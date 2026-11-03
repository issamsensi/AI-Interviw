"""Tests for the Meta transcription service boundary.

Uses httpx.MockTransport: no network, no credentials required.
"""

import io
import unittest
import wave
from unittest import mock

import httpx

from app.config import settings
from app.services.stt import (
    STTConfigurationError,
    STTProviderError,
    STTTimeoutError,
    STTValidationError,
    stt_error_to_http,
    transcribe_audio,
    validate_wav_pcm,
)

TEST_KEY = "test-key-not-a-secret"


def make_wav(framerate=16000, channels=1, sampwidth=2, seconds=1) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(sampwidth)
        wav.setframerate(framerate)
        wav.writeframes(b"\x00" * sampwidth * channels * framerate * seconds)
    return buf.getvalue()


def patch_key(key=TEST_KEY):
    return mock.patch.object(settings, "meta_api_key", key)


class ValidateWavTests(unittest.TestCase):
    def test_valid_16k_mono(self):
        params = validate_wav_pcm(make_wav(16000))
        self.assertEqual(params["framerate"], 16000)

    def test_valid_24k_mono(self):
        params = validate_wav_pcm(make_wav(24000))
        self.assertEqual(params["framerate"], 24000)

    def test_empty_rejected(self):
        with self.assertRaises(STTValidationError):
            validate_wav_pcm(b"")

    def test_non_wav_rejected(self):
        with self.assertRaises(STTValidationError):
            validate_wav_pcm(b"\x1aE\xdf\xa3" + b"\x00" * 100)

    def test_wrong_rate_rejected(self):
        with self.assertRaises(STTValidationError):
            validate_wav_pcm(make_wav(8000))

    def test_stereo_rejected(self):
        with self.assertRaises(STTValidationError):
            validate_wav_pcm(make_wav(16000, channels=2))

    def test_oversized_rejected(self):
        with mock.patch.object(settings, "meta_stt_max_bytes", 10):
            with self.assertRaises(STTValidationError):
                validate_wav_pcm(make_wav())


class TranscribeAudioTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_returns_transcript(self):
        with patch_key():
            transport = httpx.MockTransport(
                lambda req: httpx.Response(200, json={"text": "hello there"})
            )
            text = await transcribe_audio(make_wav(), transport=transport)
            self.assertEqual(text, "hello there")

    async def test_request_uses_verified_multipart_shape(self):
        # Live-verified 2026-10-28: parts "request" (JSON with model +
        # audioEncoding WAV) and "audio". Any other shape gets a 400.
        with patch_key():
            seen = {}

            def handler(req: httpx.Request):
                seen["body"] = req.content
                return httpx.Response(200, json={"text": "ok"})

            await transcribe_audio(
                make_wav(), transport=httpx.MockTransport(handler)
            )
            body = seen["body"]
            self.assertIn(b'name="request"', body)
            self.assertIn(b'name="audio"', body)
            self.assertIn(b'"audioEncoding": "WAV"', body)
            self.assertIn(b"muse-voice-transcribe-1.0", body)
            self.assertNotIn(b'name="file"', body)

    async def test_segments_shape_parsed(self):
        with patch_key():
            transport = httpx.MockTransport(
                lambda req: httpx.Response(
                    200, json={"segments": [{"text": "hi"}, {"text": "there"}]}
                )
            )
            text = await transcribe_audio(make_wav(), transport=transport)
            self.assertEqual(text, "hi there")

    async def test_missing_key_raises_without_http(self):
        with patch_key(""):
            def handler(req: httpx.Request):
                raise AssertionError("no HTTP call expected")

            with self.assertRaises(STTConfigurationError):
                await transcribe_audio(
                    make_wav(), transport=httpx.MockTransport(handler)
                )

    async def test_invalid_audio_never_reaches_http(self):
        with patch_key():
            def handler(req: httpx.Request):
                raise AssertionError("no HTTP call expected")

            with self.assertRaises(STTValidationError):
                await transcribe_audio(b"garbage", transport=httpx.MockTransport(handler))

    async def test_401_maps_to_provider_error(self):
        with patch_key():
            transport = httpx.MockTransport(lambda req: httpx.Response(401, json={}))
            with self.assertRaises(STTProviderError):
                await transcribe_audio(make_wav(), transport=transport)

    async def test_500_maps_to_provider_error(self):
        with patch_key():
            transport = httpx.MockTransport(lambda req: httpx.Response(500, json={}))
            with self.assertRaises(STTProviderError):
                await transcribe_audio(make_wav(), transport=transport)

    async def test_timeout_maps_to_timeout_error(self):
        with patch_key():
            def handler(req: httpx.Request):
                raise httpx.ReadTimeout("slow")

            with self.assertRaises(STTTimeoutError):
                await transcribe_audio(
                    make_wav(), transport=httpx.MockTransport(handler)
                )

    async def test_empty_transcript_maps_to_provider_error(self):
        with patch_key():
            transport = httpx.MockTransport(
                lambda req: httpx.Response(200, json={"text": "   "})
            )
            with self.assertRaises(STTProviderError):
                await transcribe_audio(make_wav(), transport=transport)


class STTErrorMappingTests(unittest.TestCase):
    def test_validation_is_422(self):
        exc = stt_error_to_http(STTValidationError("bad audio"))
        self.assertEqual(exc.status_code, 422)

    def test_timeout_is_504(self):
        self.assertEqual(stt_error_to_http(STTTimeoutError("x")).status_code, 504)

    def test_provider_is_502(self):
        self.assertEqual(stt_error_to_http(STTProviderError("x")).status_code, 502)


if __name__ == "__main__":
    unittest.main()
