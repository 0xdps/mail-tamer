import asyncio
from fastapi import APIRouter, Depends
from auth import require_auth

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


@router.get("")
async def list_emails(page_token: str | None = None, max_results: int = 25):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: _fetch_emails(page_token, max_results))
    return result
