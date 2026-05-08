"""Migrate task_assets x/y/w/h into tasks.canvas_config, then drop those columns."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db import get_db, init_db

init_db()

with get_db() as conn:
    tasks = conn.execute("SELECT id FROM tasks").fetchall()
    for task in tasks:
        task_id = task["id"]
        existing = conn.execute("SELECT canvas_config FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if existing and existing["canvas_config"]:
            print(f"Task {task_id}: canvas_config already set, skipping")
            continue

        rows = conn.execute(
            "SELECT asset_id, x, y, w, h, on_canvas FROM task_assets WHERE task_id = ? ORDER BY id",
            (task_id,),
        ).fetchall()
        if not rows:
            continue

        cards = []
        for r in rows:
            if r["on_canvas"] == "1":
                cards.append({
                    "asset_id": r["asset_id"],
                    "x": r["x"], "y": r["y"],
                    "w": r["w"], "h": r["h"],
                })

        config = {
            "viewport": {"offsetX": 0, "offsetY": 0, "scale": 0.85},
            "cards": cards,
            "connections": [],
        }
        conn.execute(
            "UPDATE tasks SET canvas_config = ? WHERE id = ?",
            (json.dumps(config, ensure_ascii=False), task_id),
        )
        print(f"Task {task_id}: migrated {len(cards)} cards to canvas_config")

    conn.commit()
    print("Migration complete.")
