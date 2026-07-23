from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Tracks live WebSocket connections, keyed per-project (live pin/comment feed)
    and per-user (personal notification feed)."""

    def __init__(self) -> None:
        self.project_connections: dict[int, set[WebSocket]] = defaultdict(set)
        self.user_connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect_project(self, project_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.project_connections[project_id].add(websocket)

    def disconnect_project(self, project_id: int, websocket: WebSocket) -> None:
        self.project_connections[project_id].discard(websocket)
        if not self.project_connections[project_id]:
            del self.project_connections[project_id]

    async def connect_user(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.user_connections[user_id].add(websocket)

    def disconnect_user(self, user_id: int, websocket: WebSocket) -> None:
        self.user_connections[user_id].discard(websocket)
        if not self.user_connections[user_id]:
            del self.user_connections[user_id]

    async def broadcast_to_project(self, project_id: int, message: dict) -> None:
        dead = []
        for ws in self.project_connections.get(project_id, set()):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_project(project_id, ws)

    async def send_to_user(self, user_id: int, message: dict) -> None:
        dead = []
        for ws in self.user_connections.get(user_id, set()):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_user(user_id, ws)


manager = ConnectionManager()
