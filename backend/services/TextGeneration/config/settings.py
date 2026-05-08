"""OpenRouter LLM configuration.

All agents share the same OpenRouter endpoint. Each agent can override the model
via agent-specific env vars, or fall back to the global default.

Environment variables:
    OPENROUTER_API_KEY          – required
    OPENROUTER_MODEL            – global default model  (fallback: google/gemini-2.5-flash-preview)
    MANAGER_MODEL               – override for manager agent
    WRITER_MODEL                – override for writer agent
    ROASTER_MODEL               – override for roaster agent
    CHAT_MODEL                  – override for chat agent (must support function calling)
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "google/gemini-3.1-pro-preview-customtools"
PROMPTS_DIR = Path(__file__).parent / "prompts"

# Max iterations for the forge loop
MAX_ITERATIONS = 5
# Score threshold to pass
PASS_SCORE = 7.0
# Score plateau threshold — if two consecutive rounds differ less than this, pivot
PLATEAU_DELTA = 0.3


@dataclass(frozen=True)
class Settings:
    api_key: str = field(default_factory=lambda: os.getenv("OPENROUTER_API_KEY", ""))
    default_model: str = field(
        default_factory=lambda: os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    )
    manager_model: str = field(
        default_factory=lambda: os.getenv("MANAGER_MODEL", "qwen/qwen3.6-plus")
    )
    writer_model: str = field(
        default_factory=lambda: os.getenv("WRITER_MODEL", "google/gemini-3.1-pro-preview-customtools")
    )
    roaster_model: str = field(
        default_factory=lambda: os.getenv("ROASTER_MODEL", "z-ai/glm-5.1")
    )
    chat_model: str = field(
        default_factory=lambda: os.getenv("CHAT_MODEL", DEFAULT_MODEL)
    )
    max_iterations: int = MAX_ITERATIONS
    pass_score: float = PASS_SCORE
    plateau_delta: float = PLATEAU_DELTA

    def model_for(self, agent_name: str) -> str:
        """Return the model ID for a given agent, falling back to default."""
        override = {
            "manager": self.manager_model,
            "writer": self.writer_model,
            "roaster": self.roaster_model,
            "chat": self.chat_model,
        }.get(agent_name, "")
        return override or self.default_model


settings = Settings()


def get_llm(agent_name: str, *, temperature: float = 0.7) -> ChatOpenAI:
    """Create a ChatOpenAI instance pointing at OpenRouter for the given agent."""
    return ChatOpenAI(
        model=settings.model_for(agent_name),
        openai_api_key=settings.api_key,
        openai_api_base=OPENROUTER_BASE_URL,
        temperature=temperature,
    )


def get_llm_with_web_search(
    agent_name: str,
    *,
    temperature: float = 0.7,
    max_results: int = 5,
    search_context_size: str = "medium",
) -> ChatOpenAI:
    """Create an LLM with OpenRouter server-side web search enabled.

    The model autonomously decides when to search. OpenRouter executes the
    search and feeds results back before the model generates its final response.
    No tool-call handling needed on our side.

    Args:
        max_results: Number of search results per query (1–25).
        search_context_size: Depth of context — "low" | "medium" | "high".
    """
    return ChatOpenAI(
        model=settings.model_for(agent_name),
        openai_api_key=settings.api_key,
        openai_api_base=OPENROUTER_BASE_URL,
        temperature=temperature,
        model_kwargs={
            "tools": [
                {
                    "type": "openrouter:web_search",
                    "max_results": max_results,
                    "search_context_size": search_context_size,
                }
            ]
        },
    )
