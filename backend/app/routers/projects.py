from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.comment import Comment
from app.models.enums import PinStatus
from app.models.activity_event import ActivityEvent
from app.models.pin import Pin
from app.models.project import Project, ProjectMember
from app.models.enums import ProjectRole
from app.models.sheet import Sheet
from app.models.user import User
from app.routers.channels import _ensure_general_channel as ensure_general_channel
from app.services.activity_service import ActivityKind, log_activity
from app.schemas.schemas import (
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    ProjectMemberAdd,
    ProjectMemberOut,
    ProjectMemberRoleUpdate,
    ProjectDashboard,
    OverduePin,
    ActivityEventOut,
    SearchResults,
    SearchPinHit,
    PinOut,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _require_membership(db: Session, project_id: int, user_id: int) -> ProjectMember:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return membership


@router.post("", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = Project(name=payload.name, address=payload.address, created_by_id=user.id)
    db.add(project)
    db.flush()

    db.add(ProjectMember(project_id=project.id, user_id=user.id, role=ProjectRole.OWNER))
    ensure_general_channel(db, project.id, user.id)  # BS-101-1: General channel automatically created
    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectOut])
def list_my_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == user.id)
        .all()
    )


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_membership(db, project_id, user.id)
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = _require_membership(db, project_id, user.id)
    if membership.role not in (ProjectRole.OWNER, ProjectRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owners/admins can edit project details")

    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Project name can't be empty")
        data["name"] = name

    for field, value in data.items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/members", response_model=ProjectMemberOut)
async def add_member(
    project_id: int,
    payload: ProjectMemberAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = _require_membership(db, project_id, user.id)
    if membership.role not in (ProjectRole.OWNER, ProjectRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owners/admins can add members")

    target_user = db.get(User, payload.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == payload.user_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member")

    new_member = ProjectMember(project_id=project_id, user_id=payload.user_id, role=payload.role)
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    await log_activity(
        db,
        project_id,
        ActivityKind.MEMBER_JOINED,
        f"{target_user.full_name} joined the project",
        actor=target_user,
        extra={"user_id": target_user.id, "role": new_member.role.value},
    )

    return new_member


@router.get("/{project_id}/members", response_model=list[ProjectMemberOut])
def list_members(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_membership(db, project_id, user.id)
    return db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()


def _count_owners(db: Session, project_id: int) -> int:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.role == ProjectRole.OWNER)
        .count()
    )


@router.patch("/{project_id}/members/{member_id}", response_model=ProjectMemberOut)
def update_member_role(
    project_id: int,
    member_id: int,
    payload: ProjectMemberRoleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = _require_membership(db, project_id, user.id)
    if membership.role not in (ProjectRole.OWNER, ProjectRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owners/admins can change roles")

    target = db.get(ProjectMember, member_id)
    if not target or target.project_id != project_id:
        raise HTTPException(status_code=404, detail="Member not found")

    if target.role == ProjectRole.OWNER and payload.role != ProjectRole.OWNER and _count_owners(db, project_id) <= 1:
        raise HTTPException(status_code=400, detail="Project must have at least one owner")

    target.role = payload.role
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{project_id}/members/{member_id}", status_code=204)
def remove_member(
    project_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = _require_membership(db, project_id, user.id)
    target = db.get(ProjectMember, member_id)
    if not target or target.project_id != project_id:
        raise HTTPException(status_code=404, detail="Member not found")

    is_self = target.user_id == user.id
    if not is_self and membership.role not in (ProjectRole.OWNER, ProjectRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owners/admins can remove other members")

    if target.role == ProjectRole.OWNER and _count_owners(db, project_id) <= 1:
        raise HTTPException(status_code=400, detail="Project must have at least one owner — promote someone else first")

    db.delete(target)
    db.commit()


@router.get("/{project_id}/dashboard", response_model=ProjectDashboard)
def project_dashboard(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_membership(db, project_id, user.id)

    pins = db.query(Pin).join(Sheet, Pin.sheet_id == Sheet.id).filter(Sheet.project_id == project_id).all()

    by_status: dict[str, int] = {}
    by_trade: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    overdue: list[OverduePin] = []
    now = datetime.now(timezone.utc)

    for pin in pins:
        by_status[pin.status.value] = by_status.get(pin.status.value, 0) + 1
        by_priority[pin.priority.value] = by_priority.get(pin.priority.value, 0) + 1
        if pin.trade:
            by_trade[pin.trade.value] = by_trade.get(pin.trade.value, 0) + 1

        if pin.status not in (PinStatus.RESOLVED, PinStatus.VERIFIED):
            days_open = (now - pin.created_at).days
            if days_open >= 7:
                overdue.append(
                    OverduePin(
                        id=pin.id,
                        sheet_id=pin.sheet_id,
                        title=pin.title,
                        status=pin.status,
                        priority=pin.priority,
                        trade=pin.trade,
                        days_open=days_open,
                    )
                )
    overdue.sort(key=lambda p: p.days_open, reverse=True)

    # Recent activity now comes straight from the persisted, generic
    # activity log (BS-201) — every subsystem below funnels events into it,
    # so this is just "the 15 newest rows for this project."
    activity = (
        db.query(ActivityEvent)
        .filter(ActivityEvent.project_id == project_id)
        .order_by(ActivityEvent.created_at.desc())
        .limit(15)
        .all()
    )

    return ProjectDashboard(
        project_id=project_id,
        total_pins=len(pins),
        by_status=by_status,
        by_trade=by_trade,
        by_priority=by_priority,
        overdue=overdue[:20],
        recent_activity=activity,
    )


@router.get("/{project_id}/activity", response_model=list[ActivityEventOut])
def list_activity(
    project_id: int,
    before: datetime | None = None,
    limit: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Paginated project timeline (BS-201). Pass `before` (an ISO timestamp
    from the oldest item you've already loaded) to page further back."""
    _require_membership(db, project_id, user.id)
    limit = max(1, min(limit, 100))

    query = db.query(ActivityEvent).filter(ActivityEvent.project_id == project_id)
    if before:
        query = query.filter(ActivityEvent.created_at < before)

    return query.order_by(ActivityEvent.created_at.desc()).limit(limit).all()


@router.get("/{project_id}/search", response_model=SearchResults)
def search_project(
    project_id: int,
    q: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_membership(db, project_id, user.id)
    if not q or not q.strip():
        return SearchResults(query=q, results=[])

    term = f"%{q.strip()}%"

    title_matches = (
        db.query(Pin)
        .join(Sheet, Pin.sheet_id == Sheet.id)
        .filter(Sheet.project_id == project_id, Pin.title.ilike(term))
        .all()
    )

    comment_matches = (
        db.query(Comment)
        .join(Pin, Comment.pin_id == Pin.id)
        .join(Sheet, Pin.sheet_id == Sheet.id)
        .filter(Sheet.project_id == project_id, Comment.body.ilike(term))
        .all()
    )

    results: list[SearchPinHit] = []

    for pin in title_matches:
        results.append(SearchPinHit(pin=PinOut.model_validate(pin), sheet_id=pin.sheet_id, matched_on="title"))

    for comment in comment_matches:
        snippet = comment.body if len(comment.body) <= 140 else comment.body[:137] + "..."
        results.append(
            SearchPinHit(
                pin=PinOut.model_validate(comment.pin),
                sheet_id=comment.pin.sheet_id,
                matched_on="comment",
                snippet=snippet,
            )
        )

    return SearchResults(query=q, results=results)
