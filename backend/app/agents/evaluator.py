import json

SYSTEM_PROMPT = """You are an interview evaluator. Analyze the interview transcript and produce a detailed evaluation.
Return ONLY raw valid JSON — no markdown, no code fences, no backticks.
Use these keys:
- overall_score (0-100)
- strengths (list of strings)
- weaknesses (list of strings)
- suggestions (list of strings)
- question_scores (object with question_text as key and score 0-100 as value)"""


def build_evaluation_prompt(questions_and_answers: list[dict]) -> str:
    return json.dumps({
        "task": "Evaluate the interview performance",
        "transcript": questions_and_answers,
    })
