from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.uploads import save_upload, IMAGE_EXTENSIONS
from app.models.attachment import Attachment
from app.models.comment import Comment
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


@router.delete("/attachments/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    attachment = db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if attachment.pin_id:
        _require_pin_membership(db, attachment.pin_id, user.id)
    elif attachment.task_id:
        _require_task_membership(db, attachment.task_id, user.id)
    else:
        _require_comment_membership(db, attachment.comment_id, user.id)

    if attachment.uploaded_by_id != user.id:
        raise HTTPException(status_code=403, detail="Only the uploader can delete this attachment")

    db.delete(attachment)
    db.commit()
