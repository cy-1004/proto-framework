import json
import logging
import os
import subprocess
import threading
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from db import consume_quota, get_db, log_tool_usage
from deps import require_login, require_quota_enabled
from routers.generate import (
    MEDIA_DIR,
    _PROVIDERS,
    _get_video_size,
    _save_media,
)
from services.ToolsCollection.transcribe import _create_tool_job, _get_tool_job, _update_tool_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])

# Storage: env-configurable; default matches production nginx static root
TOOLS_MEDIA_DIR = os.getenv("TOOLS_MEDIA_DIR", "/var/www/static/media/tools")
TOOLS_MEDIA_URL = os.getenv("TOOLS_MEDIA_URL", "/static/media/tools")
VIDEO_OUT_DIR = os.path.join(TOOLS_MEDIA_DIR, "video")
os.makedirs(VIDEO_OUT_DIR, exist_ok=True)

# Temp dir for uploaded reference images (not deleted per data-protection policy)
TOOLS_TMP_DIR = os.path.join(MEDIA_DIR, "tools_tmp")
os.makedirs(TOOLS_TMP_DIR, exist_ok=True)

VIDEO_PROVIDERS = {k for k, v in _PROVIDERS.items() if v.get("type") == "video"}

# Providers that consume user quota (comma-separated in .env: QUOTA_GATED_PROVIDERS=seedance-2.0,seedance-2.0-fast)
_QUOTA_GATED_PROVIDERS: set[str] = set(
    p.strip() for p in os.getenv("QUOTA_GATED_PROVIDERS", "").split(",") if p.strip()
)


def _is_quota_gated(provider_key: str) -> bool:
    return provider_key in _QUOTA_GATED_PROVIDERS


def _extract_tool_thumbnail(video_path: str) -> str | None:
    """Extract first frame as JPEG thumbnail next to the video file. Returns URL or None."""
    uid = uuid.uuid4().hex[:8]
    thumb_path = os.path.join(VIDEO_OUT_DIR, f"thumb_{uid}.jpg")
    try:
        r = subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-ss", "0", "-vframes", "1", "-q:v", "2", thumb_path],
            capture_output=True, timeout=30,
        )
        if r.returncode == 0 and os.path.exists(thumb_path):
            return f"{TOOLS_MEDIA_URL}/video/thumb_{uid}.jpg"
    except Exception:
        pass
    return None


def _run_video_job(
    job_id: str,
    user_id: int,
    user_name: str,
    provider_key: str,
    prompt: str,
    config: dict,
):
    p = _PROVIDERS[provider_key]

    def progress_cb(cur: int, total: int, label: str = ""):
        pct = max(10, min(95, int(cur / max(total, 1) * 85) + 10))
        msg = f"正在等待 {label} 返回 ({cur}/{total})" if label else f"生成中 ({cur}/{total})"
        _update_tool_job(job_id, progress=pct, message=msg)

    try:
        _update_tool_job(job_id, status="running", progress=5, message="正在提交生成任务...")
        usage_out: dict = {}
        video_bytes, mime_type = p["fn"](prompt, config, p["model"], progress_cb=progress_cb, usage_out=usage_out)
        _update_tool_job(job_id, progress=96, message="正在保存视频...")

        # Determine file extension from mime type
        ext = {"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}.get(mime_type, "mp4")
        uid = uuid.uuid4().hex[:12]
        filename = f"{uid}.{ext}"
        video_path = os.path.join(VIDEO_OUT_DIR, filename)
        with open(video_path, "wb") as f:
            f.write(video_bytes)

        output_url = f"{TOOLS_MEDIA_URL}/video/{filename}"
        thumb_url = _extract_tool_thumbnail(video_path)
        vid_w, vid_h = _get_video_size(video_path)
        duration = config.get("duration")

        result = json.dumps({
            "url": output_url,
            "thumbnail": thumb_url,
            "width": vid_w,
            "height": vid_h,
            "duration": duration,
        }, ensure_ascii=False)

        _update_tool_job(
            job_id,
            status="complete",
            progress=100,
            message="生成完成",
            result=result,
            completed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )

        # Quota: increment usage after successful generation
        if _is_quota_gated(provider_key):
            consume_quota(user_id)

        total_tokens = usage_out.get("total_tokens")
        log_tool_usage(
            user_id=user_id,
            user_name=user_name,
            tool="video",
            model=p["model"],
            input_text=prompt,
            output_url=output_url,
            output_type="video",
            total_tokens=total_tokens,
        )

    except Exception as e:
        logger.exception("video tool job failed: %s", job_id)
        _update_tool_job(
            job_id,
            status="failed",
            progress=100,
            message=str(e),
            error=str(e),
            completed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        log_tool_usage(
            user_id=user_id,
            user_name=user_name,
            tool="video",
            model=p["model"],
            input_text=prompt,
            status="failed",
        )


@router.post("/video/generate")
async def submit_video_generate(
    user: dict = Depends(require_login),
    provider: str = Form(...),
    prompt: str = Form(...),
    config: str = Form(default="{}"),
    image: UploadFile | None = File(default=None),
):
    if provider not in VIDEO_PROVIDERS:
        raise HTTPException(400, f"未知 provider: {provider}，可用: {sorted(VIDEO_PROVIDERS)}")
    if not prompt.strip():
        raise HTTPException(400, "prompt 不能为空")

    # Quota gate: check before starting the job
    if _is_quota_gated(provider):
        from deps import ENABLE_LOGIN
        if ENABLE_LOGIN and user.get("enable", 1) == 0:
            raise HTTPException(403, "您的使用配额已耗尽，无法调用该模型，请联系管理员")

    try:
        cfg: dict = json.loads(config) if config.strip() else {}
    except json.JSONDecodeError:
        raise HTTPException(400, "config 必须是合法 JSON")

    if image:
        suffix = os.path.splitext(image.filename or "ref")[1] or ".jpg"
        img_name = f"tools_tmp/{uuid.uuid4().hex[:12]}{suffix}"
        img_path = os.path.join(MEDIA_DIR, img_name)
        content = await image.read()
        with open(img_path, "wb") as f:
            f.write(content)
        existing = cfg.get("media_files") or []
        existing.insert(0, {"filename": img_name, "mediaType": "image"})
        cfg["media_files"] = existing

    job_id = _create_tool_job(
        user["id"], "video_generate",
        _PROVIDERS[provider]["model"],
        "text" if not image else "image+text",
        prompt[:80],
    )
    threading.Thread(
        target=_run_video_job,
        args=(job_id, user["id"], user.get("name", ""), provider, prompt.strip(), cfg),
        daemon=True,
    ).start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/video/providers")
def list_video_providers():
    return [
        {
            "key": k,
            "model": _PROVIDERS[k]["model"],
            "quota_gated": _is_quota_gated(k),
        }
        for k in sorted(VIDEO_PROVIDERS)
    ]
