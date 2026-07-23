from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PinMaterial(Base):
    """A material needed to resolve a pin, e.g. '2x 250ft Romex roll'.

    unit_price is a snapshot of the variant's price at the time it was attached,
    so a project's cost total doesn't silently shift if the catalog price changes
    later — the shopping-list export should still use current catalog pricing,
    which it reads live from the variant relationship.
    """

    __tablename__ = "pin_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    pin_id: Mapped[int] = mapped_column(ForeignKey("pins.id"), index=True)
    material_variant_id: Mapped[int] = mapped_column(ForeignKey("material_variants.id"))
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pin = relationship("Pin", back_populates="materials")
    material_variant = relationship("MaterialVariant")
