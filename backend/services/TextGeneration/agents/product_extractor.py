"""Product info extractor — fetches a product URL and extracts structured info.

Strategy:
  1. Direct httpx fetch — fastest, gets the exact page HTML.
  2. Jina Reader (r.jina.ai) — handles anti-scraping / login walls on Chinese
     e-commerce platforms (Taobao, JD, Douyin, Pinduoduo, etc.).
  3. If both fail, raise RuntimeError so the caller can handle gracefully.
"""

from __future__ import annotations

import re

import httpx

from agents.base import BaseAgent
from config.settings import get_llm

# Browser-like headers to reduce chance of being blocked
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

_FETCH_TIMEOUT = 10   # seconds for direct fetch
_JINA_TIMEOUT  = 20   # seconds for Jina Reader (remote service)
# Max characters of page text to send to LLM (avoid token overflow)
_MAX_PAGE_CHARS = 6000

_EXTRACT_SYSTEM = (
    "你是一个商品信息提炼专家。"
    "根据提供的商品页面内容，提炼出以下结构化信息，用中文输出：\n\n"
    "产品名称：\n"
    "核心卖点（1-3条）：\n"
    "价格信息（原价/促销价/赠品）：\n"
    "目标人群：\n"
    "平台：\n"
    "其他关键信息：\n\n"
    "只输出以上结构，不要多余解释。"
)


def _strip_html(html: str) -> str:
    """Remove HTML tags and collapse whitespace to get readable plain text."""
    html = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _fetch_page_text(url: str) -> str | None:
    """Direct httpx fetch. Returns cleaned plain text or None on failure."""
    try:
        with httpx.Client(headers=_HEADERS, timeout=_FETCH_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            text = _strip_html(resp.text)
            return text[:_MAX_PAGE_CHARS] if text else None
    except Exception:
        return None


def _fetch_jina_text(url: str) -> str | None:
    """Fetch via Jina Reader (r.jina.ai/{url}). Handles anti-scraping / paywalls.

    Returns clean Markdown text or None on failure.
    """
    try:
        jina_url = f"https://r.jina.ai/{url}"
        jina_headers = {**_HEADERS, "Accept": "text/plain, text/markdown"}
        with httpx.Client(headers=jina_headers, timeout=_JINA_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(jina_url)
            resp.raise_for_status()
            text = resp.text.strip()
            return text[:_MAX_PAGE_CHARS] if text else None
    except Exception:
        return None


class ProductExtractor(BaseAgent):
    name = "writer"       # reuses writer's model config
    prompt_file = ""      # no markdown prompt file
    temperature = 0.3

    def __init__(self) -> None:
        # Bypass BaseAgent.__init__ (no prompt file to load)
        self._llm_plain = get_llm(self.name, temperature=self.temperature)
        self.system_prompt = _EXTRACT_SYSTEM

    def extract(self, url_input: str) -> str:
        """Fetch the product page and return structured product info.

        Tries direct HTTP fetch first, then Jina Reader as fallback.
        Raises RuntimeError if both fail so the caller can surface a clear message.
        """
        url_match = re.search(r"https?://\S+", url_input)
        url = url_match.group(0) if url_match else url_input

        # 1. Direct fetch
        page_text = _fetch_page_text(url)

        # 2. Jina Reader fallback
        if not page_text:
            print("⚠️  直接抓取失败，尝试 Jina Reader…")
            page_text = _fetch_jina_text(url)

        if page_text:
            prompt = f"以下是商品页面的文字内容，请从中提炼商品信息：\n\n{page_text}"
            return self._invoke_with(self._llm_plain, prompt)

        raise RuntimeError(f"无法访问链接（直接抓取和 Jina Reader 均失败）：{url}")
