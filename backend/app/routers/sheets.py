import logging
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.uploads import save_upload_with_metadata, hash_file, SHEET_EXTENSIONS
from app.models.project import ProjectMember
from app.models.sheet import Sheet
from app.models.user import User
from app.schemas.schemas import SheetOut
from app.services.activity_service import ActivityKind, log_activity

router = APIRouter(prefix="/projects/{project_id}/sheets", tags=["sheets"])
logger = logging.getLogger(__name__)


def _validate_title(title: str) -> str:
    title = title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Sheet title can't be empty")
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="Sheet title is too long")
    return title


def _require_membership(db: Session, project_id: int, user_id: int):
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return membership


@router.post("", response_model=SheetOut)
async def upload_sheet(
    project_id: int,
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a brand-new sheet (starts a new version family at v1)."""
    _require_membership(db, project_id, user.id)
    title = _validate_title(title)
    stored_path, _, _, content_hash = save_upload_with_metadata(file, SHEET_EXTENSIONS)

    sheet = Sheet(
        project_id=project_id,
        title=title,
        file_path=stored_path,
        content_hash=content_hash,
        version=1,
        uploaded_by_id=user.id,
    )
    db.add(sheet)
    db.flush()
    sheet.root_sheet_id = sheet.id  # v1 is the root of its own family
    db.commit()
    db.refresh(sheet)

    await log_activity(
        db,
        project_id,
        ActivityKind.SHEET_UPLOADED,
        f'{user.full_name} uploaded "{title}"',
        actor=user,
        extra={"sheet_id": sheet.id},
    )

    return sheet


@router.get("/{sheet_id}/download")
def download_sheet(
    project_id: int,
    sheet_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Streams a sheet's file back after verifying it hasn't been altered on
    disk since upload. Prefer this over the raw /static/uploads/... URL,
    which bypasses this check entirely."""
    _require_membership(db, project_id, user.id)
    sheet = db.get(Sheet, sheet_id)
    if not sheet or sheet.project_id != project_id:
        raise HTTPException(status_code=404, detail="Sheet not found")

    if not os.path.exists(sheet.file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    # Re-hash the file on disk and compare against the hash taken at upload
    # time. A mismatch means the file was modified after upload — refuse to
    # serve it rather than silently handing back altered content. Sheets
    # from before this feature shipped have no stored hash and are served
    # as-is, since there's nothing to verify against.
    if sheet.content_hash is not None:
        current_hash = hash_file(sheet.file_path)
        if current_hash != sheet.content_hash:
            logger.error(
                "Content hash mismatch for sheet %s at %s — possible tampering",
                sheet.id,
                sheet.file_path,
            )
            raise HTTPException(
                status_code=409,
                detail="This file has changed since it was uploaded and cannot be downloaded. Please contact support.",
            )

    filename = os.path.basename(sheet.file_path)
    return FileResponse(sheet.file_path, filename=filename)


@router.get("", response_model=list[SheetOut])
def list_sheets(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Lists the latest version of every sheet family in the project."""
    _require_membership(db, project_id, user.id)
    all_sheets = (
        db.query(Sheet)
        .filter(Sheet.project_id == project_id)
        .order_by(Sheet.root_sheet_id, Sheet.version.desc())
        .all()
    )
    latest_by_family: dict[int, Sheet] = {}
    for s in all_sheets:
        if s.root_sheet_id not in latest_by_family:
            latest_by_family[s.root_sheet_id] = s
    return list(latest_by_family.values())


@router.post("/{sheet_id}/versions", response_model=SheetOut)
def upload_new_version(
    project_id: int,
    sheet_id: int,
    title: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Re-upload a sheet, creating a new version linked to the same family."""
    _require_membership(db, project_id, user.id)
    existing = db.get(Sheet, sheet_id)
    if not existing or existing.project_id != project_id:
        raise HTTPException(status_code=404, detail="Sheet not found")

    title = _validate_title(title) if title is not None else None
    stored_path, _, _, content_hash = save_upload_with_metadata(file, SHEET_EXTENSIONS)

    latest_version = (
        db.query(Sheet)
        .filter(Sheet.root_sheet_id == existing.root_sheet_id)
        .order_by(Sheet.version.desc())
        .first()
    )

    new_sheet = Sheet(
        project_id=project_id,
        root_sheet_id=existing.root_sheet_id,
        title=title or existing.title,
        file_path=stored_path,
        content_hash=content_hash,
        version=(latest_version.version if latest_version else existing.version) + 1,
        uploaded_by_id=user.id,
    )
    db.add(new_sheet)
    db.commit()
    db.refresh(new_sheet)
    return new_sheet


@router.get("/{sheet_id}/versions", response_model=list[SheetOut])
def list_versions(
    project_id: int,
    sheet_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Full version history for a sheet's family, newest first."""
    _require_membership(db, project_id, user.id)
    anchor = db.get(Sheet, sheet_id)
    if not anchor or anchor.project_id != project_id:
        raise HTTPException(status_code=404, detail="Sheet not found")

    return (
        db.query(Sheet)
        .filter(Sheet.root_sheet_id == anchor.root_sheet_id)
        .order_by(Sheet.version.desc())
        .all()
    )
