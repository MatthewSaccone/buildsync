def test_create_and_list_daily_log(client, test_project):
    resp = client.post(
        f"/projects/{test_project.id}/daily-logs",
        json={
            "log_date": "2026-08-01",
            "weather": "Clear, 75F",
            "crew": "3 framers, 1 electrician",
            "hours_worked": 8.5,
            "completed_work": "Framed north wall",
            "delays": None,
            "visitors": "Inspector - passed rough framing",
            "safety_notes": "No incidents",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["log_date"] == "2026-08-01"
    assert body["weather"] == "Clear, 75F"

    list_resp = client.get(f"/projects/{test_project.id}/daily-logs")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


def test_duplicate_date_rejected(client, test_project):
    payload = {"log_date": "2026-08-01"}
    first = client.post(f"/projects/{test_project.id}/daily-logs", json=payload)
    assert first.status_code == 200

    second = client.post(f"/projects/{test_project.id}/daily-logs", json=payload)
    assert second.status_code == 400


def test_hours_worked_bounds_rejected(client, test_project):
    resp = client.post(
        f"/projects/{test_project.id}/daily-logs",
        json={"log_date": "2026-08-02", "hours_worked": 30},
    )
    assert resp.status_code == 422


def test_blank_field_rejected(client, test_project):
    resp = client.post(
        f"/projects/{test_project.id}/daily-logs",
        json={"log_date": "2026-08-03", "weather": "   "},
    )
    assert resp.status_code == 422


def test_update_and_delete(client, test_project):
    create = client.post(f"/projects/{test_project.id}/daily-logs", json={"log_date": "2026-08-04"})
    log_id = create.json()["id"]

    update = client.patch(
        f"/projects/{test_project.id}/daily-logs/{log_id}",
        json={"delays": "Rain delayed concrete pour by 3 hours"},
    )
    assert update.status_code == 200
    assert update.json()["delays"] == "Rain delayed concrete pour by 3 hours"

    delete = client.delete(f"/projects/{test_project.id}/daily-logs/{log_id}")
    assert delete.status_code == 204

    get_after = client.get(f"/projects/{test_project.id}/daily-logs/{log_id}")
    assert get_after.status_code == 404


def test_non_member_blocked(client, db_session):
    from app.models.project import Project

    other_project = Project(name="Someone Else's Project", created_by_id=999)
    db_session.add(other_project)
    db_session.commit()

    resp = client.post(f"/projects/{other_project.id}/daily-logs", json={"log_date": "2026-08-05"})
    assert resp.status_code == 403


def test_diagnostic_table_names(db_session):
    from app.core.database import Base
    table_names = sorted(Base.metadata.tables.keys())
    print("\n\nTABLES IN METADATA:", table_names)
    assert "daily_logs" in table_names


def test_diagnostic_direct_insert(db_session, test_project, test_user):
    from datetime import date
    from app.models.daily_log import DailyLog

    log = DailyLog(project_id=test_project.id, created_by_id=test_user.id, log_date=date(2026, 8, 1))
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    print("\n\nDIRECT INSERT/REFRESH SUCCEEDED, id =", log.id)
    assert log.id is not None
