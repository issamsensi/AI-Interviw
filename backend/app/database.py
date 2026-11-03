from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


# Columns added after the first release. create_all never alters existing
# tables, so add what is missing (Alembic remains the long-term answer).
_USER_COLUMN_DDL = {
    "is_guest": "BOOLEAN NOT NULL DEFAULT TRUE",
    "trial_used_at": "TIMESTAMP WITH TIME ZONE",
    "target_role": "VARCHAR(255)",
}


def _add_missing_user_columns(sync_conn) -> None:
    inspector = inspect(sync_conn)
    if not inspector.has_table("users"):
        return
    existing = {col["name"] for col in inspector.get_columns("users")}
    for name, ddl in _USER_COLUMN_DDL.items():
        if name not in existing:
            sync_conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_user_columns)
