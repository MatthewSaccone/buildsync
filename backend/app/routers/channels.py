from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.channel import Channel, ChannelMessage, ChannelRead
from app.models.notification_settings import ChannelMute
from app.models.project import ProjectMember
from app.models.user import User
from app.schemas.schemas import (
    ChannelCreate,
    ChannelRename,
    ChannelOut,
    ChannelMessageCreate,
    ChannelMessageOut,
    ChannelMuteOut,
)
from app.services.connection_manager import manager
from app.services.mentions import parse_mentioned_users
from app.services.notification_service import notify

router = APIRouter(prefix="/projects/{project_id}/channels", tags=["channels"])


def _require_membership(db: Session, project_id: int, user_id: int) -> ProjectMember:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return membership


def _get_channel(db: Session, project_id: int, channel_id: int) -> Channel:
    channel = (
        db.query(Channel)
        .filter(Channel.id == channel_id, Channel.project_id == project_id)
        .first()
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


def _ensure_general_channel(db: Session, project_id: int, creator_id: int) -> Channel:
    """Every project needs exactly one permanent "general" channel. Lazily
    provision it the first time anyone asks for this project's channels,
    so existing projects created before channels existed still get one."""
    general = (
        db.query(Channel)
        .filter(Channel.project_id == project_id, Channel.is_general.is_(True))
        .first()
    )
    if general:
        return general

    general = Channel(
        project_id=project_id,
        name="general",
        is_general=True,
        created_by_id=creator_id,
    )
    db.add(general)
    db.commit()
    db.refresh(general)
    return general


def _unread_count(db: Session, channel_id: int, user_id: int) -> int:
    last_read = (
        db.query(ChannelRead)
        .filter(ChannelRead.channel_id == channel_id, ChannelRead.user_id == user_id)
        .first()
    )
    query = db.query(ChannelMessage).filter(
        ChannelMessage.channel_id == channel_id,
        ChannelMessage.sender_id != user_id,
    )
    if last_read:
        query = query.filter(ChannelMessage.created_at > last_read.last_read_at)
    return query.count()


def _is_muted(db: Session, channel_id: int, user_id: int) -> bool:
    return (
        db.query(ChannelMute)
        .filter(ChannelMute.channel_id == channel_id, ChannelMute.user_id == user_id)
        .first()
        is not None
    )


def _to_out(db: Session, channel: Channel, user_id: int) -> ChannelOut:
    last_message_at = (
        db.query(func.max(ChannelMessage.created_at))
        .filter(ChannelMessage.channel_id == channel.id)
        .scalar()
    )
    out = ChannelOut.model_validate(channel)
    out.unread_count = _unread_count(db, channel.id, user_id)
    out.last_message_at = last_message_at
    out.muted = _is_muted(db, channel.id, user_id)
    return out


@router.get("", response_model=list[ChannelOut])
def list_channels(
    project_id: int,
    q: str | None = Query(default=None, description="Filter channels by name (search)"),
    include_archived: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    _ensure_general_channel(db, project_id, user.id)

    query = db.query(Channel).filter(Channel.project_id == project_id)
    if not include_archived:
        query = query.filter(Channel.is_archived.is_(False))
    if q:
        query = query.filter(Channel.name.ilike(f"%{q.strip()}%"))

    channels = query.all()

    # General is pinned first since it's the permanent default; everything
    # else sorts alphabetically (case-insensitive) after it.
    channels.sort(key=lambda c: (not c.is_general, c.name.lower()))

    return [_to_out(db, c, user.id) for c in channels]


@router.post("", response_model=ChannelOut, status_code=201)
def create_channel(
    project_id: int,
    payload: ChannelCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    _ensure_general_channel(db, project_id, user.id)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Channel name can't be empty")
    if len(name) > 80:
        raise HTTPException(status_code=400, detail="Channel name is too long")

    existing = (
        db.query(Channel)
        .filter(Channel.project_id == project_id, func.lower(Channel.name) == name.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A channel with that name already exists")

    channel = Channel(project_id=project_id, name=name, created_by_id=user.id)
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return _to_out(db, channel, user.id)


@router.patch("/{channel_id}", response_model=ChannelOut)
def rename_channel(
    project_id: int,
    channel_id: int,
    payload: ChannelRename,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    channel = _get_channel(db, project_id, channel_id)

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Channel name can't be empty")
    if len(name) > 80:
        raise HTTPException(status_code=400, detail="Channel name is too long")

    existing = (
        db.query(Channel)
        .filter(
            Channel.project_id == project_id,
            Channel.id != channel_id,
            func.lower(Channel.name) == name.lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A channel with that name already exists")

    channel.name = name
    db.commit()
    db.refresh(channel)
    return _to_out(db, channel, user.id)


@router.post("/{channel_id}/archive", response_model=ChannelOut)
def archive_channel(
    project_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    channel = _get_channel(db, project_id, channel_id)

    if channel.is_general:
        raise HTTPException(status_code=400, detail="The general channel can't be archived")
    if channel.is_archived:
        return _to_out(db, channel, user.id)

    channel.is_archived = True
    channel.archived_at = datetime.utcnow()
    db.commit()
    db.refresh(channel)
    return _to_out(db, channel, user.id)


@router.post("/{channel_id}/unarchive", response_model=ChannelOut)
def unarchive_channel(
    project_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    channel = _get_channel(db, project_id, channel_id)

    channel.is_archived = False
    channel.archived_at = None
    db.commit()
    db.refresh(channel)
    return _to_out(db, channel, user.id)


@router.post("/{channel_id}/mute", response_model=ChannelMuteOut)
def mute_channel(
    project_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mute a channel (BS-104-4): the user keeps seeing unread badges, but
    stops getting notifications/desktop alerts for new messages in it."""
    _require_membership(db, project_id, user.id)
    channel = _get_channel(db, project_id, channel_id)

    if not _is_muted(db, channel.id, user.id):
        db.add(ChannelMute(channel_id=channel.id, user_id=user.id))
        db.commit()
    return ChannelMuteOut(channel_id=channel.id, muted=True)


@router.delete("/{channel_id}/mute", response_model=ChannelMuteOut)
def unmute_channel(
    project_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    channel = _get_channel(db, project_id, channel_id)

    db.query(ChannelMute).filter(
        ChannelMute.channel_id == channel.id, ChannelMute.user_id == user.id
    ).delete()
    db.commit()
    return ChannelMuteOut(channel_id=channel.id, muted=False)


@router.delete("/{channel_id}", status_code=204)
def delete_channel(
    project_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    channel = _get_channel(db, project_id, channel_id)

    if channel.is_general:
        raise HTTPException(status_code=400, detail="The general channel can't be deleted")
    if not channel.is_archived:
        raise HTTPException(status_code=400, detail="Only archived channels can be permanently deleted")

    db.query(ChannelRead).filter(ChannelRead.channel_id == channel.id).delete()
    db.query(ChannelMessage).filter(ChannelMessage.channel_id == channel.id).delete()
    db.delete(channel)
    db.commit()


@router.get("/{channel_id}/messages", response_model=list[ChannelMessageOut])
def get_channel_messages(
    project_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    channel = _get_channel(db, project_id, channel_id)

    messages = (
        db.query(ChannelMessage)
        .filter(ChannelMessage.channel_id == channel.id)
        .order_by(ChannelMessage.created_at)
        .all()
    )

    # Opening a channel marks it read "now" — anything sent after this
    # instant will still count as unread.
    read = (
        db.query(ChannelRead)
        .filter(ChannelRead.channel_id == channel.id, ChannelRead.user_id == user.id)
        .first()
    )
    now = datetime.utcnow()
    if read:
        read.last_read_at = now
    else:
        db.add(ChannelRead(channel_id=channel.id, user_id=user.id, last_read_at=now))
    db.commit()

    return messages


@router.post("/{channel_id}/messages", response_model=ChannelMessageOut)
async def send_channel_message(
    project_id: int,
    channel_id: int,
    payload: ChannelMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    channel = _get_channel(db, project_id, channel_id)
    if channel.is_archived:
        raise HTTPException(status_code=400, detail="Can't post in an archived channel")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message can't be empty")

    message = ChannelMessage(channel_id=channel.id, sender_id=user.id, body=body)
    db.add(message)
    db.commit()
    db.refresh(message)

    # Sender's own read marker moves forward too, so they don't see their
    # own message as unread in another tab.
    read = (
        db.query(ChannelRead)
        .filter(ChannelRead.channel_id == channel.id, ChannelRead.user_id == user.id)
        .first()
    )
    if read:
        read.last_read_at = message.created_at
    else:
        db.add(ChannelRead(channel_id=channel.id, user_id=user.id, last_read_at=message.created_at))
    db.commit()

    payload_out = ChannelMessageOut.model_validate(message).model_dump(mode="json")
    await manager.broadcast_to_project(
        project_id, {"event": "channel_message_created", "channel_id": channel.id, "message": payload_out}
    )

    mentioned = parse_mentioned_users(body, project_id, db)
    for mentioned_user in mentioned:
        if mentioned_user.id == user.id:
            continue
        if _is_muted(db, channel.id, mentioned_user.id):
            continue
        await notify(
            db,
            user_id=mentioned_user.id,
            type="mention",
            message=f"{user.full_name} mentioned you in #{channel.name}",
            project_id=project_id,
        )

    return message
