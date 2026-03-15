import aiosqlite
import os

DB_PATH = os.getenv("DB_PATH", "triage.db")

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    label       TEXT NOT NULL,
    action      TEXT NOT NULL DEFAULT 'label',   -- label | archive | trash
    source      TEXT NOT NULL DEFAULT 'manual',  -- manual | ai
    status      TEXT NOT NULL DEFAULT 'active',  -- active | pending | disabled
    conditions  TEXT NOT NULL DEFAULT '{}',      -- JSON: {domain, subject_contains, headers}
    match_count INTEGER NOT NULL DEFAULT 0,
    confidence  REAL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS domain_mappings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    domain     TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    action     TEXT NOT NULL DEFAULT 'label',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decisions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id   TEXT NOT NULL UNIQUE,
    sender       TEXT,
    subject      TEXT,
    snippet      TEXT,
    label        TEXT,
    action       TEXT,
    source       TEXT NOT NULL DEFAULT 'ai',    -- ai | rule | domain
    rule_id      INTEGER REFERENCES rules(id),
    confidence   REAL,
    model        TEXT,
    is_dry_run   INTEGER NOT NULL DEFAULT 0,
    applied      INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger         TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | manual | batch
    status          TEXT NOT NULL DEFAULT 'running',    -- running | done | failed
    emails_fetched  INTEGER NOT NULL DEFAULT 0,
    rules_matched   INTEGER NOT NULL DEFAULT 0,
    ai_calls        INTEGER NOT NULL DEFAULT 0,
    labels_applied  INTEGER NOT NULL DEFAULT 0,
    dry_run         INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    started_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at     TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('poll_interval_minutes', '5'),
    ('ai_model', 'gemini-2.0-flash'),
    ('confidence_threshold', '0.85'),
    ('dry_run', 'false'),
    ('batch_size', '50'),
    ('scheduler_enabled', 'true');
"""

async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    return db

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()

async def get_setting(key: str, default: str = "") -> str:
    async with await get_db() as db:
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
            row = await cur.fetchone()
            return row["value"] if row else default

async def set_setting(key: str, value: str):
    async with await get_db() as db:
        await db.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            (key, value)
        )
        await db.commit()
