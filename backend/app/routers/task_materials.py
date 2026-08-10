from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.material import MaterialVariant
from app.models.task import Task
from app.models.task_material import TaskMaterial
from app.models.user import User
from app.routers.tasks import _get_task, _require_membership
from app.schemas.schemas import TaskMaterialCreate, TaskMaterialUpdate, TaskMaterialOut, TaskOut
from app.services.activity_service import ActivityKind, log_activity
from app.services.connection_manager import manager

router = APIRouter(prefix="/tasks/{task_id}/materials", tags=["task materials"])


def _require_task_membership(db: Session, task_id: int, user_id: int) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _require_membership(db, task.project_id, user_id)
    return task


async def _broadcast_task(db: Session, project_id: int, task_id: int) -> None:
    # Reload with the same eager-load shape the tasks router broadcasts with,
    # so the payload is consistent regardless of which endpoint changed it.
    task = _get_task(db, project_id, task_id)
    await manager.broadcast_to_project(
        project_id, {"event": "task_updated", "task": TaskOut.model_validate(task).model_dump(mode="json")}
    )


@router.get("", response_model=list[TaskMaterialOut])
def list_task_materials(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = _require_task_membership(db, task_id, user.id)
    return task.materials


@router.post("", response_model=TaskMaterialOut)
async def add_task_material(
    task_id: int,
    payload: TaskMaterialCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = _require_task_membership(db, task_id, user.id)
    variant = db.get(MaterialVariant, payload.material_variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Material size/variant not found")

    task_material = TaskMaterial(
        task_id=task_id,
        material_variant_id=variant.id,
        quantity=payload.quantity,
        unit_price=variant.price,
    )
    db.add(task_material)
    db.commit()
    db.refresh(task_material)

    await _broadcast_task(db, task.project_id, task_id)

    total = round(payload.quantity * float(variant.price), 2)
    await log_activity(
        db,
        task.project_id,
        ActivityKind.COST_ADDED,
        f'{user.full_name} added {payload.quantity} {variant.unit or ""} of {variant.material.name} to "{task.title}" (${total:,.2f})'.replace(
            "  ", " "
        ),
        actor=user,
        extra={"task_id": task.id, "amount": total},
    )
    return task_material


@router.patch("/{task_material_id}", response_model=TaskMaterialOut)
async def update_task_material(
    task_id: int,
    task_material_id: int,
    payload: TaskMaterialUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = _require_task_membership(db, task_id, user.id)
    task_material = db.get(TaskMaterial, task_material_id)
    if not task_material or task_material.task_id != task_id:
        raise HTTPException(status_code=404, detail="Not found")
    task_material.quantity = payload.quantity
    db.commit()
    db.refresh(task_material)

    await _broadcast_task(db, task.project_id, task_id)
    return task_material


@router.delete("/{task_material_id}", status_code=204)
async def remove_task_material(
    task_id: int,
    task_material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = _require_task_membership(db, task_id, user.id)
    task_material = db.get(TaskMaterial, task_material_id)
    if not task_material or task_material.task_id != task_id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(task_material)
    db.commit()

    await _broadcast_task(db, task.project_id, task_id)
