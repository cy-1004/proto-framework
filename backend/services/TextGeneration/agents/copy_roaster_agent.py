"""Copy roaster agent — reviews and scores short-video marketing copy."""

from __future__ import annotations

from agents.base import BaseAgent


class CopyRoasterAgent(BaseAgent):
    name = "roaster"
    prompt_file = "copy_roaster.md"
    temperature = 0.4  # consistent scoring

    def review(self, copy_text: str, language: str = "中文") -> str:
        """Review a copy and return a structured evaluation."""
        lang_instruction = (
            f"**文案语言为{language}，请用{language}撰写所有点评和改法。**\n\n"
            if language != "中文" else ""
        )
        prompt = (
            f"请审核以下短视频带货文案，按照标准格式输出评分和逐段手术。\n\n"
            f"{lang_instruction}"
            f"## 待审核文案\n\n{copy_text}"
        )
        return self.invoke(prompt)
