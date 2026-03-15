import aiosqlite
import os
from contextlib import asynccontextmanager

DB_PATH = os.getenv("DB_PATH", "triage.db")

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    description     TEXT,
    label           TEXT NOT NULL,
    action          TEXT NOT NULL DEFAULT 'label',   -- label | archive | trash
    source          TEXT NOT NULL DEFAULT 'manual',  -- manual | ai | gmail
    status          TEXT NOT NULL DEFAULT 'active',  -- active | pending | disabled
    conditions      TEXT NOT NULL DEFAULT '{}',      -- JSON: {domain, from_raw, subject_contains, gmail_query, negated_query}
    match_count     INTEGER NOT NULL DEFAULT 0,
    confidence      REAL,
    gmail_filter_id TEXT,                            -- linked Gmail filter id (source='gmail')
    mark_read       INTEGER NOT NULL DEFAULT 0,      -- 1 = mark as read when matched
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS gmail_labels (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    messages_total   INTEGER NOT NULL DEFAULT 0,
    messages_unread  INTEGER NOT NULL DEFAULT 0,
    synced_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

"""  # default settings inserted in init_db from env

@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        yield db

_SETTING_DEFAULTS = {
    "poll_interval_minutes": ("POLL_INTERVAL_MINUTES", "5"),
    "ai_model":              ("AI_MODEL",              "gemini-2.0-flash"),
    "confidence_threshold":  ("CONFIDENCE_THRESHOLD",  "0.85"),
    "dry_run":               ("DRY_RUN",               "false"),
    "batch_size":            ("BATCH_SIZE",            "50"),
    "scheduler_enabled":     ("SCHEDULER_ENABLED",     "false"),
}

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()
        # Seed defaults from env (INSERT OR IGNORE — never overwrites user changes)
        for key, (env_var, fallback) in _SETTING_DEFAULTS.items():
            value = os.getenv(env_var, fallback)
            await db.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )
        await db.commit()
        # Migrations for existing databases — safe to re-run
        for sql in [
            "ALTER TABLE rules ADD COLUMN gmail_filter_id TEXT",
            "ALTER TABLE rules ADD COLUMN mark_read INTEGER NOT NULL DEFAULT 0",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_gmail_filter_id "
            "ON rules(gmail_filter_id) WHERE gmail_filter_id IS NOT NULL",
        ]:
            try:
                await db.execute(sql)
                await db.commit()
            except Exception:
                pass  # column/index already exists

async def get_setting(key: str, default: str = "") -> str:
    async with get_db() as db:
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
            row = await cur.fetchone()
            return row["value"] if row else default

async def set_setting(key: str, value: str):
    async with get_db() as db:
        await db.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            (key, value)
        )
        await db.commit()
