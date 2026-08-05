from datetime import datetime, timezone, timezone

from sqlalchemy import String, DateTime, ForeignKey, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Channel(Base):
    """A named chat channel within a project (BS-101). Kept as its own table
    (rather than reusing DirectMessage) since channel messages have no single
    recipient and need per-member read tracking instead of a single read_at.
    """

    __tablename__ = "channels"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_channel_project_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # The auto-created, un-deletable "General" channel every project gets on creation.
    is_general: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    created_by = relationship("User", foreign_keys=[created_by_id])
    messages: Mapped[list["ChannelMessage"]] = relationship(
        "ChannelMessage", back_populates="channel", cascade="all, delete-orphan"
    )
    reads: Mapped[list["ChannelRead"]] = relationship(
        "ChannelRead", back_populates="channel", cascade="all, delete-orphan"
    )


class ChannelMessage(Base):
    """A single message posted to a channel. No recipient_id (unlike
    DirectMessage) since it's visible to every project member.
    """

    __tablename__ = "channel_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    channel = relationship("Channel", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])
    attachments = relationship("Attachment", back_populates="channel_message", cascade="all, delete-orphan")


class ChannelRead(Base):
    """Tracks, per user per channel, the timestamp that user last read up to —
    used to compute unread badges (BS-101) without touching individual
    ChannelMessage rows the way DirectMessage.read_at does for DMs.
    """

    __tablename__ = "channel_reads"
    __table_args__ = (UniqueConstraint("channel_id", "user_id", name="uq_channel_read_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    last_read_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    channel = relationship("Channel", back_populates="reads")
