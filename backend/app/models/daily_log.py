from datetime import datetime, timezone, date as date_type

from sqlalchemy import String, Text, Integer, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.types import UTCDateTime


class DailyLog(Base):
    """A single day's construction report for a project (BS-301). One log
    per project per calendar date -- see the unique constraint below.
    Weather is free text rather than an enum since site conditions ("light
    rain AM, cleared by noon") don't fit cleanly into fixed categories."""

    __tablename__ = "daily_logs"
    __table_args__ = (UniqueConstraint("project_id", "log_date", name="uq_daily_log_project_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)

    log_date: Mapped[date_type] = mapped_column(Date, nullable=False, index=True)
    weather: Mapped[str | None] = mapped_column(String(255), nullable=True)
    crew: Mapped[str | None] = mapped_column(Text, nullable=True)
    hours_worked: Mapped[float | None] = mapped_column(nullable=True)
    completed_work: Mapped[str | None] = mapped_column(Text, nullable=True)
    delays: Mapped[str | None] = mapped_column(Text, nullable=True)
    visitors: Mapped[str | None] = mapped_column(Text, nullable=True)
    safety_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    project = relationship("Project", back_populates="daily_logs")
    created_by = relationship("User", foreign_keys=[created_by_id])
