import json
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from auth import require_auth
from database import get_db

router = APIRouter(prefix="/api/rules", tags=["rules"], dependencies=[Depends(require_auth)])


class RuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    label: str
    action: Literal["label", "archive", "trash"] = "label"
    conditions: dict = {}


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    label: Optional[str] = None
    action: Optional[Literal["label", "archive", "trash"]] = None
    conditions: Optional[dict] = None
    status: Optional[Literal["active", "pending", "disabled"]] = None


@router.get("")
async def list_rules(
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
):
    async with get_db() as db:
        query = "SELECT * FROM rules WHERE 1=1"
        params = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if source:
            query += " AND source = ?"
            params.append(source)
        query += " ORDER BY match_count DESC, created_at DESC"
        async with db.execute(query, params) as cur:
            rows = await cur.fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("", status_code=201)
async def create_rule(body: RuleCreate):
    async with get_db() as db:
        cur = await db.execute(
            """INSERT INTO rules (name, description, label, action, source, status, conditions)
               VALUES (?, ?, ?, ?, 'manual', 'active', ?)""",
            (body.name, body.description, body.label, body.action, json.dumps(body.conditions))
        )
        await db.commit()
        rule_id = cur.lastrowid
    return {"id": rule_id}


@router.patch("/{rule_id}")
async def update_rule(rule_id: int, body: RuleUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    if "conditions" in updates:
        updates["conditions"] = json.dumps(updates["conditions"])

    sets = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [rule_id]

    async with get_db() as db:
        await db.execute(
            f"UPDATE rules SET {sets}, updated_at = datetime('now') WHERE id = ?", values
        )
        await db.commit()
    return {"ok": True}


@router.post("/{rule_id}/approve")
async def approve_rule(rule_id: int):
    """Approve a pending AI-promoted rule — makes it active."""
    async with get_db() as db:
        await db.execute(
            "UPDATE rules SET status = 'active', updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
            (rule_id,)
        )
        await db.commit()
    return {"ok": True}


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(rule_id: int):
    async with get_db() as db:
        await db.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
        await db.commit()


def _row_to_dict(row) -> dict:
    d = dict(row)
    if isinstance(d.get("conditions"), str):
        d["conditions"] = json.loads(d["conditions"])
    return d
