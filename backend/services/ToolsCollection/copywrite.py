import json
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import log_tool_usage
from deps import require_login

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_GEN_URL = "https://openrouter.ai/api/v1/generation"
DEFAULT_MODEL = os.getenv("COPYWRITE_MODEL", "google/gemini-3-flash-preview")

# 1 USD → CNY exchange rate (configurable via env)
CNY_RATE = float(os.getenv("CNY_RATE", "7.25"))

SYSTEM_PROMPT = (
    "你是一位专业的短视频带货口播文案创作者，深度熟悉 TikTok/抖音平台的内容节奏与用户心理，"
    "擅长将商品卖点自然融入口播叙事，驱动观众完成关注、互动或购买行为。"
)

_CPS = 3.5
_DURATION_LABELS = {15: "15秒", 30: "30秒", 45: "45秒", 60: "1分钟", 90: "1分半", 120: "2分钟"}


def _build_user_message(product_info: str, reference_text: str, duration_seconds: int) -> str:
    word_count = int(duration_seconds * _CPS)
    duration_label = _DURATION_LABELS.get(duration_seconds, f"{duration_seconds}秒")
    parts: list[str] = []
    if product_info.strip():
        parts.append(f"【带货商品信息】\n{product_info.strip()}")
    if reference_text.strip():
        parts.append(f"【参考内容 / 灵感来源】\n{reference_text.strip()}")
    parts.append(
        f"【创作要求】\n"
        f"- 目标时长：{duration_label}（建议 {word_count} 字左右，以实际口播节奏为准）\n"
        f"- 口语化短句，节奏感强，适合真人口播\n"
        f"- 开头前 3 秒必须足够抓眼球，让观众不划走\n"
        f"- 自然植入商品卖点，不能有硬广感\n"
        f"- 结尾加上明确的引导行动话术（购买 / 关注 / 评论 / 收藏）\n\n"
        f"请直接输出口播文案正文，不需要标注段落结构，不需要任何解释说明。"
    )
    return "\n\n".join(parts)


async def _fetch_generation_cost(api_key: str, gen_id: str) -> dict:
    """Fetch accurate token and cost data from OpenRouter after generation completes."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                OPENROUTER_GEN_URL,
                params={"id": gen_id},
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                return {
                    "prompt_tokens": data.get("tokens_prompt"),
                    "completion_tokens": data.get("tokens_completion"),
                    "total_tokens": (data.get("tokens_prompt") or 0) + (data.get("tokens_completion") or 0),
                    "cost_usd": data.get("total_cost"),
                }
    except Exception:
        pass
    return {}


class CopywriteRequest(BaseModel):
    product_info: str = ""
    reference_text: str = ""
    duration_seconds: int = 30
    model: str = DEFAULT_MODEL


@router.post("/copywrite")
async def stream_copywrite(body: CopywriteRequest, user: dict = Depends(require_login)):
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "OPENROUTER_API_KEY 未配置")
    if not body.product_info.strip() and not body.reference_text.strip():
        raise HTTPException(400, "请至少填写商品信息或参考内容之一")
    if body.duration_seconds < 10 or body.duration_seconds > 300:
        raise HTTPException(400, "时长需在 10–300 秒之间")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_message(
            body.product_info, body.reference_text, body.duration_seconds
        )},
    ]
    input_text = (body.product_info + " " + body.reference_text).strip()

    async def event_stream():
        gen_id: str | None = None
        # usage from streaming last chunk (may or may not be present)
        stream_usage: dict = {}

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
                            break
                        try:
                            chunk = json.loads(payload)
                            # Capture generation ID from first chunk
                            if gen_id is None and chunk.get("id"):
                                gen_id = chunk["id"]
                            # Capture inline usage if present (final chunk)
                            if chunk.get("usage"):
                                stream_usage = chunk["usage"]
                            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield f"event: delta\ndata: {json.dumps({'content': delta}, ensure_ascii=False)}\n\n"
                        except json.JSONDecodeError:
                            continue

            # --- Fetch accurate cost from OpenRouter generation endpoint ---
            usage: dict = {}
            if gen_id:
                usage = await _fetch_generation_cost(api_key, gen_id)
            # Fall back to inline usage from streaming if fetch failed
            if not usage and stream_usage:
                usage = {
                    "prompt_tokens": stream_usage.get("prompt_tokens"),
                    "completion_tokens": stream_usage.get("completion_tokens"),
                    "total_tokens": stream_usage.get("total_tokens"),
                    "cost_usd": stream_usage.get("cost"),
                }

            cost_usd = usage.get("cost_usd")
            cost_cny = round(cost_usd * CNY_RATE, 6) if cost_usd is not None else None

            yield f"event: done\ndata: {{}}\n\n"

            # Write to log (best-effort, non-blocking)
            try:
                log_tool_usage(
                    user_id=user["id"],
                    user_name=user.get("name"),
                    tool="copywrite",
                    model=body.model,
                    input_text=input_text,
                    prompt_tokens=usage.get("prompt_tokens"),
                    completion_tokens=usage.get("completion_tokens"),
                    total_tokens=usage.get("total_tokens"),
                    cost_usd=cost_usd,
                    cost_cny=cost_cny,
                )
            except Exception:
                logger.exception("copywrite log_tool_usage failed")

        except Exception as e:
            logger.exception("copywrite stream failed")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
