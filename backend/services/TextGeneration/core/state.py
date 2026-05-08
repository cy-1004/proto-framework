"""Shared state for the Copy Forge LangGraph workflow."""

from __future__ import annotations

from typing import TypedDict


def make_initial_state(user_request: str, language: str = "中文") -> "ForgeState":
    """Return a fresh ForgeState seeded with the user's request.

    Single source of truth for pipeline initialization — used by the CLI,
    the FastAPI endpoints, and the chat agent.
    """
    return {
        "user_request": user_request,
        "language": language,
        "current_round": 0,
        "current_copy": "",
        "current_review": "",
        "current_score": 0.0,
        "scores": [],
        "history": [],
        "best_copy": "",
        "best_score": 0.0,
        "best_round": 0,
        "manager_decision": "",
        "manager_instructions": "",
        "final_report": "",
    }


class CopyVersion(TypedDict):
    """A single version of the copy produced during iteration."""
    round: int
    copy: str
    score: float
    review: str
    summary: str  # one-line summary of this round


class ForgeState(TypedDict, total=False):
    """LangGraph state that flows through the entire workflow.

    Attributes:
        user_request: Raw user input describing product and requirements.
        current_round: Current iteration number (1-based).
        current_copy: Latest copy text from writer.
        current_review: Latest review text from roaster.
        current_score: Latest score extracted from roaster output.
        scores: List of scores across all rounds.
        history: List of CopyVersion dicts for every completed round.
        best_copy: The copy with the highest score so far.
        best_score: The highest score so far.
        best_round: The round number that produced the best score.
        manager_decision: The latest decision from manager ("write"/"rewrite"/"pass"/"finish").
        manager_instructions: Instructions from manager to writer.
        final_report: The final output report.
    """
    user_request: str
    language: str          # output language, e.g. "中文" / "English" / "日本語"
    current_round: int
    current_copy: str
    current_review: str
    current_score: float
    scores: list[float]
    history: list[CopyVersion]
    best_copy: str
    best_score: float
    best_round: int
    manager_decision: str
    manager_instructions: str
    final_report: str
