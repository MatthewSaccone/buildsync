from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Tracks live WebSocket connections, keyed per-project (live pin/comment feed)
    and per-user (personal notification feed). Also doubles as the source of
    truth for online/offline presence, since a user with an open notification
    socket is, by definition, online."""

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
        was_offline = not self.user_connections[user_id]
        self.user_connections[user_id].add(websocket)
        if was_offline:
            await self.broadcast_presence(user_id, online=True)

    async def disconnect_user(self, user_id: int, websocket: WebSocket) -> None:
        self.user_connections[user_id].discard(websocket)
        if not self.user_connections[user_id]:
            del self.user_connections[user_id]
            await self.broadcast_presence(user_id, online=False)

    def is_online(self, user_id: int) -> bool:
        return bool(self.user_connections.get(user_id))

    def online_user_ids(self) -> set[int]:
        return {uid for uid, conns in self.user_connections.items() if conns}

    async def broadcast_presence(self, user_id: int, online: bool) -> None:
        """Notifies every currently-connected user that someone's status
        changed. Simplest correct approach: presence is genuinely global
        info (any project member might care), and the set of concurrently
        open sockets is small, so a full broadcast is cheap and avoids
        needing project-membership lookups here."""
        event = {"event": "presence_changed", "user_id": user_id, "online": online}
        dead: list[tuple[int, WebSocket]] = []
        for uid, sockets in self.user_connections.items():
            for ws in sockets:
                try:
                    await ws.send_json(event)
                except Exception:
                    dead.append((uid, ws))
        for uid, ws in dead:
            self.user_connections[uid].discard(ws)

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
            await self.disconnect_user(user_id, ws)


manager = ConnectionManager()
