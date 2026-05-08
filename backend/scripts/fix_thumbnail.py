"""
Fix missing thumbnails for video assets.
Query assets where mediatype='video', generate thumbnail via ffmpeg, update DB.

Usage: python scripts/fix_thumbnail.py
"""

import os
import sys
import sqlite3
from pathlib import Path

import ffmpeg

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DB_PATH = BACKEND_DIR / "tasks.db"
MEDIA_DIR = BACKEND_DIR / "media"
THUMB_WIDTH = 320


def make_thumbnail(video_path: Path) -> str:
    thumb_name = f"{video_path.stem}_thumb.jpg"
    thumb_path = video_path.parent / thumb_name
    if thumb_path.exists():
        return thumb_name
    try:
        probe = ffmpeg.probe(str(video_path))
        dur = float(probe["format"]["duration"])
        ts = min(dur * 0.1, 2.0)
        (
            ffmpeg.input(str(video_path), ss=ts)
            .filter("scale", THUMB_WIDTH, -2)
            .output(str(thumb_path), vframes=1, q=2, update=1)
            .overwrite_output()
            .run(quiet=True)
        )
    except Exception as e:
        print(f"  [warn] thumbnail failed for {video_path.name}: {e}")
        return ""
    return thumb_name


def main():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT id, uri, thumbnail FROM assets WHERE mediatype = 'video'"
    ).fetchall()

    if not rows:
        print("No video assets found.")
        conn.close()
        return

    fixed = 0
    skipped = 0
    failed = 0

    for row in rows:
        asset_id = row["id"]
        uri = row["uri"]
        existing_thumb = row["thumbnail"] or ""

        if not uri:
            print(f"  [skip] {asset_id}: no uri")
            skipped += 1
            continue

        video_path = MEDIA_DIR / uri
        if not video_path.exists():
            print(f"  [skip] {asset_id}: file not found {video_path}")
            skipped += 1
            continue

        thumb_file_ok = existing_thumb and (MEDIA_DIR / existing_thumb).exists()
        if thumb_file_ok:
            print(f"  [skip] {asset_id}: thumbnail already exists ({existing_thumb})")
            skipped += 1
            continue

        print(f"  [proc] {asset_id}: generating thumbnail for {uri} ...")
        thumb_name = make_thumbnail(video_path)

        if not thumb_name:
            failed += 1
            continue

        conn.execute(
            "UPDATE assets SET thumbnail = ? WHERE id = ?",
            (thumb_name, asset_id),
        )
        conn.commit()
        print(f"  [done] {asset_id}: thumbnail = {thumb_name}")
        fixed += 1

    conn.close()
    print(f"\nSummary: fixed={fixed}, skipped={skipped}, failed={failed}, total={len(rows)}")


if __name__ == "__main__":
    main()
