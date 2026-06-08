import asyncio
import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import uuid
from datetime import datetime

import assemblyai as aai
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from db import get_db
from deps import require_login

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])


def _create_tool_job(user_id: int, tool: str, model: str, input_type: str, input_ref: str) -> str:
    job_id = uuid.uuid4().hex[:16]
    with get_db() as conn:
        conn.execute(
            """INSERT INTO tool_jobs (id, user_id, tool, model, input_type, input_ref)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (job_id, user_id, tool, model, input_type, input_ref),
        )
        conn.commit()
    return job_id


def _update_tool_job(job_id: str, **kwargs):
    cols = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values())
    vals.append(job_id)
    with get_db() as conn:
        conn.execute(f"UPDATE tool_jobs SET {cols} WHERE id = ?", vals)
        conn.commit()


def _get_tool_job(job_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tool_jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def _cleanup_dir(tmp_dir: str):
    try:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        pass


def _do_transcribe(job_id: str, audio_path: str, tmp_dir: str):
    """Submit audio to AssemblyAI and wait for result (blocking)."""
    try:
        api_key = os.environ.get("ASSEMBLYAI_API_KEY", "")
        if not api_key:
            raise ValueError("ASSEMBLYAI_API_KEY 未配置，请联系管理员")

        _update_tool_job(job_id, progress=40, message="正在提交至 AssemblyAI...")
        aai.settings.api_key = api_key
        transcript = aai.Transcriber().transcribe(audio_path)

        if transcript.status == aai.TranscriptStatus.error:
            raise RuntimeError(f"AssemblyAI 识别失败: {transcript.error}")

        duration = getattr(transcript, "audio_duration", None)
        cost = round(duration / 3600 * 0.65, 6) if duration else None

        _update_tool_job(
            job_id,
            status="complete",
            progress=100,
            message="转录完成",
            result=transcript.text or "",
            audio_duration=duration,
            cost_usd=cost,
            completed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
    except Exception as e:
        logger.exception("transcribe job failed: %s", job_id)
        _update_tool_job(
            job_id,
            status="failed",
            progress=100,
            message=str(e),
            error=str(e),
            completed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
    finally:
        _cleanup_dir(tmp_dir)


def _run_file_job(job_id: str, src_path: str, tmp_dir: str):
    audio_path = os.path.join(tmp_dir, "audio.mp3")
    try:
        _update_tool_job(job_id, status="running", progress=10, message="正在提取音频...")
        r = subprocess.run(
            ["ffmpeg", "-y", "-i", src_path, "-vn", "-acodec", "libmp3lame", "-q:a", "4", audio_path],
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            raise RuntimeError(f"FFmpeg 提取音频失败: {r.stderr[-400:]}")
        _update_tool_job(job_id, progress=30, message="音频提取完成，正在识别...")
    except Exception as e:
        logger.exception("ffmpeg failed for job %s", job_id)
        _update_tool_job(
            job_id,
            status="failed",
            progress=100,
            message=str(e),
            error=str(e),
            completed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        _cleanup_dir(tmp_dir)
        return
    _do_transcribe(job_id, audio_path, tmp_dir)


def _run_url_job(job_id: str, url: str, tmp_dir: str):
    audio_path = os.path.join(tmp_dir, "audio.mp3")
    try:
        _update_tool_job(job_id, status="running", progress=10, message="正在下载 TikTok 音频...")
        r = subprocess.run(
            [
                "yt-dlp", "-f", "bestaudio", "-x",
                "--audio-format", "mp3",
                "--audio-quality", "5",
                "--no-playlist",
                "-o", os.path.join(tmp_dir, "audio.%(ext)s"),
                url,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode != 0:
            combined = (r.stderr or "") + (r.stdout or "")
            tail = combined[-800:]
            if any(k in tail for k in ("Sign in", "login required", "cookies", "Log in")):
                raise RuntimeError("TikTok 要求登录认证，暂无法访问该视频")
            elif any(k in tail.lower() for k in ("private", "不公开")):
                raise RuntimeError("该视频为私密视频，无法下载")
            else:
                raise RuntimeError(f"音频下载失败: {tail}")

        if not os.path.exists(audio_path):
            raise RuntimeError("音频文件未生成，请检查链接是否有效")

        _update_tool_job(job_id, progress=30, message="音频下载完成，正在识别...")
    except subprocess.TimeoutExpired:
        _update_tool_job(
            job_id,
            status="failed",
            progress=100,
            message="下载超时（120s），请检查链接或网络状态",
            error="yt-dlp timeout",
            completed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        _cleanup_dir(tmp_dir)
        return
    except Exception as e:
        logger.exception("yt-dlp failed for job %s", job_id)
        _update_tool_job(
            job_id,
            status="failed",
            progress=100,
            message=str(e),
            error=str(e),
            completed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        _cleanup_dir(tmp_dir)
        return
    _do_transcribe(job_id, audio_path, tmp_dir)


@router.post("/transcribe")
async def submit_transcribe(
    user: dict = Depends(require_login),
    file: UploadFile | None = File(default=None),
    url: str | None = Form(default=None),
):
    """
    接受视频/音频文件上传 或 TikTok 链接，异步转录为文本。
    返回 job_id，前端通过 /api/tools/jobs/{job_id}/stream 获取进度。
    """
    if not file and not url:
        raise HTTPException(400, "请上传文件或提供 TikTok 链接")
    if file and url:
        raise HTTPException(400, "只能选择一种方式：上传文件或提供链接")

    tmp_dir = tempfile.mkdtemp(prefix="tools_transcribe_")

    if file:
        suffix = os.path.splitext(file.filename or "upload")[1] or ".mp4"
        src_path = os.path.join(tmp_dir, f"upload{suffix}")
        content = await file.read()
        with open(src_path, "wb") as f:
            f.write(content)

        job_id = _create_tool_job(user["id"], "transcribe", "assemblyai", "file", file.filename or "upload")
        threading.Thread(target=_run_file_job, args=(job_id, src_path, tmp_dir), daemon=True).start()
    else:
        job_id = _create_tool_job(user["id"], "transcribe", "assemblyai", "url", url.strip())
        threading.Thread(target=_run_url_job, args=(job_id, url.strip(), tmp_dir), daemon=True).start()

    return {"job_id": job_id, "status": "pending"}


@router.get("/jobs/{job_id}")
def get_tool_job(job_id: str, user: dict = Depends(require_login)):
    job = _get_tool_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/jobs/{job_id}/stream")
async def stream_tool_job(job_id: str):
    job = _get_tool_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    async def event_stream():
        last_progress = -1
        while True:
            j = _get_tool_job(job_id)
            if not j:
                yield f"event: error\ndata: {json.dumps({'error': 'Job not found'})}\n\n"
                return

            progress = j.get("progress", 0)
            status = j.get("status", "pending")

            if progress != last_progress or status in ("complete", "failed"):
                payload = {"status": status, "progress": progress, "message": j.get("message", "")}
                if status == "complete":
                    payload["result"] = j.get("result", "")
                    payload["audio_duration"] = j.get("audio_duration")
                    payload["cost_usd"] = j.get("cost_usd")
                    yield f"event: complete\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                    return
                elif status == "failed":
                    payload["error"] = j.get("error", "")
                    yield f"event: error\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                    return
                else:
                    yield f"event: progress\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                last_progress = progress

            await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
