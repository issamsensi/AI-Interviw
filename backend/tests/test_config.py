"""Configuration compatibility tests (no secrets, no network).

Verifies the Meta settings surface, dev/prod model selection, URL
building, optional TTS flag, and that legacy .env files containing
removed provider keys no longer crash startup.
"""

import os
import unittest
from unittest import mock

from app.config import Settings


class MetaSettingsTests(unittest.TestCase):
    def test_dev_model_default(self):
        with mock.patch.dict(os.environ, {"META_ENV": "dev"}, clear=False):
            s = Settings()
        self.assertEqual(s.meta_model, s.meta_model_dev)

    def test_prod_model_selection(self):
        env = {"META_ENV": "prod", "META_MODEL_PROD": "muse-spark-1.3"}
        with mock.patch.dict(os.environ, env, clear=False):
            s = Settings()
        self.assertEqual(s.meta_model, "muse-spark-1.3")

    def test_chat_url_join(self):
        env = {"META_API_BASE": "https://api.meta.ai/v1/",
               "META_CHAT_PATH": "chat/completions"}
        with mock.patch.dict(os.environ, env, clear=False):
            s = Settings()
        self.assertEqual(
            s.meta_chat_url, "https://api.meta.ai/v1/chat/completions"
        )

    def test_stt_endpoint_default_and_override(self):
        with mock.patch.dict(os.environ, {"META_API_BASE": "https://x.test/v1"},
                             clear=False):
            s = Settings()
        self.assertEqual(s.meta_stt_endpoint, "https://x.test/v1/asr/transcribe")
        with mock.patch.dict(
            os.environ, {"META_STT_URL": "https://other.test/stt"}, clear=False
        ):
            s = Settings()
        self.assertEqual(s.meta_stt_endpoint, "https://other.test/stt")

    def test_legacy_env_keys_do_not_crash_startup(self):
        env = {"GROQ_API_KEY": "legacy-value", "META_API_KEY": "test-key"}
        with mock.patch.dict(os.environ, env, clear=False):
            s = Settings()
        self.assertEqual(s.meta_api_key, "test-key")
        self.assertFalse(hasattr(s, "groq_api_key"))

    def test_tts_flag_follows_key(self):
        with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": ""}, clear=False):
            self.assertFalse(Settings().tts_enabled)
        with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "k"}, clear=False):
            self.assertTrue(Settings().tts_enabled)


if __name__ == "__main__":
    unittest.main()
