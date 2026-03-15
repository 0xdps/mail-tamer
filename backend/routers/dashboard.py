import asyncio
from fastapi import APIRouter, Depends

from auth import require_auth
from database import get_db

router = APIRouter(
    prefix="/api/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(require_auth)],
)


def _fetch_gmail_labels_sync() -> list[dict]:
    from gmail_client import get_gmail_service

    service = get_gmail_service()
    result = service.users().labels().list(userId="me").execute()
    labels = []
    for lbl in result.get("labels", []):
        if lbl.get("type") == "user":
            detail = service.users().labels().get(userId="me", id=lbl["id"]).execute()
            labels.append(
                {
                    "id": detail["id"],
                    "name": detail["name"],
                    "messages_total": detail.get("messagesTotal", 0),
                    "messages_unread": detail.get("messagesUnread", 0),
                }
            )
    return labels


@router.post("/sync-labels")
async def sync_labels():
    loop = asyncio.get_running_loop()
    labels = await loop.run_in_executor(None, _fetch_gmail_labels_sync)

    async with get_db() as db:
        for lbl in labels:
            await db.execute(
                """INSERT INTO gmail_labels (id, name, messages_total, messages_unread, synced_at)
                   VALUES (?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(id) DO UPDATE SET
                     name             = excluded.name,
                     messages_total   = excluded.messages_total,
                     messages_unread  = excluded.messages_unread,
                     synced_at        = excluded.synced_at""",
                (lbl["id"], lbl["name"], lbl["messages_total"], lbl["messages_unread"]),
            )
        await db.commit()

    return {"synced": len(labels), "labels": labels}


@router.get("/stats")
async def get_stats():
    async with get_db() as db:
        # Gmail labels
        async with db.execute(
            "SELECT id, name, messages_total, messages_unread, synced_at"
            " FROM gmail_labels ORDER BY messages_total DESC"
        ) as cur:
            gmail_labels = [dict(r) for r in await cur.fetchall()]

        # Decision totals
        async with db.execute(
            "SELECT COUNT(*) as total,"
            "       SUM(CASE WHEN applied = 1 THEN 1 ELSE 0 END) as applied"
            " FROM decisions WHERE is_dry_run = 0"
        ) as cur:
            dec_row = dict(await cur.fetchone())

        # Decisions by label (top 10)
        async with db.execute(
            "SELECT label, COUNT(*) as count FROM decisions"
            " WHERE is_dry_run = 0 AND label IS NOT NULL"
            " GROUP BY label ORDER BY count DESC LIMIT 10"
        ) as cur:
            decisions_by_label = [dict(r) for r in await cur.fetchall()]

        # Decisions by source
        async with db.execute(
            "SELECT source, COUNT(*) as count FROM decisions"
            " WHERE is_dry_run = 0"
            " GROUP BY source"
        ) as cur:
            decisions_by_source = [dict(r) for r in await cur.fetchall()]

        # Rules by status
        async with db.execute(
            "SELECT status, COUNT(*) as count FROM rules GROUP BY status"
        ) as cur:
            rules_by_status = {r["status"]: r["count"] for r in await cur.fetchall()}

        # Recent runs
        async with db.execute(
            "SELECT id, status, started_at, finished_at, emails_fetched,"
            "       labels_applied, dry_run"
            " FROM runs ORDER BY started_at DESC LIMIT 7"
        ) as cur:
            recent_runs = [dict(r) for r in await cur.fetchall()]

        # Total completed runs
        async with db.execute(
            "SELECT COUNT(*) FROM runs WHERE status = 'done'"
        ) as cur:
            total_runs = (await cur.fetchone())[0]

    return {
        "gmail_labels": gmail_labels,
        "decisions": {
            "total": dec_row["total"] or 0,
            "applied": dec_row["applied"] or 0,
            "by_label": decisions_by_label,
            "by_source": decisions_by_source,
        },
        "rules": rules_by_status,
        "runs": {
            "total_completed": total_runs,
            "recent": recent_runs,
        },
    }
