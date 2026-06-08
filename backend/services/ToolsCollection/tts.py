import logging
import os
import uuid

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_db
from deps import require_login
from services.ToolsCollection.transcribe import _create_tool_job, _update_tool_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])

TTS_API_URL = "https://api.minimax.io/v1/t2a_v2"
TTS_MODEL = "speech-2.8-hd"
MEDIA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "media")
TTS_DIR = os.path.join(MEDIA_DIR, "tools_tts")
os.makedirs(TTS_DIR, exist_ok=True)


class PronunciationEntry(BaseModel):
    text: str
    pronunciation: str


class TTSRequest(BaseModel):
    text: str
    voice_id: str = "Chinese (Mandarin)_Unrestrained_Young_Man"
    speed: float = 1.0
    vol: float = 1.0
    pitch: int = 0
    emotion: str = "neutral"
    pronunciation_dict: list[PronunciationEntry] = []


@router.post("/tts")
def synthesize_tts(body: TTSRequest, user: dict = Depends(require_login)):
    api_key = os.environ.get("MINIMAX_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "MINIMAX_API_KEY 未配置")
    if not body.text.strip():
        raise HTTPException(400, "文本内容不能为空")

    job_id = _create_tool_job(user["id"], "tts", TTS_MODEL, "text", body.text[:80])
    _update_tool_job(job_id, status="running", progress=10, message="正在调用 MiniMax TTS...")

    voice_setting: dict = {
        "voice_id": body.voice_id,
        "speed": body.speed,
        "vol": body.vol,
        "pitch": body.pitch,
    }
    if body.emotion and body.emotion != "neutral":
        voice_setting["emotion"] = body.emotion

    payload: dict = {
        "model": TTS_MODEL,
        "text": body.text.strip(),
        "stream": False,
        "subtitle_enable": False,
        "voice_setting": voice_setting,
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": "mp3",
            "channel": 1,
        },
    }

    if body.pronunciation_dict:
        tone_list = [
            f"{e.text}/{e.pronunciation}" for e in body.pronunciation_dict if e.text and e.pronunciation
        ]
        if tone_list:
            payload["pronunciation_dict"] = {"tone": tone_list}

    try:
        resp = requests.post(
            TTS_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            timeout=120,
        )
        result = resp.json()
    except Exception as e:
        _update_tool_job(job_id, status="failed", progress=100, message=str(e), error=str(e))
        raise HTTPException(502, f"TTS 请求失败: {e}")

    base_resp = result.get("base_resp", {})
    if base_resp.get("status_code", -1) != 0:
        msg = base_resp.get("status_msg", "Unknown TTS error")
        _update_tool_job(job_id, status="failed", progress=100, message=msg, error=msg)
        raise HTTPException(502, f"MiniMax TTS 错误: {msg}")

    audio_hex = result.get("data", {}).get("audio", "")
    if not audio_hex:
        err = "MiniMax 未返回音频数据"
        _update_tool_job(job_id, status="failed", progress=100, message=err, error=err)
        raise HTTPException(502, err)

    uid = uuid.uuid4().hex[:12]
    filename = f"tools_tts/{uid}.mp3"
    audio_path = os.path.join(MEDIA_DIR, filename)
    with open(audio_path, "wb") as f:
        f.write(bytes.fromhex(audio_hex))

    duration_ms = result.get("extra_info", {}).get("audio_length", 0)
    duration_s = round(duration_ms / 1000, 2) if duration_ms else None
    file_size = os.path.getsize(audio_path)
    cost = round((duration_s or 0) / 3600 * 0.1, 6)

    _update_tool_job(
        job_id,
        status="complete",
        progress=100,
        message="生成完成",
        result=filename,
        audio_duration=duration_s,
        cost_usd=cost,
    )

    return {
        "job_id": job_id,
        "url": f"/media/{filename}",
        "duration": duration_s,
        "size": file_size,
    }
