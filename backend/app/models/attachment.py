from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Attachment(Base):
    """A photo or file attached to a pin, a task, a comment, a DM, or a channel
    message. Exactly one of pin_id/task_id/comment_id/message_id/channel_message_id is set."""

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    pin_id: Mapped[int | None] = mapped_column(ForeignKey("pins.id"), nullable=True, index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True, index=True)
    comment_id: Mapped[int | None] = mapped_column(ForeignKey("comments.id"), nullable=True, index=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("direct_messages.id"), nullable=True, index=True)
    channel_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("channel_messages.id"), nullable=True, index=True
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    # Original client-side filename + MIME type, kept separately from the
    # randomized on-disk name so downloads can offer a sensible filename and
    # the UI can decide how to preview/render the attachment.
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # SHA-256 hex digest of the file's bytes at upload time, taken after
    # validation/malware scanning pass. Re-checked on every download so a
    # file modified on disk after upload (compromised process, bad deploy,
    # direct disk access) is caught instead of silently served.
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pin = relationship("Pin", back_populates="attachments")
    task = relationship("Task", back_populates="attachments")
    comment = relationship("Comment", back_populates="attachments")
    message = relationship("DirectMessage", back_populates="attachments")
    channel_message = relationship("ChannelMessage", back_populates="attachments")
    uploaded_by = relationship("User")
