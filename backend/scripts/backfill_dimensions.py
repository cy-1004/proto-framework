"""
Backfill width/height for assets and sync task_assets card size.

Run from proto-framework/backend/:
    python scripts/backfill_dimensions.py
"""

import io
import os
import sys
import sqlite3

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from PIL import Image
import ffmpeg

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "tasks.db")
MEDIA_DIR = os.path.join(os.path.dirname(__file__), "..", "media")

CARD_BASE_W = 240
NAME_BAR_H = 32


def compute_card_size(w: int, h: int) -> tuple[int, int]:
    if w > 0 and h > 0:
        ar = w / h
        return CARD_BASE_W, round(CARD_BASE_W / ar + NAME_BAR_H)
    return CARD_BASE_W, 200


def get_image_size(path: str) -> tuple[int, int]:
    try:
        with Image.open(path) as img:
            return img.size
    except Exception as e:
        print(f"  [PIL error] {e}")
        return 0, 0


def get_video_size(path: str) -> tuple[int, int]:
    try:
        probe = ffmpeg.probe(path)
        vs = next((s for s in probe["streams"] if s["codec_type"] == "video"), None)
        if vs:
            return int(vs["width"]), int(vs["height"])
    except Exception as e:
        print(f"  [ffprobe error] {e}")
    return 0, 0


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        """SELECT id, mediatype, thumbnail, uri
           FROM assets
           WHERE mediatype IN ('image', 'video')
             AND (width IS NULL OR height IS NULL OR width = 0 OR height = 0)"""
    ).fetchall()

    print(f"Found {len(rows)} assets missing dimensions.")

    updated = 0
    for row in rows:
        asset_id = row["id"]
        mediatype = row["mediatype"]
        uri = row["uri"]
        thumbnail = row["thumbnail"]

        filename = uri or thumbnail

        if not filename:
            print(f"  [skip] {asset_id}: no file reference")
            continue

        path = os.path.join(MEDIA_DIR, filename)
        if not os.path.exists(path):
            print(f"  [skip] {asset_id}: file not found -> {path}")
            continue

        if mediatype == "image":
            w, h = get_image_size(path)
        else:
            w, h = get_video_size(path)

        if w == 0 or h == 0:
            print(f"  [skip] {asset_id}: could not read dimensions")
            continue

        card_w, card_h = compute_card_size(w, h)

        conn.execute(
            "UPDATE assets SET width = ?, height = ? WHERE id = ?",
            (w, h, asset_id),
        )
        print(f"  [ok] {asset_id} ({mediatype}): {w}x{h} -> card {card_w}x{card_h}")
        updated += 1

    conn.commit()
    conn.close()
    print(f"\nDone. Updated {updated}/{len(rows)} assets.")


if __name__ == "__main__":
    main()
