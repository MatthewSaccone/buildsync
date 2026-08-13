from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.estimate import EstimateSession, EstimateLine
from app.models.material import MaterialVariant
from app.models.project import ProjectMember
from app.models.sheet import Sheet
from app.models.user import User
from app.schemas.schemas import (
    EstimateSessionCreate,
    DimensionConfirm,
    EstimateSessionOut,
    EstimateLineOverride,
)
from app.services.takeoff_service import TakeoffInput, compute_raw_quantities
from app.services.selection_service import select_material
def _get_extract_dimensions():
    """Imported lazily, not at module load, so a missing/broken torch/
    transformers install can't take down the whole backend on startup --
    it only fails when someone actually tries to start an estimate."""
    from app.services.local_extraction_service import extract_dimensions
    return extract_dimensions

router = APIRouter(prefix="/projects/{project_id}/estimates", tags=["estimates"])


def _require_membership(db: Session, project_id: int, user_id: int) -> None:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")


def _get_session(db: Session, project_id: int, session_id: int) -> EstimateSession:
    session = db.get(EstimateSession, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=404, detail="Estimate session not found")
    return session


@router.post("", response_model=EstimateSessionOut)
def start_estimate(
    project_id: int,
    payload: EstimateSessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Kicks off an estimate: runs vision extraction on the sheet's image and
    stores the raw (unconfirmed) result. Nothing here is trusted for cost math
    yet -- the user must review/confirm via PATCH before lines are generated."""
    _require_membership(db, project_id, user.id)
    sheet = db.get(Sheet, payload.sheet_id)
    if not sheet or sheet.project_id != project_id:
        raise HTTPException(status_code=404, detail="Sheet not found")

    session = EstimateSession(
        project_id=project_id,
        sheet_id=sheet.id,
        status="pending_review",
        created_by_id=user.id,
    )
    db.add(session)
    db.flush()
    
    try:
        extract_dimensions = _get_extract_dimensions()
        extraction = extract_dimensions(sheet.file_path)
    except (RuntimeError, ImportError, ModuleNotFoundError) as e:
        session.status = "failed"
        session.notes = str(e)
        db.commit()
        db.refresh(session)
        raise HTTPException(status_code=422, detail=f"Could not extract dimensions: {e}")

    low_confidence = [
        field for field, level in (extraction.get("confidence") or {}).items() if level == "low"
    ]

    session.extracted_dimensions = extraction
    session.low_confidence_fields = low_confidence
    session.scale_ratio = extraction.get("scale_ratio")
    session.scale_confirmed = False
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=EstimateSessionOut)
def get_estimate(
    project_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    return _get_session(db, project_id, session_id)


@router.get("", response_model=list[EstimateSessionOut])
def list_estimates(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    return (
        db.query(EstimateSession)
        .filter(EstimateSession.project_id == project_id)
        .order_by(EstimateSession.created_at.desc())
        .all()
    )


@router.post("/{session_id}/confirm", response_model=EstimateSessionOut)
def confirm_and_generate(
    project_id: int,
    session_id: int,
    payload: DimensionConfirm,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """User has reviewed/corrected the extracted dimensions. This runs the
    takeoff + material selection and finalizes the estimate. This is an
    estimate for planning purposes only, not a binding quote."""
    _require_membership(db, project_id, user.id)
    session = _get_session(db, project_id, session_id)
    if session.status == "failed":
        raise HTTPException(status_code=400, detail="This session's extraction failed; start a new estimate")

    session.scale_ratio = payload.scale_ratio if payload.scale_ratio is not None else session.scale_ratio
    session.scale_confirmed = True
    session.wall_height_ft = payload.wall_height_ft
    session.waste_factor_overrides = payload.waste_factor_overrides

    # Clear any prior lines if re-confirming (e.g. user corrected a number and re-ran)
    db.query(EstimateLine).filter(EstimateLine.session_id == session.id).delete()

    takeoff_input = TakeoffInput(
        wall_length_ft=payload.wall_length_ft,
        wall_height_ft=payload.wall_height_ft,
        opening_sqft=payload.opening_sqft,
        floor_area_sqft=payload.floor_area_sqft,
        roof_area_sqft=payload.roof_area_sqft,
        include_categories=payload.include_categories or [
            "framing", "drywall", "roofing", "concrete", "paint",
        ],
    )
    raw_quantities = compute_raw_quantities(takeoff_input, payload.waste_factor_overrides)

    for raw in raw_quantities:
        result = select_material(db, raw)
        if result.unmatched or result.chosen is None:
            db.add(EstimateLine(
                session_id=session.id,
                category=raw.category,
                material_variant_id=None,
                raw_quantity_needed=raw.raw_quantity,
                waste_factor=raw.waste_factor,
                purchase_quantity=0,
                unit_price_snapshot=None,
                alternates=[],
                unmatched=True,
            ))
            continue

        db.add(EstimateLine(
            session_id=session.id,
            category=raw.category,
            material_variant_id=result.chosen.variant_id,
            raw_quantity_needed=raw.raw_quantity,
            waste_factor=raw.waste_factor,
            purchase_quantity=result.chosen.purchase_quantity,
            unit_price_snapshot=result.chosen.unit_price,
            alternates=[
                {
                    "variant_id": a.variant_id,
                    "variant_label": a.variant_label,
                    "unit_price": a.unit_price,
                    "purchase_quantity": a.purchase_quantity,
                    "line_total": a.line_total,
                }
                for a in result.alternates
            ],
            unmatched=False,
        ))

    session.status = "finalized"
    from datetime import datetime, timezone
    session.finalized_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return _serialize_with_labels(db, session)


@router.patch("/{session_id}/lines/{line_id}", response_model=EstimateSessionOut)
def override_line_material(
    project_id: int,
    session_id: int,
    line_id: int,
    payload: EstimateLineOverride,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Swap a line to a different variant (e.g. one of the offered alternates,
    or any other catalog variant). Recalculates purchase quantity and price
    from the line's existing raw_quantity_needed/waste_factor."""
    _require_membership(db, project_id, user.id)
    session = _get_session(db, project_id, session_id)
    line = db.get(EstimateLine, line_id)
    if not line or line.session_id != session.id:
        raise HTTPException(status_code=404, detail="Estimate line not found")

    variant = db.get(MaterialVariant, payload.material_variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Material variant not found")
    if not variant.coverage_value:
        raise HTTPException(status_code=400, detail="Selected variant has no coverage data set")

    import math
    needed = line.raw_quantity_needed * (1 + line.waste_factor)
    line.material_variant_id = variant.id
    line.purchase_quantity = max(1, math.ceil(needed / variant.coverage_value))
    line.unit_price_snapshot = float(variant.price)
    line.unmatched = False
    line.user_overridden = True

    db.commit()
    db.refresh(session)
    return _serialize_with_labels(db, session)


def _serialize_with_labels(db: Session, session: EstimateSession) -> EstimateSession:
    """EstimateLineOut needs material_label, which isn't a DB column -- stash
    it onto each ORM line object before returning so from_attributes picks it up."""
    for line in session.lines:
        if line.material_variant_id:
            variant = db.get(MaterialVariant, line.material_variant_id)
            line.material_label = f"{variant.material.name} - {variant.size}" if variant else None
        else:
            line.material_label = None
    return session
