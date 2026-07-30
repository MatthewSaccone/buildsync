from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.enums import JobStatus, UserRole
from app.models.pin import Pin
from app.models.project import Project, ProjectMember
from app.models.scheduled_job import ScheduledJob
from app.models.task import Task
from app.models.user import User
from app.schemas.schemas import ScheduledJobCreate, ScheduledJobUpdate, ScheduledJobOut
from app.services.notification_service import notify

# Scoped to a single project — used by the project's own Schedule tab, if/when
# one is added there.
router = APIRouter(prefix="/projects/{project_id}/schedule", tags=["schedule"])

# Cross-project — powers the top-level Schedule page, which pulls scheduled
# jobs from every project the current user belongs to.
my_schedule_router = APIRouter(prefix="/schedule", tags=["schedule"])


def _require_membership(db: Session, project_id: int, user_id: int) -> ProjectMember:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return membership


def _serialize(db: Session, job: ScheduledJob) -> ScheduledJobOut:
    project = db.get(Project, job.project_id)
    assignee = db.get(User, job.assigned_to_id) if job.assigned_to_id else None
    pin = db.get(Pin, job.pin_id) if job.pin_id else None
    task = db.get(Task, job.task_id) if job.task_id else None
    return ScheduledJobOut(
        id=job.id,
        project_id=job.project_id,
        pin_id=job.pin_id,
        task_id=job.task_id,
        title=job.title,
        trade=job.trade,
        status=job.status,
        assigned_to_id=job.assigned_to_id,
        depends_on_id=job.depends_on_id,
        start_time=job.start_time,
        end_time=job.end_time,
        created_by_id=job.created_by_id,
        created_at=job.created_at,
        project_name=project.name if project else None,
        project_address=project.address if project else None,
        assignee_name=assignee.full_name if assignee else None,
        pin_title=pin.title if pin else None,
        task_title=task.title if task else None,
    )


def _validate_assignee(db: Session, project_id: int, assigned_to_id: int | None):
    if assigned_to_id is None:
        return
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == assigned_to_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=400, detail="Assignee must be a member of this project")


def _validate_depends_on(db: Session, project_id: int, depends_on_id: int | None, self_id: int | None = None):
    if depends_on_id is None:
        return
    if depends_on_id == self_id:
        raise HTTPException(status_code=400, detail="A job can't depend on itself")
    dep = db.get(ScheduledJob, depends_on_id)
    if not dep or dep.project_id != project_id:
        raise HTTPException(status_code=400, detail="Dependency must be a job on the same project")


def _validate_task(db: Session, project_id: int, task_id: int | None):
    if task_id is None:
        return
    task = db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=400, detail="Task must belong to the same project")


@router.post("", response_model=ScheduledJobOut)
async def create_scheduled_job(
    project_id: int,
    payload: ScheduledJobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    _validate_assignee(db, project_id, payload.assigned_to_id)
    _validate_depends_on(db, project_id, payload.depends_on_id)
    _validate_task(db, project_id, payload.task_id)

    if payload.pin_id is not None:
        pin = db.get(Pin, payload.pin_id)
        if not pin:
            raise HTTPException(status_code=404, detail="Pin not found")

    job = ScheduledJob(
        project_id=project_id,
        pin_id=payload.pin_id,
        task_id=payload.task_id,
        title=payload.title,
        trade=payload.trade,
        assigned_to_id=payload.assigned_to_id,
        depends_on_id=payload.depends_on_id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        created_by_id=user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    if job.assigned_to_id and job.assigned_to_id != user.id:
        await notify(
            db,
            user_id=job.assigned_to_id,
            type="schedule_assignment",
            message=f'{user.full_name} scheduled you for "{job.title}" on {job.start_time.strftime("%b %d")}',
            project_id=project_id,
        )

    return _serialize(db, job)


@router.get("", response_model=list[ScheduledJobOut])
def list_project_schedule(
    project_id: int,
    start: datetime | None = None,
    end: datetime | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    query = db.query(ScheduledJob).filter(ScheduledJob.project_id == project_id)
    if start:
        query = query.filter(ScheduledJob.end_time >= start)
    if end:
        query = query.filter(ScheduledJob.start_time <= end)
    jobs = query.order_by(ScheduledJob.start_time).all()
    return [_serialize(db, j) for j in jobs]


@router.patch("/{job_id}", response_model=ScheduledJobOut)
async def update_scheduled_job(
    project_id: int,
    job_id: int,
    payload: ScheduledJobUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    job = db.get(ScheduledJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "assigned_to_id" in update_data:
        _validate_assignee(db, project_id, update_data["assigned_to_id"])
    if "depends_on_id" in update_data:
        _validate_depends_on(db, project_id, update_data["depends_on_id"], self_id=job.id)
    if "task_id" in update_data:
        _validate_task(db, project_id, update_data["task_id"])

    previous_assignee_id = job.assigned_to_id

    new_start = update_data.get("start_time", job.start_time)
    new_end = update_data.get("end_time", job.end_time)
    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    for field, value in update_data.items():
        setattr(job, field, value)

    db.commit()
    db.refresh(job)

    if job.assigned_to_id and job.assigned_to_id != previous_assignee_id and job.assigned_to_id != user.id:
        await notify(
            db,
            user_id=job.assigned_to_id,
            type="schedule_assignment",
            message=f'{user.full_name} scheduled you for "{job.title}" on {job.start_time.strftime("%b %d")}',
            project_id=project_id,
        )

    return _serialize(db, job)


@router.delete("/{job_id}", status_code=204)
def delete_scheduled_job(
    project_id: int,
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    job = db.get(ScheduledJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status_code=404, detail="Scheduled job not found")
    db.delete(job)
    db.commit()


@my_schedule_router.get("", response_model=list[ScheduledJobOut])
def list_my_schedule(
    start: datetime | None = None,
    end: datetime | None = None,
    project_id: int | None = None,
    trade: UserRole | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Every scheduled job across every project the current user belongs to —
    this is what powers the top-level Schedule page/calendar."""
    my_project_ids = [
        row.project_id
        for row in db.query(ProjectMember.project_id).filter(ProjectMember.user_id == user.id).all()
    ]
    if not my_project_ids:
        return []

    query = db.query(ScheduledJob).filter(ScheduledJob.project_id.in_(my_project_ids))
    if project_id is not None:
        query = query.filter(ScheduledJob.project_id == project_id)
    if trade is not None:
        query = query.filter(ScheduledJob.trade == trade)
    if start:
        query = query.filter(ScheduledJob.end_time >= start)
    if end:
        query = query.filter(ScheduledJob.start_time <= end)

    jobs = query.order_by(ScheduledJob.start_time).all()
    return [_serialize(db, j) for j in jobs]
