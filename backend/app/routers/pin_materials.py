from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.material import MaterialVariant
from app.models.pin import Pin
from app.models.pin_material import PinMaterial
from app.models.project import ProjectMember
from app.models.user import User
from app.schemas.schemas import PinMaterialCreate, PinMaterialUpdate, PinMaterialOut
from app.services.connection_manager import manager
from app.services.pin_serializer import serialize_pin

router = APIRouter(prefix="/pins/{pin_id}/materials", tags=["pin materials"])


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


async def _broadcast_pin(db: Session, pin: Pin) -> None:
    db.refresh(pin)
    out = serialize_pin(pin)
    await manager.broadcast_to_project(
        pin.sheet.project_id, {"event": "pin_updated", "pin": out.model_dump(mode="json")}
    )


@router.get("", response_model=list[PinMaterialOut])
def list_pin_materials(pin_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pin = _require_pin_membership(db, pin_id, user.id)
    return pin.materials


@router.post("", response_model=PinMaterialOut)
async def add_pin_material(
    pin_id: int,
    payload: PinMaterialCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pin = _require_pin_membership(db, pin_id, user.id)
    variant = db.get(MaterialVariant, payload.material_variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Material size/variant not found")

    pin_material = PinMaterial(
        pin_id=pin_id,
        material_variant_id=variant.id,
        quantity=payload.quantity,
        unit_price=variant.price,
    )
    db.add(pin_material)
    db.commit()
    db.refresh(pin_material)

    await _broadcast_pin(db, pin)
    return pin_material


@router.patch("/{pin_material_id}", response_model=PinMaterialOut)
async def update_pin_material(
    pin_id: int,
    pin_material_id: int,
    payload: PinMaterialUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pin = _require_pin_membership(db, pin_id, user.id)
    pin_material = db.get(PinMaterial, pin_material_id)
    if not pin_material or pin_material.pin_id != pin_id:
        raise HTTPException(status_code=404, detail="Not found")
    pin_material.quantity = payload.quantity
    db.commit()
    db.refresh(pin_material)

    await _broadcast_pin(db, pin)
    return pin_material


@router.delete("/{pin_material_id}", status_code=204)
async def remove_pin_material(
    pin_id: int,
    pin_material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pin = _require_pin_membership(db, pin_id, user.id)
    pin_material = db.get(PinMaterial, pin_material_id)
    if not pin_material or pin_material.pin_id != pin_id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(pin_material)
    db.commit()

    await _broadcast_pin(db, pin)
