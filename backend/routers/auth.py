import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_db, pwd_context
from deps import JWT_ALGORITHM, JWT_SECRET, ENABLE_LOGIN, ENABLE_DOWNLOAD, require_login

router = APIRouter(prefix="/api/auth", tags=["auth"])

TOKEN_EXPIRE_DAYS = 7


class LoginRequest(BaseModel):
    name: str
    pwd: str


@router.get("/config")
def auth_config():
    return {"enable_login": ENABLE_LOGIN, "enable_download": ENABLE_DOWNLOAD}


@router.post("/login")
def login(body: LoginRequest):
    if not ENABLE_LOGIN:
        raise HTTPException(400, "登录未启用")
    with get_db() as conn:
        row = conn.execute("SELECT id, name, pwd, quota, role FROM users WHERE name = ?", (body.name,)).fetchone()
    if not row or not pwd_context.verify(body.pwd, row["pwd"]):
        raise HTTPException(401, "用户名或密码错误")
    payload = {
        "user_id": row["id"],
        "role": row["role"],
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "token": token,
        "user": {"id": row["id"], "name": row["name"], "quota": row["quota"], "role": row["role"]},
    }


@router.get("/me")
def me(user: dict = Depends(require_login)):
    return {"id": user["id"], "name": user["name"], "quota": user["quota"], "role": user["role"]}
