from datetime import datetime

from sqlalchemy import Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DirectMessage(Base):
    """A 1:1 chat message between two members of the same project.

    Scoped to a project (not global) since that's the shared context these
    people actually have — mirrors how pins/comments are project-scoped.
    """

    __tablename__ = "direct_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    recipient_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Set when a message is auto-generated about a specific task (e.g. an
    # assignment ping), so the chat UI can render a "View task" link/button
    # on it. Null for ordinary human-typed messages.
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])
    attachments = relationship("Attachment", back_populates="message", cascade="all, delete-orphan")
