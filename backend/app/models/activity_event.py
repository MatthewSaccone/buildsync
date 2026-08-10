from datetime import datetime, timezone

from sqlalchemy import String, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.types import UTCDateTime


class ActivityEvent(Base):
    """A single persisted entry in a project's activity timeline (BS-201).

    Generic by design so any subsystem can log an event without a schema
    change: `kind` identifies the event type (see ACTIVITY_KINDS in
    activity_service.py), `message` is the pre-rendered human-readable
    summary, and `extra` carries whatever kind-specific ids/fields the
    frontend needs to link back to the source object (pin_id, task_id,
    sheet_id, amount, etc). Nothing here is required to be non-null except
    the fields every event has in common.
    """

    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(64), index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Denormalized so the timeline still reads correctly even if the actor
    # later leaves the project or changes their name.
    actor_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Kind-specific payload, e.g. {"pin_id": 4, "sheet_id": 2} or
    # {"task_id": 9} or {"amount": 240.5}. Optional and freeform on purpose.
    extra: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), index=True
    )

    project = relationship("Project")
    actor = relationship("User")
