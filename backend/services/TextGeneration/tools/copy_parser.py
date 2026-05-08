"""Parse Writer markdown output into structured JSON matching example.json format."""

from __future__ import annotations

import re
from typing import Any


# ── Segment type mapping (Chinese/English label → bilingual display name) ────
_SEGMENT_TYPE_MAP = [
    (["钩子", "Hook", "黄金3秒", "Golden"], "Hook (黄金3秒)"),
    (["痛点", "Pain", "好奇", "Curiosity"], "Pain Points & Curiosity (痛点/好奇)"),
    (["产品展示", "Product", "效果证明", "Demo"], "Product Demo (产品展示/效果证明)"),
    (["逼单", "转化", "CTA", "Call"], "CTA (逼单转化)"),
]

# 场景标题匹配：只匹配行首的【...】或[...]，避免误匹配画面描述中的内联标注
# Fix #2 + #3：行首限定 + 同时支持全角【】和半角[]
_SCENE_HEADER_PATTERN = re.compile(
    r"(?:^|\n)[【\[](.+?)[】\]]",
    re.MULTILINE,
)

_SCENE_FIELD_EMOJIS = ["🎤", "📷", "📝", "🎬"]


def _match_segment_type(raw_title: str) -> str:
    for keywords, label in _SEGMENT_TYPE_MAP:
        if any(k.lower() in raw_title.lower() for k in keywords):
            return label
    return raw_title


def _strip_bold(text: str) -> str:
    """Remove **bold** markers the LLM may add around field labels."""
    return re.sub(r"\*\*(.+?)\*\*", r"\1", text)


def _extract_by_emoji(content: str, emoji: str) -> str:
    """Extract a single-line field value by emoji prefix.

    Tolerates any label text (including **bold**) between the emoji and the colon.
    e.g.  🎤 口播：xxx  /  🎤 **Voiceover**: xxx
    """
    pattern = re.escape(emoji) + r"[^\n：:]*[：:]\s*(.*)"
    match = re.search(pattern, content)
    return match.group(1).strip() if match else ""


def _extract_multiline_by_emoji(content: str, emoji: str, stop_emojis: list[str]) -> str:
    """Extract a possibly multi-line value starting at emoji.

    Reads until the next known field emoji, scene header, or separator.
    """
    pattern = re.escape(emoji) + r"[^\n：:]*[：:]\s*(.*)"
    match = re.search(pattern, content)
    if not match:
        return ""

    first_line = match.group(1).strip()
    rest = content[match.end():]

    extra_lines: list[str] = []
    for line in rest.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if any(stripped.startswith(e) for e in stop_emojis + ["---", "【", "["]):
            break
        extra_lines.append(stripped)

    if extra_lines:
        return (first_line + "\n" + "\n".join(extra_lines)).strip() if first_line else "\n".join(extra_lines).strip()
    return first_line


