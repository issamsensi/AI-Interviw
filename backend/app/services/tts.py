"""Optional Text-to-Speech via ElevenLabs.

Positioning: the intended default interview voice is the browser's
built-in ``speechSynthesis``. The backend synthesizes audio ONLY when
explicitly configured (``ELEVENLABS_API_KEY`` set) and an existing
caller still requires server-generated audio. TTS is therefore
best-effort: callers must treat TTS failures as skippable (log and
continue without audio), unlike STT/LLM failures which block progress.

Unlike before, failures are never hidden as ``b""``: they raise typed
exceptions so callers can distinguish "TTS disabled" from "TTS failed".
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class TTSError(Exception):
    """Base class for TTS failures."""


class TTSConfigurationError(TTSError):
    """ElevenLabs is not configured (no API key)."""


class TTSProviderError(TTSError):
    """ElevenLabs request failed."""


class TTSTimeoutError(TTSProviderError):
    """ElevenLabs request timed out."""


def tts_enabled() -> bool:
    """Whether server-side TTS is configured and may be used."""
    return settings.tts_enabled


async def synthesize_speech(
    text: str,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
    transport: httpx.AsyncBaseTransport | None = None,
) -> bytes:
    """Synthesize speech via ElevenLabs.

    The ``transport`` argument exists only as a test seam.

    Raises:
        TTSConfigurationError: ``ELEVENLABS_API_KEY`` is not set.
        TTSTimeoutError: request timed out.
        TTSProviderError: request failed or returned no audio.
    """
    api_key = settings.elevenlabs_api_key.strip()
    if not api_key:
        raise TTSConfigurationError("Server-side TTS is not configured")
    if not text.strip():
        raise TTSProviderError("Cannot synthesize empty text")

    try:
        async with httpx.AsyncClient(timeout=30, transport=transport) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
                },
            )
    except (httpx.TimeoutException, TimeoutError) as e:
        logger.warning("ElevenLabs TTS timed out")
        raise TTSTimeoutError("TTS request timed out") from e
    except httpx.HTTPError as e:
        logger.warning("ElevenLabs TTS transport error: %s", type(e).__name__)
        raise TTSProviderError("TTS transport failed") from e

    status = response.status_code
    if status < 200 or status >= 300:
        logger.warning("ElevenLabs TTS failed (status=%s)", status)
        raise TTSProviderError(f"TTS failed with status {status}")
    if not response.content:
        raise TTSProviderError("TTS returned no audio")
    logger.info("TTS synthesized (chars=%d, bytes=%d)", len(text), len(response.content))
    return response.content
