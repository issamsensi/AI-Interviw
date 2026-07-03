import logging

from app.services.groq_client import groq_chat

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior recruiter conducting a live interview.
Be professional, conversational, and adaptive. Your goal is to assess the candidate thoroughly.

Rules:
- Ask one question at a time
- Listen to the answer and ask relevant follow-ups
- Adapt based on technologies and topics mentioned
- Maintain a realistic interview flow
- After the last question, signal completion

Current interview state will be provided. Respond naturally as an interviewer."""


def build_follow_up_prompt(
    question: str,
    answer: str,
    resume_data: dict,
    remaining_questions: list,
) -> str:
    import json
    return json.dumps({
        "current_question": question,
        "candidate_answer": answer,
        "resume_context": resume_data,
        "remaining_questions": [q.get("text") for q in remaining_questions],
        "task": "Respond to the candidate's answer. Either ask a follow-up question or proceed to the next question. If it's the last question, end professionally.",
    })
