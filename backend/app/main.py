import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
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
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume_router)
app.include_router(interview_router)
app.include_router(report_router)


@app.on_event("startup")
async def startup():
    try:
        await init_db()
        logger.info("Database tables created")
    except Exception as e:
        logger.warning(f"Database init skipped: {e}")


@app.get("/health")
async def health():
    return {"status": "ok"}
