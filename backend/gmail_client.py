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
    # gmail.settings.basic needed when filter create/delete is implemented
]

def _build_credentials() -> Credentials:
    return Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
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
        """Return label id for label_name, creating it (and any missing parents) if needed.
        
        Nested labels use '/' as separator: e.g. 'Work/Projects/Client A'.
        Parent labels are created first so Gmail doesn't reject orphaned children.
        """
        if label_name in self._label_cache:
            return self._label_cache[label_name]

        # Refresh cache from Gmail
        labels = self.service.users().labels().list(userId="me").execute()
        for lbl in labels.get("labels", []):
            self._label_cache[lbl["name"]] = lbl["id"]

        if label_name not in self._label_cache:
            # Ensure all ancestor labels exist first
            parts = label_name.split("/")
            for depth in range(1, len(parts) + 1):
                ancestor = "/".join(parts[:depth])
                if ancestor not in self._label_cache:
                    created = self.service.users().labels().create(
                        userId="me", body={"name": ancestor}
                    ).execute()
                    self._label_cache[ancestor] = created["id"]

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

    def apply_label(self, message_id: str, label_name: str, archive: bool = False, mark_read: bool = False):
        label_id = self._ensure_label(label_name)
        body: dict = {"addLabelIds": [label_id]}
        remove = []
        if archive:
            remove.append("INBOX")
        if mark_read:
            remove.append("UNREAD")
        if remove:
            body["removeLabelIds"] = remove
        self.service.users().messages().modify(
            userId="me", id=message_id, body=body
        ).execute()

    def trash_message(self, message_id: str):
        self.service.users().messages().trash(userId="me", id=message_id).execute()

    def apply_action(self, message_id: str, label_name: str, action: str, mark_read: bool = False):
        """Dispatch label / archive actions, with optional mark-as-read."""
        if action == "archive":
            self.apply_label(message_id, label_name, archive=True, mark_read=mark_read)
        else:
            self.apply_label(message_id, label_name, mark_read=mark_read)

    # ------------------------------------------------------------------ gmail filters

    def fetch_gmail_filters(self) -> list[dict]:
        """Fetch all Gmail filters and translate to our rule format."""
        SYSTEM_IDS = {"INBOX", "UNREAD", "SPAM", "TRASH", "SENT", "DRAFT", "IMPORTANT", "STARRED"}

        labels_resp = self.service.users().labels().list(userId="me").execute()
        label_map = {lbl["id"]: lbl["name"] for lbl in labels_resp.get("labels", [])}

        filters_resp = self.service.users().settings().filters().list(userId="me").execute()
        results = []
        for f in filters_resp.get("filter", []):
            criteria = f.get("criteria", {})
            action = f.get("action", {})

            # Resolve first user-owned label
            user_label = None
            for lid in action.get("addLabelIds", []):
                if lid not in SYSTEM_IDS and not lid.startswith("CATEGORY_"):
                    user_label = label_map.get(lid)
                    break
            if not user_label:
                continue  # no user label → skip

            # Build conditions JSON
            conditions: dict = {}
            from_val = (criteria.get("from") or "").strip()
            if from_val:
                if " OR " in from_val:
                    conditions["from_raw"] = from_val
                elif "@" in from_val:
                    conditions["domain"] = from_val.split("@")[-1].strip("> ")
                else:
                    conditions["domain"] = from_val  # domain-only e.g. "barraiser.com"
            if criteria.get("subject"):
                conditions["subject_contains"] = criteria["subject"]
            if criteria.get("query"):
                conditions["gmail_query"] = criteria["query"]
            if criteria.get("negatedQuery"):
                conditions["negated_query"] = criteria["negatedQuery"]

            remove_ids = set(action.get("removeLabelIds", []))
            rule_action = "archive" if "INBOX" in remove_ids else "label"
            mark_read = 1 if "UNREAD" in remove_ids else 0

            # Human-readable name
            if from_val and " OR " not in from_val:
                name = f"Gmail: {from_val[:60]}"
            elif conditions.get("domain"):
                name = f"Gmail: @{conditions['domain']}"
            elif criteria.get("subject"):
                name = f"Gmail: subject:{criteria['subject'][:50]}"
            elif criteria.get("query"):
                name = f"Gmail: {criteria['query'][:50]}"
            else:
                name = f"Gmail filter {f['id'][:12]}"

            results.append({
                "gmail_filter_id": f["id"],
                "name": name,
                "label": user_label,
                "action": rule_action,
                "mark_read": mark_read,
                "conditions": conditions,
            })

        return results

    # ------------------------------------------------------------------ bulk ops

    def mark_all_read(self) -> int:
        """Mark all UNREAD messages as read. Returns count of messages processed."""
        total = 0
        page_token = None
        while True:
            kwargs: dict = {"userId": "me", "labelIds": ["UNREAD"], "maxResults": 500}
            if page_token:
                kwargs["pageToken"] = page_token
            resp = self.service.users().messages().list(**kwargs).execute()
            ids = [m["id"] for m in resp.get("messages", [])]
            if ids:
                for i in range(0, len(ids), 1000):
                    self.service.users().messages().batchModify(
                        userId="me",
                        body={"removeLabelIds": ["UNREAD"], "ids": ids[i:i + 1000]},
                    ).execute()
                total += len(ids)
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return total

    # ------------------------------------------------------------------ utils

    @staticmethod
    def extract_domain(sender: str) -> str:
        """Extract domain from 'Name <email@domain.com>' format."""
        email = sender.split("<")[-1].strip("> ")
        return email.split("@")[-1].lower() if "@" in email else ""
