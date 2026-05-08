"""Extract the total score from a copy-roaster review output."""

from __future__ import annotations

import re


def parse_score(review_text: str) -> float:
    """Extract the total score (X.X / 10) from a roaster review.

    Looks for patterns like:
        **总分：7.2 / 10**
        总分：6.5/10
        **总分: 8.0 / 10**
    """
    patterns = [
        r"总分[：:]\s*\*{0,2}(\d+(?:\.\d+)?)\s*/\s*10",
        r"(\d+(?:\.\d+)?)\s*/\s*10",
    ]
    for pattern in patterns:
        match = re.search(pattern, review_text)
        if match:
            return float(match.group(1))
    return 0.0


def extract_round_summary(review_text: str) -> str:
    """Extract the one-line verdict from the roaster review (一句话定性)."""
    match = re.search(r"一句话定性[：:]\s*(.+)", review_text)
    if match:
        return match.group(1).strip()
    # Fallback: grab the line after 总分
    match = re.search(r"总分.+\n(.+)", review_text)
    if match:
        return match.group(1).strip()
    return ""
