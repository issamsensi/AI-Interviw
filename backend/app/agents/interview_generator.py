import json

SYSTEM_PROMPT = """You are an interview question generator. Create a structured interview plan.

Interview types and what to focus on:
- "mixed": blend behavioral, resume-specific, technical, and pressure questions
- "behavioral": behavioral questions only (STAR: situations, actions, results)
- "technical": technical depth for the role and the candidate's stack only
- "case_study": case-study and problem-solving walkthroughs for the role
- "hr": HR screening only (motivation, culture fit, strengths, availability)

Generate exactly the requested number of questions, ordered 0..N-1, all in
the requested interview type's focus.

Return ONLY raw valid JSON — no markdown, no code fences, no backticks.
Use these keys:
- questions (array of objects with text, category, order)
- strategy (brief interview strategy description)"""


def build_prompt(
    resume_data: dict,
    role: str,
    seniority: str,
    job_description: str | None = None,
    interview_type: str = "mixed",
    question_count: int = 5,
) -> str:
    return json.dumps({
        "task": "Generate interview questions",
        "role": role,
        "seniority": seniority,
        "job_description": job_description or "Not provided",
        "candidate_profile": resume_data,
        "interview_type": interview_type,
        "question_count": question_count,
    })
