import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request

from db import get_db

ENABLE_LOGIN = os.environ.get("ENABLE_LOGIN", "0") == "1"
ENABLE_DOWNLOAD = os.environ.get("ENABLE_DOWNLOAD", "0") == "1"
JWT_SECRET = os.environ.get("JWT_SECRET", "kick-proto-jwt-secret-change-me")
JWT_ALGORITHM = "HS256"


def _extract_user_from_token(request: Request) -> Optional[dict]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    user_id = payload.get("user_id")
    if not user_id:
        return None
    with get_db() as conn:
        row = conn.execute("SELECT id, name, quota, role FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return dict(row)


async def get_current_user(request: Request) -> Optional[dict]:
    if not ENABLE_LOGIN:
        return None
    return _extract_user_from_token(request)


async def require_login(request: Request) -> dict:
    if not ENABLE_LOGIN:
        return {"id": 0, "name": "anonymous", "quota": 9999, "role": "admin"}
    user = _extract_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录或 token 无效")
    return user


async def require_admin(request: Request) -> dict:
    user = await require_login(request)
    if ENABLE_LOGIN and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


async def check_quota(request: Request) -> dict:
    user = await require_login(request)
    if ENABLE_LOGIN and user.get("role") == "user" and user.get("quota", 0) < 0:
        raise HTTPException(status_code=403, detail="配额已用尽，请联系管理员")
    return user
