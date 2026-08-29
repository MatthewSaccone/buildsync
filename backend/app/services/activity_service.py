from sqlalchemy.orm import Session

from app.models.activity_event import ActivityEvent
from app.models.user import User
from app.schemas.schemas import ActivityEventOut
from app.services.connection_manager import manager


class ActivityKind:
    """The 7 BS-201 subticket event types, plus PIN_CREATED / COMMENT_ADDED
    which were the original ad-hoc "recent activity" entries."""

    PIN_CREATED = "pin_created"
    COMMENT_ADDED = "comment_added"
    TASK_COMPLETED = "task_completed"
    COST_ADDED = "cost_added"
    SHEET_UPLOADED = "sheet_uploaded"
    CHAT_MESSAGE = "chat_message"
    MEMBER_JOINED = "member_joined"
    DAILY_LOG_CREATED = "daily_log_created"


async def log_activity(
    db: Session,
    project_id: int,
    kind: str,
    message: str,
    actor: User | None,
    extra: dict | None = None,
) -> ActivityEvent:
    """Persists a project activity event and pushes it live over the
    project's websocket. Every BS-201 subticket funnels through here so the
    timeline has one consistent, generic shape regardless of source."""

    event = ActivityEvent(
        project_id=project_id,
        kind=kind,
        message=message,
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "System",
        extra=extra,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    await manager.broadcast_to_project(
        project_id,
        {
            "event": "activity_created",
            "activity": ActivityEventOut.model_validate(event).model_dump(mode="json"),
        },
    )
    return event
