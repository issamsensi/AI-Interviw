import io
import logging

from groq import AsyncGroq

from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncGroq(api_key=settings.groq_api_key)


async def transcribe_audio(audio_bytes: bytes) -> str:
    try:
        transcript = await client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=("audio.wav", io.BytesIO(audio_bytes)),
        )
        return transcript.text
    except Exception as e:
        logger.error(f"Groq Whisper transcription failed: {e}")
        return ""
