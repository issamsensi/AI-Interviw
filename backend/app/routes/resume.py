import json
import logging
import uuid

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.resume import Resume
from app.services.ocr import extract_text
from app.agents.resume_analyzer import SYSTEM_PROMPT
from app.services.groq_client import groq_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["resume"])


@router.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    user_id: str = "default",
    db: AsyncSession = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "No file provided")

    file_bytes = await file.read()
    raw_text = await extract_text(file_bytes, file.filename)

    if not raw_text:
        raise HTTPException(422, "Could not extract text from resume")

    resume = Resume(
        user_id=uuid.UUID(user_id) if user_id != "default" else uuid.uuid4(),
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
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Resume).where(Resume.id == uuid.UUID(resume_id)))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    parsed_json = await groq_chat(SYSTEM_PROMPT, resume.raw_text, max_tokens=2048)

    try:
        parsed_data = json.loads(parsed_json)
    except json.JSONDecodeError:
        raise HTTPException(500, "Failed to parse resume analysis")

    resume.parsed_data = parsed_data
    await db.commit()

    return {"resume_id": resume_id, "analysis": parsed_data}
