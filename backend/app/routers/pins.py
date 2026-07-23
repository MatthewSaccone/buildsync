from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.enums import PinStatus, UserRole
from app.models.pin import Pin
from app.models.project import ProjectMember
from app.models.sheet import Sheet
from app.models.user import User
from app.schemas.schemas import PinCreate, PinUpdate, PinOut
from app.services.connection_manager import manager
from app.services.notification_service import notify

router = APIRouter(prefix="/sheets/{sheet_id}/pins", tags=["pins"])
project_pins_router = APIRouter(prefix="/projects/{project_id}/pins", tags=["pins"])


def _require_sheet_membership(db: Session, sheet_id: int, user_id: int) -> Sheet:
    sheet = db.get(Sheet, sheet_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == sheet.project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return sheet


@router.post("", response_model=PinOut)
async def create_pin(
    sheet_id: int,
    payload: PinCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sheet = _require_sheet_membership(db, sheet_id, user.id)

    pin = Pin(
        sheet_id=sheet_id,
        x=payload.x,
        y=payload.y,
        title=payload.title,
        trade=payload.trade,
        priority=payload.priority,
        assigned_to_id=payload.assigned_to_id,
        created_by_id=user.id,
    )
    db.add(pin)
    db.commit()
    db.refresh(pin)

    await manager.broadcast_to_project(
        sheet.project_id,
        {"event": "pin_created", "pin": PinOut.model_validate(pin).model_dump(mode="json")},
    )

    if pin.assigned_to_id and pin.assigned_to_id != user.id:
        await notify(
            db,
            user_id=pin.assigned_to_id,
            type="assignment",
            message=f"{user.full_name} assigned you a pin: \"{pin.title}\"",
            project_id=sheet.project_id,
            pin_id=pin.id,
        )

    return pin


@router.get("", response_model=list[PinOut])
def list_pins(
    sheet_id: int,
    status: PinStatus | None = None,
    trade: UserRole | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_sheet_membership(db, sheet_id, user.id)
    query = db.query(Pin).filter(Pin.sheet_id == sheet_id)
    if status:
        query = query.filter(Pin.status == status)
    if trade:
        query = query.filter(Pin.trade == trade)
    return query.all()


@project_pins_router.get("", response_model=list[PinOut])
def list_project_pins(
    project_id: int,
    status: PinStatus | None = None,
    trade: UserRole | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All pins across every sheet in a project — for a project-wide punch list / cost rollup."""
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")

    query = db.query(Pin).join(Sheet, Pin.sheet_id == Sheet.id).filter(Sheet.project_id == project_id)
    if status:
        query = query.filter(Pin.status == status)
    if trade:
        query = query.filter(Pin.trade == trade)
    return query.all()


@router.patch("/{pin_id}", response_model=PinOut)
async def update_pin(
    sheet_id: int,
    pin_id: int,
    payload: PinUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sheet = _require_sheet_membership(db, sheet_id, user.id)
    pin = db.get(Pin, pin_id)
    if not pin or pin.sheet_id != sheet_id:
        raise HTTPException(status_code=404, detail="Pin not found")

    previous_assignee_id = pin.assigned_to_id
    previous_status = pin.status

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pin, field, value)

    if payload.status == PinStatus.RESOLVED and pin.resolved_at is None:
        pin.resolved_at = datetime.utcnow()
    elif payload.status and payload.status != PinStatus.RESOLVED:
        pin.resolved_at = None

    db.commit()
    db.refresh(pin)

    await manager.broadcast_to_project(
        sheet.project_id,
        {"event": "pin_updated", "pin": PinOut.model_validate(pin).model_dump(mode="json")},
    )

    if pin.assigned_to_id and pin.assigned_to_id != previous_assignee_id and pin.assigned_to_id != user.id:
        await notify(
            db,
            user_id=pin.assigned_to_id,
            type="assignment",
            message=f"{user.full_name} assigned you a pin: \"{pin.title}\"",
            project_id=sheet.project_id,
            pin_id=pin.id,
        )

    if payload.status and payload.status != previous_status:
        interested = {pin.created_by_id, pin.assigned_to_id} - {user.id, None}
        for uid in interested:
            await notify(
                db,
                user_id=uid,
                type="status_change",
                message=f"{user.full_name} moved \"{pin.title}\" to {pin.status.value.replace('_', ' ')}",
                project_id=sheet.project_id,
                pin_id=pin.id,
            )

    return pin


@router.delete("/{pin_id}", status_code=204)
async def delete_pin(
    sheet_id: int,
    pin_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sheet = _require_sheet_membership(db, sheet_id, user.id)
    pin = db.get(Pin, pin_id)
    if not pin or pin.sheet_id != sheet_id:
        raise HTTPException(status_code=404, detail="Pin not found")

    db.delete(pin)
    db.commit()

    await manager.broadcast_to_project(
        sheet.project_id,
        {"event": "pin_deleted", "pin_id": pin_id, "sheet_id": sheet_id},
    )
