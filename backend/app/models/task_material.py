from datetime import datetime, timezone, timezone

from sqlalchemy import DateTime, ForeignKey, Numeric, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TaskMaterial(Base):
    """A material needed for a task, e.g. '80x 80lb bags of concrete' for an
    'Order concrete' task. Mirrors PinMaterial — unit_price is a snapshot of
    the variant's price at the time it was attached, so a project's cost
    total doesn't silently shift if the catalog price changes later. This is
    what lets a task carry a cost even when it isn't linked to any Pin.
    """

    __tablename__ = "task_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    material_variant_id: Mapped[int] = mapped_column(ForeignKey("material_variants.id"))
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    task = relationship("Task", back_populates="materials")
    material_variant = relationship("MaterialVariant")
