"""
Analyze video files via OpenRouter xiaomi/mimo-v2-omni (native video input).
Compresses video to <1MB before base64 encoding to avoid connection resets.

Usage: python scripts/process_video.py <video_file_path>
"""

import sys
import os
import json
import base64
import hashlib
import tempfile
import time
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import ffmpeg

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = "xiaomi/mimo-v2-omni"
CACHE_DIR = Path(__file__).resolve().parent
THUMB_WIDTH = 320
MAX_DURATION = 30   # seconds to keep
TARGET_MB = 1.0     # target compressed size
REQUEST_TIMEOUT = 600
MAX_RETRIES = 3

PROMPT = """Watch this video carefully and analyze the content. Return a JSON object with exactly these fields:

{
  "name": "short English title",
  "name_cn": "简短中文标题",
  "subtype": "landscape or portrait (pick one)",
  "category": "one of: People, Nature, Object, Animal, Tech, Business, Food, Abstract, Anime",
  "tag": "comma-separated from: funny, cozy, peaceful, aesthetic, energetic, inspiring (pick all that apply)",
  "desc": "A semantic description combining subtype/category/tag with the actual video content. Write it in a way suitable for embedding search."
}

Rules:
- subtype: "landscape" for horizontal/wide videos; "portrait" for vertical/tall videos
- category: pick the single best match based on the dominant subject
- tag: pick all that apply, comma-separated
- desc: 1-2 sentences describing the video content, style, and mood. Include category and tags naturally.

Return ONLY the JSON object, no markdown fences, no extra text."""


def get_cache_path(video_path: str) -> Path:
    abs_path = str(Path(video_path).resolve())
    h = hashlib.md5(abs_path.encode()).hexdigest()[:8]
    stem = Path(video_path).stem
    return CACHE_DIR / f"{stem}_{h}.json"


def load_cache(video_path: str) -> dict | None:
    cp = get_cache_path(video_path)
    if cp.exists():
        return json.loads(cp.read_text(encoding="utf-8"))
    return None


def save_cache(video_path: str, data: dict):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cp = get_cache_path(video_path)
    cp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def compress_video(video_path: str) -> bytes:
    """Compress video until it is small enough for inline base64 upload."""
    p = Path(video_path).resolve()
    tmp_path = None
    try:
        probe = ffmpeg.probe(str(p))
        dur = float(probe["format"]["duration"])
        clip_dur = min(dur, MAX_DURATION)
        profiles = [
            {"width": 480, "fps": 5, "crf": 32},
            {"width": 360, "fps": 4, "crf": 36},
            {"width": 320, "fps": 3, "crf": 40},
        ]

        for profile in profiles:
            tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            tmp.close()
            tmp_path = Path(tmp.name)

            stream = ffmpeg.input(str(p), t=clip_dur).filter("fps", fps=profile["fps"]).filter("scale", profile["width"], -2)
            (
                ffmpeg.output(
                    stream,
                    str(tmp_path),
                    vcodec="libx264",
                    pix_fmt="yuv420p",
                    preset="fast",
                    crf=profile["crf"],
                    movflags="+faststart",
                    an=None,
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )

            data = tmp_path.read_bytes()
            size_mb = len(data) / 1024 / 1024
            print(
                f"[compress] {p.stat().st_size/1024/1024:.1f}MB -> {size_mb:.2f}MB "
                f"({clip_dur:.0f}s, {profile['width']}w/{profile['fps']}fps/crf{profile['crf']})"
            )
            if size_mb <= TARGET_MB:
                return data
            tmp_path.unlink(missing_ok=True)
            tmp_path = None

        print(f"[warn] compressed video still > {TARGET_MB:.1f}MB, using smallest version")
        return data
    except Exception as e:
        print(f"[warn] compress failed: {e}, using original")
        return p.read_bytes()
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def call_openrouter(payload: dict) -> dict:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "Connection": "close",
    }
    last_error = None
    with requests.Session() as session:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = session.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=REQUEST_TIMEOUT,
                )
                if not resp.ok:
                    print(f"[error] {resp.status_code} {resp.text}")
                    resp.raise_for_status()
                return resp.json()
            except requests.RequestException as e:
                last_error = e
                print(f"[warn] request attempt {attempt}/{MAX_RETRIES} failed: {e}")
                if attempt < MAX_RETRIES:
                    time.sleep(attempt * 2)
    raise RuntimeError(f"OpenRouter request failed after {MAX_RETRIES} attempts: {last_error}")


def make_thumbnail(video_path: str) -> str:
    p = Path(video_path).resolve()
    thumb_name = f"{p.stem}_thumb.jpg"
    thumb_path = p.parent / thumb_name
    if thumb_path.exists():
        return thumb_name
    try:
        probe = ffmpeg.probe(str(p))
        dur = float(probe["format"]["duration"])
        ts = min(dur * 0.1, 2.0)
        (
            ffmpeg.input(str(p), ss=ts)
            .filter("scale", THUMB_WIDTH, -2)
            .output(str(thumb_path), vframes=1, q=2, update=1)
            .overwrite_output()
            .run(quiet=True)
        )
    except Exception as e:
        print(f"[warn] thumbnail failed: {e}")
        return ""
    return thumb_name


def get_file_meta(video_path: str) -> dict:
    p = Path(video_path).resolve()
    size = p.stat().st_size if p.exists() else 0
    width, height, duration = 0, 0, None
    try:
        probe = ffmpeg.probe(str(p))
        duration = round(float(probe["format"]["duration"]))
        for s in probe["streams"]:
            if s["codec_type"] == "video":
                width = int(s.get("width", 0))
                height = int(s.get("height", 0))
                break
    except Exception:
        pass
    thumb = make_thumbnail(video_path)
    return {
        "mediatype": "video",
        "format": p.suffix.lstrip(".").lower(),
        "uri": p.name,
        "thumbnail": thumb,
        "width": width,
        "height": height,
        "duration": duration,
        "size": size,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def analyze_video(video_path: str) -> dict:
    cached = load_cache(video_path)
    if cached:
        print(f"[cache hit] {get_cache_path(video_path)}")
        cached.update(get_file_meta(video_path))
        save_cache(video_path, cached)
        return cached

    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set in .env")

    p = Path(video_path)
    if not p.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    video_bytes = compress_video(video_path)
    b64 = base64.b64encode(video_bytes).decode("utf-8")
    data_url = f"data:video/mp4;base64,{b64}"

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "video_url", "video_url": {"url": data_url}},
                ],
            }
        ],
        "temperature": 0.0,
    }

    print(f"[calling] {MODEL} for {p.name} ({len(video_bytes)/1024/1024:.2f}MB payload) ...")
    body = call_openrouter(payload)
    text = body["choices"][0]["message"]["content"].strip()

    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    result = json.loads(text)

    required = {"name", "name_cn", "subtype", "category", "tag", "desc"}
    missing = required - set(result.keys())
    if missing:
        raise ValueError(f"Missing fields in response: {missing}")

    result.update(get_file_meta(video_path))
    save_cache(video_path, result)
    print(f"[cached] {get_cache_path(video_path)}")
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/process_video.py <video_file_path>")
        sys.exit(1)

    path = sys.argv[1]
    data = analyze_video(path)
    print(json.dumps(data, ensure_ascii=False, indent=2))
