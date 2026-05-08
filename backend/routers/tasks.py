import json
import os
import shutil
import sqlite3
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Body, Query
from pydantic import BaseModel

from db import get_db
from services.embedding import get_embedding, build_content
from services import vector_store
from routers.narations import build_task_naration_dict

router = APIRouter(prefix="/api")

MEDIA_DIR = os.path.join(os.path.dirname(__file__), "..", "media")


class TaskAssetAdd(BaseModel):
    asset_id: str
    on_canvas: str = "1"


class AssetCreate(BaseModel):
    id: str
    name: str
    name_cn: str
    type: str
    subtype: str
    thumbnail: Optional[str] = None
    score: float = 0
    desc: Optional[str] = None
    tags: Optional[str] = None
    mediatype: Optional[str] = None
    category: Optional[str] = None
    format: Optional[str] = None
    uri: Optional[str] = None
    size: int = 0
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    source: str = "uploaded"
    user_id: str = "spider_bella"


@router.get("/tasks")
def list_tasks():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
        return [dict(r) for r in rows]


@router.get("/tasks/{task_id}")
def get_task(task_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return dict(row)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task not found")
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()


@router.get("/tasks/{task_id}/canvas_config")
def get_canvas_config(task_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT canvas_config FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task not found")
        raw = row["canvas_config"] or ""
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {}
        return {}


@router.put("/tasks/{task_id}/canvas_config")
def save_canvas_config(task_id: int, config: dict = Body(...)):
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        conn.execute(
            "UPDATE tasks SET canvas_config = ? WHERE id = ?",
            (json.dumps(config, ensure_ascii=False), task_id),
        )
        conn.commit()
    return config


@router.get("/tasks/{task_id}/assets")
def list_task_assets(task_id: int):
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        rows = conn.execute(
            "SELECT * FROM task_assets WHERE task_id = ? ORDER BY id",
            (task_id,),
        ).fetchall()
        out = []
        for ta in rows:
            asset_row = conn.execute(
                "SELECT * FROM assets WHERE id = ?",
                (dict(ta)["asset_id"],),
            ).fetchone()
            if asset_row is None:
                continue
            out.append(_build_task_asset_dict(ta, asset_row))
        return out


def _build_task_asset_dict(ta_row, asset_row) -> dict:
    ta_d = dict(ta_row)
    link_id = ta_d.pop("id")
    return {
        "link_id": link_id,
        "task_id": ta_d["task_id"],
        "asset_id": ta_d["asset_id"],
        "on_canvas": ta_d.get("on_canvas", "1"),
        "asset": dict(asset_row),
    }


@router.post("/tasks/{task_id}/assets")
def add_task_asset(task_id: int, body: TaskAssetAdd):
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        asset = conn.execute("SELECT * FROM assets WHERE id = ?", (body.asset_id,)).fetchone()
        if asset is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        try:
            conn.execute(
                "INSERT INTO task_assets (task_id, asset_id, on_canvas) VALUES (?, ?, ?)",
                (task_id, body.asset_id, body.on_canvas),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Asset already linked to task")
        row = conn.execute(
            "SELECT * FROM task_assets WHERE task_id = ? AND asset_id = ?",
            (task_id, body.asset_id),
        ).fetchone()
        asset_row = conn.execute(
            "SELECT * FROM assets WHERE id = ?",
            (body.asset_id,),
        ).fetchone()
        return _build_task_asset_dict(row, asset_row)


@router.patch("/tasks/{task_id}/assets/{asset_id}/on_canvas")
def toggle_task_asset_on_canvas(task_id: int, asset_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM task_assets WHERE task_id = ? AND asset_id = ?",
            (task_id, asset_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task asset not found")
        cur = row["on_canvas"] if row["on_canvas"] in ("0", "1") else "1"
        nxt = "0" if cur == "1" else "1"
        conn.execute(
            "UPDATE task_assets SET on_canvas = ? WHERE task_id = ? AND asset_id = ?",
            (nxt, task_id, asset_id),
        )
        conn.commit()
        updated = conn.execute(
            "SELECT * FROM task_assets WHERE task_id = ? AND asset_id = ?",
            (task_id, asset_id),
        ).fetchone()
        asset_row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
        return _build_task_asset_dict(updated, asset_row)


@router.delete("/tasks/{task_id}/assets/{asset_id}", status_code=204)
def remove_task_asset(task_id: int, asset_id: str):
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM task_assets WHERE task_id = ? AND asset_id = ?",
            (task_id, asset_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task asset not found")


class TaskNarationAdd(BaseModel):
    naration_id: str
    on_canvas: str = "1"


@router.get("/tasks/{task_id}/narations")
def list_task_narations(task_id: int):
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        rows = conn.execute(
            "SELECT * FROM task_narations WHERE task_id = ? ORDER BY id", (task_id,)
        ).fetchall()
        out = []
        for tn in rows:
            nr = conn.execute("SELECT * FROM narations WHERE id = ?", (dict(tn)["naration_id"],)).fetchone()
            if nr is None:
                continue
            out.append(build_task_naration_dict(tn, nr))
        return out


@router.post("/tasks/{task_id}/narations")
def add_task_naration(task_id: int, body: TaskNarationAdd):
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        nr = conn.execute("SELECT * FROM narations WHERE id = ?", (body.naration_id,)).fetchone()
        if nr is None:
            raise HTTPException(status_code=404, detail="Naration not found")
        try:
            conn.execute(
                "INSERT INTO task_narations (task_id, naration_id, on_canvas) VALUES (?, ?, ?)",
                (task_id, body.naration_id, body.on_canvas),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Naration already linked to task")
        tn = conn.execute(
            "SELECT * FROM task_narations WHERE task_id = ? AND naration_id = ?",
            (task_id, body.naration_id),
        ).fetchone()
        return build_task_naration_dict(tn, nr)


@router.patch("/tasks/{task_id}/narations/{naration_id}/on_canvas")
def toggle_task_naration_on_canvas(task_id: int, naration_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM task_narations WHERE task_id = ? AND naration_id = ?",
            (task_id, naration_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task naration not found")
        cur = row["on_canvas"] if row["on_canvas"] in ("0", "1") else "1"
        nxt = "0" if cur == "1" else "1"
        conn.execute(
            "UPDATE task_narations SET on_canvas = ? WHERE task_id = ? AND naration_id = ?",
            (nxt, task_id, naration_id),
        )
        conn.commit()
        updated = conn.execute(
            "SELECT * FROM task_narations WHERE task_id = ? AND naration_id = ?",
            (task_id, naration_id),
        ).fetchone()
        nr = conn.execute("SELECT * FROM narations WHERE id = ?", (naration_id,)).fetchone()
        return build_task_naration_dict(updated, nr)


@router.delete("/tasks/{task_id}/narations/{naration_id}", status_code=204)
def remove_task_naration(task_id: int, naration_id: str):
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM task_narations WHERE task_id = ? AND naration_id = ?",
            (task_id, naration_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task naration not found")


@router.patch("/assets/{asset_id}/favorite")
def toggle_asset_favorite(asset_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        cur_fav = row["favorite"] if row["favorite"] in ("0", "1") else "0"
        next_fav = "0" if cur_fav == "1" else "1"
        conn.execute(
            "UPDATE assets SET favorite = ? WHERE id = ?",
            (next_fav, asset_id),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
        return dict(updated)


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        asset = dict(row)

        conn.execute("DELETE FROM task_assets WHERE asset_id = ?", (asset_id,))
        conn.execute("DELETE FROM asset_fts WHERE asset_id = ?", (asset_id,))
        conn.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
        conn.commit()

    try:
        vector_store.delete(asset_id)
    except Exception:
        pass

    for field in ("uri", "thumbnail"):
        fname = asset.get(field)
        if fname:
            fpath = os.path.join(MEDIA_DIR, fname)
            if os.path.isfile(fpath):
                os.remove(fpath)


@router.get("/assets")
def list_assets(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    asset_type: str | None = Query(None, alias="type"),
    favorite: bool = Query(False),
):
    conditions = []
    params: list = []
    _ASSET_TYPES = {"image", "video", "audio", "reference", "naration"}
    if asset_type and asset_type in _ASSET_TYPES:
        conditions.append("type = ?")
        params.append(asset_type)
    if favorite:
        conditions.append("favorite = '1'")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * limit
    with get_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM assets {where}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM assets {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "limit": limit}


@router.post("/media/upload")
async def upload_media(file: UploadFile = File(...)):
    os.makedirs(MEDIA_DIR, exist_ok=True)
    file_path = os.path.join(MEDIA_DIR, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": file.filename, "size": os.path.getsize(file_path)}


@router.post("/assets")
def create_asset(asset: AssetCreate):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM assets WHERE uri = ?", (asset.uri,)
        ).fetchone() if asset.uri else None

        if existing:
            conn.execute(
                """UPDATE assets SET
                   name=?, name_cn=?, type=?, subtype=?, thumbnail=?, score=?,
                   desc=?, tags=?, mediatype=?, category=?, format=?,
                   size=?, width=?, height=?, duration=?, source=?, user_id=?
                   WHERE uri=?""",
                (asset.name, asset.name_cn, asset.type, asset.subtype,
                 asset.thumbnail, asset.score, asset.desc, asset.tags,
                 asset.mediatype, asset.category, asset.format,
                 asset.size, asset.width, asset.height, asset.duration,
                 asset.source, asset.user_id, asset.uri),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM assets WHERE id = ?", (existing["id"],)).fetchone()
        else:
            conn.execute(
                """INSERT INTO assets
                   (id, name, name_cn, type, subtype, thumbnail, score, desc, tags,
                    mediatype, category, format, uri, size, width, height,
                    duration, source, user_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (asset.id, asset.name, asset.name_cn, asset.type, asset.subtype,
                 asset.thumbnail, asset.score, asset.desc, asset.tags,
                 asset.mediatype, asset.category, asset.format, asset.uri,
                 asset.size, asset.width, asset.height, asset.duration,
                 asset.source, asset.user_id),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset.id,)).fetchone()
    return dict(row)


@router.post("/assets_with_emd")
def create_asset_with_emd(asset: AssetCreate):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM assets WHERE uri = ?", (asset.uri,)
        ).fetchone() if asset.uri else None

        if existing:
            conn.execute(
                """UPDATE assets SET
                   name=?, name_cn=?, type=?, subtype=?, thumbnail=?, score=?,
                   desc=?, tags=?, mediatype=?, category=?, format=?,
                   size=?, width=?, height=?, duration=?, source=?, user_id=?
                   WHERE uri=?""",
                (asset.name, asset.name_cn, asset.type, asset.subtype,
                 asset.thumbnail, asset.score, asset.desc, asset.tags,
                 asset.mediatype, asset.category, asset.format,
                 asset.size, asset.width, asset.height, asset.duration,
                 asset.source, asset.user_id, asset.uri),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM assets WHERE id = ?", (existing["id"],)).fetchone()
        else:
            conn.execute(
                """INSERT INTO assets
                   (id, name, name_cn, type, subtype, thumbnail, score, desc, tags,
                    mediatype, category, format, uri, size, width, height,
                    duration, source, user_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (asset.id, asset.name, asset.name_cn, asset.type, asset.subtype,
                 asset.thumbnail, asset.score, asset.desc, asset.tags,
                 asset.mediatype, asset.category, asset.format, asset.uri,
                 asset.size, asset.width, asset.height, asset.duration,
                 asset.source, asset.user_id),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset.id,)).fetchone()

    asset_dict = dict(row)
    asset_id = asset_dict["id"]

    content = build_content(asset_dict)
    if content.strip():
        embedding = get_embedding(content)
        metadata = {
            "type": asset_dict.get("type") or "",
            "subtype": asset_dict.get("subtype") or "",
            "category": asset_dict.get("category") or "",
        }
        vector_store.upsert(asset_id, embedding, content, metadata)

        with get_db() as conn:
            conn.execute("DELETE FROM asset_fts WHERE asset_id = ?", (asset_id,))
            conn.execute("INSERT INTO asset_fts (asset_id, content) VALUES (?, ?)", (asset_id, content))
            conn.commit()

    return asset_dict


@router.get("/test")
def get_test_env():
    return {"test_env": os.getenv("TEST_ENV", "")}
