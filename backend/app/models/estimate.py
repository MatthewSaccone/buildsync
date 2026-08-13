from datetime import datetime, timezone

from sqlalchemy import String, ForeignKey, Float, Integer, Text, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.types import UTCDateTime


class EstimateSession(Base):
    """One cost-estimation run against a drawing. Holds the extracted/confirmed
    dimensions and the scale used, plus every generated line item. Kept even
    after being superseded (see supersedes_id) so cost history is auditable
    rather than overwritten in place -- mirrors how Sheet versioning works."""

    __tablename__ = "estimate_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    sheet_id: Mapped[int] = mapped_column(ForeignKey("sheets.id"), index=True)
    supersedes_id: Mapped[int | None] = mapped_column(ForeignKey("estimate_sessions.id"), nullable=True)

    status: Mapped[str] = mapped_column(String(30), default="pending_review")
    # pending_review -> extraction done, waiting on user to confirm dimensions/scale
    # finalized -> user confirmed, lines generated
    # failed -> extraction could not produce usable dimensions

    scale_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)  # e.g. 100 for 1:100
    scale_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    wall_height_ft: Mapped[float] = mapped_column(Float, default=8.0)
    waste_factor_overrides: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    extracted_dimensions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # raw extraction output: {"rooms": [...], "walls": [...], "openings": [...],
    #   "roof_area_sqft": ..., "confidence": {"wall_lengths": "high", ...}}
    low_confidence_fields: Mapped[list | None] = mapped_column(JSON, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=lambda: datetime.now(timezone.utc), index=True)
    finalized_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    project = relationship("Project")
    sheet = relationship("Sheet")
    created_by = relationship("User", foreign_keys=[created_by_id])
    lines: Mapped[list["EstimateLine"]] = relationship(
        "EstimateLine", back_populates="session", cascade="all, delete-orphan"
    )


class EstimateLine(Base):
    """One material line in a generated estimate: a category (e.g. 'drywall'),
    the selected variant, the computed quantity, and the alternates that were
    considered but not chosen -- kept so the user can see/swap without
    re-running the whole estimate."""

    __tablename__ = "estimate_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("estimate_sessions.id"), index=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    material_variant_id: Mapped[int | None] = mapped_column(ForeignKey("material_variants.id"), nullable=True)

    raw_quantity_needed: Mapped[float] = mapped_column(Float, nullable=False)  # theoretical, pre-waste/rounding
    waste_factor: Mapped[float] = mapped_column(Float, default=0.0)
    purchase_quantity: Mapped[float] = mapped_column(Float, nullable=False)  # rounded to purchasable units
    unit_price_snapshot: Mapped[float | None] = mapped_column(Float, nullable=True)

    alternates: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{variant_id, price, quantity}, ...]
    unmatched: Mapped[bool] = mapped_column(Boolean, default=False)  # no catalog variant fit this category
    user_overridden: Mapped[bool] = mapped_column(Boolean, default=False)

    session = relationship("EstimateSession", back_populates="lines")
    material_variant = relationship("MaterialVariant")
