import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Header
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from app.database import get_db, async_session_factory
from app.models.interview import Interview
from app.models.resume import Resume
from app.models.question import Question
from app.models.answer import Answer
from app.agents.interview_generator import SYSTEM_PROMPT as GEN_SYSTEM_PROMPT
from app.agents.interview_generator import build_prompt as gen_build_prompt
from app.agents.interview_agent import SYSTEM_PROMPT as AGENT_SYSTEM_PROMPT
from app.agents.interview_agent import build_follow_up_prompt
from app.agents.evaluator import SYSTEM_PROMPT as EVAL_SYSTEM_PROMPT
from app.agents.evaluator import build_evaluation_prompt
from app.services.groq_client import groq_chat
from app.services.stt import transcribe_audio
from app.services.tts import synthesize_speech
from app.websocket.manager import manager
from app.services.anonymous import ensure_anonymous_user
from app.schemas.ai import Evaluation as EvaluationSchema
from app.schemas.ai import FollowUpResponse, InterviewPlan
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["interview"])


async def _upsert_answer(
    db: AsyncSession,
    interview_id: uuid.UUID,
    question_id: uuid.UUID,
    text: str,
) -> Answer:
    result = await db.execute(
        select(Answer)
        .where(
            Answer.interview_id == interview_id,
            Answer.question_id == question_id,
        )
        .order_by(Answer.created_at)
    )
    answer = result.scalars().first()
    if answer:
        answer.text = text
    else:
        answer = Answer(
            interview_id=interview_id,
            question_id=question_id,
            text=text,
        )
        db.add(answer)

    await db.commit()
    return answer


async def _load_qa_pairs(
    db: AsyncSession,
    interview_id: uuid.UUID,
    answered_only: bool = False,
) -> list[dict]:
    questions_result = await db.execute(
        select(Question)
        .where(Question.interview_id == interview_id)
        .order_by(Question.order)
    )
    questions = questions_result.scalars().all()

    answers_result = await db.execute(
        select(Answer)
        .where(Answer.interview_id == interview_id)
        .order_by(Answer.created_at)
    )
    answers_by_question = {}
    for answer in answers_result.scalars().all():
        answers_by_question[answer.question_id] = answer

    qa_pairs = []
    for question in questions:
        answer = answers_by_question.get(question.id)
        if answered_only and (not answer or not answer.text.strip()):
            continue
        qa_pairs.append({
            "question_id": str(question.id),
            "question": question.text,
            "category": question.category,
            "order": question.order,
            "answer": answer.text if answer else None,
        })
    return qa_pairs


@router.post("/start-interview")
async def start_interview(
    body: dict,
    anonymous_user_id: str | None = Header(default=None, alias="X-Anonymous-User-ID"),
    db: AsyncSession = Depends(get_db),
):
    resume_id = body.get("resume_id")
    role = body.get("role")
    seniority = body.get("seniority", "mid")
    job_description = body.get("job_description")
    duration_minutes = body.get("duration_minutes", 10)

    if not role:
        raise HTTPException(400, "Role is required")
    if not isinstance(duration_minutes, int) or not (2 <= duration_minutes <= 20):
        raise HTTPException(400, "Duration must be between 2 and 20 minutes")
    if job_description and len(job_description) > settings.max_job_description_chars:
        raise HTTPException(413, "Job description is too long")

    user = await ensure_anonymous_user(db, anonymous_user_id)
    try:
        parsed_resume_id = uuid.UUID(resume_id)
    except (ValueError, AttributeError, TypeError):
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

    interview = Interview(
        user_id=user.id,
        resume_id=resume.id,
        role=role,
        seniority=seniority,
        job_description=job_description,
        duration_minutes=duration_minutes,
        status="generating",
    )
    db.add(interview)
    await db.commit()
    await db.refresh(interview)

    prompt = gen_build_prompt(
        resume.parsed_data or {},
        role,
        seniority,
        job_description,
    )
    response = await groq_chat(GEN_SYSTEM_PROMPT, prompt, max_tokens=3072)

    try:
        plan = InterviewPlan.model_validate_json(response)
    except (ValidationError, ValueError):
        interview.status = "failed"
        await db.commit()
        raise HTTPException(502, "Interview question provider returned invalid data")

    questions = plan.questions
    for i, q in enumerate(questions):
        question = Question(
            interview_id=interview.id,
            text=q.text,
            category=q.category,
            order=i,
        )
        db.add(question)

    interview.status = "ready"
    await db.commit()

    return {
        "interview_id": str(interview.id),
        "role": role,
        "seniority": seniority,
        "duration_minutes": duration_minutes,
        "question_count": len(questions),
        "strategy": plan.strategy,
    }


