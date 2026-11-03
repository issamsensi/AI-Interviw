"""Identity resolution: Supabase accounts first, anonymous guests second.

A request carries either:
- ``Authorization: Bearer <Supabase JWT>`` for signed-in users, verified
  against the project's JWKS, or
- ``X-Anonymous-User-ID: <uuid>`` for guests (see services/anonymous.py).

When a signed-in request also carries a guest id, that guest's resumes and
interviews are claimed by the account so nothing is lost at sign-up.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException
from jwt import PyJWKClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.interview import Interview
from app.models.resume import Resume
from app.models.user import User
from app.services.anonymous import ensure_anonymous_user

logger = logging.getLogger(__name__)

_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(settings.supabase_jwks_url, cache_keys=True)
    return _jwk_client


def _verify_supabase_token(token: str) -> dict:
    """Blocking JWKS fetch/verify; call via asyncio.to_thread."""
    if not settings.supabase_url.strip():
        raise HTTPException(503, "Accounts are not configured on this server")
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
            issuer=settings.supabase_issuer,
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid or expired session. Please sign in again.")


async def _claim_guest_data(db: AsyncSession, guest_id: uuid.UUID, user: User) -> None:
    if guest_id == user.id:
        return
    result = await db.execute(select(User).where(User.id == guest_id))
    guest = result.scalar_one_or_none()
    if not guest or not guest.is_guest:
        return
    await db.execute(update(Resume).where(Resume.user_id == guest.id).values(user_id=user.id))
    await db.execute(update(Interview).where(Interview.user_id == guest.id).values(user_id=user.id))
    await db.execute(delete(User).where(User.id == guest.id))
    await db.flush()
    logger.info("Claimed guest %s data for account %s", guest.id, user.id)


async def resolve_user(
    db: AsyncSession,
    authorization: str | None,
    anonymous_id: str | None,
) -> User:
    """Return the account user for a Bearer token, else the guest user."""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        claims = await asyncio.to_thread(_verify_supabase_token, token)
        try:
            user_id = uuid.UUID(str(claims.get("sub")))
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(401, "Invalid session token")
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        email = claims.get("email")
        if user is None:
            user = User(id=user_id, email=email, is_guest=False)
            db.add(user)
            await db.flush()
        else:
            user.is_guest = False
            if email and user.email != email:
                user.email = email
        if anonymous_id:
            try:
                await _claim_guest_data(db, uuid.UUID(anonymous_id), user)
            except (ValueError, AttributeError, TypeError):
                pass  # A malformed guest id simply claims nothing.
        return user
    return await ensure_anonymous_user(db, anonymous_id)


async def claim_guest_trial(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Atomically consume the guest's one free interview.

    The conditional UPDATE is the race guard: two parallel starts cannot
    both flip trial_used_at from NULL. Commits immediately so the claim
    survives whatever the caller does next.
    """
    result = await db.execute(
        update(User)
        .where(User.id == user_id, User.trial_used_at.is_(None))
        .values(trial_used_at=datetime.now(timezone.utc))
    )
    claimed = (result.rowcount or 0) > 0
    await db.commit()
    return claimed


async def release_guest_trial(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Give the trial back when generation failed through no fault of the guest."""
    await db.execute(
        update(User).where(User.id == user_id).values(trial_used_at=None)
    )
    await db.commit()
