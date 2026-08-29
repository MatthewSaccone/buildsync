print("!!!!! CONFTEST.PY LOADED FROM:", __file__, "!!!!!")

import os
os.environ["ALLOWED_HOSTS"] = "testserver"

import tempfile
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.deps import get_current_user
from app.main import app
from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.enums import UserRole, ProjectRole

@pytest.fixture()
def db_session():
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        os.close(db_fd)
        os.unlink(db_path)


@pytest.fixture()
def test_user(db_session):
    user = User(
        email="tester@example.com",
        hashed_password="not-a-real-hash",
        full_name="Test User",
        role=UserRole.GENERAL_CONTRACTOR,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def test_project(db_session, test_user):
    project = Project(name="Test Project", created_by_id=test_user.id)
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    membership = ProjectMember(project_id=project.id, user_id=test_user.id, role=ProjectRole.OWNER)
    db_session.add(membership)
    db_session.commit()
    return project


@pytest.fixture()
def client(db_session, test_user):
    def override_get_db():
        print("\n\nOVERRIDE YIELDING SESSION ID:", id(db_session), "ENGINE:", db_session.bind.url)
        yield db_session

    def override_get_current_user():
        return test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield TestClient(app)
    app.dependency_overrides.clear()
