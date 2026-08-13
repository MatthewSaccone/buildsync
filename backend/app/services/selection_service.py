"""Given a raw quantity need for a category, picks the best-fit MaterialVariant(s)
from the project's catalog. Requires coverage_value/coverage_unit to be set on
a variant -- variants without it can't be matched and are reported as unmatched
rather than guessed at.
"""
import math
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.material import MaterialVariant
from app.services.takeoff_service import RawQuantity

# Maps a takeoff category to the material catalog category/coverage_unit it
# should draw from. Adjust as your catalog's `category` naming evolves --
# this is intentionally centralized instead of scattered through queries.
CATEGORY_MATCH: dict[str, dict] = {
    "framing_studs": {"catalog_category": "framing", "coverage_unit": "each"},
    "framing_plates": {"catalog_category": "framing", "coverage_unit": "linear_ft"},
    "drywall": {"catalog_category": "drywall", "coverage_unit": "sqft"},
    "paint": {"catalog_category": "paint", "coverage_unit": "gallon"},
    "roofing": {"catalog_category": "roofing", "coverage_unit": "square"},
    "concrete": {"catalog_category": "concrete", "coverage_unit": "cuyd"},
}


@dataclass
class MaterialOption:
    variant_id: int
    variant_label: str  # "<material name> - <size>"
    unit_price: float
    coverage_value: float
    purchase_quantity: int
    line_total: float


@dataclass
class SelectionResult:
    category: str
    chosen: MaterialOption | None
    alternates: list[MaterialOption]
    unmatched: bool


def _candidates(db: Session, catalog_category: str, coverage_unit: str) -> list[MaterialVariant]:
    return (
        db.query(MaterialVariant)
        .join(MaterialVariant.material)
        .filter(
            MaterialVariant.coverage_value.isnot(None),
            MaterialVariant.coverage_unit == coverage_unit,
        )
        .filter(MaterialVariant.material.has(category=catalog_category))
        .all()
    )


def _to_option(variant: MaterialVariant, raw: RawQuantity) -> MaterialOption:
    needed = raw.raw_quantity * (1 + raw.waste_factor)
    units_needed = needed / variant.coverage_value if variant.coverage_value else 0
    purchase_qty = max(1, math.ceil(units_needed))
    return MaterialOption(
        variant_id=variant.id,
        variant_label=f"{variant.material.name} - {variant.size}",
        unit_price=float(variant.price),
        coverage_value=variant.coverage_value,
        purchase_quantity=purchase_qty,
        line_total=round(purchase_qty * float(variant.price), 2),
    )


def select_material(db: Session, raw: RawQuantity) -> SelectionResult:
    """Chooses the lowest total-cost option for this category, and returns up
    to 2 additional alternates (mid/premium by price) so the user isn't
    locked into the automated pick. See selection_service module docstring."""
    mapping = CATEGORY_MATCH.get(raw.category)
    if not mapping:
        return SelectionResult(category=raw.category, chosen=None, alternates=[], unmatched=True)

    variants = _candidates(db, mapping["catalog_category"], mapping["coverage_unit"])
    if not variants:
        return SelectionResult(category=raw.category, chosen=None, alternates=[], unmatched=True)

    options = sorted((_to_option(v, raw) for v in variants), key=lambda o: o.line_total)
    chosen = options[0]
    # Alternates: a mid-tier and a premium pick if the catalog has enough spread
    alternates = []
    if len(options) > 1:
        mid_idx = len(options) // 2
        if options[mid_idx] is not chosen:
            alternates.append(options[mid_idx])
        if options[-1] is not chosen and options[-1] not in alternates:
            alternates.append(options[-1])

    return SelectionResult(category=raw.category, chosen=chosen, alternates=alternates[:2], unmatched=False)
