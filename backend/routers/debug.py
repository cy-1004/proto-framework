import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db

router = APIRouter(prefix="/api/debug")

ALLOWED_TABLES = {"tasks", "assets", "task_assets", "chat_sessions", "chat_messages", "narations", "task_narations", "script_references", "generation_jobs", "products", "product_assets"}

def _qt(table: str) -> str:
    return f'"{table}"'


@router.get("/config")
def get_config():
    return {"debug": os.getenv("DEBUG", "0") == "1"}


@router.get("/tables")
def list_tables():
    placeholders = ",".join(f"'{t}'" for t in sorted(ALLOWED_TABLES))
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({placeholders})"
        ).fetchall()
        return [r["name"] for r in rows]


@router.get("/tables/{table}/schema")
def table_schema(table: str):
    if table not in ALLOWED_TABLES:
        raise HTTPException(400, "Table not allowed")
    with get_db() as conn:
        cols = conn.execute(f"PRAGMA table_info({_qt(table)})").fetchall()
        return [
            {"name": c["name"], "type": c["type"], "notnull": c["notnull"], "pk": c["pk"], "default": c["dflt_value"]}
            for c in cols
        ]


@router.get("/tables/{table}")
def list_rows(table: str, limit: int = 100, offset: int = 0):
    if table not in ALLOWED_TABLES:
        raise HTTPException(400, "Table not allowed")
    qt = _qt(table)
    with get_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM {qt}").fetchone()[0]
        rows = conn.execute(f"SELECT * FROM {qt} LIMIT ? OFFSET ?", (limit, offset)).fetchall()
        return {"total": total, "rows": [dict(r) for r in rows]}


class RowData(BaseModel):
    data: dict[str, Any]


@router.post("/tables/{table}")
def create_row(table: str, body: RowData):
    if table not in ALLOWED_TABLES:
        raise HTTPException(400, "Table not allowed")
    cols = list(body.data.keys())
    vals = list(body.data.values())
    placeholders = ",".join(["?"] * len(cols))
    col_names = ",".join(cols)
    with get_db() as conn:
        conn.execute(f"INSERT INTO {_qt(table)} ({col_names}) VALUES ({placeholders})", vals)
        conn.commit()
    return {"ok": True}


def _get_pk(conn, table: str) -> str:
    cols = conn.execute(f"PRAGMA table_info({_qt(table)})").fetchall()
    for c in cols:
        if c["pk"] == 1:
            return c["name"]
    return "id"


@router.put("/tables/{table}/{row_id}")
def update_row(table: str, row_id: str, body: RowData):
    if table not in ALLOWED_TABLES:
        raise HTTPException(400, "Table not allowed")
    sets = ",".join([f"{k}=?" for k in body.data.keys()])
    vals = list(body.data.values()) + [row_id]
    with get_db() as conn:
        pk = _get_pk(conn, table)
        conn.execute(f"UPDATE {_qt(table)} SET {sets} WHERE {pk}=?", vals)
        conn.commit()
    return {"ok": True}


@router.delete("/tables/{table}/{row_id}")
def delete_row(table: str, row_id: str):
    if table not in ALLOWED_TABLES:
        raise HTTPException(400, "Table not allowed")
    with get_db() as conn:
        pk = _get_pk(conn, table)
        conn.execute(f"DELETE FROM {_qt(table)} WHERE {pk}=?", (row_id,))
        conn.commit()
    return {"ok": True}
