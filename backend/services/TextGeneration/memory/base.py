"""Abstract memory store interface.

Current implementation: ``SQLiteMemoryStore`` (file-based, survives restarts).
To add another backend (Postgres, Redis, etc.), subclass ``MemoryStore`` and
implement the three abstract methods — no other code changes needed.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class MemoryStore(ABC):
    """Conversation history storage interface."""

    @abstractmethod
    def append(self, session_id: str, role: str, content: str, **kwargs) -> None:
        """Append one message to the session history.

        Args:
            session_id: Unique session identifier.
            role: ``"user"`` or ``"assistant"``.
            content: Message text.
            **kwargs: Optional backend-specific fields (e.g. ``msg_type``).
                     Implementations may ignore unknown kwargs.
        """

    @abstractmethod
    def get_history(
        self,
        session_id: str,
        limit: int | None = None,
    ) -> list[dict[str, str]]:
        """Return conversation history as a list of ``{role, content}`` dicts.

        Args:
            session_id: Unique session identifier.
            limit: If given, return only the last *limit* messages.
                   Useful for capping LLM context window usage.
        """

    @abstractmethod
    def clear(self, session_id: str) -> None:
        """Delete all messages for the given session."""
