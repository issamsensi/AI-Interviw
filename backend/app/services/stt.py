"""Speech-to-text backed by Meta Muse Voice Transcribe.

Verification status (verified live 2026-10-28 against api.meta.ai):
- ``muse-voice-transcribe-1.0`` accepted; Bearer auth accepted.
- Batch endpoint ``POST {base}/asr/transcribe`` confirmed live. It
  requires multipart parts ``request`` (JSON with ``model`` and
  ``audioEncoding``) and ``audio`` (the recording bytes). For the WAV
  containers this module validates, ``audioEncoding`` must be ``"WAV"``
  (``"LINEAR16"`` is rejected: it expects raw PCM, not a container).
- Success shape: ``{"transcript": str, "audioDurationMs": int,
  "turns": [...]}`` — verified with synthetic audio (empty transcript,
  as expected for a tone). Real-speech transcription quality has NOT
  been verified (no speech sample available in this environment).
- The realtime WebSocket (``/v1/asr/realtime``) is reported only by
  third-party sources and is NOT used here.
- Direct PDF/image input to Meta for resume extraction is likewise
  unverified, so resume text still comes from local OCR (see ocr.py).

What this module does, honestly:
- Accepts one COMPLETE recording per call (buffered batch mode). It does
  NOT do realtime streaming: the interview WebSocket delivers whole
  answer recordings and this module transcribes each recording with a
  single provider call.
- Validates audio locally: 16-bit mono PCM WAV at 16 kHz or 24 kHz.
  Browser recordings in other containers (e.g. WebM/Opus from
  MediaRecorder) are rejected with a clear error until a verified spec
  (and, if needed, a converter in the backend image, which currently
  has no FFmpeg) allows safe conversion. Nothing is uploaded in an
  assumed-compatible format.
- Sends audio bytes in memory (multipart); no temporary files are
  created, so there is nothing to leak or clean up.
- Never returns a silent ``""``: empty input, bad format, missing
  configuration and provider failures all raise typed exceptions.

Contract: browser recording -> this backend (anonymous session) ->
transcript text. The Meta key never leaves the backend.
"""

import io
import json
import logging
import wave

import httpx

from app.config import settings
from app.services.meta_client import (
    MetaClientError,
    MetaInvalidResponseError,
    MetaTimeoutError,
    meta_error_to_http,
)

logger = logging.getLogger(__name__)

ALLOWED_SAMPLE_RATES = (16000, 24000)


class STTError(MetaClientError):
    """Base class for transcription failures."""


class STTConfigurationError(STTError):
    """``META_API_KEY`` (or STT endpoint config) is missing/invalid."""


class STTValidationError(STTError):
    """Caller-supplied audio is empty or in an unsupported format."""


class STTProviderError(STTError):
    """Meta transcription endpoint failed or returned no transcript."""


class STTTimeoutError(STTProviderError, MetaTimeoutError):
    """Transcription request timed out (maps to HTTP 504)."""


def validate_wav_pcm(audio_bytes: bytes) -> dict:
    """Validate 16-bit mono PCM WAV at 16/24 kHz; return its parameters.

    Raises:
        STTValidationError: audio is empty, not a WAV file, or has
            unsupported encoding parameters.
    """
    if not audio_bytes:
        raise STTValidationError("No audio data received")
    if len(audio_bytes) > settings.meta_stt_max_bytes:
        raise STTValidationError("Audio recording is too large")
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav:
            channels = wav.getnchannels()
            sampwidth = wav.getsampwidth()
            framerate = wav.getframerate()
            comptype = wav.getcomptype()
            frames = wav.getnframes()
    except (wave.Error, EOFError, OSError) as e:
        raise STTValidationError(
            "Audio must be a WAV file (16-bit mono PCM at 16 kHz or 24 kHz)"
        ) from e
    if comptype != "NONE" or sampwidth != 2 or channels != 1:
        raise STTValidationError(
            "Audio must be 16-bit mono PCM WAV (1 channel, 16-bit samples)"
        )
    if framerate not in ALLOWED_SAMPLE_RATES:
        raise STTValidationError(
            f"Audio sample rate must be one of {list(ALLOWED_SAMPLE_RATES)} Hz, "
            f"got {framerate} Hz"
        )
    if frames <= 0:
        raise STTValidationError("Audio recording contains no samples")
    return {"channels": channels, "sampwidth": sampwidth, "framerate": framerate}


