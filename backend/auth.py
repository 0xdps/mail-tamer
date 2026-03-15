import os
from functools import wraps
from fastapi import HTTPException, Request, Response
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

def _get_serializer() -> URLSafeTimedSerializer:
    secret = os.environ.get("SECRET_SESSION", "change-me-in-env")
    return URLSafeTimedSerializer(secret)


def create_session_cookie(response: Response):
    s = _get_serializer()
    token = s.dumps("admin")
    response.set_cookie(
        key="session",
        value=token,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        max_age=60 * 60 * 24 * 7,  # 7 days
    )


def verify_admin_token(token: str) -> bool:
    admin_token = os.environ.get("ADMIN_TOKEN", "")
    if not admin_token:
        raise RuntimeError("ADMIN_TOKEN env var is not set")
    return token == admin_token


def require_auth(request: Request):
    """Dependency — raises 401 if session cookie is missing or invalid."""
    session_cookie = request.cookies.get("session")
    if not session_cookie:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        s = _get_serializer()
        s.loads(session_cookie, max_age=60 * 60 * 24 * 7)
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Session expired or invalid")
