"""
Backfill metadata for source=created image/video assets using LLM analysis.

Run from proto-framework/backend/:
    python scripts/backfill_created_assets.py
    python scripts/backfill_created_assets.py --dry-run   # preview only
    python scripts/backfill_created_assets.py --id abc123  # single asset
"""

import argparse
import os
import sys
import sqlite3
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from services.media_analyzer import analyze_media
from services.embedding import get_embedding, build_content
from services import vector_store

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "tasks.db")
MEDIA_DIR = os.path.join(os.path.dirname(__file__), "..", "media")

FIELDS_TO_UPDATE = ("name", "name_cn", "subtype", "desc", "tags", "category")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--id", type=str, help="Only process this asset id")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    query = """
        SELECT id, type, uri, desc, name
        FROM assets
        WHERE source = 'created' AND type IN ('image', 'video')
    """
    params = ()
    if args.id:
        query += " AND id = ?"
        params = (args.id,)

    rows = conn.execute(query, params).fetchall()
    print(f"Found {len(rows)} source=created image/video assets.\n")

    updated = 0
    failed = 0
    for i, row in enumerate(rows):
        asset_id = row["id"]
        media_type = row["type"]
        uri = row["uri"]
        prompt = row["desc"] or ""

        print(f"[{i+1}/{len(rows)}] {asset_id} ({media_type}) uri={uri}")
        print(f"  current name: {row['name']}")
        print(f"  current desc: {prompt[:80]}...")

        if not uri:
            print("  [skip] no uri\n")
            continue

        file_path = os.path.join(MEDIA_DIR, uri)
        if not os.path.exists(file_path):
            print(f"  [skip] file not found: {file_path}\n")
            continue

        analysis = analyze_media(file_path, media_type, prompt)
        if not analysis:
            print("  [fail] LLM analysis returned None\n")
            failed += 1
            continue

        print(f"  -> name:     {analysis.get('name')}")
        print(f"  -> name_cn:  {analysis.get('name_cn')}")
        print(f"  -> subtype:  {analysis.get('subtype')}")
        print(f"  -> category: {analysis.get('category')}")
        print(f"  -> tags:     {analysis.get('tags')}")
        print(f"  -> desc:     {analysis.get('desc', '')[:100]}")

        if args.dry_run:
            print("  [dry-run] skipped write\n")
            continue

        conn.execute(
            """UPDATE assets
               SET name = ?, name_cn = ?, subtype = ?, desc = ?, tags = ?, category = ?
               WHERE id = ?""",
            (
                analysis.get("name", row["name"]),
                analysis.get("name_cn", row["name"]),
                analysis.get("subtype", "generated"),
                analysis.get("desc", prompt),
                analysis.get("tags", ""),
                analysis.get("category", "ai-generated"),
                asset_id,
            ),
        )
        conn.commit()

        asset_dict = dict(conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone())
        content = build_content(asset_dict)
        if content.strip():
            embedding = get_embedding(content)
            metadata = {
                "type": asset_dict.get("type") or "",
                "subtype": asset_dict.get("subtype") or "",
                "category": asset_dict.get("category") or "",
            }
            vector_store.upsert(asset_id, embedding, content, metadata)
            conn.execute("DELETE FROM asset_fts WHERE asset_id = ?", (asset_id,))
            conn.execute("INSERT INTO asset_fts (asset_id, content) VALUES (?, ?)", (asset_id, content))
            conn.commit()

        updated += 1
        print(f"  [ok] updated + re-embedded\n")

        time.sleep(1)

    conn.close()
    print(f"Done. Updated {updated}/{len(rows)}, failed {failed}.")


if __name__ == "__main__":
    main()