def _parse_transcript(payload: object) -> str:
    if isinstance(payload, dict):
        for key in ("text", "transcript", "transcription"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        data = payload.get("data")
        if isinstance(data, dict):
            return _parse_transcript(data)
        segments = payload.get("segments")
        if isinstance(segments, list):
            texts = [
                seg.get("text", "")
                for seg in segments
                if isinstance(seg, dict) and isinstance(seg.get("text"), str)
            ]
            joined = " ".join(t.strip() for t in texts if t.strip()).strip()
            if joined:
                return joined
    raise STTProviderError("Transcription provider returned no transcript")


async def transcribe_audio(
    audio_bytes: bytes,
    transport: httpx.AsyncBaseTransport | None = None,
) -> str:
    """Transcribe one complete validated recording via Meta.

    The ``transport`` argument exists only as a test seam.

    Raises:
        STTValidationError: empty/oversized/unsupported audio.
        STTConfigurationError: ``META_API_KEY`` is not set.
        STTTimeoutError: provider call timed out.
        STTProviderError: auth/rate-limit/server failures or empty result.
    """
    params = validate_wav_pcm(audio_bytes)

    api_key = settings.meta_api_key.strip()
    if not api_key:
        raise STTConfigurationError("META_API_KEY is not set")
    url = settings.meta_stt_endpoint
    model = settings.meta_stt_model.strip() or "muse-voice-transcribe-1.0"

    # Multipart shape verified live: a "request" JSON part plus the
    # "audio" bytes part. WAV containers require audioEncoding "WAV".
    request_part = json.dumps({"model": model, "audioEncoding": "WAV"})

    try:
        async with httpx.AsyncClient(
            timeout=settings.meta_request_timeout_seconds, transport=transport
        ) as client:
            response = await client.post(
                url,
                headers={"Authorization": "Bearer " + api_key},
                files={
                    "request": (None, request_part, "application/json"),
                    "audio": ("answer.wav", io.BytesIO(audio_bytes), "audio/wav"),
                },
            )
    except (httpx.TimeoutException, TimeoutError) as e:
        logger.warning("Meta transcription timed out")
        raise STTTimeoutError("Transcription request timed out") from e
    except httpx.HTTPError as e:
        logger.warning("Meta transcription transport error: %s", type(e).__name__)
        raise STTProviderError("Transcription transport failed") from e

    status = response.status_code
    if status in (401, 403):
        logger.warning("Meta transcription rejected credentials (status=%s)", status)
        raise STTProviderError("Transcription credentials rejected")
    if status == 429:
        logger.warning("Meta transcription rate limited")
        raise STTProviderError("Transcription rate limited")
    if status < 200 or status >= 300:
        logger.warning("Meta transcription failed (status=%s)", status)
        raise STTProviderError(f"Transcription failed with status {status}")

    try:
        payload = response.json()
    except ValueError as e:
        logger.warning("Meta transcription returned invalid JSON")
        raise MetaInvalidResponseError(
            "Transcription returned invalid JSON"
        ) from e

    text = _parse_transcript(payload)
    logger.info(
        "Transcription succeeded (rate=%s Hz, chars=%d)",
        params["framerate"],
        len(text),
    )
    return text


def stt_error_to_http(exc: STTError):
    """Map a transcription exception to a safe HTTP response."""
    if isinstance(exc, STTValidationError):
        from fastapi import HTTPException

        return HTTPException(422, str(exc))
    return meta_error_to_http(exc)
