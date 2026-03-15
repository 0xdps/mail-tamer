import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, BackgroundTasks
from auth import require_auth
from database import get_setting, set_setting

MAILBOX_STATS_TTL = 600  # seconds (10 minutes)

router = APIRouter(prefix="/api/emails", tags=["emails"], dependencies=[Depends(require_auth)])


def _fetch_emails(page_token: str | None, max_results: int) -> dict:
    from gmail_client import get_gmail_service
    service = get_gmail_service()

    kwargs = {"userId": "me", "labelIds": ["INBOX"], "maxResults": max_results}
    if page_token:
        kwargs["pageToken"] = page_token

    resp = service.users().messages().list(**kwargs).execute()
    message_stubs = resp.get("messages", [])
    next_page_token = resp.get("nextPageToken")

    emails = []
    for stub in message_stubs:
        detail = service.users().messages().get(
            userId="me",
            id=stub["id"],
            format="metadata",
            metadataHeaders=["From", "Subject", "Date"],
        ).execute()
        headers = {h["name"]: h["value"] for h in detail.get("payload", {}).get("headers", [])}
        label_ids = detail.get("labelIds", [])
        emails.append({
            "id": stub["id"],
            "from": headers.get("From", ""),
            "subject": headers.get("Subject", "(no subject)"),
            "date": headers.get("Date", ""),
            "snippet": detail.get("snippet", "")[:120],
            "unread": "UNREAD" in label_ids,
        })

    return {"emails": emails, "next_page_token": next_page_token}


@router.get("/inbox-meta")
async def inbox_meta():
    """Return cached inbox total/unread and mark-all-read job status from settings."""
    return {
        "total":     int(await get_setting("inbox_total",     "0")),
        "unread":    int(await get_setting("inbox_unread",    "0")),
        "synced_at": await get_setting("inbox_synced_at", ""),
        "mark_read_status": await get_setting("mark_read_status", "idle"),
    }


def _fetch_mailbox_stats_sync() -> dict:
    """Fetch live mailbox stats from Gmail: inbox, trash, spam, categories, total."""
    from gmail_client import get_gmail_service
    service = get_gmail_service()

    # Total messages across all of Gmail
    profile = service.users().getProfile(userId="me").execute()
    mailbox_total = profile.get("messagesTotal", 0)

    fetch_ids = [
        "INBOX", "TRASH", "SPAM",
        "CATEGORY_PERSONAL", "CATEGORY_SOCIAL",
        "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS",
    ]
    ldata: dict[str, dict] = {}
    for lid in fetch_ids:
        try:
            lbl = service.users().labels().get(userId="me", id=lid).execute()
            ldata[lid] = {
                "total":  lbl.get("messagesTotal",  0),
                "unread": lbl.get("messagesUnread", 0),
            }
        except Exception:
            ldata[lid] = {"total": 0, "unread": 0}

    categories = [
        {"name": "Personal",   **ldata["CATEGORY_PERSONAL"]},
        {"name": "Social",     **ldata["CATEGORY_SOCIAL"]},
        {"name": "Promotions", **ldata["CATEGORY_PROMOTIONS"]},
        {"name": "Updates",    **ldata["CATEGORY_UPDATES"]},
        {"name": "Forums",     **ldata["CATEGORY_FORUMS"]},
    ]
    return {
        "mailbox_total": mailbox_total,
        "inbox":      ldata["INBOX"],
        "trash":      ldata["TRASH"],
        "spam":       ldata["SPAM"],
        "categories": categories,
    }


def _do_refresh_mailbox_stats():
    """Background task: fetch fresh stats from Gmail and write to settings cache."""
    data = _fetch_mailbox_stats_sync()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    loop = asyncio.new_event_loop()
    loop.run_until_complete(set_setting("mailbox_stats_json", json.dumps(data)))
    loop.run_until_complete(set_setting("mailbox_stats_fetched_at", now))
    loop.close()


@router.get("/mailbox-stats")
async def mailbox_stats(background_tasks: BackgroundTasks, force: bool = False):
    """Return cached mailbox stats (TTL 10 min). Background-refreshes when stale.

    Pass ?force=true to bypass cache and fetch synchronously from Gmail.
    """
    cached_json = await get_setting("mailbox_stats_json", "")
    fetched_at  = await get_setting("mailbox_stats_fetched_at", "")
    refreshing  = False

    # Determine staleness
    is_stale = True
    if fetched_at and not force:
        try:
            age = (datetime.now(timezone.utc) -
                   datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))).total_seconds()
            is_stale = age > MAILBOX_STATS_TTL
        except Exception:
            is_stale = True

    if force or is_stale:
        if cached_json and not force:
            # Serve stale cache immediately; refresh in background
            background_tasks.add_task(_do_refresh_mailbox_stats)
            refreshing = True
        else:
            # No cache or forced — fetch synchronously so the client gets real data now
            loop = asyncio.get_running_loop()
            fresh = await loop.run_in_executor(None, _fetch_mailbox_stats_sync)
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            await set_setting("mailbox_stats_json", json.dumps(fresh))
            await set_setting("mailbox_stats_fetched_at", now)
            fetched_at  = now
            cached_json = json.dumps(fresh)

    data = json.loads(cached_json)
    data["mark_read_status"] = await get_setting("mark_read_status", "idle")
    data["fetched_at"]  = fetched_at
    data["refreshing"]  = refreshing
    return data


@router.post("/reset-mark-read-status")
async def reset_mark_read_status():
    """Reset the mark-all-read job status to idle (called after client consumes a done result)."""
    await set_setting("mark_read_status", "idle")
    return {"ok": True}


def _do_mark_all_read():
    """Runs in a thread — marks all unread, then writes result back to settings."""
    import asyncio
    from gmail_client import GmailClient
    client = GmailClient()
    count = client.mark_all_read()
    # Use a new event loop to write settings from this thread
    loop = asyncio.new_event_loop()
    loop.run_until_complete(set_setting("mark_read_status", f"done:{count}"))
    loop.close()


@router.post("/mark-all-read")
async def mark_all_read(background_tasks: BackgroundTasks):
    """Enqueue a background job to mark all messages as read. Returns immediately."""
    current = await get_setting("mark_read_status", "idle")
    if current == "running":
        return {"queued": False, "reason": "already running"}
    await set_setting("mark_read_status", "running")
    background_tasks.add_task(_do_mark_all_read)
    return {"queued": True}


@router.get("")
async def list_emails(page_token: str | None = None, max_results: int = 25):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: _fetch_emails(page_token, max_results))
    return result
