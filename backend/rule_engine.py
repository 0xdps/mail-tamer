import json
import re
from dataclasses import dataclass
from typing import Optional
import aiosqlite
from database import get_db


@dataclass
class RuleMatch:
    rule_id: int
    label: str
    action: str
    confidence: float = 1.0
    source: str = "rule"   # "rule" | "domain"


async def match_email(sender: str, subject: str, domain: str) -> Optional[RuleMatch]:
    """Try domain_mappings first (fastest), then full rule scan."""

    async with await get_db() as db:
        # 1. Domain mapping (exact, fastest)
        async with db.execute(
            "SELECT label, action FROM domain_mappings WHERE domain = ?",
            (domain,)
        ) as cur:
            row = await cur.fetchone()
            if row:
                return RuleMatch(rule_id=0, label=row["label"], action=row["action"], source="domain")

        # 2. Active rules (ordered by match_count desc — most-used first)
        async with db.execute(
            "SELECT id, label, action, conditions FROM rules "
            "WHERE status = 'active' ORDER BY match_count DESC"
        ) as cur:
            rules = await cur.fetchall()

    for rule in rules:
        conditions: dict = json.loads(rule["conditions"] or "{}")
        if _rule_matches(conditions, sender, subject, domain):
            # Increment match counter (fire-and-forget)
            await _increment_match_count(rule["id"])
            return RuleMatch(rule_id=rule["id"], label=rule["label"], action=rule["action"])

    return None


def _rule_matches(conditions: dict, sender: str, subject: str, domain: str) -> bool:
    """Return True if ALL specified conditions match the email."""
    if not conditions:
        return False

    # Domain match
    if cond_domain := conditions.get("domain"):
        if cond_domain.lower() != domain.lower():
            return False

    # Sender contains
    if sender_contains := conditions.get("sender_contains"):
        if sender_contains.lower() not in sender.lower():
            return False

    # Subject contains (list OR single string)
    if subject_contains := conditions.get("subject_contains"):
        needles = subject_contains if isinstance(subject_contains, list) else [subject_contains]
        if not any(n.lower() in subject.lower() for n in needles):
            return False

    # Subject regex
    if subject_regex := conditions.get("subject_regex"):
        if not re.search(subject_regex, subject, re.IGNORECASE):
            return False

    return True


async def _increment_match_count(rule_id: int):
    async with await get_db() as db:
        await db.execute(
            "UPDATE rules SET match_count = match_count + 1, updated_at = datetime('now') WHERE id = ?",
            (rule_id,)
        )
        await db.commit()
