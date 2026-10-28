import asyncio
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine, init_db
from app.routes.resume import router as resume_router
from app.routes.interview import router as interview_router
from app.routes.report import router as report_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Interview Simulator",
    description="Multi-agent AI-powered mock interview platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume_router)
app.include_router(interview_router)
app.include_router(report_router)


@app.on_event("startup")
async def startup():
    for attempt in range(1, settings.database_startup_retries + 1):
        try:
            await init_db()
            logger.info("Database tables created")
            return
        except Exception:
            if attempt == settings.database_startup_retries:
                logger.exception("Database initialization failed after %s attempts", attempt)
                raise
            logger.warning(
                "Database unavailable during startup (attempt %s/%s); retrying",
                attempt,
                settings.database_startup_retries,
            )
            await asyncio.sleep(settings.database_startup_retry_seconds)


@app.get("/health")
async def health():
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(503, "Database unavailable")
    return {"status": "ok"}
