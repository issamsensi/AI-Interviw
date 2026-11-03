import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, DateTime, func, true, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    # True for anonymous browser guests, False once a Supabase account exists.
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), nullable=False)
    # Set when the guest's one free interview is claimed (see services/auth.py).
    trial_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # Role the user is preparing for, shown on their profile.
    target_role: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    interviews: Mapped[list["Interview"]] = relationship("Interview", back_populates="user", cascade="all, delete-orphan")
    resumes: Mapped[list["Resume"]] = relationship("Resume", back_populates="user", cascade="all, delete-orphan")
