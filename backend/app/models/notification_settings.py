from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class NotificationSettings(Base):
    """Per-user notification preferences (BS-104-4). Created lazily with
    all-defaults-on the first time a user's settings are read or touched,
    so most users never have a row explicitly created for them.
    """

    __tablename__ = "notification_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)

    # Which activity should generate an in-app + desktop notification at all.
    notify_on_message: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_on_mention: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_on_task_assignment: Mapped[bool] = mapped_column(Boolean, default=True)

    # Master switch for desktop (browser) notifications specifically -
    # in-app notifications/unread counts are unaffected by this.
    desktop_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    user = relationship("User", foreign_keys=[user_id])


class ChannelMute(Base):
    """Marks that a user has muted a specific channel (BS-104-4) - muted
    channels don't generate notifications or desktop alerts, but messages
    still count toward the channel's unread badge.
    """

    __tablename__ = "channel_mutes"
    __table_args__ = (UniqueConstraint("channel_id", "user_id", name="uq_channel_mute_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
