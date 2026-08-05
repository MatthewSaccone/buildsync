from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.message import DirectMessage
from app.models.project import ProjectMember
from app.models.user import User
from app.schemas.schemas import MessageCreate, DirectMessageOut, ConversationOut
from app.services.connection_manager import manager
from app.services.mentions import parse_mentioned_users
from app.services.notification_service import notify

router = APIRouter(prefix="/projects/{project_id}", tags=["messages"])


def _require_membership(db: Session, project_id: int, user_id: int) -> ProjectMember:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return membership


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """One entry per other project member — including members you haven't
    messaged yet, so the chat UI can list everyone you *can* talk to."""
    _require_membership(db, project_id, user.id)

    other_members = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id != user.id)
        .all()
    )

    conversations: list[ConversationOut] = []
    for member in other_members:
        other_id = member.user_id
        last_message = (
            db.query(DirectMessage)
            .filter(
                DirectMessage.project_id == project_id,
                or_(
                    and_(DirectMessage.sender_id == user.id, DirectMessage.recipient_id == other_id),
                    and_(DirectMessage.sender_id == other_id, DirectMessage.recipient_id == user.id),
                ),
            )
            .order_by(DirectMessage.created_at.desc())
            .first()
        )
        unread_count = (
            db.query(DirectMessage)
            .filter(
                DirectMessage.project_id == project_id,
                DirectMessage.sender_id == other_id,
                DirectMessage.recipient_id == user.id,
                DirectMessage.read_at.is_(None),
            )
            .count()
        )
        conversations.append(
            ConversationOut(user=member.user, last_message=last_message, unread_count=unread_count)
        )

    # Most recently active conversations first; members you haven't chatted with yet sort last.
    conversations.sort(
        key=lambda c: c.last_message.created_at if c.last_message else datetime.min,
        reverse=True,
    )
    return conversations


# NOTE: this must be declared before /messages/{other_user_id} in file order
# for readability, though FastAPI would route it correctly either way since
# other_user_id is typed int and "search" won't match that converter.
@router.get("/presence")
def get_presence(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Snapshot of which project members are currently online. WS
    presence_changed events cover updates after the client connects; this
    covers the initial state on page load."""
    _require_membership(db, project_id, user.id)
    member_ids = {
        m.user_id
        for m in db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    }
    online = manager.online_user_ids() & member_ids
    return {"online_user_ids": list(online)}


@router.get("/messages/search", response_model=list[DirectMessageOut])
def search_messages(
    project_id: int,
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Full-text (substring) search across every DM thread the current user
    is a participant in, within this project. Used to power the DM search
    box — results link back to whichever conversation each hit belongs to."""
    _require_membership(db, project_id, user.id)

    term = f"%{q.strip()}%"
    if not q.strip():
        return []

    results = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.project_id == project_id,
            or_(DirectMessage.sender_id == user.id, DirectMessage.recipient_id == user.id),
            DirectMessage.body.ilike(term),
        )
        .order_by(DirectMessage.created_at.desc())
        .limit(50)
        .all()
    )
    return results


@router.get("/messages/{other_user_id}", response_model=list[DirectMessageOut])
async def get_thread(
    project_id: int,
    other_user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    _require_membership(db, project_id, other_user_id)

    thread = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.project_id == project_id,
            or_(
                and_(DirectMessage.sender_id == user.id, DirectMessage.recipient_id == other_user_id),
                and_(DirectMessage.sender_id == other_user_id, DirectMessage.recipient_id == user.id),
            ),
        )
        .order_by(DirectMessage.created_at)
        .all()
    )

    # Opening the thread marks anything the other person sent you as read.
    unread = [
        m for m in thread if m.sender_id == other_user_id and m.recipient_id == user.id and m.read_at is None
    ]
    if unread:
        now = datetime.utcnow()
        for m in unread:
            m.read_at = now
        db.commit()
        # Let the original sender know their messages were just seen, so
        # their open thread updates live instead of only on next refresh.
        await manager.send_to_user(
            other_user_id,
            {
                "event": "messages_read",
                "reader_id": user.id,
                "project_id": project_id,
                "read_at": now.isoformat(),
            },
        )

    return thread


@router.post("/messages/{other_user_id}", response_model=DirectMessageOut)
async def send_message(
    project_id: int,
    other_user_id: int,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    _require_membership(db, project_id, other_user_id)

    if other_user_id == user.id:
        raise HTTPException(status_code=400, detail="Can't message yourself")

    message = DirectMessage(
        project_id=project_id,
        sender_id=user.id,
        recipient_id=other_user_id,
        body=payload.body,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    payload_out = DirectMessageOut.model_validate(message).model_dump(mode="json")

    # Push live to both ends of the conversation (sender for multi-tab sync, recipient for real-time chat).
    await manager.send_to_user(other_user_id, {"event": "message_created", "message": payload_out})
    await manager.send_to_user(user.id, {"event": "message_created", "message": payload_out})

    await notify(
        db,
        user_id=other_user_id,
        type="message",
        message=f"{user.full_name} sent you a message",
        project_id=project_id,
    )

    # @mentions inside a DM loop in a third person, e.g. "hey @sam can you take a look"
    mentioned = parse_mentioned_users(payload.body, project_id, db)
    for mentioned_user in mentioned:
        if mentioned_user.id in (user.id, other_user_id):
            continue
        await notify(
            db,
            user_id=mentioned_user.id,
            type="mention",
            message=f"{user.full_name} mentioned you in a message with {message.recipient.full_name}",
            project_id=project_id,
        )

    return message


@router.delete("/messages/{other_user_id}", status_code=204)
def delete_thread(
    project_id: int,
    other_user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Deletes the entire message thread between the current user and
    other_user_id within this project. Either participant can clear it."""
    _require_membership(db, project_id, user.id)
    _require_membership(db, project_id, other_user_id)

    db.query(DirectMessage).filter(
        DirectMessage.project_id == project_id,
        or_(
            and_(DirectMessage.sender_id == user.id, DirectMessage.recipient_id == other_user_id),
            and_(DirectMessage.sender_id == other_user_id, DirectMessage.recipient_id == user.id),
        ),
    ).delete(synchronize_session=False)
    db.commit()
