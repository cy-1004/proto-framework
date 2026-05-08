import json
import os
import sqlite3
from contextlib import contextmanager

import bcrypt


class PwdHelper:
    @staticmethod
    def hash(password: str) -> str:
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    @staticmethod
    def verify(password: str, hashed: str) -> bool:
        return bcrypt.checkpw(password.encode(), hashed.encode())


pwd_context = PwdHelper()

DB_PATH = os.path.join(os.path.dirname(__file__), "tasks.db")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                description TEXT DEFAULT '',
                status      TEXT DEFAULT 'pending',
                cover_image TEXT DEFAULT '',
                created_at  TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        _task_cols = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
        if "cover_image" not in _task_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN cover_image TEXT DEFAULT ''")
            conn.commit()
        if "canvas_config" not in _task_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN canvas_config TEXT DEFAULT ''")
            conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO tasks (title, description, status, cover_image) VALUES (?, ?, ?, ?)",
                [
                    ("夏日防晒好物种草", "30秒竖屏带货短视频，展示三款热门防晒霜的使用效果对比，突出轻薄不假白的卖点",
                     "in_progress", "gen_2b26b607b7cf.png"),
                    ("城市街拍穿搭日记", "记录一天三套 OOTD 街拍，搭配轻快BGM和转场特效，适合小红书/抖音双平台发布",
                     "pending", "walk_thumb.jpg"),
                    ("5分钟读懂量子计算", "知识科普类竖屏视频，用动画和实拍结合讲解量子计算基础原理，目标完播率>40%",
                     "pending", "book_thumb.jpg"),
                    ("赛博朋克城市特效", "AI生成赛博朋克风格城市夜景，叠加霓虹光效和粒子特效，制作15秒视觉冲击力短片",
                     "done", "gen_343eda0147d5.png"),
                    ("新品咖啡机开箱测评", "3分钟产品测评视频，从开箱到实际萃取全流程，重点展示拉花效果和口感描述",
                     "pending", "gen_8ed7a692271f.png"),
                ],
            )
            conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                name_cn TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('image', 'video', 'audio', 'reference', 'naration')),
                subtype TEXT NOT NULL,
                thumbnail TEXT,
                score REAL DEFAULT 0,
                featured TEXT DEFAULT '0' CHECK(featured IN ('0', '1')),
                desc TEXT,
                tags TEXT,
                mediatype TEXT CHECK(mediatype IN ('image', 'video', 'audio')),
                category TEXT,
                format TEXT,
                uri TEXT,
                size INTEGER DEFAULT 0,
                width INTEGER,
                height INTEGER,
                duration REAL,
                source TEXT NOT NULL CHECK(source IN ('uploaded', 'created')),
                user_id TEXT NOT NULL,
                favorite TEXT DEFAULT '0' CHECK(favorite IN ('0', '1')),
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)

        _assets_schema = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='assets'"
        ).fetchone()
        if _assets_schema and "'naration'" not in _assets_schema[0]:
            conn.execute("""CREATE TABLE assets_new (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, name_cn TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('image', 'video', 'audio', 'reference', 'naration')),
                subtype TEXT NOT NULL, thumbnail TEXT, score REAL DEFAULT 0,
                featured TEXT DEFAULT '0' CHECK(featured IN ('0', '1')),
                desc TEXT, tags TEXT,
                mediatype TEXT CHECK(mediatype IN ('image', 'video', 'audio')),
                category TEXT, format TEXT, uri TEXT, size INTEGER DEFAULT 0,
                width INTEGER, height INTEGER, duration REAL,
                source TEXT NOT NULL CHECK(source IN ('uploaded', 'created')),
                user_id TEXT NOT NULL,
                favorite TEXT DEFAULT '0' CHECK(favorite IN ('0', '1')),
                created_at TEXT DEFAULT (datetime('now', 'localtime')))""")
            conn.execute("""INSERT INTO assets_new
                (id, name, name_cn, type, subtype, thumbnail, score, featured,
                 desc, tags, mediatype, category, format, uri, size, width, height,
                 duration, source, user_id, favorite, created_at)
                SELECT id, name, name_cn, type, subtype, thumbnail, score, featured,
                 desc, tags, mediatype, category, format, uri, size, width, height,
                 duration, source, user_id, favorite, created_at
                FROM assets""")
            conn.execute("DROP TABLE assets")
            conn.execute("ALTER TABLE assets_new RENAME TO assets")
            conn.commit()

        _all_tbls = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        # migrate: asset_references / "references" → script_references
        for _old in ("asset_references", "references"):
            if _old in _all_tbls:
                _ar_cols = {row[1] for row in conn.execute(f'PRAGMA table_info("{_old}")')}
                conn.execute("""CREATE TABLE script_references_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    origin_url TEXT, backup_url TEXT, title TEXT,
                    mediatype TEXT CHECK(mediatype IN ('video', 'audio', 'text')),
                    thumbnail TEXT, text_speech TEXT, text_visual TEXT, text_drama TEXT,
                    like_count INTEGER DEFAULT 0, comment_count INTEGER DEFAULT 0,
                    collect_count INTEGER DEFAULT 0, share_count INTEGER DEFAULT 0,
                    view_count INTEGER DEFAULT 0)""")
                conn.execute("""INSERT INTO script_references_new
                    (origin_url, backup_url, title, mediatype, thumbnail,
                     text_speech, text_visual, text_drama,
                     like_count, comment_count, collect_count, share_count, view_count)
                    SELECT origin_url,
                        {bk}, {ti}, {mt}, {th},
                        text_speech, text_visual,
                        {ts},
                        like_count, comment_count, collect_count, share_count, view_count
                    FROM "{old}" """.format(
                    bk="backup_url" if "backup_url" in _ar_cols else "NULL",
                    ti="title" if "title" in _ar_cols else "NULL",
                    mt="mediatype" if "mediatype" in _ar_cols else "NULL",
                    th="thumbnail" if "thumbnail" in _ar_cols else "NULL",
                    ts="text_script" if "text_script" in _ar_cols else ("text_drama" if "text_drama" in _ar_cols else "NULL"),
                    old=_old,
                ))
                conn.execute(f'DROP TABLE "{_old}"')
                conn.execute("ALTER TABLE script_references_new RENAME TO script_references")
                conn.commit()
                _all_tbls = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
                break

        _ref_cols = {row[1] for row in conn.execute("PRAGMA table_info(script_references)")}
        if "backup_url" not in _ref_cols:
            conn.execute("ALTER TABLE script_references ADD COLUMN backup_url TEXT")
            conn.commit()
        if "title" not in _ref_cols:
            conn.execute("ALTER TABLE script_references ADD COLUMN title TEXT")
            conn.commit()
        if "mediatype" not in _ref_cols:
            conn.execute("ALTER TABLE script_references ADD COLUMN mediatype TEXT CHECK(mediatype IN ('video', 'audio', 'text'))")
            conn.commit()
        if "thumbnail" not in _ref_cols:
            conn.execute("ALTER TABLE script_references ADD COLUMN thumbnail TEXT")
            conn.commit()
        if "text_drama" not in _ref_cols and "text_script" in _ref_cols:
            conn.execute("ALTER TABLE script_references ADD COLUMN text_drama TEXT")
            conn.execute("UPDATE script_references SET text_drama = text_script")
            conn.commit()

        existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(assets)")}
        if "favorite" not in existing_cols:
            conn.execute("ALTER TABLE assets ADD COLUMN favorite TEXT DEFAULT '0' CHECK(favorite IN ('0', '1'))")
            conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS script_references (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                origin_url TEXT,
                backup_url TEXT,
                title TEXT,
                mediatype TEXT CHECK(mediatype IN ('video', 'audio', 'text')),
                thumbnail TEXT,
                text_speech TEXT,
                text_visual TEXT,
                text_drama TEXT,
                like_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                collect_count INTEGER DEFAULT 0,
                share_count INTEGER DEFAULT 0,
                view_count INTEGER DEFAULT 0
            )
        """)
        conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS narations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                tts_done TEXT DEFAULT '0' CHECK(tts_done IN ('0', '1')),
                audio TEXT,
                subtitles TEXT,
                uri TEXT,
                duration REAL,
                size INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS task_narations (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                naration_id TEXT NOT NULL REFERENCES narations(id) ON DELETE CASCADE,
                on_canvas TEXT DEFAULT '1' CHECK(on_canvas IN ('0', '1')),
                UNIQUE(task_id, naration_id)
            )
        """)
        conn.commit()

        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS naration_fts USING fts5(
                naration_id UNINDEXED,
                title,
                content,
                tokenize = 'unicode61'
            )
        """)
        conn.commit()

        _all_tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        if "asset_narations" in _all_tables:
            migrated = conn.execute("""
                SELECT an.asset_id, a.name, an.content, an.tts_done, an.audio,
                       an.subtitles, a.uri, a.duration, a.size, a.created_at
                FROM asset_narations an
                JOIN assets a ON a.id = an.asset_id
            """).fetchall()
            for row in migrated:
                if not conn.execute("SELECT id FROM narations WHERE id = ?", (row[0],)).fetchone():
                    conn.execute(
                        "INSERT INTO narations (id,title,content,tts_done,audio,subtitles,uri,duration,size,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        tuple(row),
                    )
            tn_links = conn.execute("""
                SELECT ta.task_id, ta.asset_id, ta.on_canvas
                FROM task_assets ta JOIN assets a ON a.id = ta.asset_id
                WHERE a.type = 'naration'
            """).fetchall()
            for lnk in tn_links:
                if not conn.execute("SELECT id FROM task_narations WHERE task_id=? AND naration_id=?", (lnk[0], lnk[1])).fetchone():
                    conn.execute("INSERT INTO task_narations (task_id,naration_id,on_canvas) VALUES (?,?,?)", tuple(lnk))
            conn.execute("DELETE FROM task_assets WHERE asset_id IN (SELECT id FROM assets WHERE type='naration')")
            conn.execute("DELETE FROM assets WHERE type='naration'")
            conn.execute("DROP TABLE asset_narations")
            conn.commit()
            for nr in conn.execute("SELECT id, title, content FROM narations").fetchall():
                conn.execute("INSERT INTO naration_fts (naration_id, title, content) VALUES (?,?,?)", tuple(nr))
            conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS tiktok_accounts (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL UNIQUE,
                open_id       TEXT NOT NULL,
                display_name  TEXT,
                avatar_url    TEXT,
                access_token  TEXT NOT NULL,
                refresh_token TEXT,
                created_at    TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at    TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.commit()


        asset_count = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        if asset_count == 0:
            conn.executemany(
                """INSERT INTO assets
                   (id, name, name_cn, type, subtype, thumbnail, desc, tags,
                    mediatype, category, format, uri, size, width, height,
                    duration, source, user_id, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                [
                    ("58c5e12a", "Open Book on Wooden Table", "木桌上的打开的书",
                     "image", "background", "book_thumb.jpg",
                     "A background image of an open book with fanned pages on a rustic wooden table, creating a cozy and peaceful atmosphere.",
                     "cozy, peaceful, aesthetic, inspiring",
                     "image", "Nature", "jpg", "book.jpg",
                     275170, 1600, 840, None,
                     "uploaded", "test_user", "2026-03-27 15:39:29"),
                    ("b7dacb09", "Shadow in Play", "影子游戏",
                     "audio", "bgm", None,
                     "background music, sad, used for vlog, story.",
                     "vlog, story",
                     "audio", "sad", "mp3", "dayafterday.mp3",
                     3344179, None, None, 182,
                     "uploaded", "test_user", "2026-03-27 14:44:48"),
                    ("ac80944d", "Uh-Oh Exclamation", "哎呀声",
                     "audio", "sfx", None,
                     "sound effect, tense, used for vlog, story, gaming.",
                     "vlog, story, gaming",
                     None, "tense", None, None,
                     0, None, None, None,
                     "uploaded", "test_user", None),
                    ("52ff6383", "Stylish Woman Walking with Cats", "时尚女性与猫漫步",
                     "video", "portrait", "walk_thumb.jpg",
                     "A portrait video of a stylish woman in a white outfit walking confidently down a vibrant urban street.",
                     "aesthetic, energetic, inspiring",
                     "video", "People", "mp4", "walk.mp4",
                     4005104, 720, 1270, 11,
                     "uploaded", "test_user", "2026-03-27 17:06:15"),
                ],
            )
            conn.commit()

        naration_count = conn.execute("SELECT COUNT(*) FROM narations").fetchone()[0]
        if naration_count == 0:
            conn.execute(
                """INSERT INTO narations (id, title, content, tts_done, audio, subtitles, uri, duration, size, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                ("nr01a1b2", "Sunset Prairie Narration",
                 "在一片广袤的草原上，夕阳正缓缓落下。远处的山峦被染成了金黄色，几只飞鸟掠过天际。"
                 "一位旅人停下脚步，望着这壮丽的景色，心中充满了感动。"
                 "他知道，这一刻的美好将永远留在记忆中。",
                 "1", "narations/n01.mp3", "narations/n01.json",
                 "narations/n01.mp3", 24, 387693,
                 "2026-03-31 15:32:00"),
            )
            conn.commit()
            conn.execute("INSERT INTO naration_fts (naration_id, title, content) VALUES (?,?,?)",
                         ("nr01a1b2", "Sunset Prairie Narration",
                          "在一片广袤的草原上，夕阳正缓缓落下。远处的山峦被染成了金黄色，几只飞鸟掠过天际。"
                          "一位旅人停下脚步，望着这壮丽的景色，心中充满了感动。"
                          "他知道，这一刻的美好将永远留在记忆中。"))
            conn.commit()

        ref_count = conn.execute("SELECT COUNT(*) FROM script_references").fetchone()[0]
        if ref_count == 0:
            conn.execute(
                """INSERT INTO script_references
                   (origin_url, text_speech, text_visual, text_drama,
                    like_count, comment_count, collect_count, share_count, view_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "https://www.tiktok.com/@user/video/7450000000000000001",
                    "大家好，今天跟大家分享一下我的日常穿搭，这套白色套装真的超级好看！",
                    "A stylish woman in a white outfit walking confidently on a vibrant urban street with cats following behind.",
                    "镜头跟随主角走路，节奏轻快，背景音乐活泼，结尾定格在猫咪特写。",
                    12400, 3800, 2100, 980, 258000,
                ),
            )
            conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS task_assets (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                x        REAL DEFAULT 0,
                y        REAL DEFAULT 0,
                w        REAL DEFAULT 240,
                h        REAL DEFAULT 200,
                on_canvas TEXT DEFAULT '1' CHECK(on_canvas IN ('0', '1')),
                UNIQUE(task_id, asset_id)
            )
        """)
        conn.commit()

        _ta_cols = {row[1] for row in conn.execute("PRAGMA table_info(task_assets)")}
        if "on_canvas" not in _ta_cols:
            conn.execute("ALTER TABLE task_assets ADD COLUMN on_canvas TEXT DEFAULT '1' CHECK(on_canvas IN ('0', '1'))")
            conn.commit()

        if "x" in _ta_cols:
            for t in conn.execute("SELECT id FROM tasks").fetchall():
                tid = t["id"]
                cc = conn.execute("SELECT canvas_config FROM tasks WHERE id = ?", (tid,)).fetchone()
                if cc and cc["canvas_config"]:
                    continue
                tas = conn.execute(
                    "SELECT asset_id, x, y, w, h, on_canvas FROM task_assets WHERE task_id = ? ORDER BY id",
                    (tid,),
                ).fetchall()
                cards = [{"asset_id": r["asset_id"], "x": r["x"], "y": r["y"], "w": r["w"], "h": r["h"]}
                         for r in tas if r["on_canvas"] == "1"]
                if cards:
                    cfg = {"viewport": {"offsetX": 0, "offsetY": 0, "scale": 0.85}, "cards": cards, "connections": []}
                    conn.execute("UPDATE tasks SET canvas_config = ? WHERE id = ?",
                                 (json.dumps(cfg, ensure_ascii=False), tid))
            conn.commit()
            conn.execute("""CREATE TABLE task_assets_new (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                on_canvas TEXT DEFAULT '1' CHECK(on_canvas IN ('0', '1')),
                UNIQUE(task_id, asset_id))""")
            conn.execute("""INSERT INTO task_assets_new (id, task_id, asset_id, on_canvas)
                SELECT id, task_id, asset_id, on_canvas FROM task_assets""")
            conn.execute("DROP TABLE task_assets")
            conn.execute("ALTER TABLE task_assets_new RENAME TO task_assets")
            conn.commit()

        ta_count = conn.execute("SELECT COUNT(*) FROM task_assets").fetchone()[0]
        if ta_count == 0:
            conn.executemany(
                "INSERT INTO task_assets (task_id, asset_id, on_canvas) VALUES (?, ?, ?)",
                [
                    (1, "58c5e12a", "1"),
                    (1, "b7dacb09", "1"),
                    (1, "ac80944d", "0"),
                    (1, "52ff6383", "1"),
                ],
            )
            conn.commit()
            tn_count = conn.execute("SELECT COUNT(*) FROM task_narations").fetchone()[0]
            if tn_count == 0:
                conn.execute(
                    "INSERT INTO task_narations (task_id, naration_id, on_canvas) VALUES (?, ?, ?)",
                    (1, "nr01a1b2", "1"),
                )
                conn.commit()
            seed_cards = [
                {"asset_id": "58c5e12a", "x": 80, "y": 60, "w": 240, "h": 200},
                {"asset_id": "b7dacb09", "x": 380, "y": 60, "w": 240, "h": 200},
                {"asset_id": "52ff6383", "x": 380, "y": 320, "w": 240, "h": 200},
                {"asset_id": "nr01a1b2", "x": 80, "y": 560, "w": 240, "h": 60},
            ]
            seed_cfg = {"viewport": {"offsetX": 0, "offsetY": 0, "scale": 0.85},
                        "cards": seed_cards, "connections": []}
            conn.execute("UPDATE tasks SET canvas_config = ? WHERE id = 1",
                         (json.dumps(seed_cfg, ensure_ascii=False),))
            conn.commit()

        _cs_schema = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_sessions'"
        ).fetchone()
        if _cs_schema and ("'generate'" not in _cs_schema[0] or "'script'" not in _cs_schema[0]):
            conn.execute("""CREATE TABLE chat_sessions_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL,
                stage TEXT NOT NULL CHECK(stage IN ('lib', 'storyboard', 'finecut', 'script')),
                mode TEXT NOT NULL CHECK(mode IN ('freechat', 'search', 'generate')),
                title TEXT, created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE)""")
            conn.execute("INSERT INTO chat_sessions_new SELECT * FROM chat_sessions")
            conn.execute("DROP TABLE chat_sessions")
            conn.execute("ALTER TABLE chat_sessions_new RENAME TO chat_sessions")
            conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id    INTEGER NOT NULL,
                stage      TEXT NOT NULL CHECK(stage IN ('lib', 'storyboard', 'finecut', 'script')),
                mode       TEXT NOT NULL CHECK(mode IN ('freechat', 'search', 'generate')),
                title      TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role       TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content    TEXT NOT NULL DEFAULT '',
                model      TEXT,
                msg_type   TEXT NOT NULL DEFAULT 'text',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )
        """)
        conn.commit()

        _msg_cols = {row[1] for row in conn.execute("PRAGMA table_info(chat_messages)")}
        if "msg_type" not in _msg_cols:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN msg_type TEXT NOT NULL DEFAULT 'text'")
            conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS generation_jobs (
                id          TEXT PRIMARY KEY,
                task_id     INTEGER NOT NULL REFERENCES tasks(id),
                session_id  INTEGER REFERENCES chat_sessions(id),
                media_type  TEXT NOT NULL,
                provider    TEXT NOT NULL,
                prompt      TEXT NOT NULL,
                config      TEXT DEFAULT '{}',
                count       INTEGER DEFAULT 1,
                center_x    INTEGER,
                center_y    INTEGER,
                status      TEXT DEFAULT 'pending',
                progress    INTEGER DEFAULT 0,
                message     TEXT DEFAULT '',
                results     TEXT DEFAULT '[]',
                errors      TEXT DEFAULT '[]',
                created_at  TEXT DEFAULT (datetime('now','localtime')),
                updated_at  TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        conn.commit()

        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS asset_fts USING fts5(
                asset_id UNINDEXED,
                content,
                tokenize = 'unicode61'
            )
        """)
        conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL UNIQUE,
                pwd        TEXT NOT NULL,
                quota      INTEGER DEFAULT 100,
                role       TEXT DEFAULT 'user' CHECK(role IN ('user', 'pro', 'admin')),
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.commit()
        admin_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
        if admin_count == 0:
            conn.execute(
                "INSERT INTO users (name, pwd, quota, role) VALUES (?, ?, ?, ?)",
                ("admin", pwd_context.hash("admin123"), 9999, "admin"),
            )
            conn.commit()

        chat_count = conn.execute("SELECT COUNT(*) FROM chat_sessions").fetchone()[0]
        if chat_count == 0:
            conn.executemany(
                "INSERT INTO chat_sessions (task_id, stage, mode, title) VALUES (?, ?, ?, ?)",
                [
                    (1, "lib", "freechat", "素材风格讨论"),
                    (1, "lib", "search", "寻找日落场景素材"),
                    (1, "lib", "freechat", "背景音乐推荐"),
                ],
            )
            conn.commit()

            conn.executemany(
                "INSERT INTO chat_messages (session_id, role, content, model) VALUES (?, ?, ?, ?)",
                [
                    (1, "user", "这个项目适合什么风格的画面？我想要一种温暖治愈的感觉", None),
                    (1, "assistant", "温暖治愈的风格通常可以从以下几个方面入手：\n\n1. **色调**：暖黄、柔橙、奶白色系\n2. **光线**：自然光、黄金时段的侧光\n3. **构图**：留白较多、画面干净\n4. **素材类型**：日常生活场景、自然风光、慢节奏运镜\n\n你的素材库里已经有一些不错的素材，比如那张木桌上的书就很契合这个风格。", "minimax/minimax-m2.7"),
                    (1, "user", "有没有推荐的配色方案？", None),
                    (1, "assistant", "推荐几组温暖治愈的配色方案：\n\n**方案一「晨光」**\n- 主色：#F5E6D3（奶茶色）\n- 辅色：#E8C4A0（焦糖色）\n- 点缀：#7B9E6B（苔藓绿）\n\n**方案二「暮色」**\n- 主色：#FFF0DB（暖杏色）\n- 辅色：#D4A574（琥珀色）\n- 点缀：#8B7355（咖啡棕）\n\n建议在剪辑时统一调色，保持整体色调一致。", "minimax/minimax-m2.7"),
                    (2, "user", "找一些日落海边的视频素材", None),
                    (3, "user", "有什么适合治愈风格的背景音乐推荐吗？", None),
                    (3, "assistant", "推荐几类适合温暖治愈风格的BGM：\n\n1. **钢琴轻音乐** — 如坂本龙一风格的简约钢琴曲\n2. **吉他弹唱** — 轻柔的民谣吉他\n3. **Lo-fi** — 带有黑胶唱片质感的慢节拍\n\n你素材库中的「Shadow in Play」就是一首不错的选择，节奏舒缓适合叙事类内容。", "minimax/minimax-m2.7"),
                ],
            )
            conn.commit()

        # ── products ──────────────────────────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id            TEXT PRIMARY KEY,
                product_id    TEXT NOT NULL,
                seller_id     TEXT DEFAULT '',
                title         TEXT NOT NULL,
                description   TEXT DEFAULT '',
                category      TEXT DEFAULT '',
                slug          TEXT DEFAULT '',
                canonical_url TEXT DEFAULT '',
                cover_image   TEXT DEFAULT '',
                images        TEXT DEFAULT '[]',
                created_at    TEXT DEFAULT (datetime('now', 'localtime')),
                UNIQUE(product_id)
            )
        """)
        conn.commit()

        # ── product_assets ────────────────────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS product_assets (
                id            TEXT PRIMARY KEY,
                product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                asset_type    TEXT NOT NULL CHECK(asset_type IN ('image', 'video', 'affiliate_video')),
                origin_url    TEXT DEFAULT '',
                thumbnail_url TEXT DEFAULT '',
                width         INTEGER,
                height        INTEGER,
                duration      REAL,
                created_at    TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.commit()

        # ── seed: products & product_assets ───────────────────────────────────
        product_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if product_count == 0:
            conn.execute(
                """INSERT INTO products
                   (id, product_id, seller_id, title, description, category,
                    slug, canonical_url, cover_image, images)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "prod_001",
                    "1729410103929704001",
                    "7495192122169133001",
                    "Open Book Aesthetic Desk Decoration",
                    "A beautifully styled open book perfect for desk decoration and aesthetic flat lays. Great for bookworm content creators.",
                    '{"first": "Home & Living", "second": "Decor", "third": "Desk Accessories"}',
                    "open-book-aesthetic-desk-decoration",
                    "https://www.tiktok.com/shop/pdp/open-book-aesthetic-desk-decoration/1729410103929704001",
                    "products/sample_book.webp",
                    '[{"url": "products/sample_book.webp", "width": 800, "height": 600}]',
                ),
            )
            conn.commit()

            conn.executemany(
                """INSERT INTO product_assets
                   (id, product_id, asset_type, origin_url, thumbnail_url, width, height, duration)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        "pa_001",
                        "prod_001",
                        "image",
                        "products/sample_book.webp",
                        "products/sample_book.webp",
                        800, 600, None,
                    ),
                    (
                        "pa_002",
                        "prod_001",
                        "video",
                        "products/sample_book.mp4",
                        "products/sample_book.webp",
                        720, 1280, None,
                    ),
                ],
            )
            conn.commit()
