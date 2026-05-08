"""SQLite-backed conversation store.

Design notes
------------
* Uses Python's built-in ``sqlite3`` — zero extra dependencies.
* Single persistent connection with ``check_same_thread=False`` + a
  ``threading.Lock`` that serializes all writes.  Reads are also serialised to
  avoid "database is locked" errors under concurrent FastAPI requests.
* WAL journal mode keeps the DB readable by external tools (DB Browser,
  sqlite3 CLI) while the server is running.
* ``PRAGMA foreign_keys = ON`` ensures cascade-deletes work correctly.
* ``PRAGMA synchronous = NORMAL`` is safe with WAL and gives a noticeable
  throughput improvement over the default FULL mode.
* Auto-creates the DB file and any parent directories on first use.
* Schema is idempotent (CREATE TABLE IF NOT EXISTS) — safe to deploy over an
  existing DB file without manual migration.

Portability path
----------------
To migrate to another database engine (PostgreSQL, MySQL, …):
  1. Create a new class that subclasses ``memory.base.MemoryStore``.
  2. Implement ``append``, ``get_history``, ``clear``.
  3. Replace the one line in ``app.py`` that instantiates the store.
  No other code in the project needs to change.
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path


from .base import MemoryStore

# ── Schema ────────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id  TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL
                        REFERENCES sessions(session_id) ON DELETE CASCADE,
    role        TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Composite index covers both "get all messages for session" and "get last N"
CREATE INDEX IF NOT EXISTS idx_messages_session_id
    ON messages (session_id, id);
"""


# ── Store ─────────────────────────────────────────────────────────────────────

class SQLiteMemoryStore(MemoryStore):
    """Persistent conversation store backed by a local SQLite file.

    Args:
        db_path: Path to the ``.db`` file.  Parent directories are created
                 automatically.  Defaults to ``data/memory.db`` relative to
                 the current working directory.
    """

    def __init__(self, db_path: str | Path = "data/memory.db") -> None:
        self._path = Path(db_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

        self._lock = threading.Lock()
        self._conn = sqlite3.connect(
            str(self._path),
            check_same_thread=False,
        )
        self._conn.row_factory = sqlite3.Row
        self._apply_pragmas()
        self._init_schema()

    # ── MemoryStore interface ─────────────────────────────────────────────────

    def append(self, session_id: str, role: str, content: str, **kwargs) -> None:
        """Insert one message, creating the session row if it does not exist.

        Extra kwargs (e.g. ``msg_type``) are accepted for interface compatibility
        but ignored — this store has no schema support for them.
        """
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO sessions (session_id) VALUES (?)",
                (session_id,),
            )
            self._conn.execute(
                "UPDATE sessions SET updated_at = datetime('now') WHERE session_id = ?",
                (session_id,),
            )
            self._conn.execute(
                "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
                (session_id, role, content),
            )
            self._conn.commit()

    def get_history(
        self,
        session_id: str,
        limit: int | None = None,
    ) -> list[dict[str, str]]:
        """Return conversation history, optionally capped to the last *limit* messages."""
        sql = "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id"
        params: tuple = (session_id,)

        if limit is not None:
            # Fetch last N rows: subquery orders DESC then outer re-orders ASC
            sql = (
                "SELECT role, content FROM ("
                "  SELECT id, role, content FROM messages"
                "  WHERE session_id = ? ORDER BY id DESC LIMIT ?"
                ") ORDER BY id"
            )
            params = (session_id, limit)

        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [{"role": r["role"], "content": r["content"]} for r in rows]

    def clear(self, session_id: str) -> None:
        """Delete all messages for the session (keeps the session row)."""
        with self._lock:
            self._conn.execute(
                "DELETE FROM messages WHERE session_id = ?", (session_id,)
            )
            self._conn.commit()

    # ── Extended API (SQLite-specific) ────────────────────────────────────────

    def list_sessions(self) -> list[dict[str, str]]:
        """Return all sessions ordered by most-recently-updated first.

        Each entry: ``{session_id, created_at, updated_at}``.
        Useful for admin dashboards and debugging.
        """
        with self._lock:
            rows = self._conn.execute(
                "SELECT session_id, created_at, updated_at"
                " FROM sessions ORDER BY updated_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_session(self, session_id: str) -> None:
        """Permanently delete a session and all its messages (cascade)."""
        with self._lock:
            self._conn.execute(
                "DELETE FROM sessions WHERE session_id = ?", (session_id,)
            )
            self._conn.commit()

    def message_count(self, session_id: str) -> int:
        """Return the total number of messages stored for a session."""
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) FROM messages WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        return row[0] if row else 0

    def close(self) -> None:
        """Close the database connection.  Call on application shutdown."""
        with self._lock:
            self._conn.close()

    # ── Internals ─────────────────────────────────────────────────────────────

    def _apply_pragmas(self) -> None:
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA synchronous = NORMAL")

    def _init_schema(self) -> None:
        # executescript auto-commits, so no explicit commit needed here
        self._conn.executescript(_SCHEMA)

    def __repr__(self) -> str:
        return f"SQLiteMemoryStore(db_path={str(self._path)!r})"
