import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.pin import Pin
from app.models.pin_material import PinMaterial
from app.models.project import ProjectMember
from app.models.sheet import Sheet
from app.models.user import User
from app.schemas.schemas import ProjectCostSummary, MaterialCostLine

router = APIRouter(prefix="/projects/{project_id}/materials-cost", tags=["costs"])


def _require_membership(db: Session, project_id: int, user_id: int) -> None:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")


def _aggregate(db: Session, project_id: int, status: str | None) -> list[MaterialCostLine]:
    query = (
        db.query(PinMaterial)
        .join(Pin, PinMaterial.pin_id == Pin.id)
        .join(Sheet, Pin.sheet_id == Sheet.id)
        .filter(Sheet.project_id == project_id)
    )
    if status:
        query = query.filter(Pin.status == status)

    totals: dict[int, MaterialCostLine] = {}
    for pm in query.all():
        variant = pm.material_variant
        if variant.id not in totals:
            totals[variant.id] = MaterialCostLine(
                material_variant_id=variant.id,
                material_name=variant.material.name,
                material_category=variant.material.category,
                size=variant.size,
                unit=variant.unit,
                total_quantity=0,
                unit_price=float(variant.price),
            )
        totals[variant.id].total_quantity += pm.quantity

    return sorted(totals.values(), key=lambda line: (line.material_category or "", line.material_name))


@router.get("", response_model=ProjectCostSummary)
def get_project_cost_summary(
    project_id: int,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aggregated material quantities/cost across every pin in the project.
    Uses current catalog pricing (not the per-pin price snapshot) so the total
    reflects what it would cost to buy everything today."""
    _require_membership(db, project_id, user.id)
    lines = _aggregate(db, project_id, status)
    return ProjectCostSummary(project_id=project_id, lines=lines)


@router.get("/export")
def export_materials_csv(
    project_id: int,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """A shopping-list CSV: one row per material size, with the total quantity
    needed across the project and the resulting line cost."""
    _require_membership(db, project_id, user.id)
    lines = _aggregate(db, project_id, status)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Category", "Material", "Size", "Unit", "Quantity", "Unit Price", "Line Total"])
    grand_total = 0.0
    for line in lines:
        writer.writerow(
            [
                line.material_category or "",
                line.material_name,
                line.size,
                line.unit or "",
                line.total_quantity,
                f"{line.unit_price:.2f}",
                f"{line.total_cost:.2f}",
            ]
        )
        grand_total += line.total_cost
    writer.writerow([])
    writer.writerow(["", "", "", "", "", "Total", f"{grand_total:.2f}"])

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=project-{project_id}-materials.csv"},
    )
