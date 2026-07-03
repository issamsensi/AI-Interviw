import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def synthesize_speech(text: str, voice_id: str = "21m00Tcm4TlvDq8ikWAM") -> bytes:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
                },
            )
            response.raise_for_status()
            return response.content
    except Exception as e:
        logger.error(f"ElevenLabs TTS failed: {e}")
        return b""
