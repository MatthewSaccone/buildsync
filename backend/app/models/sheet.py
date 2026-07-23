from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Sheet(Base):
    """A plan page or job-site photo that pins/comments attach to.

    Re-uploading a sheet creates a new row sharing `root_sheet_id` with the
    original (the first version's root_sheet_id points to its own id). This
    links the version history without a separate table.
    """

    __tablename__ = "sheets"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    root_sheet_id: Mapped[int] = mapped_column(ForeignKey("sheets.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="sheets")
    pins = relationship("Pin", back_populates="sheet", cascade="all, delete-orphan")
