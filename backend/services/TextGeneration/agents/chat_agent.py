"""Chat agent with memory and streaming function-calling support.

Flow:
  1. Load session history from MemoryStore.
  2. Stream the LLM response (with GenerateCopy + RewriteModule tools bound).
  3a. No tool call       → yield ("token", {delta}) per chunk, then ("chat", {reply})
  3b. GenerateCopy call  → yield ("progress", {message}) per pipeline step,
                           then ("copy", {reply, data})
  3c. RewriteModule call → yield ("progress", ...) then ("copy", {reply, data})
"""

from __future__ import annotations

import re
from collections.abc import Generator
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel
from pydantic import Field as PydanticField

from config.settings import PROMPTS_DIR, get_llm
from memory.base import MemoryStore

_URL_RE = re.compile(r"https?://\S+")

# ── Tool schema ──────────────────────────────────────────────────────────────

class GenerateCopy(BaseModel):
    """生成短视频或直播带货文案脚本。

    调用前置条件（5 项必须全部具备）：
    - 产品名称（具体品牌/型号）
    - 核心卖点（1-3 条）
    - 价格信息
    - 目标人群
    - 销售平台

    信息不全时禁止调用，通过对话收集缺失字段后再调用。
    """

    user_request: str = PydanticField(
        ...,
        description=(
            "整合自对话的完整产品描述（产品名称、卖点、价格、人群、平台），"
            "或用户提供的产品页面 URL（含平台/风格说明时一并传入）。"
        ),
    )


class RewriteModule(BaseModel):
    """改写当前文案中的某个模块/段落。

    仅在当前会话已生成文案，且用户明确要求改写特定模块时调用。
    不用于全新文案生成。
    """

    module: str = PydanticField(
        ...,
        description="要改写的模块名称，如：钩子、痛点段落、产品展示、CTA逼单、发布策略等",
    )
    instruction: str = PydanticField(
        ...,
        description="用户的改写要求，如：更口语化、更有冲击力、换个角度切入、突出价格优势等",
    )


# (event_type, payload_dict) — consumed by the SSE endpoint
StreamEvent = tuple[str, dict[str, Any]]


# ── Agent ────────────────────────────────────────────────────────────────────

