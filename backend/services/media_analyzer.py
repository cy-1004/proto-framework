"""
Analyze generated images/videos via OpenRouter LLM to produce rich metadata.
Used by generate.py to enrich asset records before DB insertion.
"""

import base64
import json
import logging
import os
import tempfile
import time
from pathlib import Path

import ffmpeg
import requests
from PIL import Image

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "xiaomi/mimo-v2-omni"
REQUEST_TIMEOUT = 120
MAX_RETRIES = 2

IMAGE_PROMPT = """Analyze this AI-generated image carefully. The generation prompt was: "{prompt}"

Return a JSON object with exactly these fields:
{{
  "name": "short English title (3-6 words, descriptive of visual content)",
  "name_cn": "简短中文标题（3-8字，描述画面内容）",
  "subtype": "background or sticker (pick one)",
  "category": "one of: People, Nature, Object, Animal, Tech, Business, Food, Abstract, Anime",
  "tags": "comma-separated from: funny, cozy, peaceful, aesthetic, energetic, inspiring, dramatic, cinematic, surreal, minimalist (pick all that apply)",
  "desc": "1-2 sentence semantic description of the actual visual content, style, color palette, and mood. Write for embedding search. Include category and tags naturally."
}}

Rules:
- subtype: "background" for full-scene images; "sticker" for isolated objects/characters with simple backgrounds
- category: pick the single best match based on dominant subject
- tags: pick all that apply
- desc: describe what you SEE, not what was prompted. Be specific about visual details.

Return ONLY the JSON object, no markdown fences, no extra text."""

VIDEO_PROMPT = """Analyze this AI-generated video carefully. The generation prompt was: "{prompt}"

Return a JSON object with exactly these fields:
{{
  "name": "short English title (3-6 words, descriptive of visual content)",
  "name_cn": "简短中文标题（3-8字，描述画面内容）",
  "subtype": "landscape or portrait (pick one)",
  "category": "one of: People, Nature, Object, Animal, Tech, Business, Food, Abstract, Anime",
  "tags": "comma-separated from: funny, cozy, peaceful, aesthetic, energetic, inspiring, dramatic, cinematic, surreal, minimalist (pick all that apply)",
  "desc": "1-2 sentence semantic description of the actual video content, motion, style, and mood. Write for embedding search. Include category and tags naturally."
}}

Rules:
- subtype: "landscape" for horizontal/wide; "portrait" for vertical/tall
- category: pick the single best match based on dominant subject
- tags: pick all that apply
- desc: describe what you SEE, not what was prompted. Be specific about visual details and motion.

Return ONLY the JSON object, no markdown fences, no extra text."""


def _get_api_key() -> str:
    return os.getenv(OPENROUTER_API_KEY_ENV, "")


def _call_openrouter(payload: dict) -> dict:
    api_key = _get_api_key()
    if not api_key:
        raise RuntimeError(f"{OPENROUTER_API_KEY_ENV} not set")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(
                OPENROUTER_URL, headers=headers, json=payload, timeout=REQUEST_TIMEOUT,
            )
            if not resp.ok:
                logger.warning("OpenRouter %d: %s", resp.status_code, resp.text[:200])
                resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            last_error = e
            logger.warning("OpenRouter attempt %d/%d failed: %s", attempt, MAX_RETRIES, e)
            if attempt < MAX_RETRIES:
                time.sleep(attempt * 2)
    raise RuntimeError(f"OpenRouter failed after {MAX_RETRIES} attempts: {last_error}")


def _parse_llm_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    result = json.loads(text)
    required = {"name", "name_cn", "subtype", "category", "tags", "desc"}
    missing = required - set(result.keys())
    if "tag" in result and "tags" not in result:
        result["tags"] = result.pop("tag")
        missing.discard("tags")
    if missing:
        raise ValueError(f"Missing fields: {missing}")
    return result


def _compress_video_for_analysis(video_path: str) -> bytes:
    """Compress video to ~1MB for LLM analysis."""
    profiles = [
        {"width": 480, "fps": 5, "crf": 32},
        {"width": 360, "fps": 4, "crf": 36},
        {"width": 320, "fps": 3, "crf": 40},
    ]
    for profile in profiles:
        tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        tmp.close()
        tmp_path = tmp.name
        try:
            (
                ffmpeg
                .input(video_path, t=30)
                .output(
                    tmp_path,
                    vf=f"fps={profile['fps']},scale={profile['width']}:-2",
                    vcodec="libx264", pix_fmt="yuv420p",
                    preset="fast", crf=profile["crf"],
                    movflags="+faststart", an=None,
                )
                .overwrite_output()
                .run(quiet=True)
            )
            data = Path(tmp_path).read_bytes()
            if len(data) / 1024 / 1024 <= 1.0:
                return data
        except Exception:
            pass
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    return Path(video_path).read_bytes()


def analyze_image(file_path: str, prompt: str = "") -> dict | None:
    """Analyze a generated image via LLM. Returns metadata dict or None on failure."""
    try:
        p = Path(file_path)
        if not p.exists():
            logger.warning("analyze_image: file not found %s", file_path)
            return None

        suffix = p.suffix.lstrip(".").lower()
        mime_map = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "gif": "gif", "webp": "webp"}
        mime_sub = mime_map.get(suffix, suffix)

        img = Image.open(p)
        img.close()

        b64 = base64.b64encode(p.read_bytes()).decode("utf-8")
        data_url = f"data:image/{mime_sub};base64,{b64}"

        text_prompt = IMAGE_PROMPT.format(prompt=prompt[:200])
        payload = {
            "model": MODEL,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": text_prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }],
            "temperature": 0.0,
        }

        logger.info("Analyzing image %s with %s ...", p.name, MODEL)
        body = _call_openrouter(payload)
        text = body["choices"][0]["message"]["content"].strip()
        return _parse_llm_json(text)

    except Exception:
        logger.exception("analyze_image failed for %s", file_path)
        return None


def analyze_video(file_path: str, prompt: str = "") -> dict | None:
    """Analyze a generated video via LLM. Returns metadata dict or None on failure."""
    try:
        p = Path(file_path)
        if not p.exists():
            logger.warning("analyze_video: file not found %s", file_path)
            return None

        video_bytes = _compress_video_for_analysis(file_path)
        b64 = base64.b64encode(video_bytes).decode("utf-8")
        data_url = f"data:video/mp4;base64,{b64}"

        text_prompt = VIDEO_PROMPT.format(prompt=prompt[:200])
        payload = {
            "model": MODEL,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": text_prompt},
                    {"type": "video_url", "video_url": {"url": data_url}},
                ],
            }],
            "temperature": 0.0,
        }

        logger.info("Analyzing video %s (%s MB) with %s ...",
                     p.name, f"{len(video_bytes)/1024/1024:.1f}", MODEL)
        body = _call_openrouter(payload)
        text = body["choices"][0]["message"]["content"].strip()
        return _parse_llm_json(text)

    except Exception:
        logger.exception("analyze_video failed for %s", file_path)
        return None


def analyze_media(file_path: str, media_type: str, prompt: str = "") -> dict | None:
    """Dispatch to image or video analyzer. Returns metadata dict or None."""
    if media_type == "image":
        return analyze_image(file_path, prompt)
    elif media_type == "video":
        return analyze_video(file_path, prompt)
    return None
