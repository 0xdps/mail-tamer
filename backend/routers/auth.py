from fastapi import APIRouter, Response, HTTPException
from pydantic import BaseModel
from auth import verify_admin_token, create_session_cookie

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    token: str


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    if not verify_admin_token(body.token):
        raise HTTPException(status_code=401, detail="Invalid token")
    create_session_cookie(response)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("session")
    return {"ok": True}
