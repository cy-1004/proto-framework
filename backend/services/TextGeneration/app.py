"""FastAPI service for Copy Forge."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Generator
from uuid import uuid4

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from agents.chat_agent import ChatAgent
from core.graph import build_graph
from core.state import make_initial_state
from memory.sqlite_store import SQLiteMemoryStore
from tools.copy_parser import parse_copy_to_json
from tools.logger import ForgeLogger

# ── Chat agent singleton ──────────────────────────────────────────────────────
# DB path is configurable via MEMORY_DB_PATH env var (default: data/memory.db).
# To switch to a different backend, replace SQLiteMemoryStore with any class
# that implements memory.base.MemoryStore — nothing else needs to change.
_chat_memory = SQLiteMemoryStore(os.getenv("MEMORY_DB_PATH", "data/memory.db"))
_chat_agent = ChatAgent(_chat_memory)

_URL_PATTERN = re.compile(r"https?://\S+")

app = FastAPI(title="Copy Forge API", version="1.0.0")


class GenerateRequest(BaseModel):
    user_request: str = Field(..., description="产品需求描述或商品链接")
    language: str = Field(default="中文", description="输出语言，如 中文 / English / 日本語")


# ── SSE helpers ──────────────────────────────────────────────────────

def _sse(type_: str, **kwargs) -> str:
    """Format a single SSE data line."""
    return f"data: {json.dumps({'type': type_, **kwargs}, ensure_ascii=False)}\n\n"


def _resolve_request(user_request: str) -> Generator[tuple[str, str], None, None]:
    """If user_request contains a URL, extract product info and yield progress events.

    Yields (event_str, resolved_request).
    """
    if not _URL_PATTERN.search(user_request):
        yield _sse("progress", message="📝 已收到产品需求，开始锻造…"), user_request
        return

    yield _sse("progress", message="🔗 检测到商品链接，正在提炼产品信息…"), ""
    try:
        from agents.product_extractor import ProductExtractor
        resolved = ProductExtractor().extract(user_request)
        yield _sse("progress", message="📦 产品信息提炼完成，开始锻造…"), resolved
    except Exception as e:
        yield _sse("progress", message=f"⚠️ 提炼失败（{e}），使用原始输入继续…"), user_request


def _run_pipeline(user_request: str, language: str) -> Generator[str, None, None]:
    """Run the LangGraph pipeline and yield SSE progress + final result."""
    graph = build_graph()
    logger = ForgeLogger()
    initial_state = make_initial_state(user_request, language)

    logger.log_session_header(user_request, language)

    final_state: dict = {}
    try:
        for step in graph.stream(initial_state, stream_mode="updates"):
            node_name = list(step.keys())[0]
            data = step[node_name]
            final_state.update(data)

            if node_name == "manager":
                decision = data.get("manager_decision", "")
                round_num = final_state.get("current_round", 0)
                msg = f"📋 Manager 决策：{decision}"
                if round_num:
                    msg += f"（第 {round_num} 轮）"
                yield _sse("progress", message=msg)

            elif node_name == "writer":
                round_num = data.get("current_round", "?")
                yield _sse("progress", message=f"✏️  第 {round_num} 轮文案生成完成")

            elif node_name == "roaster":
                score = data.get("current_score", 0)
                round_num = final_state.get("current_round", "?")
                yield _sse("progress", message=f"🔍 第 {round_num} 轮 Roaster 评分：{score} / 10")

            elif node_name == "report":
                yield _sse("progress", message="📊 生成锻造报告…")

    finally:
        logger.log_all_rounds(final_state.get("history", []))
        report = final_state.get("final_report", "")
        if report:
            logger.log_final_report(report)

    best_copy = final_state.get("best_copy", "")
    best_score = final_state.get("best_score", 0)
    result = parse_copy_to_json(best_copy)
    result["content"] = best_copy

    # Write best_copy + parsed JSON into the log file and save a .json file
    logger.log_best_copy_and_json(best_copy, result)
    logger.close()

    yield _sse("progress", message=f"✅ 锻造完成！最高得分：{best_score} / 10")
    yield _sse("result", data=result)


# ── Endpoints ────────────────────────────────────────────────────────

@app.post("/generate/stream")
def generate_stream(req: GenerateRequest):
    """SSE streaming endpoint — yields progress events then the final JSON result."""

    def event_generator():
        user_request = req.user_request

        # URL extraction phase
        for event, resolved in _resolve_request(user_request):
            yield event
            if resolved:
                user_request = resolved

        # Pipeline phase
        yield from _run_pipeline(user_request, req.language)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/generate")
def generate(req: GenerateRequest):
    """Non-streaming endpoint — blocks until complete, returns JSON."""
    user_request = req.user_request
    if _URL_PATTERN.search(user_request):
        try:
            from agents.product_extractor import ProductExtractor
            user_request = ProductExtractor().extract(user_request)
        except Exception:
            pass

    logger = ForgeLogger()
    initial_state = make_initial_state(user_request, req.language)
    logger.log_session_header(user_request, req.language)
    logger.start_tee()
    final_state: dict = {}
    try:
        for step in build_graph().stream(initial_state, stream_mode="updates"):
            node_name = list(step.keys())[0]
            final_state.update(step[node_name])
    finally:
        logger.stop_tee()
        logger.log_all_rounds(final_state.get("history", []))
        report = final_state.get("final_report", "")
        if report:
            logger.log_final_report(report)
        logger.close()

    best_copy = final_state.get("best_copy", "")
    result = parse_copy_to_json(best_copy)
    result["content"] = best_copy
    return JSONResponse(content=result)


# ── Chat endpoint ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="会话 ID，不传则自动生成新会话",
    )
    message: str = Field(..., description="用户消息")
    language: str = Field(default="中文", description="文案输出语言（仅在生成文案时生效）")


@app.post("/chat/stream")
def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Conversational SSE endpoint with function calling.

    Event types (JSON after ``data: ``):
      ``{"type": "token",    "delta":   "..."}``  — chat text chunk
      ``{"type": "chat",     "reply":   "..."}``  — chat stream finished
      ``{"type": "progress", "message": "..."}``  — pipeline step status
      ``{"type": "copy",     "reply":   "...", "data": {...}}``  — copy result
      ``{"type": "error",    "message": "..."}``  — unhandled exception
    """
    def event_gen():
        try:
            for event_type, payload in _chat_agent.stream_chat(
                req.session_id, req.message, req.language
            ):
                yield f"data: {json.dumps({'type': event_type, **payload}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
