import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from database import get_setting
from triage_engine import run_triage

_scheduler = AsyncIOScheduler()
_job_id = "triage_job"


async def _triage_job():
    try:
        await run_triage(trigger="scheduled")
    except Exception as e:
        print(f"[scheduler] triage error: {e}")


async def start_scheduler():
    interval = int(await get_setting("poll_interval_minutes", "5"))
    enabled = (await get_setting("scheduler_enabled", "true")) == "true"

    if not _scheduler.running:
        _scheduler.start()

    if enabled:
        _scheduler.add_job(
            _triage_job,
            trigger=IntervalTrigger(minutes=interval),
            id=_job_id,
            replace_existing=True,
            coalesce=True,
            max_instances=3,
            misfire_grace_time=60,
        )
        print(f"[scheduler] started — polling every {interval} min")
    else:
        print("[scheduler] disabled by settings")


def pause_scheduler():
    if _scheduler.running:
        job = _scheduler.get_job(_job_id)
        if job:
            job.pause()


def resume_scheduler():
    if _scheduler.running:
        job = _scheduler.get_job(_job_id)
        if job:
            job.resume()


def reschedule(interval_minutes: int):
    if _scheduler.running:
        _scheduler.reschedule_job(
            _job_id,
            trigger=IntervalTrigger(minutes=interval_minutes),
            misfire_grace_time=60,
        )


def scheduler_status() -> dict:
    if not _scheduler.running:
        return {"running": False, "paused": False, "next_run": None}
    job = _scheduler.get_job(_job_id)
    if not job:
        return {"running": True, "paused": True, "next_run": None}
    return {
        "running": True,
        "paused": job.next_run_time is None,
        "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
    }
