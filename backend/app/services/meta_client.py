"""Meta AI text-generation client (Meta Model API).

Verification status (verified live 2026-10-28 against api.meta.ai):
- ``muse-spark-1.3`` accepted; key authorization accepted (no 401).
- ``POST {base}/chat/completions`` with the OpenAI-compatible body
  sent here returns ``{"choices": [{"message": {"content": ...}}]}``.
- Operational note: this is a reasoning model. A tiny ``max_tokens``
  budget can be consumed by reasoning tokens, leaving ``content``
  null — which this module correctly reports as an invalid response.
  Normal budgets (default 1024+) return text as expected.

Consequences, by design:
- Base URL, chat path and model identifiers are all configurable via
  environment (``META_API_BASE``, ``META_CHAT_PATH``,
  ``META_MODEL_DEV`` / ``META_MODEL_PROD``, ``META_ENV``), so the
  deployment can be aligned with the credentialed docs without code
  changes.
- This module never returns silent empty results: every failure raises
  a typed exception that callers map to HTTP 502/504 responses.

Logging never includes keys, headers, prompts, or model outputs.
"""

import logging

import httpx
from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger(__name__)


class MetaClientError(Exception):
    """Base class for all Meta provider failures."""


class MetaConfigurationError(MetaClientError):
    """Local misconfiguration (e.g. missing API key)."""


class MetaAuthError(MetaClientError):
    """Provider rejected the credentials (HTTP 401/403)."""


class MetaRateLimitError(MetaClientError):
    """Provider rate limit hit (HTTP 429)."""


class MetaTimeoutError(MetaClientError):
    """Provider call timed out."""


class MetaInvalidResponseError(MetaClientError):
    """Provider returned invalid JSON or an unexpected payload shape."""


class MetaServerError(MetaClientError):
    """Provider returned an HTTP 5xx or another unexpected status."""


def resolve_model(model: str | None = None, env: str | None = None) -> str:
    """Return the model identifier to use.

    An explicit ``model`` argument wins; otherwise the ``META_ENV``
    setting selects ``META_MODEL_DEV`` (default) or ``META_MODEL_PROD``.
    """
    if model:
        return model
    selected_env = (env if env is not None else settings.meta_env).strip().lower()
    if selected_env == "prod":
        return settings.meta_model_prod
    return settings.meta_model_dev


def meta_error_to_http(exc: MetaClientError) -> HTTPException:
    """Map a provider exception to a safe, non-sensitive HTTP response."""
    if isinstance(exc, MetaTimeoutError):
        return HTTPException(504, "AI provider request timed out")
    if isinstance(exc, MetaConfigurationError):
        # Server-side misconfiguration; never expose which variable.
        return HTTPException(500, "AI service is not configured")
    if type(exc) is MetaClientError or isinstance(exc, MetaInvalidResponseError):
        return HTTPException(502, "AI provider returned invalid data")
    if isinstance(exc, (MetaAuthError, MetaRateLimitError, MetaServerError)):
        return HTTPException(502, "AI provider request failed")
    return HTTPException(502, "AI provider request failed")


def clean_llm_response(text: str) -> str:
    """Strip code fences / language tags models sometimes add."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    if text.startswith("json"):
        text = text[4:]
    return text.strip()


def _parse_chat_content(payload: object) -> str:
    if not isinstance(payload, dict):
        raise MetaInvalidResponseError("Unexpected chat response shape")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise MetaInvalidResponseError("Chat response has no choices")
    first = choices[0]
    if not isinstance(first, dict):
        raise MetaInvalidResponseError("Unexpected chat choice shape")
    message = first.get("message", first)
    if not isinstance(message, dict):
        raise MetaInvalidResponseError("Unexpected chat message shape")
    content = message.get("content")
    if isinstance(content, list):
        content = "".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") != "image_url"
        )
    if not isinstance(content, str) or not content.strip():
        raise MetaInvalidResponseError("Chat response has no text content")
    return clean_llm_response(content)


async def meta_chat(
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    transport: httpx.AsyncBaseTransport | None = None,
) -> str:
    """Send a system/user prompt pair to the Meta chat API.

    The ``transport`` argument exists only as a test seam; production
    callers must not pass it.

    Raises:
        MetaConfigurationError: ``META_API_KEY`` is not set.
        MetaAuthError: credentials rejected (401/403).
        MetaRateLimitError: rate limited (429).
        MetaTimeoutError: request timed out.
        MetaInvalidResponseError: bad JSON or unexpected payload.
        MetaServerError: other provider-side failures.
    """
    api_key = settings.meta_api_key.strip()
    if not api_key:
        raise MetaConfigurationError("META_API_KEY is not set")

    resolved_model = resolve_model(model)
    url = settings.meta_chat_url
    timeout = settings.meta_request_timeout_seconds

    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": "Bearer " + api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "model": resolved_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
    except (httpx.TimeoutException, TimeoutError) as e:
        logger.warning("Meta chat request timed out (model=%s)", resolved_model)
        raise MetaTimeoutError("Meta chat request timed out") from e
    except httpx.HTTPError as e:
        logger.warning("Meta chat transport error: %s", type(e).__name__)
        raise MetaServerError("Meta chat transport failed") from e

    status = response.status_code
    if status in (401, 403):
        logger.warning("Meta chat rejected credentials (status=%s)", status)
        raise MetaAuthError("Meta chat credentials rejected")
    if status == 429:
        logger.warning("Meta chat rate limited")
        raise MetaRateLimitError("Meta chat rate limited")
    if status < 200 or status >= 300:
        logger.warning("Meta chat failed (status=%s)", status)
        raise MetaServerError(f"Meta chat failed with status {status}")

    try:
        payload = response.json()
    except ValueError as e:
        logger.warning("Meta chat returned invalid JSON")
        raise MetaInvalidResponseError("Meta chat returned invalid JSON") from e

    return _parse_chat_content(payload)
