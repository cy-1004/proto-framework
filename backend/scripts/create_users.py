"""
批量创建测试用户。
在 backend/ 目录下运行：
    python scripts/create_users.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from db import get_db, pwd_context

USERS = [
    {"name": "alice",  "pwd": "Tkmax@Alice1"},
    {"name": "bob",    "pwd": "Tkmax@Bob123"},
    {"name": "carol",  "pwd": "Tkmax@Carol1"},
    {"name": "david",  "pwd": "Tkmax@David1"},
    {"name": "eva",    "pwd": "Tkmax@Eva123"},
]

def main():
    with get_db() as conn:
        for u in USERS:
            existing = conn.execute("SELECT id FROM users WHERE name = ?", (u["name"],)).fetchone()
            if existing:
                print(f"  跳过（已存在）: {u['name']}")
                continue
            conn.execute(
                "INSERT INTO users (name, pwd, quota, usage, enable, role) VALUES (?, ?, ?, ?, ?, ?)",
                (u["name"], pwd_context.hash(u["pwd"]), 0, 0, 1, "user"),
            )
            print(f"  已创建: {u['name']}  密码: {u['pwd']}")
        conn.commit()
    print("\n完成。")

if __name__ == "__main__":
    main()
