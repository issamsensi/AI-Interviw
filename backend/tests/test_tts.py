"""Tests for the optional ElevenLabs TTS wrapper.

Uses httpx.MockTransport: no network, no credentials required.
"""

import unittest
from unittest import mock

import httpx

from app.config import settings
from app.services.tts import (
    TTSConfigurationError,
    TTSProviderError,
    TTSTimeoutError,
    synthesize_speech,
    tts_enabled,
)


class TTSEnabledTests(unittest.TestCase):
    def test_disabled_without_key(self):
        with mock.patch.object(settings, "elevenlabs_api_key", "  "):
            self.assertFalse(tts_enabled())

    def test_enabled_with_key(self):
        with mock.patch.object(settings, "elevenlabs_api_key", "k"):
            self.assertTrue(tts_enabled())


class SynthesizeTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_returns_bytes(self):
        with mock.patch.object(settings, "elevenlabs_api_key", "k"):
            transport = httpx.MockTransport(
                lambda req: httpx.Response(200, content=b"FAKEAUDIO")
            )
            audio = await synthesize_speech("hello", transport=transport)
            self.assertEqual(audio, b"FAKEAUDIO")

    async def test_missing_key_raises_without_http(self):
        with mock.patch.object(settings, "elevenlabs_api_key", ""):
            def handler(req: httpx.Request):
                raise AssertionError("no HTTP call expected")

            with self.assertRaises(TTSConfigurationError):
                await synthesize_speech("hello", transport=httpx.MockTransport(handler))

    async def test_empty_text_rejected(self):
        with mock.patch.object(settings, "elevenlabs_api_key", "k"):
            def handler(req: httpx.Request):
                raise AssertionError("no HTTP call expected")

            with self.assertRaises(TTSProviderError):
                await synthesize_speech("   ", transport=httpx.MockTransport(handler))

    async def test_500_maps_to_provider_error(self):
        with mock.patch.object(settings, "elevenlabs_api_key", "k"):
            transport = httpx.MockTransport(lambda req: httpx.Response(500, json={}))
            with self.assertRaises(TTSProviderError):
                await synthesize_speech("hello", transport=transport)

    async def test_timeout_maps_to_timeout_error(self):
        with mock.patch.object(settings, "elevenlabs_api_key", "k"):
            def handler(req: httpx.Request):
                raise httpx.ReadTimeout("slow")

            with self.assertRaises(TTSTimeoutError):
                await synthesize_speech("hello", transport=httpx.MockTransport(handler))


if __name__ == "__main__":
    unittest.main()
