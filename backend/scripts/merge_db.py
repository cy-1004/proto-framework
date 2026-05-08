import sqlite3

DB_MAIN = "tasks.db"
DB_SRC = "tasks2.db"

src = sqlite3.connect(DB_SRC)
main = sqlite3.connect(DB_MAIN)

src.row_factory = sqlite3.Row

src_cur = src.cursor()
main_cur = main.cursor()

src_cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in src_cur.fetchall()]
print("tables in tasks2.db:", tables)

for t in tables:
    src_cur.execute(f"PRAGMA table_info({t})")
    cols = [c[1] for c in src_cur.fetchall()]
    print(f"  {t}: {cols}")
    src_cur.execute(f"SELECT COUNT(*) FROM {t}")
    print(f"  rows: {src_cur.fetchone()[0]}")

# Check if 'assets' table exists and has 'uri' column
if "assets" not in tables:
    print("No 'assets' table in tasks2.db")
    exit(1)

src_cur.execute("SELECT * FROM assets")
rows = src_cur.fetchall()
inserted = 0
skipped = 0

for row in rows:
    uri = row["uri"]
    main_cur.execute("SELECT 1 FROM assets WHERE uri = ?", (uri,))
    if main_cur.fetchone() is None:
        cols = row.keys()
        placeholders = ",".join(["?"] * len(cols))
        col_names = ",".join(cols)
        main_cur.execute(
            f"INSERT INTO assets ({col_names}) VALUES ({placeholders})",
            tuple(row)
        )
        inserted += 1
    else:
        skipped += 1

main.commit()
src.close()
main.close()

print(f"Done: inserted={inserted}, skipped={skipped}")
