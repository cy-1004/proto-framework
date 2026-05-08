"""Merge assets from tasks2.db into tasks.db where uri not already present."""
import sqlite3

SRC = "tasks2.db"
DST = "tasks.db"

src = sqlite3.connect(SRC)
dst = sqlite3.connect(DST)

# Show schema
src_cur = src.cursor()
dst_cur = dst.cursor()

src_cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("tasks2.db tables:", src_cur.fetchall())
dst_cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("tasks.db  tables:", dst_cur.fetchall())

# Get columns of assets table in tasks2.db
src_cur.execute("PRAGMA table_info(assets)")
cols_info = src_cur.fetchall()
cols = [c[1] for c in cols_info]
print("assets columns:", cols)

assert "uri" in cols, "No 'uri' column found in assets table"

# Fetch existing URIs in tasks.db
dst_cur.execute("SELECT uri FROM assets")
existing_uris = {row[0] for row in dst_cur.fetchall()}
print(f"Existing URIs in tasks.db: {len(existing_uris)}")

# Fetch rows from tasks2.db that are not in tasks.db
placeholders = ", ".join("?" * len(cols))
src_cur.execute("SELECT " + ", ".join(cols) + " FROM assets")
rows = src_cur.fetchall()

to_insert = [row for row in rows if row[cols.index("uri")] not in existing_uris]
print(f"Rows in tasks2.db: {len(rows)}, new to insert: {len(to_insert)}")

if to_insert:
    dst_cur.executemany(
        f"INSERT INTO assets ({', '.join(cols)}) VALUES ({placeholders})",
        to_insert,
    )
    dst.commit()
    print(f"Inserted {len(to_insert)} records.")
else:
    print("Nothing to insert.")

src.close()
dst.close()