def _extract_header_field(header: str, *candidates: str) -> str:
    """Try multiple label candidates and return the first match.

    Uses [^\n：:]* so it stops at the FIRST colon, avoiding greedy consumption
    of colons that appear inside values (e.g. "20:00").
    """
    for label in candidates:
        pattern = re.escape(label) + r"[^\n：:]*[：:]\s*(.+)"
        match = re.search(pattern, header, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def _extract_multiline_field(block: str, *candidates: str) -> str:
    """Extract a field value that may span multiple lines.

    Used for fields like 运营提示 where the LLM may write a numbered list below.
    Stops at the next '- ' list item or end of block.
    """
    for label in candidates:
        pattern = re.escape(label) + r"[^\n：:]*[：:]\s*(.*)"
        match = re.search(pattern, block, re.IGNORECASE)
        if not match:
            continue

        first_line = match.group(1).strip()
        rest = block[match.end():]

        extra_lines: list[str] = []
        for line in rest.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            # Stop at the next list item that looks like a new field
            if re.match(r"^-\s+\S", stripped) and not stripped.startswith("- "):
                break
            if re.match(r"^[-*]\s+(标题|话题|发布|运营|Title|Hashtag|Post|Tip|Tag)", stripped, re.IGNORECASE):
                break
            extra_lines.append(stripped)

        if extra_lines:
            joined = "\n".join(extra_lines)
            return (first_line + "\n" + joined).strip() if first_line else joined.strip()
        return first_line

    return ""


def _split_list(text: str) -> list[str]:
    """Split audience/tag text by Chinese punctuation only — NOT spaces.

    Fix #1: avoid splitting "iPhone 15用户" into ["iPhone", "15用户"].
    """
    # Split only on Chinese-style delimiters and semicolons, not whitespace
    items = re.split(r"[、,，;]+", text.strip())
    return [item.strip() for item in items if item.strip()]


def _parse_stickers(raw: str) -> list[str]:
    lines = raw.strip().splitlines()
    stickers = []
    for line in lines:
        line = line.strip().lstrip("-·•").strip()
        if line:
            stickers.append(line)
    return stickers


# ── Section parsers ──────────────────────────────────────────────────

def _parse_metadata(header_block: str) -> dict[str, Any]:
    # Emoji-only matching tolerates **bold** labels the LLM may inject
    platform = _extract_by_emoji(header_block, "📱")
    product_name = _extract_by_emoji(header_block, "🎯")
    audience_raw = _extract_by_emoji(header_block, "👤")
    duration = _extract_by_emoji(header_block, "⏱")
    bgm_style = _extract_by_emoji(header_block, "🎵")
    audio_priority = _extract_by_emoji(header_block, "🔊")
    voiceover_tone = _extract_by_emoji(header_block, "🎙")

    return {
        "platform": platform,
        "product_name": product_name,
        "target_audience": _split_list(audience_raw) if audience_raw else [],
        "estimated_duration": duration,
        "audio_config": {
            "bgm_style": bgm_style,
            "audio_priority": audio_priority or None,
            "voiceover_tone": voiceover_tone or None,
        },
    }


def _parse_storyboard(body: str) -> list[dict[str, Any]]:
    # Fix #2 + #3: match only line-leading 【】or [] to avoid inline label confusion
    scene_positions = [
        (m.start(), m.end(), m.group(1))
        for m in _SCENE_HEADER_PATTERN.finditer(body)
    ]

    scenes: list[dict[str, Any]] = []
    for i, (start, end, title) in enumerate(scene_positions):
        next_start = scene_positions[i + 1][0] if i + 1 < len(scene_positions) else len(body)
        content = body[end:next_start]

        # Time range (e.g. "0-3s")
        time_match = re.search(r"(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?s)", title)
        time_range = time_match.group(1) if time_match else ""

        # Clean title for segment type matching
        title_clean = re.sub(r"\s*·?\s*\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?s\s*", "", title).strip(" ·")

        voiceover = _extract_multiline_by_emoji(content, "🎤", _SCENE_FIELD_EMOJIS)
        visual = _extract_multiline_by_emoji(content, "📷", _SCENE_FIELD_EMOJIS)
        stickers_raw = _extract_multiline_by_emoji(content, "📝", _SCENE_FIELD_EMOJIS)
        post_notes = _extract_by_emoji(content, "🎬")

        stickers = _parse_stickers(stickers_raw) if stickers_raw else []

        if post_notes and post_notes.strip() in ("无", "null", "None", "-", "N/A", ""):
            post_notes = None

        scenes.append({
            "scene_id": i + 1,
            "segment_type": _match_segment_type(title_clean),
            "time_range": time_range,
            "voiceover": voiceover,
            "visual_description": visual,
            "text_stickers": stickers,
            "post_production_notes": post_notes or None,
        })

    return scenes


def _parse_publishing(text: str) -> dict[str, Any]:
    pub_match = re.search(r"💡[^\n]*\n([\s\S]*?)$", text)
    # Strip **bold** markers before matching
    pub_block = _strip_bold(pub_match.group(1)) if pub_match else ""

    title = _extract_header_field(pub_block, "- 标题", "标题", "- Title", "Title", "- Video Title", "Video Title")
    hashtags_raw = _extract_header_field(pub_block, "- 话题标签", "话题标签", "- Hashtags", "Hashtags", "- Tags", "Tags")
    posting_time = _extract_header_field(
        pub_block, "- 发布时间", "发布时间", "- Best Posting Time", "Best Posting Time", "- Posting Time", "Posting Time"
    )
    # Fix #4: operation_tips may be multi-line (numbered list below the colon)
    tips = _extract_multiline_field(
        pub_block, "- 运营提示", "运营提示", "- Operation Tips", "Operation Tips", "- Tips", "- Notes"
    )

    hashtags: list[str] = []
    if hashtags_raw:
        tags = re.split(r"[、,，\s#]+", hashtags_raw)
        hashtags = [t.strip().lstrip("#") for t in tags if t.strip()]

    return {
        "video_title": title,
        "hashtags": hashtags,
        "best_posting_time": posting_time,
        "operation_tips": tips or None,
    }


# ── Public entry point ───────────────────────────────────────────────

def parse_copy_to_json(copy_text: str) -> dict[str, Any]:
    """Convert Writer's markdown output to the structured JSON format.

    Returns an empty-but-valid structure on any parse failure rather than raising.
    Fix #5: exception guard so malformed LLM output never causes a 500 error.
    """
    _EMPTY: dict[str, Any] = {
        "video_project": {
            "metadata": {
                "platform": "", "product_name": "", "target_audience": [],
                "estimated_duration": "",
                "audio_config": {"bgm_style": "", "audio_priority": None, "voiceover_tone": None},
            },
            "storyboard": [],
            "publishing_strategy": {"video_title": "", "hashtags": [], "best_posting_time": "", "operation_tips": None},
        }
    }

    if not copy_text or not copy_text.strip():
        return _EMPTY

    try:
        first_scene = re.search(r"[【\[]", copy_text)
        if first_scene:
            header_block = copy_text[:first_scene.start()]
            body = copy_text[first_scene.start():]
        else:
            header_block = copy_text
            body = ""

        metadata = _parse_metadata(header_block)
        storyboard = _parse_storyboard(body) if body else []
        publishing = _parse_publishing(copy_text)

        return {
            "video_project": {
                "metadata": metadata,
                "storyboard": storyboard,
                "publishing_strategy": publishing,
            }
        }
    except Exception:
        return _EMPTY
