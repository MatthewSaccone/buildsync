from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.material import Material, MaterialVariant
from app.models.user import User
from app.schemas.schemas import (
    MaterialCreate,
    MaterialUpdate,
    MaterialOut,
    MaterialVariantCreate,
    MaterialVariantUpdate,
    MaterialVariantOut,
)

router = APIRouter(prefix="/materials", tags=["materials"])


def _get_material(db: Session, material_id: int) -> Material:
    material = (
        db.query(Material)
        .options(selectinload(Material.variants))
        .filter(Material.id == material_id)
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


@router.get("", response_model=list[MaterialOut])
def list_materials(
    q: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Material).options(selectinload(Material.variants))
    if q:
        query = query.filter(Material.name.ilike(f"%{q}%"))
    if category:
        query = query.filter(Material.category == category)
    return query.order_by(Material.name).all()


@router.post("", response_model=MaterialOut)
def create_material(payload: MaterialCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    material = Material(
        name=payload.name,
        category=payload.category,
        notes=payload.notes,
        created_by_id=user.id,
    )
    for v in payload.variants:
        material.variants.append(MaterialVariant(size=v.size, unit=v.unit, price=v.price, sku=v.sku))
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


@router.get("/{material_id}", response_model=MaterialOut)
def get_material(material_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_material(db, material_id)


@router.patch("/{material_id}", response_model=MaterialOut)
def update_material(
    material_id: int,
    payload: MaterialUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    material = _get_material(db, material_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(material, field, value)
    db.commit()
    db.refresh(material)
    return material


@router.delete("/{material_id}", status_code=204)
def delete_material(material_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    material = _get_material(db, material_id)
    db.delete(material)
    db.commit()


@router.post("/{material_id}/variants", response_model=MaterialOut)
def add_variant(
    material_id: int,
    payload: MaterialVariantCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    material = _get_material(db, material_id)
    material.variants.append(MaterialVariant(size=payload.size, unit=payload.unit, price=payload.price, sku=payload.sku))
    db.commit()
    db.refresh(material)
    return material


@router.patch("/{material_id}/variants/{variant_id}", response_model=MaterialOut)
def update_variant(
    material_id: int,
    variant_id: int,
    payload: MaterialVariantUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    material = _get_material(db, material_id)
    variant = next((v for v in material.variants if v.id == variant_id), None)
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(variant, field, value)
    db.commit()
    db.refresh(material)
    return material


@router.delete("/{material_id}/variants/{variant_id}", response_model=MaterialOut)
def delete_variant(
    material_id: int,
    variant_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    material = _get_material(db, material_id)
    variant = next((v for v in material.variants if v.id == variant_id), None)
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    db.delete(variant)
    db.commit()
    db.refresh(material)
    return material
