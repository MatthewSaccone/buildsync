from datetime import timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """A DateTime column that always round-trips as timezone-aware UTC.

    SQLite (and MySQL) have no native "timestamp with timezone" storage —
    SQLAlchemy's `DateTime(timezone=True)` silently degrades to a naive
    column on those backends, so values written as `datetime.now(timezone.utc)`
    come back out of the database with `tzinfo=None`. FastAPI/Pydantic then
    serializes that naive value with no offset (e.g. "2026-08-04T22:24:33"),
    which browsers parse as *local* time instead of UTC — every timestamp in
    the UI ends up shifted by the viewer's UTC offset.

    This type stores naive UTC in the database (for portability) but always
    hands back a timezone-aware `datetime` in UTC to the application, so the
    JSON response includes an explicit "Z" and clients parse it correctly.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
