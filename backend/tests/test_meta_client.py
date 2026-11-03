"""Tests for the Meta text-generation client.

Uses httpx.MockTransport: no network, no credentials required.
"""

import json
import unittest
from unittest import mock

import httpx

from app.config import settings
from app.services import meta_client
from app.services.meta_client import (
    MetaAuthError,
    MetaConfigurationError,
    MetaInvalidResponseError,
    MetaRateLimitError,
    MetaServerError,
    MetaTimeoutError,
    clean_llm_response,
    meta_chat,
    meta_error_to_http,
    resolve_model,
)

TEST_KEY = "test-key-not-a-secret"


def patch_meta(key=TEST_KEY, env="dev", dev="muse-spark-1.3", prod="muse-spark-1.3"):
    return (
        mock.patch.object(settings, "meta_api_key", key),
        mock.patch.object(settings, "meta_env", env),
        mock.patch.object(settings, "meta_model_dev", dev),
        mock.patch.object(settings, "meta_model_prod", prod),
    )


def run_patches(patches):
    for p in patches:
        p.start()


def stop_patches(patches):
    for p in patches:
        p.stop()


def transport_for(handler):
    return httpx.MockTransport(handler)


def ok_response(request: httpx.Request, content: str = '{"a": 1}', status: int = 200):
    return httpx.Response(status, json={
        "choices": [{"message": {"role": "assistant", "content": content}}],
    })


class ResolveModelTests(unittest.TestCase):
    def test_dev_default(self):
        patches = patch_meta(env="dev")
        run_patches(patches)
        try:
            self.assertEqual(resolve_model(), "muse-spark-1.3")
        finally:
            stop_patches(patches)

    def test_prod_selects_prod_model(self):
        patches = patch_meta(env="prod", prod="muse-spark-9.9")
        run_patches(patches)
        try:
            self.assertEqual(resolve_model(), "muse-spark-9.9")
        finally:
            stop_patches(patches)

    def test_explicit_model_wins(self):
        patches = patch_meta(env="prod", prod="muse-spark-9.9")
        run_patches(patches)
        try:
            self.assertEqual(resolve_model(model="custom-model"), "custom-model")
        finally:
            stop_patches(patches)


class CleanResponseTests(unittest.TestCase):
    def test_strips_fences(self):
        self.assertEqual(
            clean_llm_response('```json\n{"a": 1}\n```'), '{"a": 1}'
        )

    def test_plain_passthrough(self):
        self.assertEqual(clean_llm_response('{"a": 1}'), '{"a": 1}')


class MetaChatTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_returns_content(self):
        patches = patch_meta()
        run_patches(patches)
        try:
            transport = transport_for(
                lambda req: ok_response(req, '```json\n{"ok": true}\n```')
            )
            result = await meta_chat("sys", "user", transport=transport)
            self.assertEqual(result, '{"ok": true}')
        finally:
            stop_patches(patches)

    async def test_sends_bearer_and_model(self):
        patches = patch_meta()
        run_patches(patches)
        seen = {}
        try:
            def handler(req: httpx.Request):
                seen["model"] = json.loads(req.content)["model"]
                return ok_response(req, "hi")

            await meta_chat("sys", "user", transport=transport_for(handler))
            self.assertEqual(seen["model"], "muse-spark-1.3")
        finally:
            stop_patches(patches)

    async def test_missing_key_raises_without_http(self):
        patches = patch_meta(key="")
        run_patches(patches)
        try:
            def handler(req: httpx.Request):
                raise AssertionError("no HTTP call expected")

            with self.assertRaises(MetaConfigurationError):
                await meta_chat("sys", "user", transport=transport_for(handler))
        finally:
            stop_patches(patches)

    async def test_401_maps_to_auth_error(self):
        patches = patch_meta()
        run_patches(patches)
        try:
            transport = transport_for(lambda req: httpx.Response(401, json={}))
            with self.assertRaises(MetaAuthError):
                await meta_chat("sys", "user", transport=transport)
        finally:
            stop_patches(patches)

    async def test_429_maps_to_rate_limit(self):
        patches = patch_meta()
        run_patches(patches)
        try:
            transport = transport_for(lambda req: httpx.Response(429, json={}))
            with self.assertRaises(MetaRateLimitError):
                await meta_chat("sys", "user", transport=transport)
        finally:
            stop_patches(patches)

    async def test_500_maps_to_server_error(self):
        patches = patch_meta()
        run_patches(patches)
        try:
            transport = transport_for(lambda req: httpx.Response(500, json={}))
            with self.assertRaises(MetaServerError):
                await meta_chat("sys", "user", transport=transport)
        finally:
            stop_patches(patches)

    async def test_timeout_maps_to_timeout_error(self):
        patches = patch_meta()
        run_patches(patches)
        try:
            def handler(req: httpx.Request):
                raise httpx.ReadTimeout("slow")

            with self.assertRaises(MetaTimeoutError):
                await meta_chat("sys", "user", transport=transport_for(handler))
        finally:
            stop_patches(patches)

    async def test_invalid_json_maps_to_invalid_response(self):
        patches = patch_meta()
        run_patches(patches)
        try:
            transport = transport_for(
                lambda req: httpx.Response(200, content=b"not json")
            )
            with self.assertRaises(MetaInvalidResponseError):
                await meta_chat("sys", "user", transport=transport)
        finally:
            stop_patches(patches)

    async def test_empty_choices_maps_to_invalid_response(self):
        patches = patch_meta()
        run_patches(patches)
        try:
            transport = transport_for(
                lambda req: httpx.Response(200, json={"choices": []})
            )
            with self.assertRaises(MetaInvalidResponseError):
                await meta_chat("sys", "user", transport=transport)
        finally:
            stop_patches(patches)

    async def test_empty_content_maps_to_invalid_response(self):
        patches = patch_meta()
        run_patches(patches)
        try:
            transport = transport_for(lambda req: ok_response(req, "   "))
            with self.assertRaises(MetaInvalidResponseError):
                await meta_chat("sys", "user", transport=transport)
        finally:
            stop_patches(patches)


