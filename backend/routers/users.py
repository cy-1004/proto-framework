from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_db, pwd_context
from deps import require_admin

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    name: str
    pwd: str
    quota: int = 100
    role: str = "user"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    pwd: Optional[str] = None
    quota: Optional[int] = None
    role: Optional[str] = None


_USER_COLS = "id, name, quota, usage, enable, role, created_at"


@router.get("")
def list_users(admin: dict = Depends(require_admin)):
    with get_db() as conn:
        rows = conn.execute(f"SELECT {_USER_COLS} FROM users ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@router.post("")
def create_user(body: UserCreate, admin: dict = Depends(require_admin)):
    if body.role not in ("user", "pro", "admin"):
        raise HTTPException(400, "角色必须为 user/pro/admin")
    with get_db() as conn:
        dup = conn.execute("SELECT id FROM users WHERE name = ?", (body.name,)).fetchone()
        if dup:
            raise HTTPException(400, "用户名已存在")
        conn.execute(
            "INSERT INTO users (name, pwd, quota, role) VALUES (?, ?, ?, ?)",
            (body.name, pwd_context.hash(body.pwd), body.quota, body.role),
        )
        conn.commit()
        row = conn.execute(f"SELECT {_USER_COLS} FROM users WHERE name = ?", (body.name,)).fetchone()
    return dict(row)


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdate, admin: dict = Depends(require_admin)):
    with get_db() as conn:
        row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(404, "用户不存在")
        updates, params = [], []
        if body.name is not None:
            dup = conn.execute("SELECT id FROM users WHERE name = ? AND id != ?", (body.name, user_id)).fetchone()
            if dup:
                raise HTTPException(400, "用户名已存在")
            updates.append("name = ?")
            params.append(body.name)
        if body.pwd is not None:
            updates.append("pwd = ?")
            params.append(pwd_context.hash(body.pwd))
        if body.quota is not None:
            updates.append("quota = ?")
            params.append(body.quota)
        if body.role is not None:
            if body.role not in ("user", "pro", "admin"):
                raise HTTPException(400, "角色必须为 user/pro/admin")
            updates.append("role = ?")
            params.append(body.role)
        if updates:
            params.append(user_id)
            conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        row = conn.execute(f"SELECT {_USER_COLS} FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row)


@router.delete("/{user_id}")
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if admin["id"] == user_id:
        raise HTTPException(400, "不能删除自己")
    with get_db() as conn:
        row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(404, "用户不存在")
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    return {"ok": True}
