import uuid
from datetime import datetime

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    resume_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("resumes.id"), nullable=True)
    role: Mapped[str] = mapped_column(String(255))
    seniority: Mapped[str] = mapped_column(String(50))
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=10)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="interviews")
    resume: Mapped["Resume | None"] = relationship("Resume", back_populates="interviews")
    questions: Mapped[list["Question"]] = relationship("Question", back_populates="interview", cascade="all, delete-orphan")
    answers: Mapped[list["Answer"]] = relationship("Answer", back_populates="interview", cascade="all, delete-orphan")
    evaluation: Mapped["Evaluation | None"] = relationship("Evaluation", back_populates="interview", uselist=False, cascade="all, delete-orphan")
    feedback: Mapped["FeedbackReport | None"] = relationship("FeedbackReport", back_populates="interview", uselist=False, cascade="all, delete-orphan")
