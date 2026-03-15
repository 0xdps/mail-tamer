import os
import json
import base64
from typing import Optional
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.modify",
]

def _build_credentials() -> Credentials:
    return Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=SCOPES,
    )

def get_gmail_service():
    creds = _build_credentials()
    if not creds.valid:
        creds.refresh(Request())
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


class GmailClient:
    def __init__(self):
        self.service = get_gmail_service()
        self._label_cache: dict[str, str] = {}  # name → id

    # ------------------------------------------------------------------ labels

    def _ensure_label(self, label_name: str) -> str:
        """Return label id, creating it if it doesn't exist."""
        if label_name in self._label_cache:
            return self._label_cache[label_name]

        labels = self.service.users().labels().list(userId="me").execute()
        for lbl in labels.get("labels", []):
            self._label_cache[lbl["name"]] = lbl["id"]

        if label_name not in self._label_cache:
            new_label = self.service.users().labels().create(
                userId="me", body={"name": label_name}
            ).execute()
            self._label_cache[label_name] = new_label["id"]

        return self._label_cache[label_name]

    # ------------------------------------------------------------------ fetch

    def fetch_messages_since(self, since_timestamp: Optional[str] = None, max_results: int = 500) -> list[dict]:
        """Fetch message metadata since a Gmail query timestamp string like '2024/01/01'."""
        query = f"after:{since_timestamp}" if since_timestamp else ""
        messages = []
        page_token = None

        while True:
            resp = self.service.users().messages().list(
                userId="me",
                q=query,
                maxResults=min(max_results - len(messages), 500),
                pageToken=page_token,
            ).execute()

            batch = resp.get("messages", [])
            messages.extend(batch)

            page_token = resp.get("nextPageToken")
            if not page_token or len(messages) >= max_results:
                break

        return messages

    def fetch_message_detail(self, message_id: str) -> dict:
        """Fetch sender, subject, snippet for a single message."""
        msg = self.service.users().messages().get(
            userId="me",
            id=message_id,
            format="metadata",
            metadataHeaders=["From", "Subject"],
        ).execute()

        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        return {
            "id": message_id,
            "sender": headers.get("From", ""),
            "subject": headers.get("Subject", ""),
            "snippet": msg.get("snippet", ""),
        }

    def fetch_messages_batch(self, message_ids: list[str]) -> list[dict]:
        """Fetch details for a batch of message IDs."""
        results = []
        for msg_id in message_ids:
            try:
                results.append(self.fetch_message_detail(msg_id))
            except Exception:
                pass
        return results

    # ------------------------------------------------------------------ apply

    def apply_label(self, message_id: str, label_name: str, archive: bool = False):
        label_id = self._ensure_label(label_name)
        body: dict = {"addLabelIds": [label_id]}
        if archive:
            body["removeLabelIds"] = ["INBOX"]
        self.service.users().messages().modify(
            userId="me", id=message_id, body=body
        ).execute()

    def trash_message(self, message_id: str):
        self.service.users().messages().trash(userId="me", id=message_id).execute()

    def apply_action(self, message_id: str, label_name: str, action: str):
        """Dispatch label / archive / trash actions."""
        if action == "trash":
            self.trash_message(message_id)
        elif action == "archive":
            self.apply_label(message_id, label_name, archive=True)
        else:
            self.apply_label(message_id, label_name)

    # ------------------------------------------------------------------ utils

    @staticmethod
    def extract_domain(sender: str) -> str:
        """Extract domain from 'Name <email@domain.com>' format."""
        email = sender.split("<")[-1].strip("> ")
        return email.split("@")[-1].lower() if "@" in email else ""
