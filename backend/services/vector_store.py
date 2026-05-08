import os
import chromadb

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_data")

_client = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path=CHROMA_DIR)
        _collection = _client.get_or_create_collection(
            name="assets",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def upsert(asset_id: str, embedding: list[float], content: str, metadata: dict | None = None):
    _get_collection().upsert(
        ids=[asset_id],
        embeddings=[embedding],
        documents=[content],
        metadatas=[metadata or {}],
    )


def upsert_batch(ids: list[str], embeddings: list[list[float]], contents: list[str], metadatas: list[dict] | None = None):
    _get_collection().upsert(
        ids=ids,
        embeddings=embeddings,
        documents=contents,
        metadatas=metadatas or [{} for _ in ids],
    )


def query(
    embedding: list[float],
    n_results: int = 20,
    where: dict | None = None,
) -> list[tuple[str, float]]:
    kwargs = {
        "query_embeddings": [embedding],
        "n_results": n_results,
    }
    if where:
        kwargs["where"] = where
    results = _get_collection().query(**kwargs)
    ids = results["ids"][0]
    distances = results["distances"][0]
    return list(zip(ids, distances))


def count() -> int:
    return _get_collection().count()
