from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.models.project import ProjectMember
from app.models.user import User
from app.services.connection_manager import manager

router = APIRouter(tags=["websocket"])


def _authenticate(token: str) -> User | None:
    """Browsers can't set custom headers on WebSocket handshakes, so the JWT
    is passed as a query param instead of the usual Authorization header."""
    db: Session = SessionLocal()
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return db.get(User, int(user_id))
    except JWTError:
        return None
    finally:
        db.close()


@router.websocket("/ws/projects/{project_id}")
async def project_socket(websocket: WebSocket, project_id: int, token: str = Query(...)):
    user = _authenticate(token)
    if user is None:
        await websocket.close(code=4401)
        return

    db: Session = SessionLocal()
    try:
        membership = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
            .first()
        )
    finally:
        db.close()

    if not membership:
        await websocket.close(code=4403)
        return

    await manager.connect_project(project_id, websocket)
    try:
        while True:
            # Clients don't send anything meaningful over this socket; just keep it open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_project(project_id, websocket)


@router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket, token: str = Query(...)):
    user = _authenticate(token)
    if user is None:
        await websocket.close(code=4401)
        return

    await manager.connect_user(user.id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_user(user.id, websocket)
