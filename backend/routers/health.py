import os
import asyncio
from fastapi import APIRouter, Depends
from auth import require_auth
from database import get_setting

router = APIRouter(prefix="/api/health", tags=["health"], dependencies=[Depends(require_auth)])


async def _check_google() -> dict:
    try:
        required = ["GOOGLE_REFRESH_TOKEN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
        missing = [k for k in required if not os.environ.get(k)]
        if missing:
            return {"ok": False, "error": f"Missing: {', '.join(missing)}"}

        def _probe():
            from gmail_client import get_gmail_service
            svc = get_gmail_service()
            profile = svc.users().getProfile(userId="me").execute()
            return profile.get("emailAddress", "")

        loop = asyncio.get_running_loop()
        email = await loop.run_in_executor(None, _probe)
        return {"ok": True, "error": None, "email_address": email}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def _check_gemini() -> dict:
    try:
        if not os.environ.get("GEMINI_API_KEY"):
            return {"ok": False, "error": "GEMINI_API_KEY not configured"}
        import google.generativeai as genai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: list(genai.list_models()))
        return {"ok": True, "error": None}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def _check_claude() -> dict:
    try:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return {"ok": False, "error": "ANTHROPIC_API_KEY not configured"}
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: client.models.list())
        return {"ok": True, "error": None}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("")
async def health_check():
    ai_model = await get_setting("ai_model", "gemini-2.0-flash")
    if "gemini" in ai_model:
        google_result, ai_result = await asyncio.gather(_check_google(), _check_gemini())
    else:
        google_result, ai_result = await asyncio.gather(_check_google(), _check_claude())
    return {
        "google": google_result,
        "ai": {**ai_result, "model": ai_model},
    }



async def _check_gemini() -> dict:
    try:
        if not os.environ.get("GEMINI_API_KEY"):
            return {"ok": False, "error": "GEMINI_API_KEY not configured"}
        import google.generativeai as genai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: list(genai.list_models()))
        return {"ok": True, "error": None}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def _check_claude() -> dict:
    try:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return {"ok": False, "error": "ANTHROPIC_API_KEY not configured"}
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: client.models.list())
        return {"ok": True, "error": None}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("")
async def health_check():
    ai_model = await get_setting("ai_model", "gemini-2.0-flash")
    if "gemini" in ai_model:
        google_result, ai_result = await asyncio.gather(_check_google(), _check_gemini())
    else:
        google_result, ai_result = await asyncio.gather(_check_google(), _check_claude())
    return {
        "google": google_result,
        "ai": {**ai_result, "model": ai_model},
    }



async def _check_gemini() -> dict:
    try:
        if not os.environ.get("GEMINI_API_KEY"):
            return {"ok": False, "error": "GEMINI_API_KEY not configured"}
        import google.generativeai as genai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: list(genai.list_models()))
        return {"ok": True, "error": None}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def _check_claude() -> dict:
    try:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return {"ok": False, "error": "ANTHROPIC_API_KEY not configured"}
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: client.models.list())
        return {"ok": True, "error": None}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("")
async def health_check():
    ai_model = await get_setting("ai_model", "gemini-2.0-flash")
    if "gemini" in ai_model:
        google_result, ai_result = await asyncio.gather(_check_google(), _check_gemini())
    else:
        google_result, ai_result = await asyncio.gather(_check_google(), _check_claude())
    return {
        "google": google_result,
        "ai": {**ai_result, "model": ai_model},
    }
