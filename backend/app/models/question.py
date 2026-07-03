import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("interviews.id"))
    text: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(100), default="general")
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    interview: Mapped["Interview"] = relationship("Interview", back_populates="questions")
    answer: Mapped["Answer | None"] = relationship("Answer", back_populates="question", uselist=False, cascade="all, delete-orphan")
