# BuildSync — Backend Scaffold

A FastAPI backend for a project-communication tool aimed at architects, custom
home builders, and trades/contractors. Core idea: instead of back-and-forth
messaging, issues live as **pins on a plan or job-site photo**, each with its
own threaded comments, status, priority, and assigned trade.

## Data model

- **User** — has a role (architect, builder, GC, electrician, plumber, etc.)
- **Project** — a job; has members with roles (owner/admin/member/viewer)
- **Sheet** — an uploaded plan page or job-site photo, versioned
- **Pin** — an (x, y) location on a sheet with a title, status
  (open/in_progress/blocked/resolved/verified), priority, and optional trade
  + assignee
- **Comment** — threaded replies scoped to a single pin

This structure means every conversation is tied to a specific spot on a
specific sheet, with a clear owner and status — instead of a flat chat log
where issues get lost.

## Running it

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Visit `http://localhost:8000/docs` for interactive API docs (Swagger UI).

By default it uses SQLite (`buildsync.db`) so there's zero setup to try it.
For production, set `DATABASE_URL` in a `.env` file to a Postgres URL.

## API flow (tested working)

1. `POST /auth/signup` → `POST /auth/login` (returns JWT)
2. `POST /projects` → create a project (creator becomes owner)
3. `POST /projects/{id}/members` → invite architects/trades onto the job
4. `POST /projects/{id}/sheets` → upload a plan page or photo (multipart)
5. `POST /sheets/{id}/pins` → drop a pin with a location + title + trade
6. `POST /pins/{id}/comments` → thread discussion on that specific issue
7. `PATCH /sheets/{sheet_id}/pins/{pin_id}` → update status (open → resolved)
8. `GET /sheets/{id}/pins?status=open&trade=electrician` → filter the punch
   list by trade or status — this is the "who owes what" view

