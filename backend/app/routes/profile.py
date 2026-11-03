import uuid

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.answer import Answer
from app.models.interview import Interview
from app.models.resume import Resume
from app.services.auth import resolve_user

router = APIRouter(prefix="/api", tags=["profile"])

MAX_NAME_CHARS = 120
MAX_TARGET_ROLE_CHARS = 255


async def _require_account(db, authorization, anonymous_user_id):
    user = await resolve_user(db, authorization, anonymous_user_id)
    if user.is_guest:
        raise HTTPException(
            403,
            {
                "code": "AUTH_REQUIRED",
                "message": "Sign in to view your profile. Guests keep data only in this browser.",
            },
        )
    return user


def _iso(value):
    return value.isoformat() if value else None


@router.get("/profile")
async def get_profile(
    anonymous_user_id: str | None = Header(default=None, alias="X-Anonymous-User-ID"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _require_account(db, authorization, anonymous_user_id)
    # Snapshot before later queries expire/refresh the ORM object.
    profile = {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "target_role": user.target_role,
        "created_at": _iso(user.created_at),
    }
    user_id = uuid.UUID(profile["id"])

    resumes_result = await db.execute(
        select(Resume).where(Resume.user_id == user_id).order_by(Resume.created_at.desc())
    )
    resumes = [
        {
            "resume_id": str(r.id),
            "filename": r.filename,
            "created_at": _iso(r.created_at),
            "analysis": r.parsed_data,
        }
        for r in resumes_result.scalars().all()
    ]

    interviews_result = await db.execute(
        select(Interview)
        .where(Interview.user_id == user_id)
        .options(selectinload(Interview.evaluation), selectinload(Interview.questions))
        .order_by(Interview.created_at.desc())
    )
    interviews = []
    scores: list[float] = []
    for interview in interviews_result.scalars().all():
        answered_result = await db.execute(
            select(func.count(Answer.id)).where(
                Answer.interview_id == interview.id, Answer.text != ""
            )
        )
        score = interview.evaluation.overall_score if interview.evaluation else None
        if score is not None:
            scores.append(float(score))
        interviews.append(
            {
                "interview_id": str(interview.id),
                "role": interview.role,
                "seniority": interview.seniority,
                "status": interview.status,
                "created_at": _iso(interview.created_at),
                "ended_at": _iso(interview.ended_at),
                "question_count": len(interview.questions),
                "answered_count": int(answered_result.scalar_one() or 0),
                "score": score,
            }
        )

    return {
        "user": profile,
        "resumes": resumes,
        "interviews": interviews,
        "stats": {
            "interview_count": len(interviews),
            "completed_count": len(scores),
            "average_score": round(sum(scores) / len(scores), 1) if scores else None,
            "best_score": max(scores) if scores else None,
        },
    }


@router.patch("/profile")
async def update_profile(
    body: dict,
    anonymous_user_id: str | None = Header(default=None, alias="X-Anonymous-User-ID"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _require_account(db, authorization, anonymous_user_id)

    if "name" in body:
        name = body.get("name")
        if name is not None and (not isinstance(name, str) or len(name.strip()) > MAX_NAME_CHARS):
            raise HTTPException(400, "Name is too long")
        user.name = name.strip() if isinstance(name, str) and name.strip() else None
    if "target_role" in body:
        target_role = body.get("target_role")
        if target_role is not None and (
            not isinstance(target_role, str) or len(target_role.strip()) > MAX_TARGET_ROLE_CHARS
        ):
            raise HTTPException(400, "Target role is too long")
        user.target_role = (
            target_role.strip() if isinstance(target_role, str) and target_role.strip() else None
        )

    await db.commit()
    await db.refresh(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "target_role": user.target_role,
        "created_at": _iso(user.created_at),
    }
