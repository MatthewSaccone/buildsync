from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.daily_log import DailyLog
from app.models.project import ProjectMember
from app.models.user import User
from app.schemas.schemas import DailyLogCreate, DailyLogUpdate, DailyLogOut
from app.services.activity_service import ActivityKind, log_activity

router = APIRouter(prefix="/projects/{project_id}/daily-logs", tags=["daily-logs"])


def _require_membership(db: Session, project_id: int, user_id: int) -> ProjectMember:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return membership


def _get_log(db: Session, project_id: int, log_id: int) -> DailyLog:
    log = (
        db.query(DailyLog)
        .options(selectinload(DailyLog.created_by))
        .filter(DailyLog.id == log_id, DailyLog.project_id == project_id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Daily log not found")
    return log


@router.post("", response_model=DailyLogOut)
async def create_daily_log(
    project_id: int,
    payload: DailyLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    print("\n\nROUTE RECEIVED SESSION ID:", id(db), "ENGINE:", db.bind.url)
    _require_membership(db, project_id, user.id)

    existing = (
        db.query(DailyLog)
        .filter(DailyLog.project_id == project_id, DailyLog.log_date == payload.log_date)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="A daily log already exists for this date")

    log = DailyLog(project_id=project_id, created_by_id=user.id, **payload.model_dump())
    db.add(log)
    db.commit()
    print("\n\nDB ENGINE URL AT REFRESH TIME:", db.bind.url)
    db.refresh(log)

    log_activity(db, project_id, ActivityKind.DAILY_LOG_CREATED, f"Daily log added for {payload.log_date}", user)
    return log


@router.get("", response_model=list[DailyLogOut])
def list_daily_logs(
    project_id: int,
    start_date: str | None = Query(default=None, max_length=10),
    end_date: str | None = Query(default=None, max_length=10),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    query = (
        db.query(DailyLog)
        .options(selectinload(DailyLog.created_by))
        .filter(DailyLog.project_id == project_id)
    )
    if start_date:
        query = query.filter(DailyLog.log_date >= start_date)
    if end_date:
        query = query.filter(DailyLog.log_date <= end_date)
    return query.order_by(DailyLog.log_date.desc()).all()


@router.get("/{log_id}", response_model=DailyLogOut)
def get_daily_log(project_id: int, log_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_membership(db, project_id, user.id)
    return _get_log(db, project_id, log_id)


@router.patch("/{log_id}", response_model=DailyLogOut)
def update_daily_log(
    project_id: int,
    log_id: int,
    payload: DailyLogUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    log = _get_log(db, project_id, log_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(log, field, value)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/{log_id}", status_code=204)
def delete_daily_log(project_id: int, log_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_membership(db, project_id, user.id)
    log = _get_log(db, project_id, log_id)
    db.delete(log)
    db.commit()
