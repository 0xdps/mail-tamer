from fastapi import APIRouter, Depends, Query
from auth import require_auth
from database import get_db

router = APIRouter(prefix="/api/runs", tags=["runs"], dependencies=[Depends(require_auth)])


@router.get("")
async def list_runs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, le=100),
):
    offset = (page - 1) * per_page
    async with await get_db() as db:
        async with db.execute(
            "SELECT * FROM runs ORDER BY started_at DESC LIMIT ? OFFSET ?",
            (per_page, offset)
        ) as cur:
            rows = await cur.fetchall()
        async with db.execute("SELECT COUNT(*) FROM runs") as cur:
            total = (await cur.fetchone())[0]

    return {"total": total, "page": page, "per_page": per_page, "items": [dict(r) for r in rows]}
