import io
import ipaddress
import json
import logging
import os
import threading
import time
import uuid
import base64
from typing import Optional, Callable
from urllib.parse import urlparse

import httpx
import requests
import ffmpeg
from PIL import Image
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from google import genai
from google.genai import types
from volcenginesdkarkruntime import Ark

from db import get_db
from services.embedding import get_embedding, build_content
from services import vector_store
from services.media_analyzer import analyze_media

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

MEDIA_DIR = os.path.join(os.path.dirname(__file__), "..", "media")
os.makedirs(MEDIA_DIR, exist_ok=True)

CANVAS_W = 2400
CANVAS_H = 1600
CARD_BASE_W = 240
NAME_BAR_H = 32


def _get_image_size(data: bytes) -> tuple[int, int]:
    try:
        img = Image.open(io.BytesIO(data))
        return img.size  # (width, height)
    except Exception:
        return 0, 0


def _get_video_size(path: str) -> tuple[int, int]:
    try:
        probe = ffmpeg.probe(path)
        vs = next((s for s in probe["streams"] if s["codec_type"] == "video"), None)
        if vs:
            return int(vs["width"]), int(vs["height"])
    except Exception:
        pass
    return 0, 0


def _extract_video_thumbnail(video_path: str) -> str | None:
    thumb_name = f"thumb_{uuid.uuid4().hex[:12]}.jpg"
    thumb_path = os.path.join(MEDIA_DIR, thumb_name)
    try:
        (
            ffmpeg
            .input(video_path, ss=0)
            .output(thumb_path, vframes=1, q=2, f="image2")
            .overwrite_output()
            .run(quiet=True)
        )
        if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
            return thumb_name
    except Exception:
        pass
    return None


def _compute_card_size(width: int, height: int) -> tuple[int, int]:
    if width > 0 and height > 0:
        ar = width / height
        return CARD_BASE_W, round(CARD_BASE_W / ar + NAME_BAR_H)
    return CARD_BASE_W, 200

# ---------------------------------------------------------------------------
# Provider-specific clients
# ---------------------------------------------------------------------------

_google_client = None
_ark_client = None


def _get_google_client():
    global _google_client
    if _google_client is None:
        _google_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY", ""))
    return _google_client


def _get_ark_client():
    global _ark_client
    if _ark_client is None:
        _ark_client = Ark(
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key=os.getenv("ARK_API_KEY", ""),
        )
    return _ark_client