class ErrorMappingTests(unittest.TestCase):
    def test_timeout_is_504(self):
        exc = meta_error_to_http(MetaTimeoutError("x"))
        self.assertEqual(exc.status_code, 504)

    def test_auth_is_502_without_leak(self):
        exc = meta_error_to_http(MetaAuthError("bad key " + TEST_KEY))
        self.assertEqual(exc.status_code, 502)
        self.assertNotIn(TEST_KEY, str(exc.detail))

    def test_rate_limit_is_502(self):
        self.assertEqual(meta_error_to_http(MetaRateLimitError("x")).status_code, 502)

    def test_server_is_502(self):
        self.assertEqual(meta_error_to_http(MetaServerError("x")).status_code, 502)

    def test_invalid_response_is_502(self):
        self.assertEqual(
            meta_error_to_http(MetaInvalidResponseError("x")).status_code, 502
        )

    def test_config_is_500_without_leak(self):
        exc = meta_error_to_http(MetaConfigurationError("META_API_KEY missing"))
        self.assertEqual(exc.status_code, 500)
        self.assertNotIn("META_API_KEY", str(exc.detail))


class SchemaCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    """Canned provider outputs must validate against existing schemas."""

    async def test_outputs_parse_into_schemas(self):
        from app.schemas.ai import Evaluation, FollowUpResponse, InterviewPlan, ResumeAnalysis

        patches = patch_meta()
        run_patches(patches)
        try:
            canned = {
                "resume": '{"skills": ["python"], "projects": [], "experience": [], '
                          '"education": [], "tech_stack": ["python"]}',
                "plan": '{"questions": [{"text": "Tell me about yourself", '
                        '"category": "behavioral", "order": 0}], "strategy": "s"}',
                "followup": '{"next_action": "proceed", "response": "ok", '
                            '"next_question": "Why?"}',
                "eval": '{"overall_score": 80, "strengths": ["a"], '
                        '"weaknesses": ["b"], "suggestions": ["c"], '
                        '"question_scores": {"q": 80}}',
            }

            async def chat_returning(payload: str) -> str:
                transport = transport_for(lambda req: ok_response(req, payload))
                return await meta_client.meta_chat("s", "u", transport=transport)

            resume = ResumeAnalysis.model_validate_json(await chat_returning(canned["resume"]))
            self.assertEqual(resume.skills, ["python"])
            plan = InterviewPlan.model_validate_json(await chat_returning(canned["plan"]))
            self.assertEqual(len(plan.questions), 1)
            follow = FollowUpResponse.model_validate_json(await chat_returning(canned["followup"]))
            self.assertEqual(follow.next_action, "proceed")
            evaluation = Evaluation.model_validate_json(await chat_returning(canned["eval"]))
            self.assertEqual(evaluation.overall_score, 80)
        finally:
            stop_patches(patches)


if __name__ == "__main__":
    unittest.main()
