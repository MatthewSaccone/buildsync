from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Numeric, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.types import UTCDateTime


class Material(Base):
    """A material type in the shared catalog, e.g. 'Romex 12/2 wire' or '2x4 lumber'.
    Not tied to a project, since the same material/size/price is reused across jobs."""

    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=lambda: datetime.now(timezone.utc), index=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    variants: Mapped[list["MaterialVariant"]] = relationship(
        "MaterialVariant", back_populates="material", cascade="all, delete-orphan", order_by="MaterialVariant.size"
    )


class MaterialVariant(Base):
    """A specific size/unit of a material, with its own price, e.g.
    '#12 AWG, 250ft roll, $89.99' under the 'Romex 12/2 wire' material.

    coverage_value/coverage_unit describe how much real-world area/length/volume
    one unit of this variant covers (e.g. a 4x8 drywall sheet -> coverage_value=32,
    coverage_unit='sqft'; a stud -> coverage_value=1, coverage_unit='each' against
    a linear-foot requirement at standard spacing). Nullable because older/manually
    entered materials may not have this set yet -- the estimator skips variants
    without coverage data rather than guessing, and the API flags the gap."""

    __tablename__ = "material_variants"

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    size: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)  # each, ft, box, sheet, etc.
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    coverage_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    coverage_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)  # sqft, linear_ft, cuft, each
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    material: Mapped["Material"] = relationship("Material", back_populates="variants")