@router.websocket("/interview-stream/{interview_id}")
async def interview_stream(websocket: WebSocket, interview_id: str):
    await manager.connect(interview_id, websocket)

    async with async_session_factory() as session:
        try:
            try:
                parsed_interview_id = uuid.UUID(interview_id)
            except ValueError:
                await manager.send_json(interview_id, {
                    "type": "error",
                    "text": "Invalid interview ID",
                })
                return

            result = await session.execute(
                select(Interview).where(Interview.id == parsed_interview_id)
            )
            interview = result.scalar_one_or_none()
            if not interview:
                await manager.send_json(interview_id, {"type": "error", "text": "Interview not found"})
                return

            interview.status = "in_progress"
            await session.commit()

            questions_result = await session.execute(
                select(Question).where(Question.interview_id == interview.id).order_by(Question.order)
            )
            db_questions = questions_result.scalars().all()
            if not db_questions:
                await manager.send_json(interview_id, {"type": "error", "text": "No questions found"})
                return

            resume_result = await session.execute(select(Resume).where(Resume.id == interview.resume_id))
            resume = resume_result.scalar_one_or_none()
            resume_data = resume.parsed_data if resume else {}

            current_q_index = 0

            async def send_question(index: int):
                if index >= len(db_questions):
                    await manager.send_json(interview_id, {
                        "type": "interview_end",
                        "message": "Thank you for your time. That concludes the interview.",
                    })
                    return False
                q = db_questions[index]
                await manager.send_json(interview_id, {
                    "type": "question",
                    "text": q.text,
                    "question_id": str(q.id),
                    "category": q.category,
                    "order": q.order,
                })
                audio = await synthesize_speech(q.text)
                if audio:
                    await manager.send_audio(interview_id, audio)
                return True

            if not await send_question(0):
                return

            while True:
                message = await websocket.receive_json()
                action = message.get("action")

                if action == "answer":
                    if current_q_index >= len(db_questions):
                        await manager.send_json(interview_id, {
                            "type": "answer_error",
                            "text": "There is no active question for this answer.",
                        })
                        continue

                    text = ""
                    try:
                        audio_bytes = await asyncio.wait_for(
                            websocket.receive_bytes(), timeout=5.0
                        )
                        if audio_bytes:
                            text = await transcribe_audio(audio_bytes)
                    except asyncio.TimeoutError:
                        text = message.get("text", "")
                    except WebSocketDisconnect:
                        raise
                    except Exception as exc:
                        logger.exception("Failed to receive answer audio: %s", exc)
                        await manager.send_json(interview_id, {
                            "type": "answer_error",
                            "text": "Could not receive your answer audio. Please try again.",
                        })
                        continue

                    if not text.strip():
                        await manager.send_json(interview_id, {
                            "type": "answer_error",
                            "text": "Your answer could not be transcribed. Please try again.",
                        })
                        continue

                    current_question = db_questions[current_q_index]
                    try:
                        await _upsert_answer(
                            session,
                            interview.id,
                            current_question.id,
                            text.strip(),
                        )
                    except SQLAlchemyError as exc:
                        await session.rollback()
                        logger.exception("Failed to persist answer: %s", exc)
                        await manager.send_json(interview_id, {
                            "type": "answer_error",
                            "text": "Your answer could not be saved. Please try again.",
                        })
                        continue

                    await manager.send_json(interview_id, {
                        "type": "answer_ack",
                        "text": text,
                    })

                    remaining = [
                        {"text": q.text, "category": q.category}
                        for q in db_questions[current_q_index + 1:]
                    ]
                    follow_up = await groq_chat(
                        AGENT_SYSTEM_PROMPT,
                        build_follow_up_prompt(
                            current_question.text,
                            text,
                            resume_data,
                            remaining,
                        ),
                        max_tokens=512,
                    )

                    try:
                        follow_up_data = FollowUpResponse.model_validate_json(follow_up)
                    except (ValidationError, ValueError):
                        follow_up_data = FollowUpResponse()

                    is_last = current_q_index >= len(db_questions) - 1

                    if follow_up_data.next_action == "end" or is_last:
                        await manager.send_json(interview_id, {
                            "type": "interview_end",
                            "message": follow_up_data.response or "Thank you for your time.",
                        })
                        break
                    else:
                        next_q_text = follow_up_data.next_question or follow_up_data.response
                        if next_q_text:
                            current_q_index += 1
                            if current_q_index < len(db_questions):
                                db_questions[current_q_index].text = next_q_text
                                await session.commit()
                            await manager.send_json(interview_id, {
                                "type": "question",
                                "text": next_q_text,
                                "question_id": str(db_questions[min(current_q_index, len(db_questions)-1)].id),
                                "category": db_questions[min(current_q_index, len(db_questions)-1)].category,
                                "order": db_questions[min(current_q_index, len(db_questions)-1)].order,
                            })
                            audio = await synthesize_speech(next_q_text)
                            if audio:
                                await manager.send_audio(interview_id, audio)
                        else:
                            current_q_index += 1
                            if not await send_question(current_q_index):
                                break

                elif action == "end_interview":
                    await manager.send_json(interview_id, {
                        "type": "interview_ended",
                    })
                    break

        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected: {interview_id}")
        finally:
            manager.disconnect(interview_id)


