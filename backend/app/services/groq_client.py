import logging

from groq import AsyncGroq

from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncGroq(api_key=settings.groq_api_key)


async def groq_chat(
    system_prompt: str,
    user_prompt: str,
    model: str = "llama-3.3-70b-versatile",
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content or ""
        return _clean_llm_response(content)
    except Exception as e:
        logger.error(f"Groq API call failed: {e}")
        return ""


def _clean_llm_response(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    if text.startswith("json"):
        text = text[4:]
    return text.strip()
