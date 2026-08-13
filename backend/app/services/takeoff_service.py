"""Quantity takeoff: converts confirmed drawing dimensions into raw material
quantities per category, using standard construction formulas and waste
factors. Deliberately separate from material *selection* (selection_service.py)
so the math here is easy to audit/adjust independently of which catalog
variant ends up chosen.
"""
from dataclasses import dataclass, field

# Default waste/overage factors per category. These are industry-standard
# rules of thumb, not exact -- real jobs vary by cut complexity, crew, etc.
# Overridable per-session via EstimateSession.waste_factor_overrides.
DEFAULT_WASTE_FACTORS: dict[str, float] = {
    "framing": 0.10,
    "drywall": 0.10,
    "roofing": 0.12,
    "concrete": 0.05,
    "paint": 0.10,
    "flooring": 0.10,
    "siding": 0.10,
    "insulation": 0.08,
}

STUD_SPACING_IN = 16  # standard on-center spacing
DRYWALL_SHEET_SQFT = 32  # standard 4x8 sheet
PAINT_COVERAGE_SQFT_PER_GALLON = 350
CONCRETE_SLAB_DEPTH_FT = 0.333  # 4" slab default


@dataclass
class RawQuantity:
    category: str
    raw_quantity: float
    unit: str  # matches the "shape" of quantity: linear_ft, sqft, cuft, sheet, gallon
    waste_factor: float
    notes: str = ""


@dataclass
class TakeoffInput:
    """Confirmed dimensions after user review -- not raw extraction output."""
    wall_length_ft: float
    wall_height_ft: float = 8.0
    opening_sqft: float = 0.0  # total door/window area to subtract from wall area
    floor_area_sqft: float = 0.0
    roof_area_sqft: float = 0.0
    include_categories: list[str] = field(default_factory=lambda: [
        "framing", "drywall", "roofing", "concrete", "paint",
    ])


def _wall_area_sqft(inp: TakeoffInput) -> float:
    gross = inp.wall_length_ft * inp.wall_height_ft
    return max(gross - inp.opening_sqft, 0.0)


def compute_raw_quantities(inp: TakeoffInput, waste_overrides: dict[str, float] | None = None) -> list[RawQuantity]:
    """Returns one RawQuantity per requested category. Categories with no
    formula defined are skipped silently here -- the router is responsible
    for surfacing "we don't know how to estimate X" to the user, since that's
    a product decision, not a math one."""
    waste = {**DEFAULT_WASTE_FACTORS, **(waste_overrides or {})}
    wall_area = _wall_area_sqft(inp)
    results: list[RawQuantity] = []

    if "framing" in inp.include_categories and inp.wall_length_ft > 0:
        # Studs needed: wall length (in) / spacing, +1 for the end, doubled top/bottom plates
        studs = (inp.wall_length_ft * 12 / STUD_SPACING_IN) + 1
        plate_linear_ft = inp.wall_length_ft * 2  # top + bottom plate runs
        results.append(RawQuantity(
            category="framing_studs", raw_quantity=studs, unit="each",
            waste_factor=waste.get("framing", 0.10),
            notes=f"{inp.wall_length_ft:.0f} linear ft of wall at {STUD_SPACING_IN}\" O.C.",
        ))
        results.append(RawQuantity(
            category="framing_plates", raw_quantity=plate_linear_ft, unit="linear_ft",
            waste_factor=waste.get("framing", 0.10),
            notes="Top + bottom plate linear footage",
        ))

    if "drywall" in inp.include_categories and wall_area > 0:
        sheets = wall_area / DRYWALL_SHEET_SQFT
        results.append(RawQuantity(
            category="drywall", raw_quantity=sheets, unit="sheet",
            waste_factor=waste.get("drywall", 0.10),
            notes=f"{wall_area:.0f} sqft of wall area (openings subtracted)",
        ))

    if "paint" in inp.include_categories and wall_area > 0:
        gallons = wall_area / PAINT_COVERAGE_SQFT_PER_GALLON
        results.append(RawQuantity(
            category="paint", raw_quantity=gallons, unit="gallon",
            waste_factor=waste.get("paint", 0.10),
            notes=f"{wall_area:.0f} sqft at {PAINT_COVERAGE_SQFT_PER_GALLON} sqft/gal coverage",
        ))

    if "roofing" in inp.include_categories and inp.roof_area_sqft > 0:
        squares = inp.roof_area_sqft / 100  # roofing sold in "squares" = 100 sqft
        results.append(RawQuantity(
            category="roofing", raw_quantity=squares, unit="square",
            waste_factor=waste.get("roofing", 0.12),
            notes=f"{inp.roof_area_sqft:.0f} sqft of roof area",
        ))

    if "concrete" in inp.include_categories and inp.floor_area_sqft > 0:
        cuyd = (inp.floor_area_sqft * CONCRETE_SLAB_DEPTH_FT) / 27  # cuft -> cuyd
        results.append(RawQuantity(
            category="concrete", raw_quantity=cuyd, unit="cuyd",
            waste_factor=waste.get("concrete", 0.05),
            notes=f"{inp.floor_area_sqft:.0f} sqft slab at {CONCRETE_SLAB_DEPTH_FT * 12:.0f}\" depth",
        ))

    return results
