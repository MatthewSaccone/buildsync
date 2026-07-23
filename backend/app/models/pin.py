from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Float, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import PinStatus, PinPriority, UserRole


class Pin(Base):
    """A location-anchored issue/comment thread pinned to an (x, y) on a sheet."""

    __tablename__ = "pins"

    id: Mapped[int] = mapped_column(primary_key=True)
    sheet_id: Mapped[int] = mapped_column(ForeignKey("sheets.id"))
    x: Mapped[float] = mapped_column(Float, nullable=False)  # normalized 0-1
    y: Mapped[float] = mapped_column(Float, nullable=False)  # normalized 0-1
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[PinStatus] = mapped_column(SAEnum(PinStatus), default=PinStatus.OPEN)
    priority: Mapped[PinPriority] = mapped_column(SAEnum(PinPriority), default=PinPriority.NORMAL)
    trade: Mapped[UserRole | None] = mapped_column(SAEnum(UserRole), nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    sheet = relationship("Sheet", back_populates="pins")
    comments = relationship("Comment", back_populates="pin", cascade="all, delete-orphan")
    materials = relationship("PinMaterial", back_populates="pin", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="pin", cascade="all, delete-orphan")