@router.post("/end-interview")
async def end_interview(body: dict, db: AsyncSession = Depends(get_db)):
    interview_id = body.get("interview_id")
    if not interview_id:
        raise HTTPException(400, "interview_id required")

    try:
        parsed_interview_id = uuid.UUID(interview_id)
    except ValueError:
        raise HTTPException(400, "Invalid interview_id")

    result = await db.execute(
        select(Interview)
        .where(Interview.id == parsed_interview_id)
        .options(selectinload(Interview.evaluation))
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(404, "Interview not found")

    qa_pairs = await _load_qa_pairs(db, interview.id)
    answered_pairs = await _load_qa_pairs(db, interview.id, answered_only=True)

    if interview.evaluation:
        return {
            "interview_id": interview_id,
            "evaluation": {
                "overall_score": interview.evaluation.overall_score,
                "strengths": interview.evaluation.strengths,
                "weaknesses": interview.evaluation.weaknesses,
                "suggestions": interview.evaluation.suggestions,
                "question_scores": interview.evaluation.question_scores,
            },
            "qa_pairs": qa_pairs,
        }

    if not answered_pairs:
        raise HTTPException(422, "Cannot evaluate an interview with no valid answers")

    eval_prompt = build_evaluation_prompt(answered_pairs)
    eval_response = await groq_chat(EVAL_SYSTEM_PROMPT, eval_prompt, max_tokens=2048)

    try:
        evaluation = EvaluationSchema.model_validate_json(eval_response)
    except (ValidationError, ValueError):
        raise HTTPException(502, "Evaluation provider returned invalid data")

    from app.models.evaluation import Evaluation as EvalModel

    eval_record = EvalModel(
        interview_id=interview.id,
        overall_score=evaluation.overall_score,
        strengths=evaluation.strengths,
        weaknesses=evaluation.weaknesses,
        suggestions=evaluation.suggestions,
        question_scores=evaluation.question_scores,
    )
    db.add(eval_record)
    interview.status = "completed"
    interview.ended_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "interview_id": interview_id,
        "evaluation": evaluation.model_dump(),
        "qa_pairs": qa_pairs,
    }


@router.post("/submit-answer")
async def submit_answer(body: dict, db: AsyncSession = Depends(get_db)):
    interview_id = body.get("interview_id")
    question_id = body.get("question_id")
    text = body.get("text", "")

    if not interview_id or not question_id:
        raise HTTPException(400, "interview_id and question_id required")

    try:
        parsed_interview_id = uuid.UUID(interview_id)
        parsed_question_id = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(400, "Invalid interview_id or question_id")

    question_result = await db.execute(
        select(Question).where(
            Question.id == parsed_question_id,
            Question.interview_id == parsed_interview_id,
        )
    )
    if not question_result.scalar_one_or_none():
        raise HTTPException(404, "Question not found for interview")

    if not text.strip():
        raise HTTPException(422, "Answer text is required")

    answer = await _upsert_answer(
        db,
        parsed_interview_id,
        parsed_question_id,
        text.strip(),
    )

    return {"status": "ok", "answer_id": str(answer.id)}
