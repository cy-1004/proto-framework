"""TikTok OAuth binding and content publishing router."""
from __future__ import annotations

import base64
import json
import os
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_db
from deps import require_login

router = APIRouter(prefix="/api/tiktok", tags=["tiktok"])

TIKTOK_CLIENT_KEY = os.environ.get("TIKTOK_CLIENT_KEY", "sbawapdrqmrfdiqjbb")
TIKTOK_CLIENT_SECRET = os.environ.get("TIKTOK_CLIENT_SECRET", "T2HGYi6MF6MsuY1RjQdimeLNSMKz8H62")
TIKTOK_REDIRECT_URI = os.environ.get(
    "TIKTOK_REDIRECT_URI", "https://service.wh-press.com/api/tiktok/callback"
)
EXTERNAL_HISTORY_API = "https://service.wh-press.com/api/tiktok/history"
EXTERNAL_VIDEOS_API = "https://service.wh-press.com/api/videos"
TIKTOK_SCOPE = "user.info.basic,video.publish,video.upload"


class BindRequest(BaseModel):
    state: str  # raw base64 state echoed back from callback URL


class PublishRequest(BaseModel):
    title: str
    description: str
    video_url: str
    video_size: int = 0


class UploadRequest(BaseModel):
    video_url: str


@router.get("/auth-url")
async def get_auth_url(redirect_to: str, user: dict = Depends(require_login)):
    state = base64.b64encode(
        json.dumps({"redirect_to": redirect_to}).encode()
    ).decode()
    auth_url = (
        "https://www.tiktok.com/v2/auth/authorize"
        f"?client_key={TIKTOK_CLIENT_KEY}"
        f"&scope={quote(TIKTOK_SCOPE)}"
        "&response_type=code"
        f"&redirect_uri={quote(TIKTOK_REDIRECT_URI)}"
        f"&state={quote(state)}"
    )
    return {"auth_url": auth_url, "state": state}


