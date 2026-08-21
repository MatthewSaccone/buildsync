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

# Sensible starting coverage values per catalog category, for pre-filling
# the materials form -- NOT authoritative. These are typical industry specs
# (e.g. a standard 4x8 drywall sheet = 32 sqft) meant to save users from
# guessing on the common case; actual products vary (a 4x10 sheet, a 5-gal
# paint bucket, etc.) and the user can and should override the value when
# their real product differs. One entry per catalog_category; framing has
# two coverage_units (studs are "each", plates are "linear_ft") so it's
# keyed by (catalog_category, coverage_unit) instead of catalog_category alone.
COVERAGE_DEFAULTS: dict[tuple[str, str], dict] = {
    ("framing", "each"): {"coverage_value": 1, "label": "1 stud = 1 each"},
    ("framing", "linear_ft"): {"coverage_value": 1, "label": "1 linear ft of plate = 1 linear ft"},
    ("drywall", "sqft"): {"coverage_value": 32, "label": "Standard 4x8 sheet = 32 sqft"},
    ("paint", "gallon"): {"coverage_value": 350, "label": "1 gallon covers ~350 sqft (1 coat)"},
    ("roofing", "square"): {"coverage_value": 100, "label": "1 roofing square = 100 sqft"},
    ("concrete", "cuyd"): {"coverage_value": 1, "label": "Priced/ordered per cubic yard"},
}


def get_coverage_default(catalog_category: str, coverage_unit: str) -> dict | None:
    return COVERAGE_DEFAULTS.get((catalog_category, coverage_unit))


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


def _candidates(db: Session, catalog_category: str, coverage_unit: str, user_id: int) -> list[MaterialVariant]:
    return (
        db.query(MaterialVariant)
        .join(MaterialVariant.material)
        .filter(
            MaterialVariant.coverage_value.isnot(None),
            MaterialVariant.coverage_unit == coverage_unit,
        )
        .filter(MaterialVariant.material.has(category=catalog_category, created_by_id=user_id))
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


def select_material(db: Session, raw: RawQuantity, user_id: int) -> SelectionResult:
    """Chooses the lowest total-cost option for this category from the
    requesting user's own materials catalog (materials are private per-user
    — different users may use different suppliers/pricing), and returns up
    to 2 additional alternates (mid/premium by price) so the user isn't
    locked into the automated pick. See selection_service module docstring."""
    mapping = CATEGORY_MATCH.get(raw.category)
    if not mapping:
        return SelectionResult(category=raw.category, chosen=None, alternates=[], unmatched=True)

    variants = _candidates(db, mapping["catalog_category"], mapping["coverage_unit"], user_id)
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
