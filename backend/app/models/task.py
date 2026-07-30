from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, Table, Column, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import PinPriority, TaskStatus

# Many-to-many: a task can reference several pins (e.g. "Frame first floor"
# might relate to three open pins on the framing sheet), and a pin can be
# referenced by more than one task.
task_pins = Table(
    "task_pins",
    Base.metadata,
    Column("task_id", ForeignKey("tasks.id"), primary_key=True),
    Column("pin_id", ForeignKey("pins.id"), primary_key=True),
)


class Task(Base):
    """A project-level to-do — not location-anchored like a Pin. Think of it
    as the Jira ticket; a Pin is closer to a marked-up drawing comment."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus), default=TaskStatus.TODO)
    priority: Mapped[PinPriority] = mapped_column(SAEnum(PinPriority), default=PinPriority.NORMAL)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project = relationship("Project", back_populates="tasks")
    owner = relationship("User", foreign_keys=[owner_id])
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="task", cascade="all, delete-orphan")
    related_pins = relationship("Pin", secondary=task_pins, back_populates="tasks")
