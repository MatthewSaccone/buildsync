from sqlalchemy.orm import Session

from app.models.message import DirectMessage
from app.models.notification import Notification
from app.models.user import User
from app.schemas.schemas import DirectMessageOut
from app.services.connection_manager import manager


async def notify(
    db: Session,
    *,
    user_id: int,
    type: str,
    message: str,
    project_id: int | None = None,
    pin_id: int | None = None,
    task_id: int | None = None,
) -> Notification:
    """Create a Notification row and push it to the user's live socket, if connected."""
    notification = Notification(
        user_id=user_id,
        type=type,
        message=message,
        project_id=project_id,
        pin_id=pin_id,
        task_id=task_id,
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
                "task_id": notification.task_id,
                "read": notification.read,
                "created_at": notification.created_at.isoformat(),
            },
        },
    )
    return notification


async def notify_task_assignment(
    db: Session,
    *,
    task,  # app.models.task.Task — typed loosely to avoid a circular import
    assigner: User,
    assignee: User,
) -> None:
    """Fired when someone is assigned (or reassigned) to a task.

    Does two things, same as a person manually pinging a teammate would:
    1. Sends a private DM from the assigner to the assignee, referencing the
       task (so the chat UI can show a "View task" link/button on it).
    2. Creates a dedicated task_assignment notification carrying the same
       task_id, so the notification bell can offer its own "View task" link
       even if the person never opens the DM.

    No-ops if someone assigns a task to themselves — no need to DM or notify
    yourself.
    """
    if assignee.id == assigner.id:
        return

    dm_body = f'@{assignee.full_name} — {assigner.full_name} assigned you to the task "{task.title}".'

    message = DirectMessage(
        project_id=task.project_id,
        sender_id=assigner.id,
        recipient_id=assignee.id,
        body=dm_body,
        task_id=task.id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    # Same shape as a normal DM push in messages.py (nested sender object,
    # etc.) so the chat UI doesn't need a special case for auto-generated
    # assignment messages.
    message_payload = DirectMessageOut.model_validate(message).model_dump(mode="json")
    await manager.send_to_user(assignee.id, {"event": "message_created", "message": message_payload})
    await manager.send_to_user(assigner.id, {"event": "message_created", "message": message_payload})

    await notify(
        db,
        user_id=assignee.id,
        type="task_assignment",
        message=f'{assigner.full_name} assigned you a task: "{task.title}"',
        project_id=task.project_id,
        task_id=task.id,
    )
