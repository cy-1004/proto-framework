"""Strip /media/ prefix from assets.uri for consistency.
All uri values should be plain filenames (e.g. 'gen_xxx.mp4'), not '/media/gen_xxx.mp4'.

Run from proto-framework/backend/:
    python scripts/fix_uri_prefix.py
"""
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "tasks.db")


def main():
    conn = sqlite3.connect(DB_PATH)
    count = conn.execute(
        "SELECT COUNT(*) FROM assets WHERE uri LIKE '/media/%'"
    ).fetchone()[0]
    print(f"Found {count} assets with /media/ prefix in uri")

    if count == 0:
        print("Nothing to fix.")
        conn.close()
        return

    rows = conn.execute(
        "SELECT id, uri FROM assets WHERE uri LIKE '/media/%'"
    ).fetchall()
    for asset_id, uri in rows:
        new_uri = uri.removeprefix("/media/")
        print(f"  {asset_id}: {uri} -> {new_uri}")

    conn.execute(
        "UPDATE assets SET uri = SUBSTR(uri, 8) WHERE uri LIKE '/media/%'"
    )
    conn.commit()
    conn.close()
    print(f"Done. Fixed {count} assets.")


if __name__ == "__main__":
    main()