@router.post("/bind")
async def bind_account(req: BindRequest, user: dict = Depends(require_login)):
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(EXTERNAL_HISTORY_API, params={"state": req.state})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"无法获取授权记录: {e}")

    records = data if isinstance(data, list) else data.get("history", [])
    if not records:
        raise HTTPException(status_code=404, detail="未找到授权记录，请重新授权")

    # Use the most recent record (external service appends, so last = newest)
    latest = records[-1]
    auth_code = latest.get("code", "")
    if not auth_code:
        raise HTTPException(status_code=400, detail=f"授权记录中缺少 code 字段，记录：{latest}")



    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_resp = await client.post(
                "https://open.tiktokapis.com/v2/oauth/token/",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "client_key": TIKTOK_CLIENT_KEY,
                    "client_secret": TIKTOK_CLIENT_SECRET,
                    "code": auth_code,
                    "grant_type": "authorization_code",
                    "redirect_uri": TIKTOK_REDIRECT_URI,
                },
            )
            token_data = token_resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"换取 token 网络错误: {e}")

    if token_resp.status_code != 200 or "access_token" not in token_data:
        raise HTTPException(
            status_code=502,
            detail=f"TikTok token 接口错误 (HTTP {token_resp.status_code}): {token_data}",
        )

    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    open_id = token_data.get("open_id", "")

    # Fetch display name and avatar from TikTok user info API
    display_name = None
    avatar_url = None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://open.tiktokapis.com/v2/user/info/",
                params={"fields": "open_id,display_name,avatar_url"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if r.status_code == 200:
                u = r.json().get("data", {}).get("user", {})
                open_id = open_id or u.get("open_id", "")
                display_name = u.get("display_name")
                avatar_url = u.get("avatar_url")
    except Exception:
        pass

    with get_db() as conn:
        conn.execute(
            """INSERT INTO tiktok_accounts
                   (user_id, open_id, display_name, avatar_url, access_token, refresh_token, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
               ON CONFLICT(user_id) DO UPDATE SET
                   open_id       = excluded.open_id,
                   display_name  = excluded.display_name,
                   avatar_url    = excluded.avatar_url,
                   access_token  = excluded.access_token,
                   refresh_token = excluded.refresh_token,
                   updated_at    = excluded.updated_at""",
            (user["id"], open_id or "", display_name, avatar_url, access_token, refresh_token),
        )
        conn.commit()

    return {"ok": True, "display_name": display_name, "avatar_url": avatar_url}


@router.get("/account")
async def get_account(user: dict = Depends(require_login)):
    with get_db() as conn:
        row = conn.execute(
            "SELECT open_id, display_name, avatar_url, updated_at FROM tiktok_accounts WHERE user_id = ?",
            (user["id"],),
        ).fetchone()
    if not row:
        return {"bound": False}
    return {
        "bound": True,
        "open_id": row["open_id"],
        "display_name": row["display_name"],
        "avatar_url": row["avatar_url"],
        "updated_at": row["updated_at"],
    }


@router.delete("/account")
async def unbind_account(user: dict = Depends(require_login)):
    with get_db() as conn:
        conn.execute("DELETE FROM tiktok_accounts WHERE user_id = ?", (user["id"],))
        conn.commit()
    return {"ok": True}


@router.post("/publish")
async def publish_video(req: PublishRequest, user: dict = Depends(require_login)):
    with get_db() as conn:
        row = conn.execute(
            "SELECT access_token FROM tiktok_accounts WHERE user_id = ?", (user["id"],)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="未绑定 TikTok 账号")

    access_token = row["access_token"]
    title = (f"{req.title} {req.description}".strip() if req.description else req.title)[:150]

    # Unaudited apps are only permitted to post with SELF_ONLY privacy.
    # Change to PUBLIC_TO_EVERYONE after the app passes TikTok's audit.
    privacy_level = "SELF_ONLY"

    payload = {
        "post_info": {
            "title": title,
            "privacy_level": privacy_level,
        },
        "source_info": {
            "source": "PULL_FROM_URL",
            "video_url": req.video_url,
        },
    }
    import logging
    logging.warning("[TikTok publish] payload=%s token_prefix=%s", payload, access_token[:10])

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://open.tiktokapis.com/v2/post/publish/video/init/",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json=payload,
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TikTok API 请求失败: {e}")

    result = resp.json()
    logging.warning("[TikTok publish] status=%s response=%s", resp.status_code, result)
    err = result.get("error", {})
    if resp.status_code != 200 or err.get("code") not in ("ok", "success", None, 0):
        code = err.get("code", "unknown")
        msg = err.get("message") or result.get("message", "未知错误")
        raise HTTPException(status_code=502, detail=f"TikTok 发布失败 [{code}]: {msg}")

    publish_id = result.get("data", {}).get("publish_id", "")

    # Poll status up to 5 times (2 s apart) to confirm upload
    import asyncio
    status = "PROCESSING_UPLOAD"
    for _ in range(5):
        await asyncio.sleep(2)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                sr = await client.post(
                    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json; charset=UTF-8",
                    },
                    json={"publish_id": publish_id},
                )
                sd = sr.json()
                status = sd.get("data", {}).get("status", status)
        except Exception:
            break
        if status in ("PUBLISH_COMPLETE", "FAILED"):
            break

    if status == "FAILED":
        raise HTTPException(status_code=502, detail="TikTok 视频处理失败，请重试")

    return {
        "ok": True,
        "publish_id": publish_id,
        "status": status,
        # 若仍在处理中，前端展示对应提示
        "processing": status != "PUBLISH_COMPLETE",
    }


@router.post("/upload")
async def upload_video_to_inbox(req: UploadRequest, user: dict = Depends(require_login)):
    """发布到草稿箱（video.upload），视频进入 TikTok inbox，用户在 app 内完成编辑后发布。"""
    with get_db() as conn:
        row = conn.execute(
            "SELECT access_token FROM tiktok_accounts WHERE user_id = ?", (user["id"],)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="未绑定 TikTok 账号")

    access_token = row["access_token"]

    payload = {
        "source_info": {
            "source": "PULL_FROM_URL",
            "video_url": req.video_url,
        }
    }

    import logging
    logging.warning("[TikTok upload] payload=%s token_prefix=%s", payload, access_token[:10])

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json=payload,
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TikTok API 请求失败: {e}")

    result = resp.json()
    logging.warning("[TikTok upload] status=%s response=%s", resp.status_code, result)
    err = result.get("error", {})
    if resp.status_code != 200 or err.get("code") not in ("ok", "success", None, 0):
        code = err.get("code", "unknown")
        msg = err.get("message") or result.get("message", "未知错误")
        raise HTTPException(status_code=502, detail=f"TikTok 上传失败 [{code}]: {msg}")

    publish_id = result.get("data", {}).get("publish_id", "")
    return {"ok": True, "publish_id": publish_id}


@router.get("/videos")
async def get_videos(user: dict = Depends(require_login)):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(EXTERNAL_VIDEOS_API)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"获取视频列表失败: {e}")
