import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.uploads import save_upload, save_upload_with_metadata, IMAGE_EXTENSIONS, CHAT_ATTACHMENT_EXTENSIONS
from app.models.attachment import Attachment
from app.models.channel import Channel, ChannelMessage
from app.models.comment import Comment
from app.models.message import DirectMessage
from app.models.pin import Pin
from app.models.project import ProjectMember
from app.models.sheet import Sheet
from app.models.task import Task
from app.models.user import User
from app.schemas.schemas import AttachmentOut

router = APIRouter(tags=["attachments"])


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
    stored_path = save_upload(file, IMAGE_EXTENSIONS)

    attachment = Attachment(pin_id=pin_id, file_path=stored_path, uploaded_by_id=user.id)
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
    stored_path = save_upload(file, IMAGE_EXTENSIONS)

    attachment = Attachment(task_id=task_id, file_path=stored_path, uploaded_by_id=user.id)
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/tasks/{task_id}/attachments", response_model=list[AttachmentOut])
def list_task_attachments(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_task_membership(db, task_id, user.id)
    return db.query(Attachment).filter(Attachment.task_id == task_id).order_by(Attachment.uploaded_at).all()


@router.post("/comments/{comment_id}/attachments", response_model=AttachmentOut)
def upload_comment_attachment(
    comment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_comment_membership(db, comment_id, user.id)
    stored_path = save_upload(file, IMAGE_EXTENSIONS)

    attachment = Attachment(comment_id=comment_id, file_path=stored_path, uploaded_by_id=user.id)
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
    stored_path, original_name, content_type = save_upload_with_metadata(file, CHAT_ATTACHMENT_EXTENSIONS)

    attachment = Attachment(
        message_id=message_id,
        file_path=stored_path,
        original_filename=original_name,
        content_type=content_type,
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
    stored_path, original_name, content_type = save_upload_with_metadata(file, CHAT_ATTACHMENT_EXTENSIONS)

    attachment = Attachment(
        channel_message_id=channel_message_id,
        file_path=stored_path,
        original_filename=original_name,
        content_type=content_type,
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
