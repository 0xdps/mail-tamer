"""
Batch processor for one-time inbox migration (20k+ emails).
Checkpoints progress in SQLite so it can resume if interrupted.
"""

import asyncio
from database import get_db, get_setting, set_setting
from gmail_client import GmailClient
from triage_engine import run_triage


CHECKPOINT_KEY = "batch_checkpoint_index"
BATCH_MESSAGE_IDS_KEY = "batch_message_ids"


async def run_batch(max_emails: int = 20000) -> dict:
    """
    Fetch all inbox emails (up to max_emails) and triage them in batches.
    Resumable — picks up from SQLite checkpoint if interrupted.
    """
    client = GmailClient()

    # Fetch all message IDs (metadata only - cheap)
    raw = client.fetch_messages_since(max_results=max_emails)
    all_ids = [m["id"] for m in raw]
    total = len(all_ids)

    # Check for existing checkpoint
    checkpoint = int(await get_setting(CHECKPOINT_KEY, "0"))

    # Create a batch run entry
    async with await get_db() as db:
        cur = await db.execute(
            "INSERT INTO runs (trigger, emails_fetched) VALUES ('batch', ?)", (total,)
        )
        await db.commit()
        run_id = cur.lastrowid

    batch_size = int(await get_setting("batch_size", "50"))
    total_processed = checkpoint
    total_rules_matched = 0
    total_ai_calls = 0
    total_applied = 0

    remaining_ids = all_ids[checkpoint:]

    for i in range(0, len(remaining_ids), batch_size):
        chunk = remaining_ids[i:i + batch_size]

        stats = await run_triage(
            trigger="batch",
            message_ids=chunk,
            run_id=None,  # Each chunk gets its own run log
        )

        total_processed += len(chunk)
        total_rules_matched += stats.get("rules_matched", 0)
        total_ai_calls += stats.get("ai_calls", 0)
        total_applied += stats.get("labels_applied", 0)

        # Save checkpoint so we can resume
        await set_setting(CHECKPOINT_KEY, str(total_processed))

    # Clear checkpoint once complete
    await set_setting(CHECKPOINT_KEY, "0")

    # Update batch run entry
    async with await get_db() as db:
        await db.execute(
            """UPDATE runs SET status = 'done', rules_matched = ?, ai_calls = ?,
               labels_applied = ?, finished_at = datetime('now') WHERE id = ?""",
            (total_rules_matched, total_ai_calls, total_applied, run_id)
        )
        await db.commit()

    return {
        "total": total,
        "processed": total_processed,
        "rules_matched": total_rules_matched,
        "ai_calls": total_ai_calls,
        "labels_applied": total_applied,
    }