def _is_public_media_base_url(media_base_url: str) -> bool:
    if not media_base_url:
        return False
    try:
        parsed = urlparse(media_base_url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in ("http", "https") or not host:
            return False
        if host in {"localhost", "0.0.0.0"}:
            return False
        try:
            return ipaddress.ip_address(host).is_global
        except ValueError:
            return True
    except Exception:
        return False


def _image_file_to_data_uri(path: str) -> str:
    raw_size = os.path.getsize(path)
    max_size = 500 * 1024
    if raw_size > max_size:
        img = Image.open(path)
        img.thumbnail((1280, 1280), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        data = buf.getvalue()
        mime = "image/jpeg"
    else:
        with open(path, "rb") as f:
            data = f.read()
        ext = os.path.splitext(path)[1].lower()
        mime = "image/png" if ext == ".png" else "image/jpeg"
    b64 = base64.b64encode(data).decode()
    return f"data:{mime};base64,{b64}"


def _resolve_seedance_image_ref(fname: str, media_base_url: str) -> str | None:
    fpath = os.path.join(MEDIA_DIR, fname)
    if not os.path.exists(fpath):
        return None
    if _is_public_media_base_url(media_base_url):
        return f"{media_base_url}/media/{fname}"
    return _image_file_to_data_uri(fpath)


def _resolve_jimeng_image_ref(fname: str, media_base_url: str) -> str | None:
    """Resolve media file to URL or base64 for Seedream API (max 10MB, 6000x6000)."""
    fpath = os.path.join(MEDIA_DIR, fname)
    if not os.path.exists(fpath):
        return None
    if _is_public_media_base_url(media_base_url):
        return f"{media_base_url}/media/{fname}"
    raw_size = os.path.getsize(fpath)
    if raw_size > 10 * 1024 * 1024:
        img = Image.open(fpath)
        img.thumbnail((4096, 4096), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        data = buf.getvalue()
        mime = "image/jpeg"
    else:
        with open(fpath, "rb") as f:
            data = f.read()
        ext = os.path.splitext(fpath)[1].lower()
        mime = "image/png" if ext == ".png" else "image/jpeg"
    b64 = base64.b64encode(data).decode()
    return f"data:{mime};base64,{b64}"


# ---------------------------------------------------------------------------
# Provider-specific image generation
# ---------------------------------------------------------------------------


def _generate_one_image_nb(prompt: str, config: dict, model: str) -> tuple[bytes, str]:
    """Generate one image via Google/NanoBanana2 API."""
    client = _get_google_client()
    aspect_ratio = config.get("aspect_ratio", "16:9")
    image_size = config.get("image_size", "1K")
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=image_size,
            ),
        ),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            return part.inline_data.data, part.inline_data.mime_type
    raise RuntimeError("No image returned from Google API")





def _generate_one_image_minimax(prompt: str, config: dict, model: str) -> tuple[bytes, str]:
    """Generate one image via MiniMax API."""
    MINIMAX_API_URL = "https://api.minimax.io/v1/image_generation"

    api_key = os.getenv("MINIMAX_API_KEY", "")
    if not api_key:
        raise RuntimeError("MINIMAX_API_KEY not configured")

    aspect_ratio = config.get("aspect_ratio", "16:9")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "response_format": "base64",
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post(MINIMAX_API_URL, headers=headers, json=payload)
        response.raise_for_status()

    data = response.json()
    image_base64_list = data.get("data", {}).get("image_base64", [])
    if not image_base64_list:
        raise RuntimeError("No image data returned from MiniMax API")

    image_bytes = base64.b64decode(image_base64_list[0])
    return image_bytes, "image/png"


def _generate_one_image_grok(prompt: str, config: dict, model: str) -> tuple[bytes, str]:
    """Generate one image via xAI Grok Imagine API."""
    api_key = os.getenv("XAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("XAI_API_KEY not configured")

    aspect_ratio = config.get("aspect_ratio", "16:9")
    resolution = config.get("resolution", "1k")
    payload: dict = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "response_format": "b64_json",
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post("https://api.x.ai/v1/images/generations", headers=headers, json=payload)
        response.raise_for_status()

    data = response.json()
    items = data.get("data", [])
    if not items or not items[0].get("b64_json"):
        raise RuntimeError("No image data returned from Grok API")

    image_bytes = base64.b64decode(items[0]["b64_json"])
    return image_bytes, "image/png"


_SEEDREAM_SIZE_MAP = {
    "2K": {
        "1:1": "2048x2048", "16:9": "2848x1600", "9:16": "1600x2848",
        "4:3": "2304x1728", "3:4": "1728x2304", "3:2": "2496x1664",
        "2:3": "1664x2496", "21:9": "3360x1440",
    },
    "3K": {
        "1:1": "3072x3072", "16:9": "4096x2304", "9:16": "2304x4096",
        "4:3": "3456x2592", "3:4": "2592x3456", "3:2": "3744x2496",
        "2:3": "2496x3744", "21:9": "4704x2016",
    },
}

def _build_jimeng_image_refs(config: dict) -> list[str]:
    media_base_url = os.getenv("MEDIA_BASE_URL", "").rstrip("/")
    media_files = config.get("media_files") or []
    refs = []
    for mf in media_files:
        if mf.get("mediaType") != "image":
            continue
        ref = _resolve_jimeng_image_ref(mf.get("filename", ""), media_base_url)
        if ref:
            refs.append(ref)
    return refs


def _generate_one_image_jimeng(prompt: str, config: dict, model: str) -> tuple[bytes, str]:
    """Generate one image via Volcengine Ark Seedream API. Supports reference images."""
    client = _get_ark_client()
    ratio = config.get("ratio") or config.get("aspect_ratio", "16:9")
    res_key = config.get("image_size") or config.get("size", "2K")
    size_val = _SEEDREAM_SIZE_MAP.get(res_key, _SEEDREAM_SIZE_MAP["2K"]).get(ratio, "2048x2048")

    image_refs = _build_jimeng_image_refs(config)
    image_arg = None
    if image_refs:
        image_arg = image_refs[0] if len(image_refs) == 1 else image_refs

    result = client.images.generate(
        model=model,
        prompt=prompt,
        image=image_arg,
        response_format="url",
        size=size_val,
        stream=False,
        watermark=False,
    )

    if not result.data:
        raise RuntimeError("No image returned from Seedream API")

    url = result.data[0].url
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    return resp.content, "image/png"


def _generate_batch_images_jimeng(prompt: str, config: dict, model: str) -> list[tuple[bytes, str]]:
    """Generate grouped images via Seedream API."""
    client = _get_ark_client()
    ratio = config.get("ratio") or config.get("aspect_ratio", "16:9")
    res_key = config.get("image_size") or config.get("size", "2K")
    size_val = _SEEDREAM_SIZE_MAP.get(res_key, _SEEDREAM_SIZE_MAP["2K"]).get(ratio, "2048x2048")

    image_refs = _build_jimeng_image_refs(config)
    image_arg = None
    if image_refs:
        image_arg = image_refs[0] if len(image_refs) == 1 else image_refs

    result = client.images.generate(
        model=model,
        prompt=prompt,
        image=image_arg,
        response_format="url",
        size=size_val,
        stream=False,
        watermark=False,
        sequential_image_generation="auto",
    )

    if not result.data:
        raise RuntimeError("No images returned from Seedream API")

    results = []
    for item in result.data:
        img_resp = requests.get(item.url, timeout=1200)
        img_resp.raise_for_status()
        results.append((img_resp.content, "image/png"))
    return results


def _generate_one_image_qwen(prompt: str, config: dict, model: str) -> tuple[bytes, str]:
    """Generate one image via SiliconFlow Qwen-Image API."""
    api_key = os.getenv("SILICONFLOW_API_KEY", "")
    if not api_key:
        raise RuntimeError("SILICONFLOW_API_KEY not configured")

    image_size = config.get("image_size", "1664x928")
    payload = {
        "model": model,
        "prompt": prompt,
        "image_size": image_size,
        "num_inference_steps": 50,
        "cfg": 4.0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=180.0) as client:
        response = client.post(
            "https://api.siliconflow.cn/v1/images/generations",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()

    data = response.json()
    images = data.get("images", [])
    if not images or not images[0].get("url"):
        raise RuntimeError("No image returned from Qwen API")

    img_resp = requests.get(images[0]["url"], timeout=60)
    img_resp.raise_for_status()
    return img_resp.content, "image/png"


# ---------------------------------------------------------------------------
# Video generation
# ---------------------------------------------------------------------------


def _generate_one_video_seedance(prompt: str, config: dict, model: str, progress_cb: Callable | None = None, **kwargs) -> tuple[bytes, str]:
    """Generate one video via Volcengine Ark Seedance API (async polling)."""
    usage_out: dict | None = kwargs.get("usage_out")
    client = _get_ark_client()
    duration = config.get("duration", 5)
    camera_fixed = config.get("camera_fixed", False)

    text_content = (
        f"{prompt}  --duration {duration} "
        f"--camerafixed {'true' if camera_fixed else 'false'} "
        f"--watermark false"
    )

    create_result = client.content_generation.tasks.create(
        model=model,
        content=[{"type": "text", "text": text_content}],
    )
    task_id = create_result.id
    max_iter = 120

    for i in range(max_iter):
        get_result = client.content_generation.tasks.get(task_id=task_id)
        status = get_result.status
        if status == "succeeded":
            video_url = None
            if get_result.content and get_result.content.video_url:
                video_url = get_result.content.video_url
            elif hasattr(get_result, "output") and get_result.output:
                video_url = getattr(get_result.output, "video_url", None)
            if not video_url:
                raise RuntimeError("Seedance task succeeded but no video URL found")
            # Capture token usage if the SDK returns it
            if usage_out is not None:
                raw_usage = getattr(get_result, "usage", None)
                if raw_usage is not None:
                    usage_out["total_tokens"] = getattr(raw_usage, "total_tokens", None)
            resp = requests.get(video_url, timeout=120)
            resp.raise_for_status()
            return resp.content, "video/mp4"
        elif status == "failed":
            err = getattr(get_result, "error", "unknown")
            raise RuntimeError(f"Seedance task failed: {err}")
        if progress_cb:
            progress_cb(i + 1, max_iter, "Seedance")
        time.sleep(3)

    raise RuntimeError("Seedance task timed out after 360s")


def _generate_one_video_seedance_v2(prompt: str, config: dict, model: str, progress_cb: Callable | None = None, **kwargs) -> tuple[bytes, str]:
    """Generate video via Seedance 2.0 API with multimodal references."""
    usage_out: dict | None = kwargs.get("usage_out")
    api_key = os.getenv("ARK_API_KEY", "")
    if not api_key:
        raise RuntimeError("ARK_API_KEY not configured")

    media_base_url = os.getenv("MEDIA_BASE_URL", "").rstrip("/")
    has_public_media_url = _is_public_media_base_url(media_base_url)
    media_files = config.get("media_files") or []

    content: list[dict] = [{"type": "text", "text": prompt}]

    images = [m for m in media_files if m.get("mediaType") == "image"]
    videos = [m for m in media_files if m.get("mediaType") == "video"]
    audios = [m for m in media_files if m.get("mediaType") == "audio"]

    generation_mode = config.get("generation_mode", "reference")
    is_first_last = generation_mode == "first_last"
    has_multi_ref = not is_first_last and (len(images) > 1 or bool(videos) or bool(audios))

    for mf in images:
        fname = mf.get("filename", "")
        url = _resolve_seedance_image_ref(fname, media_base_url)
        if not url:
            continue
        item: dict = {
            "type": "image_url",
            "image_url": {"url": url},
        }
        if has_multi_ref:
            item["role"] = "reference_image"
        content.append(item)

    for mf in videos:
        fname = mf.get("filename", "")
        if has_public_media_url:
            url = f"{media_base_url}/media/{fname}"
        else:
            raise RuntimeError("Seedance 2.0 reference_video requires a public MEDIA_BASE_URL")
        content.append({
            "type": "video_url",
            "video_url": {"url": url},
            "role": "reference_video",
        })

    for mf in audios:
        fname = mf.get("filename", "")
        if has_public_media_url:
            url = f"{media_base_url}/media/{fname}"
        else:
            raise RuntimeError("Seedance 2.0 reference_audio requires a public MEDIA_BASE_URL")
        content.append({
            "type": "audio_url",
            "audio_url": {"url": url},
            "role": "reference_audio",
        })

    duration = config.get("duration", 5)
    if has_multi_ref and duration != -1:
        R2V_VALID_DURATIONS = [5, 10]
        duration = min(R2V_VALID_DURATIONS, key=lambda d: abs(d - duration))

    ratio = config.get("ratio") or config.get("aspect_ratio", "16:9")
    resolution = config.get("resolution")
    if model == "doubao-seedance-2-0-fast-260128" and resolution == "1080p":
        resolution = "720p"

    payload: dict = {
        "model": model,
        "content": content,
        "generate_audio": config.get("generate_audio", True),
        "ratio": ratio,
        "duration": duration,
        "watermark": config.get("watermark", False),
    }
    if resolution:
        payload["resolution"] = resolution

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
            headers=headers,
            json=payload,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Seedance 2.0 create failed: {resp.text[:500]}")

    task_id = resp.json().get("id")
    if not task_id:
        raise RuntimeError("No task_id from Seedance 2.0 API")

    auth_header = {"Authorization": f"Bearer {api_key}"}
    max_iter = 200
    for i in range(max_iter):
        time.sleep(3)
        with httpx.Client(timeout=30.0) as client:
            result = client.get(
                f"https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}",
                headers=auth_header,
            )
            result.raise_for_status()
        data = result.json()
        status = data.get("status")
        if status == "succeeded":
            video_url = None
            if data.get("content") and isinstance(data["content"], dict):
                video_url = data["content"].get("video_url")
            if not video_url and data.get("output"):
                video_url = data["output"].get("video_url") if isinstance(data["output"], dict) else None
            if not video_url:
                raise RuntimeError("Seedance 2.0 succeeded but no video URL")
            # Capture token usage from response
            if usage_out is not None and isinstance(data.get("usage"), dict):
                usage_out["total_tokens"] = data["usage"].get("total_tokens")
            video_resp = requests.get(video_url, timeout=180)
            video_resp.raise_for_status()
            return video_resp.content, "video/mp4"
        elif status == "failed":
            err = data.get("error", "unknown")
            raise RuntimeError(f"Seedance 2.0 failed: {err}")
        if progress_cb:
            progress_cb(i + 1, max_iter, "Seedance 2.0")

    raise RuntimeError("Seedance 2.0 timed out after 600s")


def _load_image_for_veo(fname: str) -> types.Image | None:
    fpath = os.path.join(MEDIA_DIR, fname)
    if not os.path.exists(fpath):
        return None
    with open(fpath, "rb") as f:
        data = f.read()
    ext = os.path.splitext(fpath)[1].lower()
    mime = "image/png" if ext == ".png" else "image/jpeg"
    return types.Image(image_bytes=data, mime_type=mime)


def _generate_one_video_veo(prompt: str, config: dict, model: str, progress_cb: Callable | None = None) -> tuple[bytes, str]:
    """Generate one video via Google Veo API (sync polling)."""
    client = _get_google_client()
    aspect_ratio = config.get("aspect_ratio", "16:9")
    raw_dur = config.get("duration", 8)
    duration = min((d for d in (4, 6, 8) if d >= raw_dur), default=8)
    resolution = config.get("resolution")

    media_files = config.get("media_files") or []
    images = [m for m in media_files if m.get("mediaType") == "image"]
    generation_mode = config.get("generation_mode", "reference")

    image_arg = None
    use_ref_images = False

    if generation_mode == "first_last" and images:
        first_img = _load_image_for_veo(images[0].get("filename", ""))
        if first_img:
            image_arg = first_img
        if len(images) > 1:
            last_img = _load_image_for_veo(images[1].get("filename", ""))
            if last_img:
                use_ref_images = True
    elif images:
        if len(images) == 1:
            img = _load_image_for_veo(images[0].get("filename", ""))
            if img:
                image_arg = img
        else:
            use_ref_images = True

    if use_ref_images or resolution in ("1080p", "4k"):
        duration = 8

    veo_config_kwargs: dict = {
        "aspect_ratio": aspect_ratio,
        "duration_seconds": str(duration),
    }
    if not (use_ref_images or image_arg):
        veo_config_kwargs["negative_prompt"] = "cartoon, drawing, low quality"
    if use_ref_images:
        veo_config_kwargs["person_generation"] = "allow_adult"
    if resolution:
        veo_config_kwargs["resolution"] = resolution

    if generation_mode == "first_last" and images and len(images) > 1:
        last_img = _load_image_for_veo(images[1].get("filename", ""))
        if last_img:
            veo_config_kwargs["last_frame"] = last_img
    elif images and len(images) > 1:
        ref_imgs = []
        for mf in images[:3]:
            img = _load_image_for_veo(mf.get("filename", ""))
            if img:
                ref_imgs.append(types.VideoGenerationReferenceImage(
                    image=img, reference_type="asset",
                ))
        if ref_imgs:
            veo_config_kwargs["reference_images"] = ref_imgs

    gen_kwargs: dict = {
        "model": model,
        "prompt": prompt,
        "config": types.GenerateVideosConfig(**veo_config_kwargs),
    }
    if image_arg:
        gen_kwargs["image"] = image_arg

    operation = client.models.generate_videos(**gen_kwargs)
    max_iter = 120

    for i in range(max_iter):
        if operation.done:
            break
        if progress_cb:
            progress_cb(i + 1, max_iter, "Veo")
        time.sleep(5)
        operation = client.operations.get(operation)

    if not operation.done:
        raise RuntimeError("Veo video generation timed out after 600s")

    generated_video = operation.response.generated_videos[0]
    client.files.download(file=generated_video.video)
    tmp_path = os.path.join(MEDIA_DIR, f"_veo_tmp_{uuid.uuid4().hex[:8]}.mp4")
    generated_video.video.save(tmp_path)
    with open(tmp_path, "rb") as f:
        data = f.read()
    os.remove(tmp_path)
    return data, "video/mp4"


def _generate_one_video_hailuo(prompt: str, config: dict, model: str, progress_cb: Callable | None = None) -> tuple[bytes, str]:
    """Generate one video via MiniMax Hailuo Video API (async polling)."""
    api_key = os.getenv("MINIMAX_API_KEY", "")
    if not api_key:
        raise RuntimeError("MINIMAX_API_KEY not configured")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    use_model = config.get("model") or model
    duration = config.get("duration", 6)
    resolution = config.get("resolution", "768P")
    prompt_optimizer = config.get("prompt_optimizer", True)

    payload: dict = {
        "model": use_model,
        "prompt": prompt,
        "duration": duration,
        "resolution": resolution,
        "prompt_optimizer": prompt_optimizer,
    }

    with httpx.Client(timeout=30.0) as client:
        resp = client.post("https://api.minimax.io/v1/video_generation", headers=headers, json=payload)
        resp.raise_for_status()
    result = resp.json()
    if result.get("base_resp", {}).get("status_code", -1) != 0:
        raise RuntimeError(f"Hailuo create task failed: {result.get('base_resp', {}).get('status_msg', 'unknown')}")
    task_id = result.get("task_id")
    if not task_id:
        raise RuntimeError("No task_id returned from Hailuo API")

    auth_header = {"Authorization": f"Bearer {api_key}"}
    max_iter = 180
    for i in range(max_iter):
        time.sleep(5)
        with httpx.Client(timeout=30.0) as client:
            qr = client.get(
                "https://api.minimax.io/v1/query/video_generation",
                headers=auth_header,
                params={"task_id": task_id},
            )
            qr.raise_for_status()
        data = qr.json()
        status = data.get("status", "")
        if status == "Success":
            file_id = data.get("file_id")
            if not file_id:
                raise RuntimeError("Hailuo task succeeded but no file_id")
            fr = httpx.get(
                "https://api.minimax.io/v1/files/retrieve",
                headers=auth_header,
                params={"file_id": file_id},
                timeout=30.0,
            )
            fr.raise_for_status()
            download_url = fr.json().get("file", {}).get("download_url")
            if not download_url:
                raise RuntimeError("No download_url from Hailuo file retrieve")
            video_resp = requests.get(download_url, timeout=120)
            video_resp.raise_for_status()
            return video_resp.content, "video/mp4"
        elif status == "Fail":
            raise RuntimeError(f"Hailuo video generation failed: {data.get('base_resp', {}).get('status_msg', 'unknown')}")
        if progress_cb:
            progress_cb(i + 1, max_iter, "Hailuo")

    raise RuntimeError("Hailuo video generation timed out after 900s")


def _generate_one_video_grok(prompt: str, config: dict, model: str, progress_cb: Callable | None = None) -> tuple[bytes, str]:
    """Generate one video via xAI Grok Imagine Video API (async polling)."""
    api_key = os.getenv("XAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("XAI_API_KEY not configured")

    aspect_ratio = config.get("aspect_ratio", "16:9")
    duration = config.get("duration", 5)
    resolution = config.get("resolution", "480p")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload: dict = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }

    with httpx.Client(timeout=30.0) as client:
        resp = client.post("https://api.x.ai/v1/videos/generations", headers=headers, json=payload)
        resp.raise_for_status()
    request_id = resp.json().get("request_id")
    if not request_id:
        raise RuntimeError("No request_id returned from Grok video API")

    auth_header = {"Authorization": f"Bearer {api_key}"}
    max_iter = 180
    for i in range(max_iter):
        time.sleep(5)
        with httpx.Client(timeout=30.0) as client:
            result = client.get(f"https://api.x.ai/v1/videos/{request_id}", headers=auth_header)
            result.raise_for_status()
        data = result.json()
        status = data.get("status")
        if status == "done":
            video_url = data["video"]["url"]
            video_resp = requests.get(video_url, timeout=120)
            video_resp.raise_for_status()
            return video_resp.content, "video/mp4"
        elif status in ("expired", "failed"):
            raise RuntimeError(f"Grok video generation {status}")
        if progress_cb:
            progress_cb(i + 1, max_iter, "Grok")

    raise RuntimeError("Grok video generation timed out after 900s")


# ---------------------------------------------------------------------------
# Music generation
# ---------------------------------------------------------------------------


def _generate_one_music_minimax(prompt: str, config: dict, model: str) -> tuple[bytes, str]:
    """Generate music via MiniMax Music API."""
    api_key = os.getenv("MINIMAX_API_KEY", "")
    if not api_key:
        raise RuntimeError("MINIMAX_API_KEY not configured")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    lyrics = config.get("lyrics", "")
    is_instrumental = config.get("is_instrumental", False)
    lyrics_optimizer = config.get("lyrics_optimizer", False)

    payload: dict = {
        "model": model,
        "prompt": prompt,
        "output_format": "url",
        "audio_setting": {
            "sample_rate": 44100,
            "bitrate": 256000,
            "format": "mp3",
        },
    }
    if is_instrumental:
        payload["is_instrumental"] = True
    elif lyrics:
        payload["lyrics"] = lyrics
    elif lyrics_optimizer:
        payload["lyrics_optimizer"] = True
    else:
        payload["lyrics_optimizer"] = True

    with httpx.Client(timeout=300.0) as client:
        resp = client.post("https://api.minimax.io/v1/music_generation", headers=headers, json=payload)
        resp.raise_for_status()

    result = resp.json()
    base_resp = result.get("base_resp", {})
    if base_resp.get("status_code", -1) != 0:
        raise RuntimeError(f"MiniMax music failed: {base_resp.get('status_msg', 'unknown')}")

    data = result.get("data", {})
    audio_url = data.get("audio")
    if not audio_url:
        raise RuntimeError("No audio data returned from MiniMax Music API")

    if audio_url.startswith("http"):
        audio_resp = requests.get(audio_url, timeout=120)
        audio_resp.raise_for_status()
        return audio_resp.content, "audio/mp3"
    else:
        return bytes.fromhex(audio_url), "audio/mp3"


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

_PROVIDERS = {
    "nanobanana2": {
        "type": "image",
        "model": "gemini-3.1-flash-image-preview",
        "fn": _generate_one_image_nb,
    },
    "minimax_image": {
        "type": "image",
        "model": "image-01",
        "fn": _generate_one_image_minimax,
    },
    "grok_image": {
        "type": "image",
        "model": "grok-imagine-image",
        "fn": _generate_one_image_grok,
    },
    "jimeng": {
        "type": "image",
        "model": "doubao-seedream-5-0-260128",
        "fn": _generate_one_image_jimeng,
        "batch_fn": _generate_batch_images_jimeng,
    },
    "qwen_image": {
        "type": "image",
        "model": "Qwen/Qwen-Image",
        "fn": _generate_one_image_qwen,
    },
    "seedance": {
        "type": "video",
        "model": "doubao-seedance-1-5-pro-251215",
        "fn": _generate_one_video_seedance,
    },
    "seedance_v2": {
        "type": "video",
        "model": "doubao-seedance-2-0-260128",
        "fn": _generate_one_video_seedance_v2,
    },
    "seedance_v2_fast": {
        "type": "video",
        "model": "doubao-seedance-2-0-fast-260128",
        "fn": _generate_one_video_seedance_v2,
    },
    "veo3.1": {
        "type": "video",
        "model": "veo-3.1-generate-preview",
        "fn": _generate_one_video_veo,
    },
    "grok_video": {
        "type": "video",
        "model": "grok-imagine-video",
        "fn": _generate_one_video_grok,
    },
    "hailuo_video": {
        "type": "video",
        "model": "MiniMax-Hailuo-2.3",
        "fn": _generate_one_video_hailuo,
    },
    "minimax_music": {
        "type": "audio",
        "model": "music-2.5+",
        "fn": _generate_one_music_minimax,
    },
}

_PROVIDER_ALIASES = {
    "seedance-v2-fast": "seedance_v2_fast",
    "seedance-2.0-fast": "seedance_v2_fast",
    "seedance-2-fast": "seedance_v2_fast",
}


def _normalize_provider(provider: str) -> str:
    key = (provider or "").strip()
    return _PROVIDER_ALIASES.get(key, key)

def _generate_image(prompt: str, provider: str, config: dict) -> tuple[bytes, str]:
    p = _PROVIDERS.get(_normalize_provider(provider))
    if p is None:
        raise RuntimeError(f"Unknown provider: {provider}")
    return p["fn"](prompt, config, p["model"])


# ---------------------------------------------------------------------------
# Generation job helpers
# ---------------------------------------------------------------------------


def _update_job(job_id: str, **kwargs):
    if not kwargs:
        return
    kwargs["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    cols = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values())
    vals.append(job_id)
    with get_db() as conn:
        conn.execute(f"UPDATE generation_jobs SET {cols} WHERE id = ?", vals)
        conn.commit()


def _get_job(job_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM generation_jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None


def _run_generation_job(job_id: str):
    """Background worker that executes a generation job."""
    job = _get_job(job_id)
    if not job:
        return
    _update_job(job_id, status="running", progress=0, message="准备中...")

    media_type = job["media_type"]
    provider = job["provider"]
    prompt = job["prompt"]
    config = json.loads(job["config"]) if isinstance(job["config"], str) else job["config"]
    count = job["count"]
    task_id = job["task_id"]
    center_x = job.get("center_x")
    center_y = job.get("center_y")

    p = _PROVIDERS.get(provider)
    if not p:
        _update_job(job_id, status="failed", progress=100, errors=json.dumps([{"error": f"Unknown provider: {provider}"}]))
        return

    results = []
    errors = []
    sequential_mode = config.get("sequential_image_generation", "disabled")

    batch_fn = p.get("batch_fn")
    if media_type == "image" and batch_fn and sequential_mode == "auto":
        _update_job(job_id, progress=5, message="正在自动组图生成...")
        try:
            batch_results = batch_fn(prompt, config, p["model"])
            positions = _compute_canvas_center(task_id, len(batch_results), center_x=center_x, center_y=center_y)
            for i, (img_bytes, mime_type) in enumerate(batch_results):
                filename = _save_media(img_bytes, mime_type)
                asset_id = uuid.uuid4().hex[:16]
                name = f"{prompt[:30]}_{i+1}"
                img_w, img_h = _get_image_size(img_bytes)
                card_w, card_h = _compute_card_size(img_w, img_h)
                _update_job(job_id, message=f"正在分析第 {i+1}/{len(batch_results)} 张...")
                analysis = analyze_media(os.path.join(MEDIA_DIR, filename), "image", prompt)
                _create_asset_record(
                    asset_id=asset_id, name=name, filename=filename, prompt=prompt,
                    width=img_w or None, height=img_h or None, provider=provider,
                    analysis=analysis,
                )
                x, y = positions[i] if i < len(positions) else (CANVAS_W // 2, CANVAS_H // 2)
                task_asset = _create_task_asset(task_id, asset_id, x, y, card_w, card_h)
                results.append(task_asset)
                _update_job(job_id, progress=int((i + 1) / len(batch_results) * 90) + 5,
                            message=f"已返回 {i+1}/{len(batch_results)} 张")
        except Exception as e:
            logger.exception("Batch generation failed job=%s provider=%s", job_id, provider)
            errors.append({"index": 0, "error": str(e)})
    else:
        positions = _compute_canvas_center(task_id, count, center_x=center_x, center_y=center_y)
        for i in range(count):
            item_base = int(i / count * 100)
            item_end = int((i + 1) / count * 100)
            _update_job(job_id, progress=item_base, message=f"正在生成第 {i+1}/{count} 个...")

            def make_progress_cb(base: int, end: int):
                def cb(cur: int, total: int, label: str = ""):
                    pct = base + int((end - base) * cur / max(total, 1))
                    msg = f"正在等待 {label} 返回 ({cur}/{total})" if label else f"生成中 ({cur}/{total})"
                    _update_job(job_id, progress=min(pct, 99), message=msg)
                return cb

            try:
                if media_type == "image":
                    img_bytes, mime_type = p["fn"](prompt, config, p["model"])
                    filename = _save_media(img_bytes, mime_type)
                    asset_id = uuid.uuid4().hex[:16]
                    name = f"{prompt[:30]}_{i+1}"
                    img_w, img_h = _get_image_size(img_bytes)
                    card_w, card_h = _compute_card_size(img_w, img_h)
                    _update_job(job_id, message=f"正在分析第 {i+1}/{count} 个...")
                    analysis = analyze_media(os.path.join(MEDIA_DIR, filename), "image", prompt)
                    _create_asset_record(
                        asset_id=asset_id, name=name, filename=filename, prompt=prompt,
                        width=img_w or None, height=img_h or None, provider=provider,
                        analysis=analysis,
                    )
                    x, y = positions[i] if i < len(positions) else (CANVAS_W // 2, CANVAS_H // 2)
                    task_asset = _create_task_asset(task_id, asset_id, x, y, card_w, card_h)
                    results.append(task_asset)

                elif media_type == "video":
                    progress_cb = make_progress_cb(item_base, item_end)
                    video_bytes, mime_type = p["fn"](prompt, config, p["model"], progress_cb=progress_cb)
                    filename = _save_media(video_bytes, mime_type)
                    asset_id = uuid.uuid4().hex[:16]
                    name = f"{prompt[:30]}_{i+1}"
                    vid_path = os.path.join(MEDIA_DIR, filename)
                    vid_w, vid_h = _get_video_size(vid_path)
                    card_w, card_h = _compute_card_size(vid_w, vid_h)
                    thumb_name = _extract_video_thumbnail(vid_path)
                    duration = config.get("duration")
                    _update_job(job_id, message=f"正在分析第 {i+1}/{count} 个...")
                    analysis = analyze_media(vid_path, "video", prompt)
                    _create_asset_record(
                        asset_id=asset_id, name=name, filename=filename, prompt=prompt,
                        width=vid_w or None, height=vid_h or None, provider=provider,
                        asset_type="video", media_format="video/mp4",
                        duration=duration, thumbnail=thumb_name,
                        analysis=analysis,
                    )
                    x, y = positions[i] if i < len(positions) else (CANVAS_W // 2, CANVAS_H // 2)
                    task_asset = _create_task_asset(task_id, asset_id, x, y, card_w, card_h)
                    results.append(task_asset)

                elif media_type == "audio":
                    audio_bytes, mime_type = p["fn"](prompt, config, p["model"])
                    filename = _save_media(audio_bytes, mime_type)
                    asset_id = uuid.uuid4().hex[:16]
                    name = f"{prompt[:30]}_{i+1}"
                    _create_asset_record(
                        asset_id=asset_id, name=name, filename=filename, prompt=prompt,
                        width=None, height=None, provider=provider,
                        asset_type="audio", media_format="audio/mp3", duration=None,
                    )
                    x, y = positions[i] if i < len(positions) else (CANVAS_W // 2, CANVAS_H // 2)
                    task_asset = _create_task_asset(task_id, asset_id, x, y, CARD_BASE_W, 80)
                    results.append(task_asset)

            except Exception as e:
                logger.exception("Generation failed job=%s provider=%s index=%s", job_id, provider, i)
                errors.append({"index": i, "error": str(e)})

    _update_job(
        job_id,
        status="complete" if results else ("failed" if errors else "complete"),
        progress=100,
        message="生成完成" if results else "生成失败",
        results=json.dumps(results, ensure_ascii=False, default=str),
        errors=json.dumps(errors, ensure_ascii=False),
    )


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class GenerateImageRequest(BaseModel):
    task_id: int
    prompt: str
    provider: str = "nanobanana2"
    config: dict = {}
    count: int = 2
    center_x: Optional[int] = None
    center_y: Optional[int] = None
    session_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _save_media(data: bytes, mime_type: str) -> str:
    """Save media bytes to media dir, return filename."""
    if "mp4" in mime_type or "video" in mime_type:
        ext = "mp4"
    elif "mp3" in mime_type or "audio" in mime_type:
        ext = "mp3"
    elif "png" in mime_type:
        ext = "png"
    else:
        ext = "jpg"
    filename = f"gen_{uuid.uuid4().hex[:12]}.{ext}"
    path = os.path.join(MEDIA_DIR, filename)
    with open(path, "wb") as f:
        f.write(data)
    return filename


def _create_asset_record(
    asset_id: str,
    name: str,
    filename: str,
    prompt: str,
    width: Optional[int],
    height: Optional[int],
    provider: str,
    asset_type: str = "image",
    media_format: str = "image/png",
    duration: Optional[float] = None,
    thumbnail: Optional[str] = None,
    analysis: Optional[dict] = None,
) -> dict:
    """Create asset in DB + embedding + FTS, return asset dict."""
    thumb = thumbnail or filename
    a = analysis or {}
    a_name = a.get("name", name)
    a_name_cn = a.get("name_cn", a_name)
    a_subtype = a.get("subtype", "generated")
    a_desc = a.get("desc", prompt)
    a_tags = a.get("tags", provider)
    a_category = a.get("category", "ai-generated")

    with get_db() as conn:
        conn.execute(
            """INSERT INTO assets
               (id, name, name_cn, type, subtype, thumbnail, score, desc, tags,
                mediatype, category, format, uri, size, width, height,
                duration, source, user_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                asset_id, a_name, a_name_cn, asset_type, a_subtype,
                thumb, 0, a_desc, a_tags,
                asset_type, a_category, media_format,
                filename,
                os.path.getsize(os.path.join(MEDIA_DIR, filename)),
                width, height, duration, "created", "system",
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()

    asset_dict = dict(row)

    # Build embedding + FTS
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


def _compute_canvas_center(
    task_id: int,
    count: int,
    card_w: int = 240,
    card_h: int = 200,
    center_x: int | None = None,
    center_y: int | None = None,
) -> list[tuple[int, int]]:
    """Compute positions for new items around a center point.

    If center_x/center_y are provided (viewport center), use them;
    otherwise fall back to the canvas geometric center.
    """
    cx = center_x if center_x is not None else CANVAS_W // 2
    cy = center_y if center_y is not None else CANVAS_H // 2
    gap = 20

    total_w = count * card_w + (count - 1) * gap
    start_x = cx - total_w // 2
    start_y = cy - card_h // 2

    return [(start_x + i * (card_w + gap), start_y) for i in range(count)]


def _create_task_asset(task_id: int, asset_id: str, x: int, y: int, w: int = 240, h: int = 200) -> dict:
    """Link asset to task and add card position to canvas_config."""
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO task_assets (task_id, asset_id, on_canvas) VALUES (?,?,?)",
            (task_id, asset_id, "1"),
        )
        raw = conn.execute("SELECT canvas_config FROM tasks WHERE id = ?", (task_id,)).fetchone()
        cfg = {}
        if raw and raw["canvas_config"]:
            try:
                cfg = json.loads(raw["canvas_config"])
            except Exception:
                pass
        if "cards" not in cfg:
            cfg = {"viewport": {"offsetX": 0, "offsetY": 0, "scale": 0.85}, "cards": [], "connections": []}
        existing_ids = {c["asset_id"] for c in cfg["cards"]}
        if asset_id not in existing_ids:
            cfg["cards"].append({"asset_id": asset_id, "x": x, "y": y, "w": w, "h": h})
            conn.execute("UPDATE tasks SET canvas_config = ? WHERE id = ?",
                         (json.dumps(cfg, ensure_ascii=False), task_id))
        conn.commit()
        row = conn.execute(
            "SELECT * FROM task_assets WHERE task_id = ? AND asset_id = ?",
            (task_id, asset_id),
        ).fetchone()
        ta = dict(row)
        link_id = ta.pop("id")
        asset_row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
    return {
        "link_id": link_id,
        "task_id": ta["task_id"],
        "asset_id": ta["asset_id"],
        "on_canvas": ta.get("on_canvas", "1"),
        "asset": dict(asset_row),
    }


# ---------------------------------------------------------------------------
# Async generation endpoints
# ---------------------------------------------------------------------------


def _create_and_start_job(
    media_type: str,
    body,
    provider: str,
) -> dict:
    """Create a generation_jobs record and start a background thread."""
    job_id = uuid.uuid4().hex[:16]
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (body.task_id,)).fetchone()
        if task is None:
            raise HTTPException(404, "Task not found")

        conn.execute(
            """INSERT INTO generation_jobs
               (id, task_id, session_id, media_type, provider, prompt, config, count, center_x, center_y, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                job_id, body.task_id, body.session_id, media_type, provider, body.prompt,
                json.dumps(body.config, ensure_ascii=False),
                body.count, body.center_x, body.center_y, "pending",
            ),
        )
        conn.commit()

    t = threading.Thread(target=_run_generation_job, args=(job_id,), daemon=True)
    t.start()

    return {"job_id": job_id, "status": "pending"}


class GenerateVideoRequest(BaseModel):
    task_id: int
    prompt: str
    provider: str = "seedance"
    config: dict = {}
    count: int = 1
    center_x: Optional[int] = None
    center_y: Optional[int] = None
    session_id: Optional[int] = None


class GenerateAudioRequest(BaseModel):
    task_id: int
    prompt: str
    provider: str = "minimax_music"
    config: dict = {}
    count: int = 1
    center_x: Optional[int] = None
    center_y: Optional[int] = None
    session_id: Optional[int] = None


@router.post("/generate/image")
def generate_image(body: GenerateImageRequest):
    provider = _normalize_provider(body.provider)
    p = _PROVIDERS.get(provider)
    if not p:
        raise HTTPException(400, f"Unknown provider: {body.provider}")
    return JSONResponse(_create_and_start_job("image", body, provider), status_code=202)


@router.post("/generate/video")
def generate_video(body: GenerateVideoRequest):
    provider = _normalize_provider(body.provider)
    p = _PROVIDERS.get(provider)
    logger.info(
        "generate_video request raw_provider=%s normalized_provider=%s task_id=%s count=%s",
        body.provider, provider, body.task_id, body.count,
    )
    if not p or p["type"] != "video":
        raise HTTPException(400, f"Unknown video provider: {body.provider}")
    return JSONResponse(_create_and_start_job("video", body, provider), status_code=202)


@router.post("/generate/audio")
def generate_audio(body: GenerateAudioRequest):
    provider = _normalize_provider(body.provider)
    p = _PROVIDERS.get(provider)
    if not p or p["type"] != "audio":
        raise HTTPException(400, f"Unknown audio provider: {body.provider}")
    return JSONResponse(_create_and_start_job("audio", body, provider), status_code=202)


class GenerateNarrationRequest(BaseModel):
    task_id: int
    prompt: str
    provider: str = "default"
    config: dict = {}
    count: int = 1
    center_x: Optional[int] = None
    center_y: Optional[int] = None
    session_id: Optional[int] = None
    language: str = "中文"


class NarrationStreamRequest(BaseModel):
    task_id: int
    prompt: str
    session_id: Optional[int] = None
    language: str = "中文"
    existing_narration_id: Optional[str] = None


@router.post("/generate/narration/stream")
def narration_stream(body: NarrationStreamRequest):
    """SSE endpoint: routes through ChatAgent.
    - Simple questions → streams chat tokens directly (fast).
    - Product descriptions → triggers LangGraph pipeline → saves narration to DB.
    Event types forwarded: token, chat, progress, copy, error.
    """
    from services.textgen import stream_narration_chat
    import sqlite3 as _sqlite3

    chat_key = str(body.session_id or f"task_{body.task_id}")

    def event_gen():
        try:
            for event_type, payload in stream_narration_chat(
                session_id=chat_key,
                message=body.prompt,
                language=body.language,
            ):
                out = {"type": event_type, **payload}

                if event_type == "copy":
                    data = payload.get("data") or {}
                    title = (
                        (data.get("video_project") or {}).get("metadata", {}).get("product_name")
                        or body.prompt[:30]
                        or "未命名旁白"
                    )
                    title = title[:60]
                    content = json.dumps(data, ensure_ascii=False)
                    existing_id = body.existing_narration_id
                    try:
                        with get_db() as conn:
                            if existing_id:
                                # Update the existing narration in-place (modification scenario).
                                conn.execute(
                                    "UPDATE narations SET title = ?, content = ? WHERE id = ?",
                                    (title, content, existing_id),
                                )
                                conn.execute(
                                    "DELETE FROM naration_fts WHERE naration_id = ?",
                                    (existing_id,),
                                )
                                conn.execute(
                                    "INSERT INTO naration_fts (naration_id, title, content) VALUES (?, ?, ?)",
                                    (existing_id, title, content),
                                )
                                narration_id = existing_id
                            else:
                                # Insert a fresh narration (new generation scenario).
                                narration_id = uuid.uuid4().hex[:16]
                                conn.execute(
                                    "INSERT INTO narations (id, title, content) VALUES (?, ?, ?)",
                                    (narration_id, title, content),
                                )
                                conn.execute(
                                    "INSERT INTO naration_fts (naration_id, title, content) VALUES (?, ?, ?)",
                                    (narration_id, title, content),
                                )
                                try:
                                    conn.execute(
                                        "INSERT INTO task_narations (task_id, naration_id, on_canvas) VALUES (?, ?, ?)",
                                        (body.task_id, narration_id, "1"),
                                    )
                                except _sqlite3.IntegrityError:
                                    pass
                            conn.commit()
                    except Exception as exc:
                        logger.exception("Failed to save narration: %s", exc)
                        out["type"] = "error"
                        out["message"] = str(exc)
                        yield f"data: {json.dumps(out, ensure_ascii=False)}\n\n"
                        return
                    out["narration_id"] = narration_id
                    out["title"] = title

                yield f"data: {json.dumps(out, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.exception("narration_stream error: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.post("/generate/narration")
def generate_narration(body: GenerateNarrationRequest):
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (body.task_id,)).fetchone()
        if task is None:
            raise HTTPException(404, "Task not found")

    narration_id = uuid.uuid4().hex[:16]
    from services.textgen import generate_narration as _textgen
    title, content = _textgen(body.prompt, body.language)

    with get_db() as conn:
        conn.execute(
            "INSERT INTO narations (id, title, content) VALUES (?, ?, ?)",
            (narration_id, title, content),
        )
        conn.execute(
            "INSERT INTO naration_fts (naration_id, title, content) VALUES (?, ?, ?)",
            (narration_id, title, content),
        )
        import sqlite3 as _sqlite3
        try:
            conn.execute(
                "INSERT INTO task_narations (task_id, naration_id, on_canvas) VALUES (?, ?, ?)",
                (body.task_id, narration_id, "1"),
            )
        except _sqlite3.IntegrityError:
            pass
        conn.commit()
        nr = conn.execute("SELECT * FROM narations WHERE id = ?", (narration_id,)).fetchone()

    narration_data = dict(nr)
    structured_data = None
    try:
        import json as _json
        parsed = _json.loads(content)
        if parsed.get("video_project"):
            structured_data = parsed
    except Exception:
        pass
    return JSONResponse({
        "narration_id": narration_id,
        "narration": narration_data,
        "structured_data": structured_data,
    }, status_code=200)


# ---------------------------------------------------------------------------
# Job query & SSE progress stream
# ---------------------------------------------------------------------------


@router.get("/generate/jobs")
def list_jobs(task_id: Optional[int] = None, status: Optional[str] = None):
    clauses = []
    params: list = []
    if task_id is not None:
        clauses.append("task_id = ?")
        params.append(task_id)
    if status:
        statuses = [s.strip() for s in status.split(",")]
        placeholders = ",".join("?" * len(statuses))
        clauses.append(f"status IN ({placeholders})")
        params.extend(statuses)
    where = " AND ".join(clauses) if clauses else "1=1"
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM generation_jobs WHERE {where} ORDER BY created_at DESC", params,
        ).fetchall()
    jobs = []
    for r in rows:
        d = dict(r)
        for k in ("results", "errors", "config"):
            if isinstance(d.get(k), str):
                try:
                    d[k] = json.loads(d[k])
                except Exception:
                    pass
        jobs.append(d)
    return jobs


@router.get("/generate/jobs/{job_id}")
def get_job_detail(job_id: str):
    job = _get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    for k in ("results", "errors", "config"):
        if isinstance(job.get(k), str):
            try:
                job[k] = json.loads(job[k])
            except Exception:
                pass
    return job


@router.get("/generate/jobs/{job_id}/stream")
async def stream_job(job_id: str):
    job = _get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    import asyncio

    async def event_stream():
        last_progress = -1
        while True:
            j = _get_job(job_id)
            if not j:
                yield f"event: error\ndata: {json.dumps({'error': 'Job not found'})}\n\n"
                return

            progress = j.get("progress", 0)
            status = j.get("status", "pending")

            if progress != last_progress or status in ("complete", "failed"):
                payload = {
                    "status": status,
                    "progress": progress,
                    "message": j.get("message", ""),
                }
                if status == "complete":
                    results_raw = j.get("results", "[]")
                    errors_raw = j.get("errors", "[]")
                    try:
                        payload["results"] = json.loads(results_raw) if isinstance(results_raw, str) else results_raw
                    except Exception:
                        payload["results"] = []
                    try:
                        payload["errors"] = json.loads(errors_raw) if isinstance(errors_raw, str) else errors_raw
                    except Exception:
                        payload["errors"] = []
                    yield f"event: complete\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"
                    return
                elif status == "failed":
                    errors_raw = j.get("errors", "[]")
                    try:
                        payload["errors"] = json.loads(errors_raw) if isinstance(errors_raw, str) else errors_raw
                    except Exception:
                        payload["errors"] = []
                    yield f"event: error\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"
                    return
                else:
                    yield f"event: progress\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                last_progress = progress

            await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
