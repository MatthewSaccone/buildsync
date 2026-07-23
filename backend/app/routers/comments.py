from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.comment import Comment
from app.models.pin import Pin
from app.models.project import ProjectMember
from app.models.user import User
from app.schemas.schemas import CommentCreate, CommentOut
from app.services.connection_manager import manager
from app.services.notification_service import notify

router = APIRouter(prefix="/pins/{pin_id}/comments", tags=["comments"])


def _require_pin_membership(db: Session, pin_id: int, user_id: int) -> Pin:
    pin = db.get(Pin, pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")
    project_id = pin.sheet.project_id
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return pin


@router.post("", response_model=CommentOut)
async def add_comment(
    pin_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pin = _require_pin_membership(db, pin_id, user.id)
    comment = Comment(pin_id=pin_id, author_id=user.id, body=payload.body)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    project_id = pin.sheet.project_id
    await manager.broadcast_to_project(
        project_id,
        {"event": "comment_created", "comment": CommentOut.model_validate(comment).model_dump(mode="json")},
    )

    interested = {pin.created_by_id, pin.assigned_to_id} - {user.id, None}
    for uid in interested:
        await notify(
            db,
            user_id=uid,
            type="comment",
            message=f"{user.full_name} commented on \"{pin.title}\"",
            project_id=project_id,
            pin_id=pin.id,
        )

    return comment


@router.get("", response_model=list[CommentOut])
def list_comments(pin_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_pin_membership(db, pin_id, user.id)
    return db.query(Comment).filter(Comment.pin_id == pin_id).order_by(Comment.created_at).all()
