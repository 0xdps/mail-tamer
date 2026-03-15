import asyncio
from typing import Literal, Optional
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from auth import require_auth
from database import get_setting, set_setting
from scheduler import (
    pause_scheduler, resume_scheduler, reschedule, scheduler_status
)
from triage_engine import run_triage
from batch_processor import run_batch

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"], dependencies=[Depends(require_auth)])


@router.get("/status")
async def get_status():
    settings = {
        "poll_interval_minutes": int(await get_setting("poll_interval_minutes", "5")),
        "dry_run": (await get_setting("dry_run", "false")) == "true",
        "ai_model": await get_setting("ai_model", "gemini-2.0-flash"),
        "confidence_threshold": float(await get_setting("confidence_threshold", "0.85")),
    }
    return {**scheduler_status(), "settings": settings}


class SchedulerAction(BaseModel):
    action: Literal["pause", "resume"]

@router.post("/control")
async def control_scheduler(body: SchedulerAction):
    if body.action == "pause":
        pause_scheduler()
    else:
        resume_scheduler()
    return scheduler_status()


class UpdateSettings(BaseModel):
    poll_interval_minutes: Optional[int] = None
    dry_run: Optional[bool] = None
    ai_model: Optional[str] = None
    confidence_threshold: Optional[float] = None

@router.patch("/settings")
async def update_settings(body: UpdateSettings):
    if body.poll_interval_minutes is not None:
        await set_setting("poll_interval_minutes", str(body.poll_interval_minutes))
        reschedule(body.poll_interval_minutes)
    if body.dry_run is not None:
        await set_setting("dry_run", str(body.dry_run).lower())
    if body.ai_model is not None:
        await set_setting("ai_model", body.ai_model)
    if body.confidence_threshold is not None:
        await set_setting("confidence_threshold", str(body.confidence_threshold))
    return {"ok": True}


@router.post("/scan")
async def trigger_scan(background_tasks: BackgroundTasks):
    """Trigger an on-demand triage scan."""
    background_tasks.add_task(run_triage, "manual")
    return {"ok": True, "message": "Scan triggered"}


@router.post("/batch")
async def trigger_batch(background_tasks: BackgroundTasks, max_emails: int = 20000):
    """Trigger one-time batch processing of existing inbox."""
    background_tasks.add_task(run_batch, max_emails)
    return {"ok": True, "message": f"Batch processing triggered for up to {max_emails} emails"}
