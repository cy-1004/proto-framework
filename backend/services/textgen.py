"""Adapter to TextGeneration LangGraph pipeline.

Exposes a single `generate_narration(prompt, language)` service that runs
the forge pipeline and returns (title, json_content_str).

The json_content_str is a JSON-serialised dict with structure:
  {
    "video_project": { "metadata": {...}, "storyboard": [...], "publishing_strategy": {...} },
    "content": "<raw markdown>",
    "score": 8.5
  }

Falls back to (prompt[:30], prompt) if the pipeline is unavailable or fails.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from collections.abc import Generator
from typing import Any, Optional

logger = logging.getLogger(__name__)

_TEXTGEN_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "TextGeneration")
)
if os.path.isdir(_TEXTGEN_DIR) and _TEXTGEN_DIR not in sys.path:
    sys.path.insert(0, _TEXTGEN_DIR)


class BackendChatMemory:
    """MemoryStore adapter backed by the main system's ``chat_messages`` table.

    - Conversation history is unified with the rest of the chat UI.
    - ``session_id`` (str) must be the integer ``chat_sessions.id`` as a string.
    - ``msg_type='text'`` → visible in frontend chat bubbles.
    - ``msg_type='agent_memory'`` → hidden from frontend but still fed to the LLM
      (used for dumping full copy text so the model can reference it next turn).

    Rows with any other ``msg_type`` (narration_result / generate_result / …) are
    excluded from LLM context via ``get_history`` so the model never sees raw
    card JSON blobs.
    """

    _ALLOWED_HISTORY_TYPES = ("text", "agent_memory")

    @staticmethod
    def _coerce_sid(session_id: str) -> Optional[int]:
        try:
            return int(session_id)
        except (TypeError, ValueError):
            return None

    def append(self, session_id: str, role: str, content: str, **kwargs) -> None:
        from db import get_db
        sid = self._coerce_sid(session_id)
        if sid is None:
            logger.warning("BackendChatMemory: invalid session_id %r, skipping append", session_id)
            return
        msg_type = kwargs.get("msg_type", "text")
        try:
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO chat_messages (session_id, role, content, msg_type) VALUES (?, ?, ?, ?)",
                    (sid, role, content, msg_type),
                )
                conn.commit()
        except Exception as exc:
            logger.exception("BackendChatMemory append failed: %s", exc)

    def get_history(self, session_id: str, limit: Optional[int] = None) -> list[dict[str, str]]:
        from db import get_db
        sid = self._coerce_sid(session_id)
        if sid is None:
            return []
        placeholders = ",".join("?" * len(self._ALLOWED_HISTORY_TYPES))
        try:
            with get_db() as conn:
                if limit is not None:
                    rows = conn.execute(
                        f"SELECT role, content FROM ("
                        f"  SELECT id, role, content FROM chat_messages "
                        f"  WHERE session_id = ? AND msg_type IN ({placeholders}) "
                        f"  ORDER BY id DESC LIMIT ?"
                        f") ORDER BY id ASC",
                        (sid, *self._ALLOWED_HISTORY_TYPES, limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        f"SELECT role, content FROM chat_messages "
                        f"WHERE session_id = ? AND msg_type IN ({placeholders}) "
                        f"ORDER BY id ASC",
                        (sid, *self._ALLOWED_HISTORY_TYPES),
                    ).fetchall()
                return [{"role": r["role"], "content": r["content"]} for r in rows]
        except Exception as exc:
            logger.exception("BackendChatMemory get_history failed: %s", exc)
            return []

    def get_latest_agent_memory(self, session_id: str) -> str:
        """Return the most recent agent_memory content for this session.

        Used as a fallback by ChatAgent when _session_copies is empty (e.g. after
        a server restart) so that module rewrites still work across restarts.
        Returns empty string if nothing is found.
        """
        from db import get_db
        sid = self._coerce_sid(session_id)
        if sid is None:
            return ""
        try:
            with get_db() as conn:
                row = conn.execute(
                    "SELECT content FROM chat_messages "
                    "WHERE session_id = ? AND msg_type = 'agent_memory' AND role = 'assistant' "
                    "ORDER BY id DESC LIMIT 1",
                    (sid,),
                ).fetchone()
                return row["content"] if row else ""
        except Exception as exc:
            logger.exception("get_latest_agent_memory failed: %s", exc)
            return ""

    def clear(self, session_id: str) -> None:
        from db import get_db
        sid = self._coerce_sid(session_id)
        if sid is None:
            return
        try:
            with get_db() as conn:
                conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (sid,))
                conn.commit()
        except Exception as exc:
            logger.exception("BackendChatMemory clear failed: %s", exc)


_chat_agent = None


def get_chat_agent():
    """Lazy singleton for ChatAgent (reuses across requests).

    Uses BackendChatMemory so conversation history is unified with the main
    system's chat_messages table (single source of truth).
    """
    global _chat_agent
    if _chat_agent is None:
        try:
            from agents.chat_agent import ChatAgent
            _chat_agent = ChatAgent(BackendChatMemory())
        except Exception as exc:
            logger.warning("ChatAgent init failed: %s", exc)
            _chat_agent = None
    return _chat_agent


def stream_narration_chat(
    session_id: str,
    message: str,
    language: str = "中文",
) -> Generator[tuple[str, dict[str, Any]], None, None]:
    """Stream (event_type, payload) tuples from ChatAgent.

    Event types: "token", "chat", "progress", "copy", "error"
    Falls back to a single error event if ChatAgent is unavailable.
    """
    agent = get_chat_agent()
    if agent is None:
        yield "error", {"message": "ChatAgent 初始化失败，请检查 TextGeneration 依赖"}
        return
    yield from agent.stream_chat(session_id, message, language)


def generate_narration(prompt: str, language: str = "中文") -> tuple[str, str]:
    """Run the forge pipeline and return (title, json_content_str).

    json_content_str contains the full structured output from parse_copy_to_json,
    plus the raw markdown under "content" and the pipeline score under "score".

    On any failure, returns (prompt[:30], prompt) so the caller still gets a
    usable narration row.
    """
    fallback = (prompt[:30] or "未命名旁白", prompt)
    try:
        from core.graph import build_graph
        from core.state import make_initial_state
        from tools.copy_parser import parse_copy_to_json
    except Exception as exc:
        logger.warning("TextGeneration import failed, using prompt as content: %s", exc)
        return fallback

    try:
        graph = build_graph()
        state = make_initial_state(prompt, language)
        final_state: dict = {}
        for step in graph.stream(state, stream_mode="updates"):
            node_name = next(iter(step))
            final_state.update(step[node_name])

        best_copy = final_state.get("best_copy", "") or ""
        if not best_copy.strip():
            return fallback

        parsed = parse_copy_to_json(best_copy)
        parsed["content"] = best_copy
        parsed["score"] = final_state.get("best_score", 0.0)

        title: Optional[str] = (parsed.get("video_project") or {}).get("metadata", {}).get("product_name")
        if not title:
            title = prompt[:30] or "未命名旁白"

        return title[:60], json.dumps(parsed, ensure_ascii=False)
    except Exception as exc:
        logger.exception("TextGeneration pipeline failed: %s", exc)
        return fallback
