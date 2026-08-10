from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.comment import Comment
from app.models.enums import TaskStatus
from app.models.material import MaterialVariant
from app.models.pin import Pin
from app.models.project import ProjectMember
from app.models.scheduled_job import ScheduledJob
from app.models.sheet import Sheet
from app.models.task import Task
from app.models.task_material import TaskMaterial
from app.models.user import User
from app.schemas.schemas import TaskCreate, TaskUpdate, TaskOut, CommentCreate, CommentOut
from app.services.activity_service import ActivityKind, log_activity
from app.services.connection_manager import manager
from app.services.notification_service import notify

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])
task_comments_router = APIRouter(prefix="/tasks/{task_id}/comments", tags=["tasks"])

TASK_LOAD_OPTIONS = (
    selectinload(Task.owner),
    selectinload(Task.related_pins),
    selectinload(Task.comments).selectinload(Comment.author),
    selectinload(Task.comments).selectinload(Comment.attachments),
    selectinload(Task.attachments),
    selectinload(Task.materials).selectinload(TaskMaterial.material_variant).selectinload(MaterialVariant.material),
)


def _require_membership(db: Session, project_id: int, user_id: int) -> ProjectMember:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return membership


def _get_task(db: Session, project_id: int, task_id: int) -> Task:
    task = db.query(Task).options(*TASK_LOAD_OPTIONS).filter(Task.id == task_id).first()
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _resolve_related_pins(db: Session, project_id: int, pin_ids: list[int]) -> list[Pin]:
    if not pin_ids:
        return []
    pins = db.query(Pin).join(Sheet, Pin.sheet_id == Sheet.id).filter(Pin.id.in_(pin_ids), Sheet.project_id == project_id).all()
    found_ids = {p.id for p in pins}
    missing = set(pin_ids) - found_ids
    if missing:
        raise HTTPException(status_code=400, detail=f"Pins not found on this project: {sorted(missing)}")
    return pins


def _validate_owner(db: Session, project_id: int, owner_id: int | None):
    if owner_id is None:
        return
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == owner_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=400, detail="Owner must be a member of this project")


@router.post("", response_model=TaskOut)
async def create_task(
    project_id: int,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    _validate_owner(db, project_id, payload.owner_id)
    related_pins = _resolve_related_pins(db, project_id, payload.related_pin_ids)

    task = Task(
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        owner_id=payload.owner_id,
        due_date=payload.due_date,
        created_by_id=user.id,
    )
    task.related_pins = related_pins
    db.add(task)
    db.commit()
    db.refresh(task)
    task = _get_task(db, project_id, task.id)

    await manager.broadcast_to_project(
        project_id, {"event": "task_created", "task": TaskOut.model_validate(task).model_dump(mode="json")}
    )

    if task.owner_id and task.owner_id != user.id:
        await notify(
            db,
            user_id=task.owner_id,
            type="task_assignment",
            message=f'{user.full_name} assigned you a task: "{task.title}"',
            project_id=project_id,
        )

    return task


@router.get("", response_model=list[TaskOut])
def list_tasks(
    project_id: int,
    status: TaskStatus | None = None,
    owner_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    query = db.query(Task).options(*TASK_LOAD_OPTIONS).filter(Task.project_id == project_id)
    if status:
        query = query.filter(Task.status == status)
    if owner_id:
        query = query.filter(Task.owner_id == owner_id)
    return query.order_by(Task.created_at.desc()).all()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(project_id: int, task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_membership(db, project_id, user.id)
    return _get_task(db, project_id, task_id)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    project_id: int,
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    task = _get_task(db, project_id, task_id)

    update_data = payload.model_dump(exclude_unset=True)
    related_pin_ids = update_data.pop("related_pin_ids", None)

    if "owner_id" in update_data:
        _validate_owner(db, project_id, update_data["owner_id"])
    previous_owner_id = task.owner_id

    for field, value in update_data.items():
        setattr(task, field, value)

    if payload.status == TaskStatus.DONE and task.completed_at is None:
        task.completed_at = datetime.utcnow()
        just_completed = True
    else:
        just_completed = False
        if payload.status and payload.status != TaskStatus.DONE:
            task.completed_at = None

    if related_pin_ids is not None:
        task.related_pins = _resolve_related_pins(db, project_id, related_pin_ids)

    db.commit()
    task = _get_task(db, project_id, task_id)

    await manager.broadcast_to_project(
        project_id, {"event": "task_updated", "task": TaskOut.model_validate(task).model_dump(mode="json")}
    )

    if just_completed:
        await log_activity(
            db,
            project_id,
            ActivityKind.TASK_COMPLETED,
            f'{user.full_name} completed "{task.title}"',
            actor=user,
            extra={"task_id": task.id},
        )

    if task.owner_id and task.owner_id != previous_owner_id and task.owner_id != user.id:
        await notify(
            db,
            user_id=task.owner_id,
            type="task_assignment",
            message=f'{user.full_name} assigned you a task: "{task.title}"',
            project_id=project_id,
        )

    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    project_id: int, task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_membership(db, project_id, user.id)
    task = _get_task(db, project_id, task_id)

    # Deleting a task shouldn't silently delete calendar entries tied to it —
    # unlink them instead so they stay on the schedule as standalone jobs.
    linked_jobs = db.query(ScheduledJob).filter(ScheduledJob.task_id == task_id).all()
    for job in linked_jobs:
        job.task_id = None

    db.delete(task)
    db.commit()

    await manager.broadcast_to_project(project_id, {"event": "task_deleted", "task_id": task_id})


# ---- Task comments ----


def _require_task_membership(db: Session, task_id: int, user_id: int) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == task.project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return task


@task_comments_router.post("", response_model=CommentOut)
async def add_task_comment(
    task_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = _require_task_membership(db, task_id, user.id)
    comment = Comment(task_id=task_id, author_id=user.id, body=payload.body)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    await manager.broadcast_to_project(
        task.project_id,
        {"event": "task_comment_created", "comment": CommentOut.model_validate(comment).model_dump(mode="json")},
    )

    await log_activity(
        db,
        task.project_id,
        ActivityKind.COMMENT_ADDED,
        f'{user.full_name} commented on task "{task.title}"',
        actor=user,
        extra={"task_id": task.id},
    )

    interested = {task.created_by_id, task.owner_id} - {user.id, None}
    for uid in interested:
        await notify(
            db,
            user_id=uid,
            type="comment",
            message=f'{user.full_name} commented on task "{task.title}"',
            project_id=task.project_id,
        )

    return comment


@task_comments_router.get("", response_model=list[CommentOut])
def list_task_comments(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_task_membership(db, task_id, user.id)
    return db.query(Comment).filter(Comment.task_id == task_id).order_by(Comment.created_at).all()
