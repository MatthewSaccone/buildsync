import logging
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.uploads import (
    save_upload,
    save_upload_with_metadata,
    hash_file,
    IMAGE_EXTENSIONS,
    CHAT_ATTACHMENT_EXTENSIONS,
)
from app.models.attachment import Attachment
from app.models.channel import Channel, ChannelMessage
from app.models.comment import Comment
from app.models.daily_log import DailyLog
from app.models.message import DirectMessage
from app.models.pin import Pin
from app.models.project import ProjectMember
from app.models.sheet import Sheet
from app.models.task import Task
from app.models.user import User
from app.schemas.schemas import AttachmentOut, AttachmentAnnotationsUpdate, AttachmentAttachRequest

router = APIRouter(tags=["attachments"])
logger = logging.getLogger(__name__)


def _require_pin_membership(db: Session, pin_id: int, user_id: int) -> Pin:
    pin = db.get(Pin, pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")
    sheet = db.get(Sheet, pin.sheet_id)
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == sheet.project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return pin


def _require_task_membership(db: Session, task_id: int, user_id: int) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == task.project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return task


def _require_comment_membership(db: Session, comment_id: int, user_id: int) -> Comment:
    comment = db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.pin_id:
        _require_pin_membership(db, comment.pin_id, user_id)
    else:
        _require_task_membership(db, comment.task_id, user_id)
    return comment


def _require_daily_log_membership(db: Session, daily_log_id: int, user_id: int) -> DailyLog:
    log = db.get(DailyLog, daily_log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Daily log not found")
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == log.project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return log


def _require_message_membership(db: Session, message_id: int, user_id: int) -> DirectMessage:
    message = db.get(DirectMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if user_id not in (message.sender_id, message.recipient_id):
        raise HTTPException(status_code=403, detail="Not a participant in this conversation")
    return message


def _require_channel_message_membership(db: Session, channel_message_id: int, user_id: int) -> ChannelMessage:
    channel_message = db.get(ChannelMessage, channel_message_id)
    if not channel_message:
        raise HTTPException(status_code=404, detail="Message not found")
    channel = db.get(Channel, channel_message.channel_id)
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == channel.project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return channel_message


@router.post("/pins/{pin_id}/attachments", response_model=AttachmentOut)
def upload_pin_attachment(
    pin_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_pin_membership(db, pin_id, user.id)
    stored_path, original_name, content_type, content_hash = save_upload_with_metadata(file, IMAGE_EXTENSIONS)

    attachment = Attachment(
        pin_id=pin_id,
        file_path=stored_path,
        original_filename=original_name,
        content_type=content_type,
        content_hash=content_hash,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/pins/{pin_id}/attachments", response_model=list[AttachmentOut])
def list_pin_attachments(pin_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_pin_membership(db, pin_id, user.id)
    return db.query(Attachment).filter(Attachment.pin_id == pin_id).order_by(Attachment.uploaded_at).all()


@router.post("/tasks/{task_id}/attachments", response_model=AttachmentOut)
def upload_task_attachment(
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_task_membership(db, task_id, user.id)
    stored_path, original_name, content_type, content_hash = save_upload_with_metadata(file, IMAGE_EXTENSIONS)

    attachment = Attachment(
        task_id=task_id,
        file_path=stored_path,
        original_filename=original_name,
        content_type=content_type,
        content_hash=content_hash,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/tasks/{task_id}/attachments", response_model=list[AttachmentOut])
def list_task_attachments(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_task_membership(db, task_id, user.id)
    return db.query(Attachment).filter(Attachment.task_id == task_id).order_by(Attachment.uploaded_at).all()


@router.post("/daily-logs/{daily_log_id}/attachments", response_model=AttachmentOut)
def upload_daily_log_attachment(
    daily_log_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a progress photo to a daily log (BS-302-1)."""
    _require_daily_log_membership(db, daily_log_id, user.id)
    stored_path, original_name, content_type, content_hash = save_upload_with_metadata(file, IMAGE_EXTENSIONS)

    attachment = Attachment(
        daily_log_id=daily_log_id,
        file_path=stored_path,
        original_filename=original_name,
        content_type=content_type,
        content_hash=content_hash,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/daily-logs/{daily_log_id}/attachments", response_model=list[AttachmentOut])
def list_daily_log_attachments(
    daily_log_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_daily_log_membership(db, daily_log_id, user.id)
    return (
        db.query(Attachment)
        .filter(Attachment.daily_log_id == daily_log_id)
        .order_by(Attachment.uploaded_at)
        .all()
    )


@router.post("/comments/{comment_id}/attachments", response_model=AttachmentOut)
def upload_comment_attachment(
    comment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_comment_membership(db, comment_id, user.id)
    stored_path, original_name, content_type, content_hash = save_upload_with_metadata(file, IMAGE_EXTENSIONS)

    attachment = Attachment(
        comment_id=comment_id,
        file_path=stored_path,
        original_filename=original_name,
        content_type=content_type,
        content_hash=content_hash,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/comments/{comment_id}/attachments", response_model=list[AttachmentOut])
def list_comment_attachments(comment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_comment_membership(db, comment_id, user.id)
    return db.query(Attachment).filter(Attachment.comment_id == comment_id).order_by(Attachment.uploaded_at).all()


@router.post("/messages/{message_id}/attachments", response_model=AttachmentOut)
def upload_message_attachment(
    message_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Attach a file to a DM (BS-103). Chat attachments accept photos, PDFs,
    and common office documents — a wider set than pin/task photo uploads."""
    _require_message_membership(db, message_id, user.id)
    stored_path, original_name, content_type, content_hash = save_upload_with_metadata(file, CHAT_ATTACHMENT_EXTENSIONS)

    attachment = Attachment(
        message_id=message_id,
        file_path=stored_path,
        original_filename=original_name,
        content_type=content_type,
        content_hash=content_hash,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/messages/{message_id}/attachments", response_model=list[AttachmentOut])
def list_message_attachments(message_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_message_membership(db, message_id, user.id)
    return db.query(Attachment).filter(Attachment.message_id == message_id).order_by(Attachment.uploaded_at).all()


@router.post("/channel-messages/{channel_message_id}/attachments", response_model=AttachmentOut)
def upload_channel_message_attachment(
    channel_message_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Attach a file to a channel message (BS-103)."""
    _require_channel_message_membership(db, channel_message_id, user.id)
    stored_path, original_name, content_type, content_hash = save_upload_with_metadata(
        file, CHAT_ATTACHMENT_EXTENSIONS
    )

    attachment = Attachment(
        channel_message_id=channel_message_id,
        file_path=stored_path,
        original_filename=original_name,
        content_type=content_type,
        content_hash=content_hash,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/channel-messages/{channel_message_id}/attachments", response_model=list[AttachmentOut])
def list_channel_message_attachments(
    channel_message_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_channel_message_membership(db, channel_message_id, user.id)
    return (
        db.query(Attachment)
        .filter(Attachment.channel_message_id == channel_message_id)
        .order_by(Attachment.uploaded_at)
        .all()
    )


def _require_attachment_access(db: Session, attachment: Attachment, user_id: int) -> None:
    """Raises unless user_id can see the entity this attachment is on."""
    if attachment.pin_id:
        _require_pin_membership(db, attachment.pin_id, user_id)
    elif attachment.task_id:
        _require_task_membership(db, attachment.task_id, user_id)
    elif attachment.comment_id:
        _require_comment_membership(db, attachment.comment_id, user_id)
    elif attachment.message_id:
        _require_message_membership(db, attachment.message_id, user_id)
    elif attachment.daily_log_id:
        _require_daily_log_membership(db, attachment.daily_log_id, user_id)
    else:
        _require_channel_message_membership(db, attachment.channel_message_id, user_id)


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Streams the file back with its original filename set via
    Content-Disposition, so downloads don't end up named after a random UUID
    (BS-103-4)."""
    attachment = db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    _require_attachment_access(db, attachment, user.id)

    if not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    # Re-hash the file on disk and compare against the hash taken at upload
    # time. A mismatch means the file was modified after upload (compromised
    # process, bad deploy, direct disk tampering, etc) — refuse to serve it
    # rather than silently handing back altered content. Attachments from
    # before this feature shipped have no stored hash (content_hash is
    # None), so there's nothing to verify against and they're served as-is.
    if attachment.content_hash is not None:
        current_hash = hash_file(attachment.file_path)
        if current_hash != attachment.content_hash:
            logger.error(
                "Content hash mismatch for attachment %s at %s — possible tampering",
                attachment.id,
                attachment.file_path,
            )
            raise HTTPException(
                status_code=409,
                detail="This file has changed since it was uploaded and cannot be downloaded. Please contact support.",
            )

    filename = attachment.original_filename or os.path.basename(attachment.file_path)
    return FileResponse(
        attachment.file_path,
        media_type=attachment.content_type or "application/octet-stream",
        filename=filename,
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    attachment = db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    _require_attachment_access(db, attachment, user.id)

    if attachment.uploaded_by_id != user.id:
        raise HTTPException(status_code=403, detail="Only the uploader can delete this attachment")

    db.delete(attachment)
    db.commit()


@router.put("/attachments/{attachment_id}/annotations", response_model=AttachmentOut)
def update_attachment_annotations(
    attachment_id: int,
    payload: AttachmentAnnotationsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Saves a freehand annotation overlay for a photo (BS-302-2). The
    original image on disk is never modified -- annotations are stored
    separately as JSON and re-rendered on top of the photo client-side."""
    attachment = db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    _require_attachment_access(db, attachment, user.id)

    attachment.annotations = payload.annotations
    db.commit()
    db.refresh(attachment)
    return attachment


@router.post("/attachments/{attachment_id}/attach", response_model=AttachmentOut)
def attach_existing_attachment(
    attachment_id: int,
    payload: AttachmentAttachRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Attaches an existing photo (e.g. a daily log progress photo) to a
    task (BS-302-3) or a pin (BS-302-4). This creates a new Attachment row
    that points at the same file on disk rather than moving/duplicating the
    original, so the photo keeps showing up wherever it was uploaded plus
    wherever it's since been attached."""
    source = db.get(Attachment, attachment_id)
    if not source:
        raise HTTPException(status_code=404, detail="Attachment not found")
    _require_attachment_access(db, source, user.id)

    if payload.task_id is not None:
        _require_task_membership(db, payload.task_id, user.id)
    else:
        _require_pin_membership(db, payload.pin_id, user.id)

    copy = Attachment(
        pin_id=payload.pin_id,
        task_id=payload.task_id,
        file_path=source.file_path,
        original_filename=source.original_filename,
        content_type=source.content_type,
        content_hash=source.content_hash,
        annotations=source.annotations,
        source_attachment_id=source.id,
        uploaded_by_id=user.id,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy
