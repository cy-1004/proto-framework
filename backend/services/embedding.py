import os
import httpx

SILICONFLOW_URL = "https://api.siliconflow.cn/v1/embeddings"
MODEL = "Qwen/Qwen3-Embedding-4B"


def _api_key() -> str:
    return os.getenv("SILICONFLOW_API_KEY", "")


def get_embedding(text: str) -> list[float]:
    return get_embeddings([text])[0]


def get_embeddings(texts: list[str]) -> list[list[float]]:
    resp = httpx.post(
        SILICONFLOW_URL,
        headers={"Authorization": f"Bearer {_api_key()}"},
        json={"model": MODEL, "input": texts},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    data.sort(key=lambda x: x["index"])
    return [d["embedding"] for d in data]


def build_content(asset: dict) -> str:
    parts = [
        asset.get("name") or "",
        asset.get("name_cn") or "",
        asset.get("category") or "",
        asset.get("tags") or "",
        asset.get("desc") or "",
    ]
    return " ".join(p for p in parts if p)
