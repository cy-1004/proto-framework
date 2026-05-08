import os

from fastapi import APIRouter, HTTPException, Query
from db import get_db
from services.embedding import get_embedding, get_embeddings, build_content
from services import vector_store

router = APIRouter(prefix="/api")

ASSET_TYPES = {"image", "video", "audio", "reference", "naration"}
SCORE_METHODS = {"RRF", "SIM_BM25"}


def _get_score_method() -> str:
    method = os.getenv("SCORE_METHOD", "RRF").strip().upper()
    return method if method in SCORE_METHODS else "RRF"


def _get_score_threshold(score_method: str) -> float:
    env_key = "SCORE_THRESHOLD_SIM" if score_method == "SIM_BM25" else "SCORE_THRESHOLD_RRF"
    raw = os.getenv(env_key, "0")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def _normalize_vector_hits(vec_hits: list[tuple[str, float]]) -> dict[str, float]:
    sims: dict[str, float] = {}
    for aid, distance in vec_hits:
        sims[aid] = max(0.0, min(1.0, 1 - float(distance)))
    return sims


def _normalize_keyword_hits(kw_hits: list[tuple[str, float]]) -> dict[str, float]:
    if not kw_hits:
        return {}

    bm25_values = [float(score) for _, score in kw_hits]
    min_score = min(bm25_values)
    max_score = max(bm25_values)
    if max_score == min_score:
        return {aid: 1.0 for aid, _ in kw_hits}

    scores: dict[str, float] = {}
    for aid, bm25_score in kw_hits:
        normalized = (max_score - float(bm25_score)) / (max_score - min_score)
        scores[aid] = max(0.0, min(1.0, normalized))
    return scores


def _score_rrf(vec_hits: list[tuple[str, float]], kw_hits: list[tuple[str, float]]) -> dict[str, float]:
    scores: dict[str, float] = {}
    k = 60
    vec_weight = 0.5
    kw_weight = 1 - vec_weight

    for rank, (aid, _) in enumerate(vec_hits):
        scores[aid] = scores.get(aid, 0) + vec_weight / (k + rank + 1)
    for rank, (aid, _) in enumerate(kw_hits):
        scores[aid] = scores.get(aid, 0) + kw_weight / (k + rank + 1)
    return scores


def _score_sim_bm25(vec_hits: list[tuple[str, float]], kw_hits: list[tuple[str, float]]) -> dict[str, float]:
    vec_scores = _normalize_vector_hits(vec_hits)
    kw_scores = _normalize_keyword_hits(kw_hits)
    ids = set(vec_scores) | set(kw_scores)
    return {
        aid: round(0.7 * vec_scores.get(aid, 0.0) + 0.3 * kw_scores.get(aid, 0.0), 6)
        for aid in ids
    }


@router.post("/assets/{asset_id}/embed")
def embed_asset(asset_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Asset not found")
        asset = dict(row)

    content = build_content(asset)
    if not content.strip():
        raise HTTPException(400, "Asset has no content to embed")

    embedding = get_embedding(content)
    metadata = {
        "type": asset.get("type") or "",
        "subtype": asset.get("subtype") or "",
        "category": asset.get("category") or "",
    }
    vector_store.upsert(asset_id, embedding, content, metadata)

    with get_db() as conn:
        conn.execute("DELETE FROM asset_fts WHERE asset_id = ?", (asset_id,))
        conn.execute("INSERT INTO asset_fts (asset_id, content) VALUES (?, ?)", (asset_id, content))
        conn.commit()

    return {"asset_id": asset_id, "content_length": len(content), "embedding_dim": len(embedding)}


@router.post("/assets/embed-all")
def embed_all_assets():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM assets").fetchall()
    if not rows:
        return {"embedded": 0}

    assets = [dict(r) for r in rows]
    contents = [build_content(a) for a in assets]
    ids = [a["id"] for a in assets]
    metadatas = [
        {"type": a.get("type") or "", "subtype": a.get("subtype") or "", "category": a.get("category") or ""}
        for a in assets
    ]

    valid = [(i, aid, c, m) for i, (aid, c, m) in enumerate(zip(ids, contents, metadatas)) if c.strip()]
    if not valid:
        return {"embedded": 0}

    _, v_ids, v_contents, v_metas = zip(*valid)
    v_ids, v_contents, v_metas = list(v_ids), list(v_contents), list(v_metas)

    embeddings = get_embeddings(v_contents)
    vector_store.upsert_batch(v_ids, embeddings, v_contents, v_metas)

    with get_db() as conn:
        conn.execute("DELETE FROM asset_fts")
        conn.executemany(
            "INSERT INTO asset_fts (asset_id, content) VALUES (?, ?)",
            list(zip(v_ids, v_contents)),
        )
        conn.commit()

    return {"embedded": len(v_ids), "total": len(assets)}


@router.get("/assets/search")
def search_assets(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    asset_type: str | None = Query(None, alias="type"),
):
    if asset_type and asset_type not in ASSET_TYPES:
        raise HTTPException(400, f"Unsupported asset type: {asset_type}")

    q_embedding = get_embedding(q)
    vec_where = {"type": asset_type} if asset_type else None

    chroma_count = vector_store.count()
    vec_n = min(limit * 2, chroma_count) if chroma_count > 0 else 0
    vec_hits = vector_store.query(q_embedding, n_results=vec_n, where=vec_where) if vec_n > 0 else []

    with get_db() as conn:
        try:
            if asset_type:
                kw_rows = conn.execute(
                    """
                    SELECT asset_fts.asset_id, bm25(asset_fts) AS bm25_score
                    FROM asset_fts
                    JOIN assets ON assets.id = asset_fts.asset_id
                    WHERE asset_fts MATCH ? AND assets.type = ?
                    ORDER BY bm25_score
                    LIMIT ?
                    """,
                    (q, asset_type, limit * 2),
                ).fetchall()
            else:
                kw_rows = conn.execute(
                    """
                    SELECT asset_id, bm25(asset_fts) AS bm25_score
                    FROM asset_fts
                    WHERE asset_fts MATCH ?
                    ORDER BY bm25_score
                    LIMIT ?
                    """,
                    (q, limit * 2),
                ).fetchall()
            kw_hits = [(r["asset_id"], r["bm25_score"]) for r in kw_rows]
        except Exception:
            kw_hits = []

    score_method = _get_score_method()
    if score_method == "SIM_BM25":
        scores = _score_sim_bm25(vec_hits, kw_hits)
    else:
        scores = _score_rrf(vec_hits, kw_hits)

    threshold = _get_score_threshold(score_method)
    scores = {aid: score for aid, score in scores.items() if score >= threshold}

    sorted_ids = [aid for aid, _ in sorted(scores.items(), key=lambda x: x[1], reverse=True)][:limit]

    if not sorted_ids:
        return []

    with get_db() as conn:
        placeholders = ",".join("?" for _ in sorted_ids)
        rows = conn.execute(f"SELECT * FROM assets WHERE id IN ({placeholders})", sorted_ids).fetchall()
        assets_map = {r["id"]: dict(r) for r in rows}

    results = []
    for aid in sorted_ids:
        if aid in assets_map:
            asset = assets_map[aid]
            asset["search_score"] = round(scores[aid], 6)
            results.append(asset)
    return results
