import json
import os
from dataclasses import dataclass
from typing import Optional
import aiosqlite
from database import get_db, get_setting

# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class ClassificationResult:
    label: str
    action: str       # derived: "archive" | "label"
    archive: bool
    mark_read: bool
    confidence: float
    reason: str
    model: str
    conditions: dict  # suggested rule conditions


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT_TEMPLATE = """You are an email classification system used to automatically organize a Gmail inbox.

Goal:
Keep the inbox focused on important human communication. Automated emails such as newsletters, notifications, receipts, and promotions should usually be archived.

Existing labels currently used in the mailbox:
{existing_labels}

Instructions:

1. Prefer assigning one of the existing labels if it fits well.
2. Only create a new label if none of the existing labels are appropriate.
3. Never return generic labels such as:
   Other, Misc, Uncategorized, General, Unknown, Inbox.
4. If creating a new label:
   - Use Title Case
   - Keep it concise (1–3 words per segment)
   - Make it specific and meaningful
   - Use nested labels with "/" for sub-categories (e.g. "Work/Projects", "Finance/Receipts", "Developer/GitHub")
   - Only add nesting when it genuinely groups related labels; do not nest arbitrarily
5. Avoid creating many similar labels. Reuse existing labels whenever possible.

Inbox rules:

- Human communication -> keep in inbox
- Newsletters / marketing -> archive
- Automated notifications -> archive
- Receipts / invoices -> label appropriately
- Developer alerts (GitHub, CI, etc.) -> label appropriately

Actions:

- archive: remove from inbox
- mark_read: mark email as read
- label: apply the label

Return ONLY valid JSON (no markdown fences) with this exact structure:

{{
  "label": "string",
  "archive": true | false,
  "mark_read": true | false,
  "confidence": 0.0-1.0,
  "reason": "short explanation",
  "conditions": {{
    "domain": "optional sender domain if reliable",
    "subject_contains": ["optional", "keywords"]
  }}
}}

Conditions are used for learning rules:
- Provide sender domain if classification is domain-based.
- Provide subject keywords if they reliably indicate this category.
- Leave empty if no strong pattern exists."""


async def _get_existing_labels() -> str:
    """Return a comma-separated string of labels from active rules + synced Gmail labels."""
    try:
        async with get_db() as db:
            async with db.execute(
                "SELECT DISTINCT label FROM rules WHERE status = 'active' ORDER BY label"
            ) as cursor:
                rule_rows = await cursor.fetchall()
            async with db.execute(
                "SELECT name, messages_total FROM gmail_labels ORDER BY messages_total DESC"
            ) as cursor:
                gmail_rows = await cursor.fetchall()
        rule_labels = {r[0] for r in rule_rows if r[0]}
        # Build label list: gmail labels first (with counts for context), then any rule labels not already present
        parts = [f"{r[0]} ({r[1]} emails)" for r in gmail_rows]
        for lbl in sorted(rule_labels):
            if lbl not in {r[0] for r in gmail_rows}:
                parts.append(lbl)
        return ", ".join(parts) if parts else "none yet"
    except Exception:
        return "none yet"


def _build_system_prompt(existing_labels: str) -> str:
    return _SYSTEM_PROMPT_TEMPLATE.format(existing_labels=existing_labels)

def _build_prompt(sender: str, subject: str, snippet: str) -> str:
    return (
        f"Sender: {sender}\n"
        f"Subject: {subject}\n"
        f"Snippet: {snippet[:200]}"
    )


# ---------------------------------------------------------------------------
# Gemini (default)
# ---------------------------------------------------------------------------

async def _classify_gemini(emails: list[dict], model_name: str) -> list[ClassificationResult]:
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    existing_labels = await _get_existing_labels()
    system_prompt = _build_system_prompt(existing_labels)
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_prompt,
    )

    results = []
    for email in emails:
        prompt = _build_prompt(email["sender"], email["subject"], email["snippet"])
        try:
            response = model.generate_content(prompt)
            data = json.loads(response.text.strip())
            archive = bool(data.get("archive", False))
            mark_read = bool(data.get("mark_read", False))
            results.append(ClassificationResult(
                label=data.get("label", "Uncategorised"),
                action="archive" if archive else "label",
                archive=archive,
                mark_read=mark_read,
                confidence=float(data.get("confidence", 0.5)),
                reason=data.get("reason", ""),
                model=model_name,
                conditions=data.get("conditions", {}),
            ))
        except Exception as e:
            results.append(ClassificationResult(
                label="Uncategorised", action="label", archive=False, mark_read=False,
                confidence=0.0, reason=str(e), model=model_name, conditions={}
            ))
    return results


# ---------------------------------------------------------------------------
# Claude Haiku (alternative)
# ---------------------------------------------------------------------------

async def _classify_claude(emails: list[dict], model_name: str) -> list[ClassificationResult]:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    existing_labels = await _get_existing_labels()
    system_prompt = _build_system_prompt(existing_labels)
    results = []

    for email in emails:
        prompt = _build_prompt(email["sender"], email["subject"], email["snippet"])
        try:
            message = client.messages.create(
                model=model_name,
                max_tokens=256,
                system=system_prompt,
                messages=[{"role": "user", "content": prompt}],
            )
            data = json.loads(message.content[0].text.strip())
            archive = bool(data.get("archive", False))
            mark_read = bool(data.get("mark_read", False))
            results.append(ClassificationResult(
                label=data.get("label", "Uncategorised"),
                action="archive" if archive else "label",
                archive=archive,
                mark_read=mark_read,
                confidence=float(data.get("confidence", 0.5)),
                reason=data.get("reason", ""),
                model=model_name,
                conditions=data.get("conditions", {}),
            ))
        except Exception as e:
            results.append(ClassificationResult(
                label="Uncategorised", action="label", archive=False, mark_read=False,
                confidence=0.0, reason=str(e), model=model_name, conditions={}
            ))
    return results


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

async def classify_batch(emails: list[dict]) -> list[ClassificationResult]:
    """Classify a batch of emails using the configured AI model."""
    model_name = await get_setting("ai_model", "gemini-2.0-flash")

    if model_name.startswith("claude"):
        return await _classify_claude(emails, model_name)
    else:
        return await _classify_gemini(emails, model_name)


async def maybe_promote_to_rule(result: ClassificationResult, email: dict):
    """If confidence >= threshold, add AI-promoted rule as 'pending' (awaits approval)."""
    threshold = float(await get_setting("confidence_threshold", "0.85"))
    if result.confidence < threshold or not result.conditions:
        return

    name = f"AI: {email['sender'].split('<')[0].strip() or email['subject'][:40]}"

    async with get_db() as db:
        await db.execute(
            """INSERT INTO rules (name, description, label, action, source, status, conditions, confidence)
               VALUES (?, ?, ?, ?, 'ai', 'pending', ?, ?)""",
            (
                name[:100],
                result.reason,
                result.label,
                result.action,
                json.dumps(result.conditions),
                result.confidence,
            )
        )
        await db.commit()
