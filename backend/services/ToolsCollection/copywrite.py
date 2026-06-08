import json
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from deps import require_login

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = os.getenv("COPYWRITE_MODEL", "google/gemini-2.0-flash-001")

SYSTEM_PROMPT = """你是一位专业的短视频口播文案创作者，擅长根据参考内容创作适合 TikTok/抖音平台的口播文案。

创作要求：
1. 口语化表达，节奏感强，适合真人口播
2. 开头要有吸引力，能在前 3 秒抓住观众注意力
3. 语言简洁有力，避免复杂句式，多用短句
4. 结尾要有引导行动的话术（点赞、关注、评论或购买）
5. 整体时长控制在 30–60 秒内（约 150–300 字）

请根据用户提供的参考内容，创作一段原创口播文案。只输出文案正文，不要解释、标注或额外说明。"""


class CopywriteRequest(BaseModel):
    reference_text: str
    model: str = DEFAULT_MODEL


@router.post("/copywrite")
async def stream_copywrite(body: CopywriteRequest, user: dict = Depends(require_login)):
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "OPENROUTER_API_KEY 未配置")
    if not body.reference_text.strip():
        raise HTTPException(400, "参考内容不能为空")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"参考内容：\n\n{body.reference_text.strip()}"},
    ]

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                async with client.stream(
                    "POST",
                    OPENROUTER_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"model": body.model, "messages": messages, "stream": True},
                ) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        yield f"event: error\ndata: {json.dumps({'error': error_body.decode()})}\n\n"
                        return

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = line[6:]
                        if payload.strip() == "[DONE]":
                            yield f"event: done\ndata: {{}}\n\n"
                            return
                        try:
                            chunk = json.loads(payload)
                            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield f"event: delta\ndata: {json.dumps({'content': delta}, ensure_ascii=False)}\n\n"
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            logger.exception("copywrite stream failed")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
