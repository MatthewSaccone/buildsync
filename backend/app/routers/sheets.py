import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.uploads import save_upload, SHEET_EXTENSIONS
from app.models.project import ProjectMember
from app.models.sheet import Sheet
from app.models.user import User
from app.schemas.schemas import SheetOut

router = APIRouter(prefix="/projects/{project_id}/sheets", tags=["sheets"])


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
def upload_sheet(
    project_id: int,
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a brand-new sheet (starts a new version family at v1)."""
    _require_membership(db, project_id, user.id)
    stored_path = save_upload(file, SHEET_EXTENSIONS)

    sheet = Sheet(
        project_id=project_id,
        title=title,
        file_path=stored_path,
        version=1,
        uploaded_by_id=user.id,
    )
    db.add(sheet)
    db.flush()
    sheet.root_sheet_id = sheet.id  # v1 is the root of its own family
    db.commit()
    db.refresh(sheet)
    return sheet


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

    stored_path = save_upload(file, SHEET_EXTENSIONS)

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