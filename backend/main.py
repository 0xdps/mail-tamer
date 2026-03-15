import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from scheduler import start_scheduler
from routers import auth, rules, decisions, runs, scheduler as scheduler_router
from routers import health as health_router
from routers import emails as emails_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await start_scheduler()
    yield

app = FastAPI(title="Mail Tamer", version="1.0.0", lifespan=lifespan)

# API routes
app.include_router(auth.router)
app.include_router(rules.router)
app.include_router(decisions.router)
app.include_router(runs.router)
app.include_router(scheduler_router.router)
app.include_router(health_router.router)
app.include_router(emails_router.router)

# Serve React SPA (built to frontend/dist)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(STATIC_DIR, "index.html")
        return FileResponse(index)
