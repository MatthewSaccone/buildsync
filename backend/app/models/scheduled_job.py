from datetime import datetime, timezone, timezone

from sqlalchemy import String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserRole, JobStatus


class ScheduledJob(Base):
    """A block of work assigned to a person on a project's calendar.

    Optionally linked to a Pin (so scheduling a punch-list item shows up on
    the calendar) and/or a Task (so a task's work can be blocked out on the
    calendar independently of its due_date), and optionally dependent on
    another ScheduledJob so that sequential trades (e.g. Foundation ->
    Framing -> Electrical) can be chained and flagged when out of order.
    """

    __tablename__ = "scheduled_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    pin_id: Mapped[int | None] = mapped_column(ForeignKey("pins.id"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    trade: Mapped[UserRole | None] = mapped_column(SAEnum(UserRole), nullable=True)
    status: Mapped[JobStatus] = mapped_column(SAEnum(JobStatus), default=JobStatus.SCHEDULED)

    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    depends_on_id: Mapped[int | None] = mapped_column(ForeignKey("scheduled_jobs.id"), nullable=True)

    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    project = relationship("Project", back_populates="scheduled_jobs")
    pin = relationship("Pin")
    task = relationship("Task", back_populates="scheduled_jobs")
    assignee = relationship("User", foreign_keys=[assigned_to_id])
    depends_on = relationship("ScheduledJob", remote_side=[id])
