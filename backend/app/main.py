import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import Base, engine
from app.routers import auth, projects, sheets, pins, comments, notifications, websocket, materials, pin_materials, costs, attachments
import app.models  # noqa: F401 ensures all models are registered before create_all

Base.metadata.create_all(bind=engine)
os.makedirs(settings.upload_dir, exist_ok=True)

app = FastAPI(title="BuildSync API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(sheets.router)
app.include_router(pins.router)
app.include_router(pins.project_pins_router)
app.include_router(comments.router)
app.include_router(pin_materials.router)
app.include_router(notifications.router)
app.include_router(materials.router)
app.include_router(costs.router)
app.include_router(attachments.router)
app.include_router(websocket.router)

# Uploaded plan/photo sheets, served so the frontend can render them directly.
app.mount("/static/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}