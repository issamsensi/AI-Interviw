import uuid
from datetime import datetime

from sqlalchemy import Text, DateTime, ForeignKey, func, Uuid, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FeedbackReport(Base):
    __tablename__ = "feedback_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("interviews.id"), unique=True)
    summary: Mapped[str] = mapped_column(Text)
    detailed_feedback: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    interview: Mapped["Interview"] = relationship("Interview", back_populates="feedback")
