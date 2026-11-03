"""Deprecated compatibility shim.

``groq_chat`` used to call Groq directly. It now delegates to the
provider-independent Meta client (:mod:`app.services.meta_client`) with
the same call signature. New code must import from ``meta_client``.
This module imports nothing from the ``groq`` package.
"""

import warnings

from app.services.meta_client import (
    MetaAuthError,
    MetaClientError,
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

__all__ = [
    "MetaAuthError",
    "MetaClientError",
    "MetaConfigurationError",
    "MetaInvalidResponseError",
    "MetaRateLimitError",
    "MetaServerError",
    "MetaTimeoutError",
    "clean_llm_response",
    "groq_chat",
    "meta_chat",
    "meta_error_to_http",
    "resolve_model",
]


async def groq_chat(
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    warnings.warn(
        "groq_chat is deprecated; use app.services.meta_client.meta_chat",
        DeprecationWarning,
        stacklevel=2,
    )
    return await meta_chat(
        system_prompt,
        user_prompt,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
