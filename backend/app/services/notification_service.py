from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.services.connection_manager import manager


async def notify(
    db: Session,
    *,
    user_id: int,
    type: str,
    message: str,
    project_id: int | None = None,
    pin_id: int | None = None,
) -> Notification:
    """Create a Notification row and push it to the user's live socket, if connected."""
    notification = Notification(
        user_id=user_id,
        type=type,
        message=message,
        project_id=project_id,
        pin_id=pin_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    await manager.send_to_user(
        user_id,
        {
            "event": "notification",
            "notification": {
                "id": notification.id,
                "type": notification.type,
                "message": notification.message,
                "project_id": notification.project_id,
                "pin_id": notification.pin_id,
                "read": notification.read,
                "created_at": notification.created_at.isoformat(),
            },
        },
    )
    return notification
