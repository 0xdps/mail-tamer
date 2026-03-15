from typing import Optional
from fastapi import APIRouter, Depends, Query
from auth import require_auth
from database import get_db

router = APIRouter(prefix="/api/decisions", tags=["decisions"], dependencies=[Depends(require_auth)])


@router.get("")
async def list_decisions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, le=200),
    label: Optional[str] = None,
    source: Optional[str] = None,
    dry_run: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    offset = (page - 1) * per_page
    query = "SELECT * FROM decisions WHERE 1=1"
    params: list = []

    if label:
        query += " AND label = ?"
        params.append(label)
    if source:
        query += " AND source = ?"
        params.append(source)
    if dry_run is not None:
        query += " AND is_dry_run = ?"
        params.append(int(dry_run))
    if date_from:
        query += " AND created_at >= ?"
        params.append(date_from)
    if date_to:
        query += " AND created_at <= ?"
        params.append(date_to)

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params += [per_page, offset]

    async with get_db() as db:
        async with db.execute(query, params) as cur:
            rows = await cur.fetchall()
        async with db.execute("SELECT COUNT(*) FROM decisions") as cur:
            total = (await cur.fetchone())[0]

    return {"total": total, "page": page, "per_page": per_page, "items": [dict(r) for r in rows]}


@router.post("/{decision_id}/promote")
async def promote_to_rule(decision_id: int):
    """Promote a decision directly to an active rule."""
    import json
    from database import get_db

    async with get_db() as db:
        async with db.execute("SELECT * FROM decisions WHERE id = ?", (decision_id,)) as cur:
            row = await cur.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404, "Decision not found")

        decision = dict(row)
        conditions = {}
        if decision.get("sender"):
            from gmail_client import GmailClient
            domain = GmailClient.extract_domain(decision["sender"])
            if domain:
                conditions["domain"] = domain

        await db.execute(
            """INSERT INTO rules (name, label, action, source, status, conditions, confidence)
               VALUES (?, ?, ?, 'manual', 'active', ?, ?)""",
            (
                f"Promoted: {decision['sender'][:50]}",
                decision["label"],
                decision["action"],
                json.dumps(conditions),
                decision.get("confidence"),
            )
        )
        await db.commit()

    return {"ok": True}
