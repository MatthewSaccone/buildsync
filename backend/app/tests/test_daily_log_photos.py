import io
from datetime import date

import pytest

from app.models.daily_log import DailyLog
from app.models.sheet import Sheet
from app.models.pin import Pin
from app.models.task import Task


@pytest.fixture(autouse=True)
def _disable_malware_scan(monkeypatch):
    # No clamd daemon in this environment -- these tests exercise the
    # attachment/annotation/copy logic, not the AV integration (which has
    # its own coverage elsewhere).
    monkeypatch.setattr("app.core.uploads.scan_file", lambda path: None)


def _make_daily_log(db_session, project, user):
    log = DailyLog(project_id=project.id, created_by_id=user.id, log_date=date(2026, 8, 29))
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    return log


def _make_pin(db_session, project, user):
    sheet = Sheet(project_id=project.id, title="Sheet 1", file_path="/tmp/sheet.pdf", uploaded_by_id=user.id)
    db_session.add(sheet)
    db_session.commit()
    db_session.refresh(sheet)
    pin = Pin(sheet_id=sheet.id, x=0.5, y=0.5, title="Pin", created_by_id=user.id)
    db_session.add(pin)
    db_session.commit()
    db_session.refresh(pin)
    return pin


def _make_task(db_session, project, user):
    task = Task(project_id=project.id, title="Task", created_by_id=user.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    return task


def _fake_png():
    # Minimal valid PNG header bytes are not required for the test since
    # malware_scan/content-sniffing behavior is exercised elsewhere; here we
    # just need something the endpoint under test will accept in this env.
    return io.BytesIO(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02"
        b"\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01"
        b"\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def test_upload_and_list_daily_log_photo(client, db_session, test_project, test_user):
    log = _make_daily_log(db_session, test_project, test_user)

    resp = client.post(
        f"/daily-logs/{log.id}/attachments",
        files={"file": ("progress.png", _fake_png(), "image/png")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["daily_log_id"] == log.id
    assert body["is_image"] is True

    listing = client.get(f"/daily-logs/{log.id}/attachments")
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_annotate_daily_log_photo(client, db_session, test_project, test_user):
    log = _make_daily_log(db_session, test_project, test_user)
    upload = client.post(
        f"/daily-logs/{log.id}/attachments",
        files={"file": ("progress.png", _fake_png(), "image/png")},
    )
    attachment_id = upload.json()["id"]

    resp = client.put(
        f"/attachments/{attachment_id}/annotations",
        json={"annotations": '[{"type":"circle","x":10,"y":10,"r":5}]'},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["annotations"] == '[{"type":"circle","x":10,"y":10,"r":5}]'


def test_attach_daily_log_photo_to_task_and_pin(client, db_session, test_project, test_user):
    log = _make_daily_log(db_session, test_project, test_user)
    task = _make_task(db_session, test_project, test_user)
    pin = _make_pin(db_session, test_project, test_user)

    upload = client.post(
        f"/daily-logs/{log.id}/attachments",
        files={"file": ("progress.png", _fake_png(), "image/png")},
    )
    attachment_id = upload.json()["id"]

    to_task = client.post(f"/attachments/{attachment_id}/attach", json={"task_id": task.id})
    assert to_task.status_code == 200, to_task.text
    assert to_task.json()["task_id"] == task.id
    assert to_task.json()["source_attachment_id"] == attachment_id

    to_pin = client.post(f"/attachments/{attachment_id}/attach", json={"pin_id": pin.id})
    assert to_pin.status_code == 200, to_pin.text
    assert to_pin.json()["pin_id"] == pin.id

    # original still shows up under the daily log
    listing = client.get(f"/daily-logs/{log.id}/attachments")
    assert len(listing.json()) == 1

    # and now also under the task/pin
    task_attachments = client.get(f"/tasks/{task.id}/attachments")
    assert len(task_attachments.json()) == 1
    pin_attachments = client.get(f"/pins/{pin.id}/attachments")
    assert len(pin_attachments.json()) == 1


def test_attach_requires_exactly_one_target(client, db_session, test_project, test_user):
    log = _make_daily_log(db_session, test_project, test_user)
    upload = client.post(
        f"/daily-logs/{log.id}/attachments",
        files={"file": ("progress.png", _fake_png(), "image/png")},
    )
    attachment_id = upload.json()["id"]

    resp = client.post(f"/attachments/{attachment_id}/attach", json={})
    assert resp.status_code == 422
