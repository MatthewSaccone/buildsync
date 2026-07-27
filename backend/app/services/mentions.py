import re

from sqlalchemy.orm import Session

from app.models.project import ProjectMember
from app.models.user import User

MENTION_PATTERN = re.compile(r"@([\w.+-]+(?:@[\w.-]+\.\w+)?)")


def parse_mentioned_users(body: str, project_id: int, db: Session) -> list[User]:
    """Finds @handles in a message body and matches them against project members.

    A handle matches if it equals the member's email, or the first "word" of
    their full name (case-insensitive) — so both "@sarah" and
    "@sarah@acme.com" work. Returns each matched user at most once.
    """
    handles = {h.lower() for h in MENTION_PATTERN.findall(body)}
    if not handles:
        return []

    members = (
        db.query(User)
        .join(ProjectMember, ProjectMember.user_id == User.id)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )

    matched: dict[int, User] = {}
    for member in members:
        first_name = member.full_name.split(" ")[0].lower()
        email = member.email.lower()
        if first_name in handles or email in handles:
            matched[member.id] = member

    return list(matched.values())
