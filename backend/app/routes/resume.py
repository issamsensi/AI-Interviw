import logging
import uuid

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Header
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.resume import Resume
from app.services.anonymous import ensure_anonymous_user
from app.schemas.ai import ResumeAnalysis
from app.config import settings
from app.services.ocr import extract_text
from app.agents.resume_analyzer import SYSTEM_PROMPT
from app.services.groq_client import groq_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["resume"])

SUPPORTED_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


@router.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    anonymous_user_id: str | None = Header(default=None, alias="X-Anonymous-User-ID"),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "No file provided")

    extension = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    expected_type = SUPPORTED_TYPES.get(extension)
    if not expected_type:
        raise HTTPException(415, "Only PDF, PNG, and JPEG resumes are supported")
    if file.content_type and file.content_type not in {expected_type, "application/octet-stream"}:
        raise HTTPException(415, "File content type does not match its extension")

    file_bytes = await file.read(settings.max_resume_size_bytes + 1)
    if len(file_bytes) > settings.max_resume_size_bytes:
        raise HTTPException(413, "Resume file is too large")
    raw_text = await extract_text(file_bytes, file.filename)

    if not raw_text:
        raise HTTPException(422, "Could not extract text from resume")
    if len(raw_text) > settings.max_resume_text_chars:
        raise HTTPException(413, "Resume text is too long")

    user = await ensure_anonymous_user(db, anonymous_user_id)

    resume = Resume(
        user_id=user.id,
        filename=file.filename,
        raw_text=raw_text,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    return {"resume_id": str(resume.id), "raw_text": raw_text, "filename": file.filename}


@router.post("/analyze-resume")
async def analyze_resume(
    resume_id: str,
    anonymous_user_id: str | None = Header(default=None, alias="X-Anonymous-User-ID"),
    db: AsyncSession = Depends(get_db),
):
    user = await ensure_anonymous_user(db, anonymous_user_id)
    try:
        parsed_resume_id = uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(400, "Invalid resume ID")

    result = await db.execute(
        select(Resume).where(
            Resume.id == parsed_resume_id,
            Resume.user_id == user.id,
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    parsed_json = await groq_chat(SYSTEM_PROMPT, resume.raw_text, max_tokens=2048)

    try:
        parsed_data = ResumeAnalysis.model_validate_json(parsed_json).model_dump()
    except (ValidationError, ValueError):
        raise HTTPException(502, "Resume analysis provider returned invalid data")

    resume.parsed_data = parsed_data
    await db.commit()

    return {"resume_id": resume_id, "analysis": parsed_data}
