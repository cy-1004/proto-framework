"""Copy writer agent — generates and revises short-video marketing copy."""

from __future__ import annotations

from agents.base import BaseAgent

_PLATFORMS = ["小红书", "抖音", "快手", "视频号", "TikTok"]


def _detect_platform(text: str) -> str:
    """Return the first platform name found in text, defaulting to TikTok."""
    for p in _PLATFORMS:
        if p in text:
            return p
    return "TikTok"


class CopyWriterAgent(BaseAgent):
    name = "writer"
    prompt_file = "copy_writer.md"
    temperature = 0.8  # higher creativity

    def generate(self, user_request: str, language: str = "中文") -> str:
        """Generate copy from scratch based on user requirements."""
        platform = _detect_platform(user_request)
        platform_lock = (
            f"\n**平台锁定：只针对【{platform}】平台创作，严格使用该平台的语气、CTA和时长规范，"
            f"不要混入其他平台的风格。**"
        )
        lang_instruction = (
            f"\n**语言：请用{language}撰写全部文案内容（口播、画面说明、字幕、发布建议均使用{language}）。**"
        )
        prompt = (
            f"请根据以下产品需求，创作一份完整的短视频带货脚本（格式 A）。"
            f"{platform_lock}"
            f"{lang_instruction}\n\n"
            f"## 产品需求\n{user_request}"
        )
        return self.invoke(prompt)

    def rewrite_module(
        self,
        current_copy: str,
        module: str,
        instruction: str,
        language: str = "中文",
    ) -> str:
        """Rewrite one specific module of an existing copy per user instruction.

        Keeps all other sections intact; outputs the full script.
        """
        lang_instruction = f"\n**请继续用{language}撰写。**"
        prompt = (
            f"以下是当前完整文案：\n\n{current_copy}\n\n"
            f"---\n\n"
            f"【改写任务】\n"
            f"只改写「{module}」部分，其余所有段落保持完全不变。\n"
            f"改写要求：{instruction}{lang_instruction}\n\n"
            f"输出完整脚本（含未改动部分），格式与原文保持一致。"
        )
        return self.invoke(prompt)

    def revise(
        self,
        user_request: str,
        review_feedback: str,
        instructions: str,
        language: str = "中文",
    ) -> str:
        """Revise copy based on roaster feedback and manager instructions."""
        platform = _detect_platform(user_request)
        platform_lock = f"\n**平台锁定：只针对【{platform}】平台，不要混入其他平台风格。**"
        lang_instruction = f"\n**请继续用{language}撰写。**"
        prompt = (
            f"## 原始产品需求\n{user_request}\n\n"
            f"## 审核反馈\n{review_feedback}\n\n"
            f"## 修改指令\n{instructions}{platform_lock}{lang_instruction}\n\n"
            f"请根据以上审核反馈修改文案。要求：\n"
            f"1. 逐条解决「逐段手术」中标出的问题\n"
            f"2. 保留「亮点」中被认可的部分，不要改动\n"
            f"3. 重点解决得分最低的维度\n"
            f"4. 修改后输出完整脚本（不是只输出修改部分）"
        )
        return self.invoke(prompt)
