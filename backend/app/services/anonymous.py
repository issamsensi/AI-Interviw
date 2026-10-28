import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def ensure_anonymous_user(db: AsyncSession, anonymous_id: str | None) -> User:
    if not anonymous_id:
        raise HTTPException(400, "Anonymous session ID is required")

    try:
        user_id = uuid.UUID(anonymous_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(400, "Invalid anonymous session ID")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        return user

    user = User(id=user_id)
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(503, "Could not establish anonymous session")
    return user
