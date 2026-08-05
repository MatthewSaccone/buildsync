# Buildsync

> The construction project management platform that connects teams, tasks, communication, documents, and project data in one unified workspace.

![Buildsync Banner](./assets/banner.png)

## 🚧 Overview

Construction projects are often managed across disconnected tools — spreadsheets for costs, messaging apps for communication, PDFs for plans, and separate systems for scheduling and documentation.

**Buildsync brings everything together into one centralized workspace built specifically for architects, builders, contractors, and construction teams.**

Instead of losing important conversations in chat threads, Buildsync connects discussions and tasks directly to the project itself — whether that is a plan sheet, job-site photo, task, or project milestone.

The goal is simple:

**Make construction projects easier to coordinate, track, and complete.**

---

# ✨ Features

## 📌 Project Pins & Issue Tracking

Keep project conversations tied to the exact location where they matter.

- Drop pins directly onto plans or job-site images
- Assign issues to specific trades or team members
- Track status:
  - Open
  - In Progress
  - Blocked
  - Resolved
  - Verified
- Add threaded comments
- Connect issues to project tasks

This replaces scattered conversations with location-based project intelligence.

---

## ✅ Task Management

A construction-focused task management system similar to Jira.

Each task supports:

- Task owner
- Due dates
- Priority levels
- Status tracking
- Comments
- Photos
- Attachments
- Related project pins

Teams can clearly see:

> Who owns what, when it is due, and what needs attention.

---

## 📅 Project Scheduling

Manage project timelines directly inside Buildsync.

Features:

- Project calendar
- Milestones
- Important deadlines
- Schedule visibility across the team

---

## 💬 Team Communication

Keep all project communication in one place.

Features:

- Project-wide chat
- Direct messaging
- Task-related conversations
- Notifications
- Assignment updates

When team members are assigned work, they can immediately access the related task or issue.

---

## 📄 Project Documentation

Centralize project files and documentation.

Supports:

- Plan sheets
- Job-site photos
- Attachments
- Project documents
- Versioned files

---

## 💰 Cost Management

Track project expenses and financial information.

Features:

- Material costs
- Project expenses
- Cost visibility
- Organized project budgeting

---

## 👥 Team Management

Manage everyone involved in a project.

Supports:

- Architects
- General contractors
- Builders
- Trades
- Project members

Roles include:

- Owner
- Admin
- Member
- Viewer

---

# 🏗️ System Architecture

The Buildsync platform follows a modern full-stack architecture with a Next.js frontend, FastAPI backend, relational database layer, and cloud-ready storage/services.

```mermaid
flowchart TB

%% USERS
A[👷 Construction Teams<br/>
Architects<br/>
Builders<br/>
Trades<br/>
Project Managers]

%% FRONTEND
B[🌐 Next.js Frontend<br/>
React + TypeScript<br/>
Tailwind CSS]

C[Frontend Features<br/>
- Dashboard<br/>
- Projects<br/>
- Tasks<br/>
- Calendar<br/>
- Chat<br/>
- Pins<br/>
- Costs<br/>
- Team Management]

%% API
D[⚡ FastAPI Backend<br/>
REST API Layer]

E[Authentication Service<br/>
JWT Tokens<br/>
User Sessions]

F[Project Service<br/>
Projects<br/>
Members<br/>
Permissions]

G[Task Service<br/>
Tasks<br/>
Assignments<br/>
Statuses]

H[Communication Service<br/>
Chat<br/>
Direct Messages<br/>
Notifications]

I[Document Service<br/>
Sheets<br/>
Photos<br/>
Attachments]

J[Pin Service<br/>
Plan Locations<br/>
Issues<br/>
Comments]

%% DATABASE
K[(🗄️ Database<br/>
SQLite / PostgreSQL)]

L[Database Models<br/>
Users<br/>
Projects<br/>
Sheets<br/>
Pins<br/>
Tasks<br/>
Messages<br/>
Comments]

%% STORAGE
M[☁️ File Storage<br/>
Plans<br/>
Images<br/>
Attachments]

%% FLOW

A --> B

B --> C

C --> D

D --> E
D --> F
D --> G
D --> H
D --> I
D --> J

E --> K
F --> K
G --> K
H --> K
I --> K
J --> K

K --> L

I --> M

M --> D

---

# 🏗️ Core Data Model

## User

Represents a project participant.

Examples:

- Architect
- Builder
- General contractor
- Electrician
- Plumber
- Other trades

---

## Project

A construction job containing:

- Members
- Sheets
- Tasks
- Costs
- Conversations
- Documentation

---

## Sheet

Represents:

- Uploaded construction plans
- Blueprints
- Job-site photos

Sheets are versioned to maintain project history.

---

## Pin

A location-based issue attached to a sheet.

Contains:

- Position (x, y coordinates)
- Title
- Description
- Status
- Priority
- Trade
- Assignee

---

## Task

A project action item.

Contains:

- Owner
- Due date
- Priority
- Status
- Comments
- Attachments
- Related pins

---

## Comment

Threaded communication attached to:

- Pins
- Tasks
- Project discussions

---

# 🛠️ Tech Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

## Backend

- FastAPI
- Python
- SQLAlchemy
- SQLite / PostgreSQL

## Infrastructure

- REST APIs
- JWT Authentication
- Uvicorn
- GitHub

---

# 📂 Project Structure

```text
buildsync/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── public/
│
├── backend/
│   ├── app/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── database/
│
└── README.md
```

---

# 🚀 Running Buildsync Locally

## Backend Setup

```bash
cd backend

pip install -r requirements.txt

uvicorn app.main:app --reload
```

Backend runs at:

```
http://localhost:8000
```

API documentation:

```
http://localhost:8000/docs
```

---

## Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

Frontend runs at:

```
http://localhost:3000
```

---

# 🔄 Current API Workflow

Example project workflow:

1. Create an account

```
POST /auth/signup
```

2. Login and receive JWT authentication

```
POST /auth/login
```

3. Create a project

```
POST /projects
```

4. Add team members

```
POST /projects/{id}/members
```

5. Upload plans or site photos

```
POST /projects/{id}/sheets
```

6. Create project pins

```
POST /sheets/{id}/pins
```

7. Start issue discussions

```
POST /pins/{id}/comments
```

8. Update issue status

```
PATCH /sheets/{sheet_id}/pins/{pin_id}
```

9. Filter outstanding work

```
GET /sheets/{id}/pins?status=open&trade=electrician
```

---

# 🛣️ Roadmap

## Completed

✅ Project Dashboard  
✅ Project Scheduling / Calendar  
✅ Task Management  
✅ Project Pins  
✅ Team Management  
✅ Project Chat  
✅ Direct Messaging  
✅ Notifications  
✅ Cost Tracking  
✅ File Attachments  

---

## Upcoming

⬜ AI construction assistant  
⬜ Automated project reporting  
⬜ Mobile application  
⬜ Contractor/vendor management  
⬜ Advanced analytics  
⬜ Document intelligence  
⬜ Automated progress tracking  

---

# 🎯 Vision

Buildsync aims to become the operating system for construction projects.

By combining communication, scheduling, documentation, and project management into one platform, Buildsync helps construction teams reduce delays, improve accountability, and complete projects more efficiently.

---

# 🤝 Contributing

Buildsync is currently under active development.

Future contributors will be able to:

- Submit feature requests
- Report bugs
- Improve documentation
- Add new integrations

---

# 📄 License

MIT License
