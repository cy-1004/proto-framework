"""LangGraph workflow for the Copy Forge system.

Graph topology:
    manager → writer → roaster → manager → (loop or end)
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from agents.copy_roaster_agent import CopyRoasterAgent
from agents.copy_writer_agent import CopyWriterAgent
from agents.manager_agent import ManagerAgent
from config.settings import settings
from core.state import CopyVersion, ForgeState
from tools.score_parser import extract_round_summary, parse_score

# Singletons — created once, reused across invocations
_manager = ManagerAgent()
_writer = CopyWriterAgent()
_roaster = CopyRoasterAgent()


# ── Node functions ───────────────────────────────────────────────────

def manager_node(state: ForgeState) -> dict:
    """Manager decides what to do next."""
    decision = _manager.decide(state)
    return {
        "manager_decision": decision["decision"],
        "manager_instructions": decision.get("instructions", ""),
    }


def writer_node(state: ForgeState) -> dict:
    """Writer generates or revises copy."""
    user_request = state["user_request"]
    language = state.get("language", "中文")
    current_round = state.get("current_round", 0) + 1

    if current_round == 1 or state.get("manager_decision") == "write":
        copy = _writer.generate(user_request, language=language)
    else:
        copy = _writer.revise(
            user_request=user_request,
            review_feedback=state.get("current_review", ""),
            instructions=state.get("manager_instructions", ""),
            language=language,
        )

    return {
        "current_copy": copy,
        "current_round": current_round,
    }


def roaster_node(state: ForgeState) -> dict:
    """Roaster reviews the current copy and scores it."""
    language = state.get("language", "中文")
    try:
        review = _roaster.review(state["current_copy"], language=language)
    except Exception as exc:
        # All retries exhausted — use a neutral fallback so the pipeline can continue
        print(f"[roaster] 所有重试耗尽，使用兜底评分: {exc!s:.120}")
        review = "（审查服务暂时不可用，使用兜底评分）\n**总分：5.0 / 10**\n一句话定性：服务异常，建议重新提交。"
    score = parse_score(review)
    summary = extract_round_summary(review)

    # Update tracking
    scores = list(state.get("scores", []))
    scores.append(score)

    history = list(state.get("history", []))
    version = CopyVersion(
        round=state["current_round"],
        copy=state["current_copy"],
        score=score,
        review=review,
        summary=summary,
    )
    history.append(version)

    # Track best version
    best_score = state.get("best_score", 0.0)
    best_copy = state.get("best_copy", "")
    best_round = state.get("best_round", 0)
    if score > best_score:
        best_score = score
        best_copy = state["current_copy"]
        best_round = state["current_round"]

    return {
        "current_review": review,
        "current_score": score,
        "scores": scores,
        "history": history,
        "best_score": best_score,
        "best_copy": best_copy,
        "best_round": best_round,
    }


def report_node(state: ForgeState) -> dict:
    """Generate the final forge report."""
    passed = state.get("current_score", 0) >= settings.pass_score
    best_score = state.get("best_score", 0)
    best_round = state.get("best_round", 0)
    best_copy = state.get("best_copy", "")
    total_rounds = state.get("current_round", 0)

    status = "✅ 达标（≥ 7）" if passed else "⚠️ 未达标但已输出最佳版本"

    lines = [
        "# 🔨 Copy Forge 锻造报告\n",
        "## 锻造结果\n",
        f"- 迭代轮次：{total_rounds} / {settings.max_iterations}",
        f"- 最终得分：{best_score} / 10",
        f"- 最佳轮次：Round {best_round}",
        f"- 结果状态：{status}",
        "\n---\n",
        "## 最终文案\n",
        best_copy,
        "\n---\n",
    ]

    # Refinement suggestions
    history = state.get("history", [])
    last_review = history[-1]["review"] if history else ""
    if best_score >= 8:
        lines.append("## 终稿微调建议\n\n可以直接拍摄，无需额外调整。\n")
    else:
        lines.append(f"## 终稿微调建议\n\n{last_review}\n")

    # Iteration details
    lines.append("---\n")
    lines.append("## 迭代过程\n")
    for v in history:
        lines.append(f"### Round {v['round']}")
        lines.append(f"- 得分：{v['score']} / 10")
        lines.append(f"- 概况：{v['summary']}\n")

    # Score trend
    lines.append("---\n")
    lines.append("## 得分趋势\n")
    for v in history:
        bar_len = int(v["score"])
        bar = "█" * bar_len + "░" * (10 - bar_len)
        lines.append(f"Round {v['round']}: {bar} {v['score']}")

    report = "\n".join(lines)
    return {"final_report": report}


# ── Routing ──────────────────────────────────────────────────────────

def after_manager(state: ForgeState) -> str:
    """Route after manager decision."""
    decision = state.get("manager_decision", "write")
    if decision in ("write", "rewrite"):
        return "writer"
    # pass or finish → generate report
    return "report"


def after_roaster(state: ForgeState) -> str:
    """Route after roaster scores the copy — go back to manager for decision."""
    return "manager"


# ── Build graph ──────────────────────────────────────────────────────

def build_graph() -> StateGraph:
    """Construct and compile the Copy Forge LangGraph."""
    graph = StateGraph(ForgeState)

    # Add nodes
    graph.add_node("manager", manager_node)
    graph.add_node("writer", writer_node)
    graph.add_node("roaster", roaster_node)
    graph.add_node("report", report_node)

    # Entry point
    graph.set_entry_point("manager")

    # Edges
    graph.add_conditional_edges("manager", after_manager, {
        "writer": "writer",
        "report": "report",
    })
    graph.add_edge("writer", "roaster")
    graph.add_edge("roaster", "manager")  # always go back to manager after review
    graph.add_edge("report", END)

    return graph.compile()
