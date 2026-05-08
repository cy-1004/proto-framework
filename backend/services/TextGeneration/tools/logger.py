"""Session logger — records all console output and every copy version to a file.

Log files are written to logs/ with a timestamp filename:
    logs/forge_20260409_143022.log

Each log captures:
  - Session metadata (time, language, product request)
  - Every round's full copy + full roaster review + score
  - Final report with score trend
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


LOG_DIR = Path(__file__).parent.parent / "logs"


class ForgeLogger:
    """Writes session output to a timestamped log file."""

    def __init__(self) -> None:
        LOG_DIR.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.log_path = LOG_DIR / f"forge_{timestamp}.log"
        self._file = self.log_path.open("w", encoding="utf-8")
        self._tee: _TeeOutput | None = None

    # ── Public API ────────────────────────────────────────────────────

    def start_tee(self) -> None:
        """Redirect stdout so all print() calls go to both console and log."""
        self._tee = _TeeOutput(sys.stdout, self._file)
        sys.stdout = self._tee

    def stop_tee(self) -> None:
        """Restore stdout."""
        if self._tee is not None:
            sys.stdout = self._tee.console
            self._tee = None

    def log_session_header(self, user_request: str, language: str) -> None:
        self._write_to_file(
            "═" * 60 + "\n"
            + f"Copy Forge 锻造日志\n"
            + f"时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            + f"语言：{language}\n"
            + "═" * 60 + "\n\n"
            + f"## 产品需求\n\n{user_request}\n\n"
            + "─" * 60 + "\n\n"
        )

    def log_all_rounds(self, history: list[dict[str, Any]]) -> None:
        """Write full copy + review for every round."""
        self._write_to_file("\n" + "═" * 60 + "\n")
        self._write_to_file("## 全部迭代记录\n\n")

        for v in history:
            self._write_to_file(
                f"### Round {v['round']}  |  得分：{v['score']} / 10\n\n"
            )
            self._write_to_file("#### 文案\n\n")
            self._write_to_file(v["copy"] + "\n\n")
            self._write_to_file("#### 审查反馈\n\n")
            self._write_to_file(v["review"] + "\n\n")
            self._write_to_file("─" * 60 + "\n\n")

    def log_final_report(self, report: str) -> None:
        self._write_to_file("\n" + "═" * 60 + "\n")
        self._write_to_file("## 最终锻造报告\n\n")
        self._write_to_file(report + "\n")

    def log_best_copy_and_json(self, best_copy: str, parsed_json: dict[str, Any]) -> None:
        """Write the best_copy text and parsed JSON result to the log file,
        and also save a standalone .json file alongside the .log file."""

        # ── Write to the .log file ───────────────────────────────────
        self._write_to_file("\n" + "═" * 60 + "\n")
        self._write_to_file("## [Parser Debug] best_copy 原文\n\n")
        self._write_to_file(f"字符数: {len(best_copy)}\n\n")
        self._write_to_file(best_copy + "\n\n")

        self._write_to_file("─" * 60 + "\n")
        self._write_to_file("## [Parser Debug] 解析后 JSON\n\n")
        self._write_to_file(json.dumps(parsed_json, ensure_ascii=False, indent=2) + "\n")

        # ── Save standalone .json file ───────────────────────────────
        json_path = self.log_path.with_suffix(".json")
        json_path.write_text(
            json.dumps(parsed_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self._write_to_file(f"\n[Parser] JSON 已保存至: {json_path}\n")

    def close(self) -> None:
        self.stop_tee()
        self._file.close()

    @property
    def path(self) -> Path:
        return self.log_path

    # ── Internal ──────────────────────────────────────────────────────

    def _write_to_file(self, text: str) -> None:
        self._file.write(text)
        self._file.flush()


class _TeeOutput:
    """Writes to both the original stdout and a log file simultaneously.

    Plain class (not io.TextIOBase) to avoid the base class calling write()
    multiple times through its internal buffering.
    """

    def __init__(self, console: Any, log_file: Any) -> None:
        self.console = console
        self.log_file = log_file

    def write(self, text: str) -> int:
        self.console.write(text)
        self.log_file.write(text)
        return len(text)

    def flush(self) -> None:
        self.console.flush()
        self.log_file.flush()
