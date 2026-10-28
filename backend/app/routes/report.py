import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.interview import Interview
from app.models.question import Question
from app.models.answer import Answer
from app.models.evaluation import Evaluation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["report"])


@router.get("/report/{interview_id}")
async def get_report(interview_id: str, db: AsyncSession = Depends(get_db)):
    try:
        parsed_interview_id = uuid.UUID(interview_id)
    except ValueError:
        raise HTTPException(400, "Invalid interview ID")

    result = await db.execute(
        select(Interview)
        .where(Interview.id == parsed_interview_id)
        .options(
            selectinload(Interview.questions),
            selectinload(Interview.answers),
            selectinload(Interview.evaluation),
        )
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(404, "Interview not found")

    questions_result = await db.execute(
        select(Question).where(Question.interview_id == interview.id).order_by(Question.order)
    )
    questions = questions_result.scalars().all()

    qa_pairs = []
    for q in questions:
        ans_result = await db.execute(
            select(Answer).where(Answer.question_id == q.id)
        )
        ans = ans_result.scalar_one_or_none()
        qa_pairs.append({
            "question_id": str(q.id),
            "question": q.text,
            "category": q.category,
            "order": q.order,
            "answer": ans.text if ans else None,
            "confidence_score": ans.confidence_score if ans else None,
        })

    eval_data = None
    if interview.evaluation:
        eval_data = {
            "overall_score": interview.evaluation.overall_score,
            "strengths": interview.evaluation.strengths,
            "weaknesses": interview.evaluation.weaknesses,
            "suggestions": interview.evaluation.suggestions,
            "question_scores": interview.evaluation.question_scores,
        }

    return {
        "interview_id": str(interview.id),
        "role": interview.role,
        "seniority": interview.seniority,
        "status": interview.status,
        "created_at": interview.created_at.isoformat() if interview.created_at else None,
        "evaluation": eval_data,
        "qa_pairs": qa_pairs,
    }
