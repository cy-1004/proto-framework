import json
import logging
import os
import threading
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from deps import require_login
from routers.generate import (
    MEDIA_DIR,
    _PROVIDERS,
    _extract_video_thumbnail,
    _get_video_size,
    _save_media,
)
from services.ToolsCollection.transcribe import _create_tool_job, _get_tool_job, _update_tool_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])

TOOLS_TMP_DIR = os.path.join(MEDIA_DIR, "tools_tmp")
os.makedirs(TOOLS_TMP_DIR, exist_ok=True)

VIDEO_PROVIDERS = {k for k, v in _PROVIDERS.items() if v.get("type") == "video"}


def _run_video_job(job_id: str, provider_key: str, prompt: str, config: dict):
    p = _PROVIDERS[provider_key]

    def progress_cb(cur: int, total: int, label: str = ""):
        pct = max(10, min(95, int(cur / max(total, 1) * 85) + 10))
        msg = f"正在等待 {label} 返回 ({cur}/{total})" if label else f"生成中 ({cur}/{total})"
        _update_tool_job(job_id, progress=pct, message=msg)

    try:
        _update_tool_job(job_id, status="running", progress=5, message="正在提交生成任务...")
        video_bytes, mime_type = p["fn"](prompt, config, p["model"], progress_cb=progress_cb)
        _update_tool_job(job_id, progress=96, message="正在保存视频...")
        filename = _save_media(video_bytes, mime_type)
        vid_path = os.path.join(MEDIA_DIR, filename)
        thumb = _extract_video_thumbnail(vid_path)
        vid_w, vid_h = _get_video_size(vid_path)
        duration = config.get("duration")

        result = json.dumps({
            "url": f"/media/{filename}",
            "thumbnail": f"/media/{thumb}" if thumb else None,
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
        user["id"], "video_generate", _PROVIDERS[provider]["model"], "text" if not image else "image+text", prompt[:80]
    )
    threading.Thread(target=_run_video_job, args=(job_id, provider, prompt.strip(), cfg), daemon=True).start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/video/providers")
def list_video_providers():
    return [
        {"key": k, "model": _PROVIDERS[k]["model"]}
        for k in sorted(VIDEO_PROVIDERS)
    ]
