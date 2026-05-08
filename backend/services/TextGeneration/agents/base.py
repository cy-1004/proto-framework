"""Base agent class — every sub-agent inherits from this."""

from __future__ import annotations

import time
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from config.settings import PROMPTS_DIR, get_llm

_MAX_RETRIES = 3          # total attempts
_RETRY_BASE_WAIT = 2.0    # seconds; doubles each retry (2 → 4 → 8)


class BaseAgent:
    """Thin wrapper: loads a system prompt from markdown and calls the LLM."""

    name: str = ""              # e.g. "manager", "writer", "roaster"
    prompt_file: str = ""       # filename under config/prompts/
    temperature: float = 0.7

    def __init__(self) -> None:
        self.llm: ChatOpenAI = get_llm(self.name, temperature=self.temperature)
        self.system_prompt: str = self._load_prompt()

    def _load_prompt(self) -> str:
        path = PROMPTS_DIR / self.prompt_file
        if not path.exists():
            raise FileNotFoundError(f"Prompt file not found: {path}")
        return path.read_text(encoding="utf-8")

    def invoke(self, user_message: str) -> str:
        """Send the system prompt + user message to the LLM and return the response text."""
        return self._invoke_with(self.llm, user_message)

    def _invoke_with(self, llm: ChatOpenAI, user_message: str) -> str:
        """Invoke with a specific LLM instance, retrying on transient API errors.

        OpenRouter may return non-JSON responses (rate limits, 5xx, truncation).
        Retries up to _MAX_RETRIES times with exponential backoff before re-raising.
        """
        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=user_message),
        ]
        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                response = llm.invoke(messages)
                return response.content
            except Exception as exc:
                last_exc = exc
                if attempt < _MAX_RETRIES - 1:
                    wait = _RETRY_BASE_WAIT * (2 ** attempt)
                    print(
                        f"[{self.name}] LLM 调用失败（第 {attempt + 1} 次）: "
                        f"{type(exc).__name__}: {exc!s:.120} — {wait:.0f}s 后重试…"
                    )
                    time.sleep(wait)
        raise last_exc  # type: ignore[misc]
