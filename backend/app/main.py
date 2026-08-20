import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from secure import Secure

from app.core.config import settings
from app.core.database import Base, engine
from app.core.limiter import limiter
from app.routers import auth, projects, sheets, pins, comments, notifications, websocket, materials, pin_materials, costs, attachments, messages, schedule, tasks, task_materials, channels, estimates
import app.models  # noqa: F401 ensures all models are registered before create_all

os.makedirs(settings.upload_dir, exist_ok=True)

app = FastAPI(title="BuildSync API")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# HSTS tells the browser "always use HTTPS for this origin, remember that for
# up to a year" -- sending it in local dev (which only serves plain HTTP)
# gets that instruction cached by the browser and breaks localhost until it's
# manually cleared (chrome://net-internals/#hsts). Only send full default
# headers (including HSTS) in production; skip HSTS specifically in debug.
if settings.debug:
    secure_headers = Secure()
else:
    secure_headers = Secure.with_default_headers()


@app.middleware("http")
async def set_secure_headers(request, call_next):
    response = await call_next(request)
    await secure_headers.set_headers_async(response)
    return response


if not settings.debug:  # only redirect in production — breaks local http://localhost dev otherwise
    app.add_middleware(HTTPSRedirectMiddleware)

if settings.allowed_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

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
app.include_router(messages.router)
app.include_router(channels.router)
app.include_router(schedule.router)
app.include_router(schedule.my_schedule_router)
app.include_router(tasks.router)
app.include_router(tasks.task_comments_router)
app.include_router(tasks.router)
app.include_router(tasks.task_comments_router)
app.include_router(task_materials.router)
app.include_router(estimates.router)

# Uploaded plan/photo sheets, served so the frontend can render them directly.
app.mount("/static/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
