"""
Analyze audio files via OpenRouter xiaomi/mimo-v2-omni.
Returns structured JSON metadata (name, category, tags, etc.) and caches results.

Usage: python scripts/process_audio.py <audio_file_path>
"""

import sys
import os
import json
import base64
import hashlib
import tempfile
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import ffmpeg

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = "xiaomi/mimo-v2-omni"
CACHE_DIR = Path(__file__).resolve().parent

PROMPT = """Listen to this audio carefully and analyze it. Return a JSON object with exactly these fields:

{
  "name": "short English title",
  "name_cn": "简短中文标题",
  "subtype": "sfx or bgm (pick one)",
  "category": "one of: sad, happy, tense, epic, relaxing",
  "tag": "comma-separated from: beat, lifestyle, vlog, story, sports, gaming, tutorial (pick by usage scenario, can be multiple)",
  "desc": "A semantic description combining subtype/category/tag with the actual audio content. Write it in a way suitable for embedding search."
}

Rules:
- subtype: "sfx" for sound effects, "bgm" for background music
- category: pick the single best match
- tag: pick all that apply, comma-separated
- desc: 
    - if subtype is "sfx", use this template: "sound effect, [category], used for [tags]. it features [content]"; 
    - if subtype is "bgm", use this template: "background music, [category], used for [tags]. write 1-2 semantic sentences describing the music.

Return ONLY the JSON object, no markdown fences, no extra text."""


def get_cache_path(audio_path: str) -> Path:
    abs_path = str(Path(audio_path).resolve())
    h = hashlib.md5(abs_path.encode()).hexdigest()[:8]
    stem = Path(audio_path).stem
    return CACHE_DIR / f"{stem}_{h}.json"


def load_cache(audio_path: str) -> dict | None:
    cp = get_cache_path(audio_path)
    if cp.exists():
        return json.loads(cp.read_text(encoding="utf-8"))
    return None


def save_cache(audio_path: str, data: dict):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cp = get_cache_path(audio_path)
    cp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_file_meta(audio_path: str) -> dict:
    p = Path(audio_path).resolve()
    suffix = p.suffix.lstrip(".").lower()
    size = p.stat().st_size if p.exists() else 0
    duration = None
    try:
        probe = ffmpeg.probe(str(p))
        duration = round(float(probe["format"]["duration"]))
    except Exception:
        pass
    return {
        "mediatype": "audio",
        "format": suffix,
        "uri": f"{p.name}",
        "size": size,
        "duration": duration,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def analyze_audio(audio_path: str) -> dict:
    cached = load_cache(audio_path)
    if cached:
        print(f"[cache hit] {get_cache_path(audio_path)}")
        cached.update(get_file_meta(audio_path))
        return cached

    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set in .env")

    p = Path(audio_path)
    if not p.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    suffix = p.suffix.lstrip(".").lower()
    fmt_map = {"mp3": "mp3", "wav": "wav", "ogg": "ogg", "m4a": "m4a", "flac": "flac"}
    audio_fmt = fmt_map.get(suffix, suffix)

    MAX_DURATION = 30
    audio_bytes = p.read_bytes()
    try:
        probe = ffmpeg.probe(str(p))
        dur = float(probe["format"]["duration"])
        if dur > MAX_DURATION:
            print(f"[trim] {dur:.1f}s -> {MAX_DURATION}s")
            tmp = tempfile.NamedTemporaryFile(suffix=f".{suffix}", delete=False)
            tmp.close()
            ffmpeg.input(str(p), t=MAX_DURATION).output(tmp.name, acodec="copy").overwrite_output().run(quiet=True)
            audio_bytes = Path(tmp.name).read_bytes()
            os.unlink(tmp.name)
    except Exception as e:
        print(f"[warn] trim skipped: {e}")

    b64 = base64.b64encode(audio_bytes).decode("utf-8")

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "input_audio",
                        "input_audio": {"data": b64, "format": audio_fmt},
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
        timeout=600,
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

    result.update(get_file_meta(audio_path))
    save_cache(audio_path, result)
    print(f"[cached] {get_cache_path(audio_path)}")
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/process_audio.py <audio_file_path>")
        sys.exit(1)

    path = sys.argv[1]
    data = analyze_audio(path)
    print(json.dumps(data, ensure_ascii=False, indent=2))
