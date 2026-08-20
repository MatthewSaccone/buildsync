import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.file_signing import verify_file_signature
from app.models.sheet import Sheet
from app.models.attachment import Attachment
from app.models.project import ProjectMember

router = APIRouter(prefix="/files", tags=["files"])


def _find_owning_project_id(db: Session, filename: str) -> int | None:
    """Files are shared across sheets/attachments by disk filename -- look up
    whichever record currently references this filename to find the project
    it belongs to, so we can re-check membership at serve time."""
    sheet = db.query(Sheet).filter(Sheet.file_path.like(f"%{filename}")).first()
    if sheet:
        return sheet.project_id

    attachment = db.query(Attachment).filter(Attachment.file_path.like(f"%{filename}")).first()
    if attachment:
        if attachment.pin_id:
            return attachment.pin.sheet.project_id
        if attachment.task_id:
            return attachment.task.project_id
    return None


@router.get("/{filename}")
def serve_file(
    filename: str,
    user_id: int = Query(...),
    expires: str = Query(...),
    signature: str = Query(...),
    db: Session = Depends(get_db),
):
    if "/" in filename or "\\" in filename or filename in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not verify_file_signature(filename, user_id, expires, signature):
        raise HTTPException(status_code=403, detail="Invalid or expired file link")

    project_id = _find_owning_project_id(db, filename)
    if project_id is not None:
        is_member = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
            .first()
        )
        if not is_member:
            raise HTTPException(status_code=403, detail="No longer have access to this file")

    file_path = os.path.join(settings.upload_dir, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path)
