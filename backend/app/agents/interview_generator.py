import json

SYSTEM_PROMPT = """You are an interview question generator. Create a structured interview plan.
Generate questions that cover:
1. Behavioral questions (tell me about yourself, why this role, etc.)
2. Resume-specific questions (based on candidate's projects and experience)
3. Technical questions (based on skills and role)
4. Pressure testing questions

Return ONLY raw valid JSON — no markdown, no code fences, no backticks.
Use these keys:
- questions (array of objects with text, category, order)
- strategy (brief interview strategy description)"""


def build_prompt(
    resume_data: dict,
    role: str,
    seniority: str,
    job_description: str | None = None,
) -> str:
    return json.dumps({
        "task": "Generate interview questions",
        "role": role,
        "seniority": seniority,
        "job_description": job_description or "Not provided",
        "candidate_profile": resume_data,
    })
