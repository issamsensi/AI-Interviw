import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["interview"])


@router.post("/start-interview")
async def start_interview(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    resume_id = body.get("resume_id")
    role = body.get("role")
    seniority = body.get("seniority", "mid")
    job_description = body.get("job_description")
    duration_minutes = body.get("duration_minutes", 10)
    user_id = body.get("user_id", "default")

    if not role:
        raise HTTPException(400, "Role is required")
    if not (2 <= duration_minutes <= 20):
        raise HTTPException(400, "Duration must be between 2 and 20 minutes")

    result = await db.execute(select(Resume).where(Resume.id == uuid.UUID(resume_id)))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    interview = Interview(
        user_id=uuid.UUID(user_id) if user_id != "default" else uuid.uuid4(),
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
        plan = json.loads(response)
    except json.JSONDecodeError:
        raise HTTPException(500, "Failed to parse interview plan")

    questions = plan.get("questions", [])
    for i, q in enumerate(questions):
        question = Question(
            interview_id=interview.id,
            text=q.get("text", ""),
            category=q.get("category", "general"),
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
        "strategy": plan.get("strategy", ""),
    }


@router.websocket("/interview-stream/{interview_id}")
async def interview_stream(websocket: WebSocket, interview_id: str):
    await manager.connect(interview_id, websocket)

    async with async_session_factory() as session:
        try:
            result = await session.execute(
                select(Interview).where(Interview.id == uuid.UUID(interview_id))
            )
            interview = result.scalar_one_or_none()
            if not interview:
                await manager.send_json(interview_id, {"type": "error", "text": "Interview not found"})
                return

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
                    text = ""
                    try:
                        audio_bytes = await asyncio.wait_for(
                            websocket.receive_bytes(), timeout=5.0
                        )
                        if audio_bytes:
                            text = await transcribe_audio(audio_bytes)
                    except (asyncio.TimeoutError, Exception):
                        text = message.get("text", "")

                    await manager.send_json(interview_id, {
                        "type": "answer_ack",
                        "text": text,
                    })

                    if text:
                        remaining = [
                            {"text": q.text, "category": q.category}
                            for q in db_questions[current_q_index + 1:]
                        ]
                        follow_up = await groq_chat(
                            AGENT_SYSTEM_PROMPT,
                            build_follow_up_prompt(
                                db_questions[current_q_index].text,
                                text,
                                resume_data,
                                remaining,
                            ),
                            max_tokens=512,
                        )

                        try:
                            follow_up_data = json.loads(follow_up)
                        except json.JSONDecodeError:
                            follow_up_data = {"next_action": "proceed", "response": follow_up}

                        is_last = current_q_index >= len(db_questions) - 1

                        if follow_up_data.get("next_action") == "end" or is_last:
                            await manager.send_json(interview_id, {
                                "type": "interview_end",
                                "message": follow_up_data.get("response", "Thank you for your time."),
                            })
                            break
                        else:
                            next_q_text = follow_up_data.get("next_question") or follow_up_data.get("response", "")
                            if next_q_text:
                                current_q_index += 1
                                if current_q_index < len(db_questions):
                                    db_questions[current_q_index].text = next_q_text
                                await manager.send_json(interview_id, {
                                    "type": "question",
                                    "text": next_q_text,
                                    "question_id": str(db_questions[min(current_q_index, len(db_questions)-1)].id),
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

    result = await db.execute(
        select(Interview).where(Interview.id == uuid.UUID(interview_id))
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(404, "Interview not found")

    interview.status = "completed"
    await db.commit()

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
            "question": q.text,
            "category": q.category,
            "answer": ans.text if ans else "",
        })

    eval_prompt = build_evaluation_prompt(qa_pairs)
    eval_response = await groq_chat(EVAL_SYSTEM_PROMPT, eval_prompt, max_tokens=2048)

    try:
        evaluation = json.loads(eval_response)
    except json.JSONDecodeError:
        evaluation = {
            "overall_score": 0,
            "strengths": [],
            "weaknesses": [],
            "suggestions": [],
            "question_scores": {},
        }

    from app.models.evaluation import Evaluation as EvalModel

    eval_record = EvalModel(
        interview_id=interview.id,
        overall_score=evaluation.get("overall_score", 0),
        strengths=evaluation.get("strengths", []),
        weaknesses=evaluation.get("weaknesses", []),
        suggestions=evaluation.get("suggestions", []),
        question_scores=evaluation.get("question_scores", {}),
    )
    db.add(eval_record)
    await db.commit()

    return {
        "interview_id": interview_id,
        "evaluation": evaluation,
        "qa_pairs": qa_pairs,
    }


@router.post("/submit-answer")
async def submit_answer(body: dict, db: AsyncSession = Depends(get_db)):
    interview_id = body.get("interview_id")
    question_id = body.get("question_id")
    text = body.get("text", "")

    if not interview_id or not question_id:
        raise HTTPException(400, "interview_id and question_id required")

    answer = Answer(
        interview_id=uuid.UUID(interview_id),
        question_id=uuid.UUID(question_id),
        text=text,
    )
    db.add(answer)
    await db.commit()

    return {"status": "ok", "answer_id": str(answer.id)}
