import json
import os
import re
import uuid

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db

router = APIRouter(prefix="/api")

MEDIA_DIR = os.path.join(os.path.dirname(__file__), "..", "media")
NARATIONS_DIR = os.path.join(MEDIA_DIR, "narations")
os.makedirs(NARATIONS_DIR, exist_ok=True)

TTS_API_URL = "https://api.minimax.io/v1/t2a_v2"


def _split_by_punctuation(text: str) -> list[str]:
    segments = re.split(r'(?<=[，。！？；,.!?;])', text)
    return [s.strip() for s in segments if s.strip()]


def _get_naration_row(conn, naration_id: str) -> dict:
    row = conn.execute(
        "SELECT * FROM narations WHERE id = ?", (naration_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Naration data not found")
    return dict(row)


def _load_segments(subtitles_path: str | None) -> list[dict] | None:
    if not subtitles_path:
        return None
    full = os.path.join(MEDIA_DIR, subtitles_path)
    if not os.path.isfile(full):
        return None
    with open(full, "r", encoding="utf-8") as f:
        return json.load(f)


def _naration_to_pseudo_asset(n: dict) -> dict:
    return {
        "id": n["id"],
        "name": n["title"],
        "name_cn": n["title"],
        "type": "naration",
        "subtype": "naration",
        "thumbnail": None,
        "score": 0,
        "featured": "0",
        "desc": None,
        "tags": None,
        "mediatype": "audio",
        "category": None,
        "format": "mp3",
        "uri": n.get("uri"),
        "size": n.get("size", 0),
        "width": None,
        "height": None,
        "duration": n.get("duration"),
        "source": "created",
        "user_id": "",
        "favorite": "0",
        "created_at": n.get("created_at"),
    }


@router.get("/narations/{naration_id}")
def get_naration(naration_id: str):
    with get_db() as conn:
        data = _get_naration_row(conn, naration_id)
    segments = _load_segments(data.get("subtitles"))
    if segments is not None:
        data["segments"] = segments
    return data


@router.get("/narations")
def list_narations():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM narations ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


class NarationCreate(BaseModel):
    id: str
    title: str
    content: str


@router.post("/narations")
def create_naration(body: NarationCreate):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO narations (id, title, content) VALUES (?, ?, ?)",
            (body.id, body.title, body.content),
        )
        conn.execute(
            "INSERT INTO naration_fts (naration_id, title, content) VALUES (?, ?, ?)",
            (body.id, body.title, body.content),
        )
        conn.commit()
        return _get_naration_row(conn, body.id)


@router.delete("/narations/{naration_id}", status_code=204)
def delete_naration(naration_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM narations WHERE id = ?", (naration_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Naration not found")
        data = dict(row)
        for field in ("audio", "subtitles"):
            fpath = data.get(field)
            if fpath:
                full = os.path.join(MEDIA_DIR, fpath)
                if os.path.isfile(full):
                    os.remove(full)
        conn.execute("DELETE FROM naration_fts WHERE naration_id = ?", (naration_id,))
        conn.execute("DELETE FROM task_narations WHERE naration_id = ?", (naration_id,))
        conn.execute("DELETE FROM narations WHERE id = ?", (naration_id,))
        conn.commit()


class ContentUpdate(BaseModel):
    content: str


@router.put("/narations/{naration_id}/content")
def update_content(naration_id: str, body: ContentUpdate):
    with get_db() as conn:
        data = _get_naration_row(conn, naration_id)
        if data["tts_done"] == "1":
            raise HTTPException(400, "Cannot edit content after TTS is done. Reset first.")
        conn.execute(
            "UPDATE narations SET content = ? WHERE id = ?",
            (body.content, naration_id),
        )
        conn.execute("DELETE FROM naration_fts WHERE naration_id = ?", (naration_id,))
        conn.execute(
            "INSERT INTO naration_fts (naration_id, title, content) VALUES (?, ?, ?)",
            (naration_id, data["title"], body.content),
        )
        conn.commit()
        return _get_naration_row(conn, naration_id)


class TTSRequest(BaseModel):
    voice_id: str = "Chinese (Mandarin)_Unrestrained_Young_Man"


@router.post("/narations/{naration_id}/tts")
def synthesize_tts(naration_id: str, body: TTSRequest = TTSRequest()):
    api_key = os.environ.get("MINIMAX_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "MINIMAX_API_KEY not configured")

    with get_db() as conn:
        data = _get_naration_row(conn, naration_id)
        if data["tts_done"] == "1":
            raise HTTPException(400, "TTS already done. Reset first.")
        content = data["content"]

    segments = _split_by_punctuation(content)
    joined = "\n".join(segments) if segments else content

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": "speech-2.8-hd",
        "text": joined,
        "stream": False,
        "subtitle_enable": True,
        "voice_setting": {
            "voice_id": body.voice_id,
            "speed": 1, "vol": 1, "pitch": 0,
        },
        "audio_setting": {
            "sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1,
        },
    }

    resp = requests.post(TTS_API_URL, json=payload, headers=headers, timeout=120)
    result = resp.json()

    if result.get("base_resp", {}).get("status_code", -1) != 0:
        msg = result.get("base_resp", {}).get("status_msg", "Unknown TTS error")
        raise HTTPException(502, f"TTS API error: {msg}")

    uid = uuid.uuid4().hex[:8]
    audio_filename = f"narations/{uid}.mp3"
    subs_filename = f"narations/{uid}.json"

    audio_hex = result["data"]["audio"]
    audio_path = os.path.join(MEDIA_DIR, audio_filename)
    with open(audio_path, "wb") as f:
        f.write(bytes.fromhex(audio_hex))

    subtitle_url = result["data"].get("subtitle_file")
    subs_data = []
    if subtitle_url:
        subs_data = requests.get(subtitle_url, timeout=30).json()
    subs_path = os.path.join(MEDIA_DIR, subs_filename)
    with open(subs_path, "w", encoding="utf-8") as f:
        json.dump(subs_data, f, ensure_ascii=False, indent=2)

    duration_ms = result.get("extra_info", {}).get("audio_length", 0)
    duration_s = round(duration_ms / 1000, 2) if duration_ms else None
    file_size = os.path.getsize(audio_path)

    with get_db() as conn:
        conn.execute(
            "UPDATE narations SET tts_done='1', audio=?, subtitles=?, uri=?, duration=?, size=? WHERE id=?",
            (audio_filename, subs_filename, audio_filename, duration_s, file_size, naration_id),
        )
        conn.commit()
        data = _get_naration_row(conn, naration_id)

    data["segments"] = subs_data
    return data


@router.post("/narations/{naration_id}/reset")
def reset_tts(naration_id: str):
    with get_db() as conn:
        data = _get_naration_row(conn, naration_id)

        for field in ("audio", "subtitles"):
            fpath = data.get(field)
            if fpath:
                full = os.path.join(MEDIA_DIR, fpath)
                if os.path.isfile(full):
                    os.remove(full)

        conn.execute(
            "UPDATE narations SET tts_done='0', audio=NULL, subtitles=NULL, uri=NULL, duration=NULL WHERE id=?",
            (naration_id,),
        )
        conn.commit()
        return _get_naration_row(conn, naration_id)


@router.get("/narations/search/{query}")
def search_narations(query: str, limit: int = 20):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT naration_id, rank FROM naration_fts WHERE naration_fts MATCH ? ORDER BY rank LIMIT ?",
            (query, limit),
        ).fetchall()
        ids = [r["naration_id"] for r in rows]
        if not ids:
            return []
        placeholders = ",".join(["?"] * len(ids))
        narations = conn.execute(
            f"SELECT * FROM narations WHERE id IN ({placeholders})", ids
        ).fetchall()
        return [dict(r) for r in narations]


NARATION_LINK_OFFSET = 1_000_000


def build_task_naration_dict(tn_row, naration_row) -> dict:
    tn_d = dict(tn_row)
    link_id = tn_d.pop("id") + NARATION_LINK_OFFSET
    n = dict(naration_row)
    return {
        "link_id": link_id,
        "task_id": tn_d["task_id"],
        "asset_id": tn_d["naration_id"],
        "on_canvas": tn_d.get("on_canvas", "1"),
        "asset": _naration_to_pseudo_asset(n),
    }