class ChatAgent:
    """Conversational agent with streaming copy-generation function calling.

    Pass any MemoryStore implementation to swap the persistence backend.
    """

    name = "chat"
    prompt_file = "chat_agent.md"
    temperature = 0.7
    _HISTORY_LIMIT = 20          # cap context window; raise for longer memory

    def __init__(self, memory: MemoryStore) -> None:
        self.memory = memory
        _llm = get_llm(self.name, temperature=self.temperature)
        self._llm = _llm.bind_tools([GenerateCopy, RewriteModule])
        self._system_prompt = (PROMPTS_DIR / self.prompt_file).read_text(encoding="utf-8")
        # Tracks the latest raw copy per session for module rewrites.
        # In-memory only; cleared on server restart.
        self._session_copies: dict[str, str] = {}

    # ── Public API ────────────────────────────────────────────────────────────

    def stream_chat(
        self,
        session_id: str,
        user_message: str,
        language: str = "中文",
    ) -> Generator[StreamEvent, None, None]:
        """Yield (event_type, payload) tuples.

        event_type values:
          "token"    — {delta: str}                one text chunk (chat streaming)
          "chat"     — {reply: str}                signals chat stream is complete
          "progress" — {message: str}              pipeline status line
          "copy"     — {reply: str, data: dict}    copy generation result
        """
        messages = self._build_messages(session_id, user_message)
        self.memory.append(session_id, "user", user_message)

        # Stream the LLM response token by token; accumulate chunks to detect
        # tool calls (tool-call responses have empty content — no tokens emitted).
        final_msg = None
        for chunk in self._llm.stream(messages):
            final_msg = chunk if final_msg is None else final_msg + chunk
            if chunk.content:
                yield "token", {"delta": chunk.content}

        if final_msg is None:
            yield "chat", {"reply": ""}
            return

        # ── Plain chat response — tokens already streamed ─────────────────────
        if not final_msg.tool_calls:
            full_text = final_msg.content or ""
            self.memory.append(session_id, "assistant", full_text)
            yield "chat", {"reply": full_text}
            return

        tool_call = final_msg.tool_calls[0]

        if tool_call["name"] == "GenerateCopy":
            user_request = tool_call["args"].get("user_request", user_message)
            yield from self._stream_pipeline(session_id, user_request, language)

        elif tool_call["name"] == "RewriteModule":
            module      = tool_call["args"].get("module", "")
            instruction = tool_call["args"].get("instruction", "")
            yield from self._stream_rewrite(session_id, module, instruction, language)

        else:
            reply = "（工具调用失败，请重试）"
            self.memory.append(session_id, "assistant", reply)
            yield "chat", {"reply": reply}

    # ── Internals ─────────────────────────────────────────────────────────────

    def _build_messages(self, session_id: str, user_message: str) -> list:
        history = self.memory.get_history(session_id, limit=self._HISTORY_LIMIT)
        msgs: list = [SystemMessage(content=self._system_prompt)]
        for entry in history:
            cls = HumanMessage if entry["role"] == "user" else AIMessage
            msgs.append(cls(content=entry["content"]))
        msgs.append(HumanMessage(content=user_message))
        return msgs

    def _stream_pipeline(
        self,
        session_id: str,
        user_request: str,
        language: str,
    ) -> Generator[StreamEvent, None, None]:
        """Run the LangGraph forge pipeline, yielding progress events then the copy."""
        from core.graph import build_graph
        from core.state import make_initial_state
        from tools.copy_parser import parse_copy_to_json
        from tools.logger import ForgeLogger

        # URL extraction
        if _URL_RE.search(user_request):
            yield "progress", {"message": "🔗 正在提取链接产品信息…"}
            try:
                from agents.product_extractor import ProductExtractor
                user_request = ProductExtractor().extract(user_request)
                yield "progress", {"message": "📦 产品信息提取完成，开始锻造…"}
            except Exception as exc:
                reply = (
                    f"该链接无法访问（直接抓取和 Jina Reader 均失败），无法获取产品信息。\n\n"
                    "请直接描述产品信息，包含以下内容：\n"
                    "- 产品名称（具体品牌/型号）\n"
                    "- 核心卖点（1-3条）\n"
                    "- 价格信息\n"
                    "- 目标人群\n"
                    "- 销售平台"
                )
                self.memory.append(session_id, "assistant", reply)
                yield "chat", {"reply": reply}
                return

        # Per-call session logger — writes to TextGeneration/logs/forge_<timestamp>.log
        forge_log = ForgeLogger()
        forge_log.log_session_header(user_request, language)
        forge_log.start_tee()

        graph = build_graph()
        initial_state = make_initial_state(user_request, language)

        final_state: dict = {}
        for step in graph.stream(initial_state, stream_mode="updates"):
            node_name = list(step.keys())[0]
            data = step[node_name]
            final_state.update(data)

            if node_name == "manager":
                decision  = data.get("manager_decision", "")
                round_num = final_state.get("current_round", 0)
                if round_num == 0:
                    msg = f"📋 Manager 分析需求，决策：{decision}"
                else:
                    msg = f"📋 第 {round_num} 轮 Manager 决策：{decision}"
                yield "progress", {"message": msg}

            elif node_name == "writer":
                round_num = data.get("current_round", "?")
                yield "progress", {"message": f"✏️ 第 {round_num} 轮文案生成完成"}

            elif node_name == "roaster":
                score     = data.get("current_score", 0)
                round_num = final_state.get("current_round", "?")
                yield "progress", {"message": f"🔍 第 {round_num} 轮评审完成，得分：{score} / 10"}

            elif node_name == "report":
                yield "progress", {"message": "📊 正在整理锻造报告…"}

        # Pipeline done — restore stdout before any further work
        forge_log.stop_tee()

        best_copy  = final_state.get("best_copy", "")
        best_score = final_state.get("best_score", 0)
        result = parse_copy_to_json(best_copy)
        result["content"] = best_copy
        result["score"]   = best_score

        # Persist full session record to logs/forge_<timestamp>.log (+ .json)
        forge_log.log_all_rounds(final_state.get("history", []))
        report_text = final_state.get("final_report", "")
        if report_text:
            forge_log.log_final_report(report_text)
        if best_copy:
            forge_log.log_best_copy_and_json(best_copy, result)
        forge_log.close()

        scene_count = len(result.get("video_project", {}).get("storyboard", []))
        reply = f"文案已生成，共 {scene_count} 个场景，综合得分 {best_score} / 10。"

        # 缓存原始文案供模块改写使用
        self._session_copies[session_id] = best_copy
        # 短回复走正常文本 (前端渲染 + LLM 上下文)
        self.memory.append(session_id, "assistant", reply)
        # 完整原始文案以隐藏类型存入 (仅 LLM 可见，前端不渲染)
        if best_copy:
            self.memory.append(session_id, "assistant", best_copy, msg_type="agent_memory")

        yield "copy", {"reply": reply, "data": result}

    def _stream_rewrite(
        self,
        session_id: str,
        module: str,
        instruction: str,
        language: str,
    ) -> Generator[StreamEvent, None, None]:
        """Call CopyWriterAgent.rewrite_module(), yield progress then updated copy."""
        from agents.copy_writer_agent import CopyWriterAgent
        from tools.copy_parser import parse_copy_to_json

        current_copy = self._session_copies.get(session_id, "")
        if not current_copy:
            # Fallback: load from persistent storage in case of server restart
            if hasattr(self.memory, "get_latest_agent_memory"):
                current_copy = self.memory.get_latest_agent_memory(session_id)
            if current_copy:
                # Restore the in-memory cache so subsequent rewrites are fast
                self._session_copies[session_id] = current_copy

        if not current_copy:
            reply = "当前会话还没有生成过文案，无法改写。请先生成一份文案。"
            self.memory.append(session_id, "assistant", reply)
            yield "chat", {"reply": reply}
            return

        yield "progress", {"message": f"✏️ 正在改写「{module}」…"}

        writer = CopyWriterAgent()
        revised_copy = writer.rewrite_module(
            current_copy=current_copy,
            module=module,
            instruction=instruction,
            language=language,
        )

        yield "progress", {"message": "🔄 改写完成，正在解析格式…"}

        result = parse_copy_to_json(revised_copy)
        result["content"] = revised_copy

        # Update cached copy so chained rewrites work correctly
        self._session_copies[session_id] = revised_copy

        reply = f"「{module}」改写完成。"
        # Short reply: visible in frontend chat bubble
        self.memory.append(session_id, "assistant", reply)
        # Full revised copy: hidden from frontend, kept in LLM context for future rewrites
        if revised_copy:
            self.memory.append(session_id, "assistant", revised_copy, msg_type="agent_memory")

        yield "copy", {"reply": reply, "data": result}
