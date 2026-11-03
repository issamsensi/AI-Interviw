"""Route-level workflow tests (REST only, no network, no credentials).

Covers: upload -> extract -> analyze -> start -> submit -> end -> report,
plus provider-failure behavior (502/504, no empty evaluations, answers
kept) and evaluation idempotency.

Transport note: requests go through httpx.ASGITransport in the test's
own event loop (not starlette TestClient), because TestClient runs the
app in a portal thread and pooled aiosqlite connections are bound to
the loop that created them. Lifespan is never started, and all DB
access goes through dependency_overrides into a throwaway SQLite file,
so the local interview.db is never touched.
"""

import tempfile
import unittest
import uuid
from unittest import mock

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401  (register all tables on Base)
from app import main as main_module
from app.database import Base, get_db
from app.services.meta_client import MetaServerError, MetaTimeoutError

RESUME_JSON = (
    '{"skills": ["python"], "projects": [], "experience": [], '
    '"education": [], "tech_stack": ["python"]}'
)
PLAN_JSON = (
    '{"questions": ['
    '{"text": "Tell me about yourself", "category": "behavioral", "order": 0}, '
    '{"text": "Describe a tough bug", "category": "technical", "order": 1}'
    '], "strategy": "test strategy"}'
)
EVAL_JSON = (
    '{"overall_score": 80, "strengths": ["clear"], '
    '"weaknesses": ["long answers"], "suggestions": ["be concise"], '
    '"question_scores": {"Tell me about yourself": 85}}'
)


class WorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="aiw-test-")
        url = f"sqlite+aiosqlite:///{self.tmp.name}/test.db"
        self.engine = create_async_engine(url)
        session_factory = async_sessionmaker(self.engine, class_=AsyncSession)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async def override_db():
            async with session_factory() as session:
                yield session

        main_module.app.dependency_overrides[get_db] = override_db
        transport = httpx.ASGITransport(app=main_module.app)
        self.client = httpx.AsyncClient(
            transport=transport, base_url="http://test"
        )
        await self.client.__aenter__()
        self.anon = {"X-Anonymous-User-ID": str(uuid.uuid4())}

    async def asyncTearDown(self):
        await self.client.__aexit__(None, None, None)
        main_module.app.dependency_overrides.clear()
        await self.engine.dispose()
        self.tmp.cleanup()

    # -- helpers ------------------------------------------------------
    async def upload_resume(self):
        with mock.patch(
            "app.routes.resume.extract_text", return_value="Jane Doe\nPython dev"
        ):
            resp = await self.client.post(
                "/api/upload-resume",
                files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        return resp.json()["resume_id"]

    async def analyze_resume(self, resume_id, payload=RESUME_JSON):
        with mock.patch("app.routes.resume.meta_chat", return_value=payload):
            return await self.client.post(
                "/api/analyze-resume",
                params={"resume_id": resume_id},
                headers=self.anon,
            )

    async def start_interview(self, resume_id, payload=PLAN_JSON):
        with mock.patch("app.routes.interview.meta_chat", return_value=payload):
            return await self.client.post(
                "/api/start-interview",
                json={"resume_id": resume_id, "role": "backend dev",
                      "seniority": "mid"},
                headers=self.anon,
            )

    async def end_interview(self, interview_id, payload=EVAL_JSON):
        with mock.patch(
            "app.routes.interview.meta_chat", return_value=payload
        ) as provider:
            resp = await self.client.post(
                "/api/end-interview", json={"interview_id": interview_id}
            )
        return resp, provider

    async def question_ids(self, interview_id):
        report = (
            await self.client.get(f"/api/report/{interview_id}")
        ).json()
        return [q["question_id"] for q in report["qa_pairs"]]

    # -- tests ---------------------------------------------------------
    async def test_happy_path_end_to_end(self):
        resume_id = await self.upload_resume()
        resp = await self.analyze_resume(resume_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["analysis"]["skills"], ["python"])

        resp = await self.start_interview(resume_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        interview_id = resp.json()["interview_id"]
        self.assertEqual(resp.json()["question_count"], 2)

        for qid in await self.question_ids(interview_id):
            resp = await self.client.post(
                "/api/submit-answer",
                json={"interview_id": interview_id, "question_id": qid,
                      "text": "My answer"},
            )
            self.assertEqual(resp.status_code, 200, resp.text)

        resp, _ = await self.end_interview(interview_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["evaluation"]["overall_score"], 80)

        report = (await self.client.get(f"/api/report/{interview_id}")).json()
        self.assertEqual(report["status"], "completed")
        self.assertEqual(report["evaluation"]["overall_score"], 80)
        self.assertEqual(
            [q["answer"] for q in report["qa_pairs"]], ["My answer", "My answer"]
        )

    async def test_end_interview_is_idempotent(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        interview_id = (await self.start_interview(resume_id)).json()["interview_id"]
        qid = (await self.question_ids(interview_id))[0]
        await self.client.post(
            "/api/submit-answer",
            json={"interview_id": interview_id, "question_id": qid, "text": "A"},
        )
        _, first = await self.end_interview(interview_id)
        self.assertEqual(first.call_count, 1)
        resp, second = await self.end_interview(interview_id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(second.call_count, 0)
        self.assertEqual(resp.json()["evaluation"]["overall_score"], 80)

    async def test_end_without_answers_is_422_and_creates_nothing(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        interview_id = (await self.start_interview(resume_id)).json()["interview_id"]
        resp, provider = await self.end_interview(interview_id)
        self.assertEqual(resp.status_code, 422)
        self.assertEqual(provider.call_count, 0)
        report = (await self.client.get(f"/api/report/{interview_id}")).json()
        self.assertIsNone(report["evaluation"])

    async def test_failed_eval_keeps_answers_and_retries_cleanly(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        interview_id = (await self.start_interview(resume_id)).json()["interview_id"]
        qid = (await self.question_ids(interview_id))[0]
        await self.client.post(
            "/api/submit-answer",
            json={"interview_id": interview_id, "question_id": qid, "text": "Kept"},
        )
        with mock.patch(
            "app.routes.interview.meta_chat", side_effect=MetaServerError("down")
        ):
            resp = await self.client.post(
                "/api/end-interview", json={"interview_id": interview_id}
            )
        self.assertEqual(resp.status_code, 502)
        report = (await self.client.get(f"/api/report/{interview_id}")).json()
        self.assertIsNone(report["evaluation"])
        self.assertEqual(report["qa_pairs"][0]["answer"], "Kept")

        resp, _ = await self.end_interview(interview_id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["evaluation"]["overall_score"], 80)

    async def test_provider_timeout_at_end_is_504(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        interview_id = (await self.start_interview(resume_id)).json()["interview_id"]
        qid = (await self.question_ids(interview_id))[0]
        await self.client.post(
            "/api/submit-answer",
            json={"interview_id": interview_id, "question_id": qid, "text": "A"},
        )
        with mock.patch(
            "app.routes.interview.meta_chat", side_effect=MetaTimeoutError("slow")
        ):
            resp = await self.client.post(
                "/api/end-interview", json={"interview_id": interview_id}
            )
        self.assertEqual(resp.status_code, 504)

    async def test_analyze_failure_is_502_and_interview_still_starts(self):
        resume_id = await self.upload_resume()
        with mock.patch(
            "app.routes.resume.meta_chat", side_effect=MetaServerError("down")
        ):
            resp = await self.client.post(
                "/api/analyze-resume",
                params={"resume_id": resume_id},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 502)
        resp = await self.start_interview(resume_id)
        self.assertEqual(resp.status_code, 200, resp.text)

    async def test_analyze_retries_truncated_output_once(self):
        resume_id = await self.upload_resume()
        with mock.patch(
            "app.routes.resume.meta_chat",
            side_effect=['{"skills": ["py', RESUME_JSON],
        ) as provider:
            resp = await self.client.post(
                "/api/analyze-resume",
                params={"resume_id": resume_id},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(resp.json()["analysis"]["skills"], ["python"])

    async def test_analyze_retry_exhausted_stores_nothing(self):
        resume_id = await self.upload_resume()
        with mock.patch(
            "app.routes.resume.meta_chat", side_effect=["bad1", "bad2"]
        ) as provider:
            resp = await self.client.post(
                "/api/analyze-resume",
                params={"resume_id": resume_id},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(provider.call_count, 2)
        # Nothing persisted: interview creation still works with empty profile.
        resp = await self.start_interview(resume_id)
        self.assertEqual(resp.status_code, 200, resp.text)

    async def test_start_failure_is_502(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        with mock.patch(
            "app.routes.interview.meta_chat", side_effect=MetaServerError("down")
        ):
            resp = await self.client.post(
                "/api/start-interview",
                json={"resume_id": resume_id, "role": "backend dev"},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 502)

    async def test_start_passes_type_and_count_to_provider(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        seen = {}

        async def capture(system_prompt, user_prompt, **kwargs):
            seen["prompt"] = user_prompt
            return PLAN_JSON

        with mock.patch("app.routes.interview.meta_chat", side_effect=capture):
            resp = await self.client.post(
                "/api/start-interview",
                json={"resume_id": resume_id, "role": "backend dev",
                      "seniority": "mid", "interview_type": "behavioral",
                      "question_count": 4, "duration_minutes": 10},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertIn('"interview_type": "behavioral"', seen["prompt"])
        self.assertIn('"question_count": 4', seen["prompt"])
        self.assertEqual(resp.json()["interview_type"], "behavioral")

    async def test_start_rejects_unknown_type_without_calling_provider(self):
        resume_id = await self.upload_resume()
        with mock.patch("app.routes.interview.meta_chat") as provider:
            resp = await self.client.post(
                "/api/start-interview",
                json={"resume_id": resume_id, "role": "x",
                      "interview_type": "coding_challenge"},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(provider.call_count, 0)

    async def test_start_default_count_derives_from_duration(self):
        resume_id = await self.upload_resume()
        seen = {}

        async def capture(system_prompt, user_prompt, **kwargs):
            seen["prompt"] = user_prompt
            return PLAN_JSON

        with mock.patch("app.routes.interview.meta_chat", side_effect=capture):
            resp = await self.client.post(
                "/api/start-interview",
                json={"resume_id": resume_id, "role": "x", "duration_minutes": 20},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        # Guests are clamped to the trial size (5 questions), even when the
        # requested duration would derive more.
        self.assertIn('"question_count": 5', seen["prompt"])

    async def test_start_rejects_bad_question_count(self):
        resume_id = await self.upload_resume()
        with mock.patch("app.routes.interview.meta_chat") as provider:
            resp = await self.client.post(
                "/api/start-interview",
                json={"resume_id": resume_id, "role": "x", "question_count": 99},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(provider.call_count, 0)

    async def test_submit_answer_validation(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        interview_id = (await self.start_interview(resume_id)).json()["interview_id"]

        resp = await self.client.post("/api/submit-answer", json={})
        self.assertEqual(resp.status_code, 400)

        resp = await self.client.post(
            "/api/submit-answer",
            json={"interview_id": interview_id,
                  "question_id": str(uuid.uuid4()), "text": "x"},
        )
        self.assertEqual(resp.status_code, 404)

        qid = (await self.question_ids(interview_id))[0]
        resp = await self.client.post(
            "/api/submit-answer",
            json={"interview_id": interview_id, "question_id": qid, "text": "  "},
        )
        self.assertEqual(resp.status_code, 422)

    async def test_transcribe_success(self):
        with mock.patch(
            "app.routes.interview.transcribe_audio", return_value="bonjour"
        ):
            resp = await self.client.post(
                "/api/transcribe",
                files={"file": ("answer.wav", b"RIFF....", "audio/wav")},
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json(), {"text": "bonjour"})

    async def test_transcribe_invalid_audio_is_422(self):
        from app.services.stt import STTValidationError

        with mock.patch(
            "app.routes.interview.transcribe_audio",
            side_effect=STTValidationError("bad audio"),
        ):
            resp = await self.client.post(
                "/api/transcribe",
                files={"file": ("answer.wav", b"garbage", "audio/wav")},
            )
        self.assertEqual(resp.status_code, 422)

    async def test_transcribe_provider_error_is_502(self):
        from app.services.stt import STTProviderError

        with mock.patch(
            "app.routes.interview.transcribe_audio",
            side_effect=STTProviderError("down"),
        ):
            resp = await self.client.post(
                "/api/transcribe",
                files={"file": ("answer.wav", b"RIFF....", "audio/wav")},
            )
        self.assertEqual(resp.status_code, 502)

    async def test_eval_retries_malformed_output_once(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        interview_id = (await self.start_interview(resume_id)).json()["interview_id"]
        qid = (await self.question_ids(interview_id))[0]
        await self.client.post(
            "/api/submit-answer",
            json={"interview_id": interview_id, "question_id": qid, "text": "A"},
        )
        with mock.patch(
            "app.routes.interview.meta_chat", side_effect=["not json", EVAL_JSON]
        ) as provider:
            resp = await self.client.post(
                "/api/end-interview", json={"interview_id": interview_id}
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(resp.json()["evaluation"]["overall_score"], 80)

    async def test_eval_retry_exhausted_creates_nothing(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        interview_id = (await self.start_interview(resume_id)).json()["interview_id"]
        qid = (await self.question_ids(interview_id))[0]
        await self.client.post(
            "/api/submit-answer",
            json={"interview_id": interview_id, "question_id": qid, "text": "A"},
        )
        with mock.patch(
            "app.routes.interview.meta_chat", side_effect=["bad1", "bad2"]
        ) as provider:
            resp = await self.client.post(
                "/api/end-interview", json={"interview_id": interview_id}
            )
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(provider.call_count, 2)
        report = (await self.client.get(f"/api/report/{interview_id}")).json()
        self.assertIsNone(report["evaluation"])

    async def test_guest_gets_one_trial_then_is_blocked(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        resp = await self.start_interview(resume_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        resp = await self.start_interview(resume_id)
        self.assertEqual(resp.status_code, 403, resp.text)
        self.assertEqual(resp.json()["detail"]["code"], "GUEST_TRIAL_USED")

    async def test_guest_trial_is_released_when_generation_fails(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        with mock.patch(
            "app.routes.interview.meta_chat",
            side_effect=MetaServerError("down"),
        ):
            resp = await self.client.post(
                "/api/start-interview",
                json={"resume_id": resume_id, "role": "backend dev",
                      "seniority": "mid"},
                headers=self.anon,
            )
        self.assertEqual(resp.status_code, 502, resp.text)
        resp = await self.start_interview(resume_id)
        self.assertEqual(resp.status_code, 200, resp.text)

    async def test_signed_in_user_claims_guest_data_and_skips_trial(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        account_id = str(uuid.uuid4())
        claims = {"sub": account_id, "email": "jane@example.com"}
        with mock.patch(
            "app.services.auth._verify_supabase_token", return_value=claims
        ):
            headers = {**self.anon, "Authorization": "Bearer test-token"}
            for _ in range(2):
                with mock.patch(
                    "app.routes.interview.meta_chat", return_value=PLAN_JSON
                ):
                    resp = await self.client.post(
                        "/api/start-interview",
                        json={"resume_id": resume_id, "role": "backend dev",
                              "seniority": "mid"},
                        headers=headers,
                    )
                self.assertEqual(resp.status_code, 200, resp.text)

    async def test_profile_blocks_guests(self):
        resp = await self.client.get("/api/profile", headers=self.anon)
        self.assertEqual(resp.status_code, 403, resp.text)
        self.assertEqual(resp.json()["detail"]["code"], "AUTH_REQUIRED")

    async def test_profile_returns_account_data_and_updates_details(self):
        resume_id = await self.upload_resume()
        await self.analyze_resume(resume_id)
        interview_id = (await self.start_interview(resume_id)).json()["interview_id"]
        qid = (await self.question_ids(interview_id))[0]
        await self.client.post(
            "/api/submit-answer",
            json={"interview_id": interview_id, "question_id": qid, "text": "A"},
        )
        await self.end_interview(interview_id)

        claims = {"sub": str(uuid.uuid4()), "email": "jane@example.com"}
        with mock.patch(
            "app.services.auth._verify_supabase_token", return_value=claims
        ):
            headers = {**self.anon, "Authorization": "Bearer [REDACTED]"}
            resp = await self.client.get("/api/profile", headers=headers)
            self.assertEqual(resp.status_code, 200, resp.text)
            data = resp.json()
            self.assertEqual(data["user"]["email"], "jane@example.com")
            self.assertEqual(len(data["resumes"]), 1)
            self.assertEqual(len(data["interviews"]), 1)
            self.assertEqual(data["interviews"][0]["score"], 80)
            self.assertEqual(data["stats"]["average_score"], 80)

            resp = await self.client.patch(
                "/api/profile",
                json={"name": "Jane Doe", "target_role": "Backend Developer"},
                headers=headers,
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            self.assertEqual(resp.json()["name"], "Jane Doe")
            self.assertEqual(resp.json()["target_role"], "Backend Developer")

    async def test_upload_rejects_unsupported_type(self):
        resp = await self.client.post(
            "/api/upload-resume",
            files={"file": ("cv.txt", b"hello", "text/plain")},
            headers=self.anon,
        )
        self.assertEqual(resp.status_code, 415)


if __name__ == "__main__":
    unittest.main()
