import uuid
from datetime import datetime

from sqlalchemy import Text, DateTime, ForeignKey, Float, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("interviews.id"))
    question_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("questions.id"))
    text: Mapped[str] = mapped_column(Text)
    audio_duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    filler_word_count: Mapped[int | None] = mapped_column(Float, nullable=True)
    hesitation_count: Mapped[int | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    interview: Mapped["Interview"] = relationship("Interview", back_populates="answers")
    question: Mapped["Question"] = relationship("Question", back_populates="answer")
