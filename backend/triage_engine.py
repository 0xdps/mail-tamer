"""
Core triage loop — called by the scheduler and on-demand scan endpoint.
Handles both ongoing triage (new emails) and is reused by the batch processor.
"""

import asyncio
from typing import Optional
from datetime import datetime

import aiosqlite
from database import get_db, get_setting, set_setting
from gmail_client import GmailClient
from rule_engine import match_email
from ai_classifier import classify_batch, maybe_promote_to_rule


async def run_triage(
    trigger: str = "scheduled",
    since: Optional[str] = None,
    message_ids: Optional[list[str]] = None,
    run_id: Optional[int] = None,
) -> dict:
    """
    Execute one triage cycle.
    - `since`: Gmail query timestamp string (e.g. '2024/01/01')
    - `message_ids`: pre-supplied list (used by batch processor)
    - `run_id`: existing run row to update (batch reuse)
    Returns stats dict.
    """
    dry_run = (await get_setting("dry_run", "false")) == "true"
    client = GmailClient()

    # ---------------------------------------------------------------- create run
    async with get_db() as db:
        if run_id is None:
            cur = await db.execute(
                "INSERT INTO runs (trigger, dry_run) VALUES (?, ?)",
                (trigger, int(dry_run))
            )
            await db.commit()
            run_id = cur.lastrowid

    stats = dict(emails_fetched=0, rules_matched=0, ai_calls=0, labels_applied=0)

    try:
        # ------------------------------------------------------------ fetch
        if message_ids is None:
            last_run = since or await get_setting("last_run_at", "")
            raw = client.fetch_messages_since(since_timestamp=last_run or None)
            message_ids = [m["id"] for m in raw]

        stats["emails_fetched"] = len(message_ids)
        await _update_run(run_id, emails_fetched=stats["emails_fetched"])

        # ------------------------------------------------------------ process
        unmatched_emails: list[dict] = []

        for msg_id in message_ids:
            detail = client.fetch_message_detail(msg_id)
            domain = GmailClient.extract_domain(detail["sender"])

            match = await match_email(detail["sender"], detail["subject"], domain)

            if match:
                stats["rules_matched"] += 1
                await _log_decision(
                    message_id=msg_id,
                    email=detail,
                    label=match.label,
                    action=match.action,
                    source=match.source,
                    rule_id=match.rule_id if match.rule_id else None,
                    confidence=match.confidence,
                    model=None,
                    dry_run=dry_run,
                )
                if not dry_run:
                    client.apply_action(msg_id, match.label, match.action)
                    stats["labels_applied"] += 1
            else:
                unmatched_emails.append(detail)

        # ------------------------------------------------------------ AI batch
        batch_size = int(await get_setting("batch_size", "50"))
        for i in range(0, len(unmatched_emails), batch_size):
            batch = unmatched_emails[i:i + batch_size]
            results = await classify_batch(batch)
            stats["ai_calls"] += 1

            for email, result in zip(batch, results):
                await _log_decision(
                    message_id=email["id"],
                    email=email,
                    label=result.label,
                    action=result.action,
                    source="ai",
                    rule_id=None,
                    confidence=result.confidence,
                    model=result.model,
                    dry_run=dry_run,
                )
                if not dry_run:
                    client.apply_action(email["id"], result.label, result.action)
                    stats["labels_applied"] += 1

                # Promote high-confidence to pending rule
                await maybe_promote_to_rule(result, email)

        # ------------------------------------------------------------ update last_run_at
        await set_setting("last_run_at", datetime.utcnow().strftime("%Y/%m/%d"))
        await _finish_run(run_id, stats)

    except Exception as exc:
        await _fail_run(run_id, str(exc))
        raise

    return stats


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

async def _log_decision(
    message_id: str, email: dict, label: str, action: str,
    source: str, rule_id, confidence, model, dry_run: bool
):
    async with get_db() as db:
        await db.execute(
            """INSERT OR IGNORE INTO decisions
               (message_id, sender, subject, snippet, label, action, source,
                rule_id, confidence, model, is_dry_run, applied)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                message_id, email["sender"], email["subject"], email["snippet"],
                label, action, source, rule_id, confidence, model,
                int(dry_run), int(not dry_run),
            )
        )
        await db.commit()


async def _update_run(run_id: int, **kwargs):
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    async with get_db() as db:
        await db.execute(f"UPDATE runs SET {sets} WHERE id = ?", (*kwargs.values(), run_id))
        await db.commit()


async def _finish_run(run_id: int, stats: dict):
    async with get_db() as db:
        await db.execute(
            """UPDATE runs SET
               status = 'done', rules_matched = ?, ai_calls = ?,
               labels_applied = ?, finished_at = datetime('now')
               WHERE id = ?""",
            (stats["rules_matched"], stats["ai_calls"], stats["labels_applied"], run_id)
        )
        await db.commit()


async def _fail_run(run_id: int, error: str):
    async with get_db() as db:
        await db.execute(
            "UPDATE runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?",
            (error[:500], run_id)
        )
        await db.commit()
