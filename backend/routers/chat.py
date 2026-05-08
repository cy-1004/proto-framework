import os
import json

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from db import get_db

router = APIRouter(prefix="/api/chat")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class SessionCreate(BaseModel):
    task_id: int
    stage: str
    mode: str
    title: Optional[str] = None


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    mode: Optional[str] = None


class MessageSend(BaseModel):
    content: str
    model: str = "minimax/minimax-m2.7"


class MessageSave(BaseModel):
    content: str
    role: str = "user"
    msg_type: str = "text"


def _session_dict(row) -> dict:
    return {k: row[k] for k in row.keys()}


@router.get("/sessions")
def list_sessions(task_id: int, stage: str):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_sessions WHERE task_id=? AND stage=? ORDER BY id DESC",
            (task_id, stage),
        ).fetchall()
        return [_session_dict(r) for r in rows]


@router.post("/sessions")
def create_session(body: SessionCreate):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO chat_sessions (task_id, stage, mode, title) VALUES (?, ?, ?, ?)",
            (body.task_id, body.stage, body.mode, body.title),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM chat_sessions WHERE id=?", (cur.lastrowid,)).fetchone()
        return _session_dict(row)


@router.put("/sessions/{session_id}")
def update_session(session_id: int, body: SessionUpdate):
    with get_db() as conn:
        updates, params = [], []
        if body.title is not None:
            updates.append("title=?"); params.append(body.title)
        if body.mode is not None:
            updates.append("mode=?"); params.append(body.mode)
        if not updates:
            raise HTTPException(400, "No fields to update")
        params.append(session_id)
        conn.execute(f"UPDATE chat_sessions SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()
        row = conn.execute("SELECT * FROM chat_sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")
        return _session_dict(row)


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM chat_messages WHERE session_id=?", (session_id,))
        conn.execute("DELETE FROM chat_sessions WHERE id=?", (session_id,))
        conn.commit()
    return {"ok": True}


@router.get("/sessions/{session_id}/messages")
def list_messages(session_id: int):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE session_id=? ORDER BY id ASC",
            (session_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/sessions/{session_id}/save")
def save_message(session_id: int, body: MessageSave):
    with get_db() as conn:
        session = conn.execute("SELECT * FROM chat_sessions WHERE id=?", (session_id,)).fetchone()
        if not session:
            raise HTTPException(404, "Session not found")
        cur = conn.execute(
            "INSERT INTO chat_messages (session_id, role, content, msg_type) VALUES (?, ?, ?, ?)",
            (session_id, body.role, body.content, body.msg_type),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM chat_messages WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: int, body: MessageSend):
    with get_db() as conn:
        session = conn.execute("SELECT * FROM chat_sessions WHERE id=?", (session_id,)).fetchone()
        if not session:
            raise HTTPException(404, "Session not found")

        cur = conn.execute(
            "INSERT INTO chat_messages (session_id, role, content, model) VALUES (?, 'user', ?, ?)",
            (session_id, body.content, body.model),
        )
        conn.commit()
        user_msg = dict(conn.execute("SELECT * FROM chat_messages WHERE id=?", (cur.lastrowid,)).fetchone())

        history = conn.execute(
            "SELECT role, content FROM chat_messages WHERE session_id=? ORDER BY id ASC",
            (session_id,),
        ).fetchall()
        messages = [{"role": r["role"], "content": r["content"]} for r in history]

    async def event_stream():
        yield f"event: user_msg\ndata: {json.dumps(user_msg, ensure_ascii=False)}\n\n"

        full_content = ""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                async with client.stream(
                    "POST",
                    OPENROUTER_URL,
                    headers={
                        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={"model": body.model, "messages": messages, "stream": True},
                ) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        yield f"event: error\ndata: {json.dumps({'error': error_body.decode()})}\n\n"
                        return

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = line[6:]
                        if payload.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(payload)
                            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                full_content += delta
                                yield f"event: delta\ndata: {json.dumps({'content': delta}, ensure_ascii=False)}\n\n"
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            return

        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO chat_messages (session_id, role, content, model) VALUES (?, 'assistant', ?, ?)",
                (session_id, full_content, body.model),
            )
            conn.commit()
            assistant_msg = dict(conn.execute("SELECT * FROM chat_messages WHERE id=?", (cur.lastrowid,)).fetchone())

        yield f"event: assistant_msg\ndata: {json.dumps(assistant_msg, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class MessageUpdate(BaseModel):
    content: str
    msg_type: Optional[str] = None


@router.put("/messages/{message_id}")
def update_message(message_id: int, body: MessageUpdate):
    with get_db() as conn:
        msg = conn.execute("SELECT * FROM chat_messages WHERE id=?", (message_id,)).fetchone()
        if not msg:
            raise HTTPException(404, "Message not found")
        updates, params = ["content=?"], [body.content]
        if body.msg_type is not None:
            updates.append("msg_type=?")
            params.append(body.msg_type)
        params.append(message_id)
        conn.execute(f"UPDATE chat_messages SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()
        row = conn.execute("SELECT * FROM chat_messages WHERE id=?", (message_id,)).fetchone()
        return dict(row)


@router.delete("/messages/{message_id}")
def delete_message(message_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM chat_messages WHERE id=?", (message_id,))
        conn.commit()
    return {"ok": True}
