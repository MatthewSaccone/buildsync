from datetime import datetime

from sqlalchemy import Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Comment(Base):
    """A reply within a pin's or task's thread. Exactly one of pin_id/task_id is set."""

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    pin_id: Mapped[int | None] = mapped_column(ForeignKey("pins.id"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pin = relationship("Pin", back_populates="comments")
    task = relationship("Task", back_populates="comments")
    author = relationship("User", back_populates="comments")
    attachments = relationship("Attachment", back_populates="comment", cascade="all, delete-orphan")
