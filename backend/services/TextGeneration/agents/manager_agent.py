"""Manager agent — makes workflow decisions based on current state."""

from __future__ import annotations

import json

from agents.base import BaseAgent
from config.settings import settings
from core.state import ForgeState


class ManagerAgent(BaseAgent):
    name = "manager"
    prompt_file = "manager.md"
    temperature = 0.3  # low temp for deterministic decisions

    def decide(self, state: ForgeState) -> dict:
        """Analyse the current forge state and return a decision dict.

        Returns:
            {"decision": "write"|"rewrite"|"pass"|"finish",
             "instructions": "...",
             "reason": "..."}
        """
        context = self._build_context(state)
        raw = self.invoke(context)
        return self._parse_decision(raw)

    # ------------------------------------------------------------------

    def _build_context(self, state: ForgeState) -> str:
        """Build a concise status summary for the manager LLM."""
        parts: list[str] = []

        parts.append(f"## 用户需求\n{state.get('user_request', '(无)')}")
        parts.append(f"## 当前轮次\n{state.get('current_round', 0)} / {settings.max_iterations}")

        scores = state.get("scores", [])
        if scores:
            parts.append(f"## 得分历史\n{scores}")
            parts.append(f"## 最高分\n{state.get('best_score', 0)} (Round {state.get('best_round', 0)})")

            # Plateau detection
            if len(scores) >= 2 and abs(scores[-1] - scores[-2]) < settings.plateau_delta:
                parts.append("## ⚠️ 注意\n连续两轮分数差 < 0.3，分数停滞！建议让 Writer 换一个完全不同的切入角度。")

        review = state.get("current_review", "")
        if review:
            parts.append(f"## 最新审查反馈\n{review}")

        copy = state.get("current_copy", "")
        if copy:
            parts.append(f"## 当前文案（摘要）\n{copy[:500]}...")

        return "\n\n".join(parts)

    def _parse_decision(self, raw: str) -> dict:
        """Parse the JSON decision from the LLM output."""
        # Try to extract JSON from the response
        raw = raw.strip()
        # Handle markdown code blocks
        if "```" in raw:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start != -1 and end > start:
                raw = raw[start:end]

        try:
            decision = json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: if LLM didn't return valid JSON, infer from text
            decision = {
                "decision": "write",
                "instructions": raw,
                "reason": "Failed to parse JSON, defaulting to write",
            }

        # Validate decision field
        valid = {"write", "rewrite", "pass", "finish"}
        if decision.get("decision") not in valid:
            decision["decision"] = "write"

        return decision
