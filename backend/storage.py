"""SQLite storage, parameterized queries, explicit memory, bounded activity history."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .models import Preferences


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)
        self.path = directory / "jarvis.sqlite3"
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, due_at TEXT, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, category TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, action TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
            """)
        self.path.chmod(0o600)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def rows(self, query, args=()):
        with self.connect() as db:
            return [dict(row) for row in db.execute(query, args).fetchall()]

    def preferences(self):
        rows = self.rows("SELECT value FROM settings WHERE id=1")
        return Preferences.model_validate_json(rows[0]["value"]) if rows else Preferences()

    def set_preferences(self, value: Preferences):
        with self.connect() as db:
            db.execute("INSERT INTO settings VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value", (value.model_dump_json(),))

    def messages(self, limit=100):
        return list(reversed(self.rows("SELECT * FROM messages ORDER BY rowid DESC LIMIT ?", (limit,))))

    def add_message(self, role, content):
        item = dict(id=uuid4().hex, role=role, content=content, created_at=now())
        with self.connect() as db:
            db.execute("INSERT INTO messages VALUES(:id, :role, :content, :created_at)", item)
        return item

    def clear_messages(self):
        with self.connect() as db:
            db.execute("DELETE FROM messages")

    def tasks(self):
        rows = self.rows("SELECT * FROM tasks ORDER BY done, due_at IS NULL, due_at, created_at DESC")
        for row in rows:
            row["done"] = bool(row["done"])
        return rows

    def add_task(self, title, due_at=None):
        item = dict(id=uuid4().hex, title=title, due_at=due_at, done=False, created_at=now())
        with self.connect() as db:
            db.execute("INSERT INTO tasks VALUES(:id, :title, :due_at, :done, :created_at)", item)
        self.audit("create_task", "success", title)
        return item

    def update_task(self, id, done):
        with self.connect() as db:
            return db.execute("UPDATE tasks SET done=? WHERE id=?", (done, id)).rowcount > 0

    def delete(self, table, id):
        if table not in {"tasks", "memories"}:
            raise ValueError("Table not permitted")
        with self.connect() as db:
            return db.execute(f"DELETE FROM {table} WHERE id=?", (id,)).rowcount > 0

    def memories(self):
        return self.rows("SELECT * FROM memories ORDER BY created_at DESC")

    def add_memory(self, content, category):
        item = dict(id=uuid4().hex, content=content, category=category, created_at=now())
        with self.connect() as db:
            db.execute("INSERT INTO memories VALUES(:id, :content, :category, :created_at)", item)
        self.audit("save_memory", "success", "Memória salva por autorização explícita")
        return item

    def update_memory(self, id, content, category):
        with self.connect() as db:
            updated = db.execute("UPDATE memories SET content=?, category=? WHERE id=?", (content, category, id)).rowcount > 0
        if updated:
            self.audit("update_memory", "success", "Memória editada pelo usuário")
        return updated

    def audit(self, action, status, detail=""):
        with self.connect() as db:
            db.execute("INSERT INTO activity VALUES(?, ?, ?, ?, ?)", (uuid4().hex, action, status, detail[:1000], now()))
            db.execute("DELETE FROM activity WHERE rowid NOT IN (SELECT rowid FROM activity ORDER BY rowid DESC LIMIT 500)")

    def activity(self):
        return self.rows("SELECT * FROM activity ORDER BY rowid DESC LIMIT 200")
