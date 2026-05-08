"""
Analyze image files via OpenRouter xiaomi/mimo-v2-omni.
Returns structured JSON metadata and generates a thumbnail.

Usage: python scripts/process_image.py <image_file_path>
"""

import sys
import os
import json
import base64
import hashlib
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from PIL import Image

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = "xiaomi/mimo-v2-omni"
CACHE_DIR = Path(__file__).resolve().parent
THUMB_SIZE = (320, 320)

PROMPT = """Analyze this image carefully. Return a JSON object with exactly these fields:

{
  "name": "short English title",
  "name_cn": "简短中文标题",
  "subtype": "background or sticker (pick one)",
  "category": "one of: People, Nature, Object, Animal, Tech, Business, Food, Abstract, Anime",
  "tag": "comma-separated from: funny, cozy, peaceful, aesthetic, energetic, inspiring (pick all that apply)",
  "desc": "A semantic description combining subtype/category/tag with the actual image content. Write it in a way suitable for embedding search."
}

Rules:
- subtype: "background" for full-scene images suitable as backgrounds; "sticker" for isolated objects/characters/icons with simple or transparent backgrounds
- category: pick the single best match
- tag: pick all that apply, comma-separated
- desc: 1-2 sentences describing the image content, style, and mood. Include subtype, category, and tags naturally.

Return ONLY the JSON object, no markdown fences, no extra text."""


def get_cache_path(image_path: str) -> Path:
    abs_path = str(Path(image_path).resolve())
    h = hashlib.md5(abs_path.encode()).hexdigest()[:8]
    stem = Path(image_path).stem
    return CACHE_DIR / f"{stem}_{h}.json"


def load_cache(image_path: str) -> dict | None:
    cp = get_cache_path(image_path)
    if cp.exists():
        return json.loads(cp.read_text(encoding="utf-8"))
    return None


def save_cache(image_path: str, data: dict):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cp = get_cache_path(image_path)
    cp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def make_thumbnail(image_path: str) -> str:
    p = Path(image_path).resolve()
    thumb_name = f"{p.stem}_thumb{p.suffix}"
    thumb_path = p.parent / thumb_name
    if thumb_path.exists():
        return thumb_name
    with Image.open(p) as img:
        img.thumbnail(THUMB_SIZE, Image.LANCZOS)
        img.save(thumb_path, quality=85)
    return thumb_name


def get_file_meta(image_path: str) -> dict:
    p = Path(image_path).resolve()
    size = p.stat().st_size if p.exists() else 0
    width, height = 0, 0
    try:
        with Image.open(p) as img:
            width, height = img.size
    except Exception:
        pass
    thumb = make_thumbnail(image_path)
    return {
        "mediatype": "image",
        "format": p.suffix.lstrip(".").lower(),
        "uri": p.name,
        "thumbnail": thumb,
        "width": width,
        "height": height,
        "size": size,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def analyze_image(image_path: str) -> dict:
    cached = load_cache(image_path)
    if cached:
        print(f"[cache hit] {get_cache_path(image_path)}")
        cached.update(get_file_meta(image_path))
        return cached

    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set in .env")

    p = Path(image_path)
    if not p.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")

    suffix = p.suffix.lstrip(".").lower()
    mime_map = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "gif": "gif", "webp": "webp", "bmp": "bmp"}
    mime_sub = mime_map.get(suffix, suffix)

    b64 = base64.b64encode(p.read_bytes()).decode("utf-8")
    data_url = f"data:image/{mime_sub};base64,{b64}"

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    },
                ],
            }
        ],
        "temperature": 0.0,
    }

    print(f"[calling] {MODEL} for {p.name} ...")
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=120,
    )
    if not resp.ok:
        print(f"[error] {resp.status_code} {resp.text}")
        resp.raise_for_status()

    body = resp.json()
    text = body["choices"][0]["message"]["content"].strip()

    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    result = json.loads(text)

    required = {"name", "name_cn", "subtype", "category", "tag", "desc"}
    missing = required - set(result.keys())
    if missing:
        raise ValueError(f"Missing fields in response: {missing}")

    result.update(get_file_meta(image_path))
    save_cache(image_path, result)
    print(f"[cached] {get_cache_path(image_path)}")
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/process_image.py <image_file_path>")
        sys.exit(1)

    path = sys.argv[1]
    data = analyze_image(path)
    print(json.dumps(data, ensure_ascii=False, indent=2))
