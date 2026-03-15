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
    action: str
    confidence: float
    reasoning: str
    model: str
    conditions: dict  # suggested rule conditions


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are an email classifier. Given email metadata, classify it into a Gmail label.
Respond ONLY with valid JSON (no markdown fences) with this exact shape:
{
  "label": "string (e.g. Newsletters, Receipts, Notifications, Developer, Social, Work, Personal)",
  "action": "label | archive | trash",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence",
  "conditions": {
    "domain": "optional sender domain if reliable",
    "subject_contains": ["optional", "keywords"]
  }
}"""

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
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=_SYSTEM_PROMPT,
    )

    results = []
    for email in emails:
        prompt = _build_prompt(email["sender"], email["subject"], email["snippet"])
        try:
            response = model.generate_content(prompt)
            data = json.loads(response.text.strip())
            results.append(ClassificationResult(
                label=data.get("label", "Uncategorised"),
                action=data.get("action", "label"),
                confidence=float(data.get("confidence", 0.5)),
                reasoning=data.get("reasoning", ""),
                model=model_name,
                conditions=data.get("conditions", {}),
            ))
        except Exception as e:
            results.append(ClassificationResult(
                label="Uncategorised", action="label", confidence=0.0,
                reasoning=str(e), model=model_name, conditions={}
            ))
    return results


# ---------------------------------------------------------------------------
# Claude Haiku (alternative)
# ---------------------------------------------------------------------------

async def _classify_claude(emails: list[dict], model_name: str) -> list[ClassificationResult]:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    results = []

    for email in emails:
        prompt = _build_prompt(email["sender"], email["subject"], email["snippet"])
        try:
            message = client.messages.create(
                model=model_name,
                max_tokens=256,
                system=_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            data = json.loads(message.content[0].text.strip())
            results.append(ClassificationResult(
                label=data.get("label", "Uncategorised"),
                action=data.get("action", "label"),
                confidence=float(data.get("confidence", 0.5)),
                reasoning=data.get("reasoning", ""),
                model=model_name,
                conditions=data.get("conditions", {}),
            ))
        except Exception as e:
            results.append(ClassificationResult(
                label="Uncategorised", action="label", confidence=0.0,
                reasoning=str(e), model=model_name, conditions={}
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

    async with await get_db() as db:
        await db.execute(
            """INSERT INTO rules (name, description, label, action, source, status, conditions, confidence)
               VALUES (?, ?, ?, ?, 'ai', 'pending', ?, ?)""",
            (
                name[:100],
                result.reasoning,
                result.label,
                result.action,
                json.dumps(result.conditions),
                result.confidence,
            )
        )
        await db.commit()
