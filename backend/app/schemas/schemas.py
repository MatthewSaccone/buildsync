import os
from datetime import datetime

from pydantic import BaseModel, EmailStr, computed_field, model_validator

from app.models.enums import UserRole, PinStatus, PinPriority, ProjectRole


# ---- Auth ----
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    company_name: str | None = None
    role: UserRole = UserRole.OTHER
    phone: str | None = None


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    company_name: str | None
    role: UserRole
    phone: str | None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


# ---- Projects ----
class ProjectCreate(BaseModel):
    name: str
    address: str | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    address: str | None
    created_by_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectMemberAdd(BaseModel):
    user_id: int
    role: ProjectRole = ProjectRole.MEMBER


class ProjectMemberRoleUpdate(BaseModel):
    role: ProjectRole


class ProjectMemberOut(BaseModel):
    id: int
    user_id: int
    role: ProjectRole
    user: UserOut

    class Config:
        from_attributes = True


# ---- Sheets ----
class SheetOut(BaseModel):
    id: int
    project_id: int
    root_sheet_id: int
    title: str
    file_path: str
    version: int
    uploaded_by_id: int
    uploaded_at: datetime

    class Config:
        from_attributes = True

    @computed_field
    @property
    def url(self) -> str:
        return f"/static/uploads/{os.path.basename(self.file_path)}"


# ---- Pins ----
class PinCreate(BaseModel):
    sheet_id: int
    x: float
    y: float
    title: str
    trade: UserRole | None = None
    priority: PinPriority = PinPriority.NORMAL
    assigned_to_id: int | None = None


class PinUpdate(BaseModel):
    status: PinStatus | None = None
    priority: PinPriority | None = None
    assigned_to_id: int | None = None
    title: str | None = None
    trade: UserRole | None = None


class PinMaterialCreate(BaseModel):
    material_variant_id: int
    quantity: float = 1


class PinMaterialUpdate(BaseModel):
    quantity: float


class PinMaterialOut(BaseModel):
    id: int
    pin_id: int
    material_variant_id: int
    material_name: str
    material_category: str | None
    size: str
    unit: str | None
    quantity: float
    unit_price: float
    created_at: datetime

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def _from_pin_material_orm(cls, data):
        # Accept either a plain dict (already shaped) or a PinMaterial ORM
        # instance, pulling the material name/size/unit off the nested
        # variant -> material relationship in the latter case.
        if isinstance(data, dict):
            return data
        variant = data.material_variant
        return {
            "id": data.id,
            "pin_id": data.pin_id,
            "material_variant_id": data.material_variant_id,
            "material_name": variant.material.name,
            "material_category": variant.material.category,
            "size": variant.size,
            "unit": variant.unit,
            "quantity": data.quantity,
            "unit_price": float(data.unit_price),
            "created_at": data.created_at,
        }

    @computed_field
    @property
    def line_total(self) -> float:
        return round(self.quantity * self.unit_price, 2)


class AttachmentOut(BaseModel):
    id: int
    pin_id: int | None
    comment_id: int | None
    file_path: str
    uploaded_by_id: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


class PinOut(BaseModel):
    id: int
    sheet_id: int
    x: float
    y: float
    title: str
    status: PinStatus
    priority: PinPriority
    trade: UserRole | None
    created_by_id: int
    assigned_to_id: int | None
    created_at: datetime
    resolved_at: datetime | None
    materials: list[PinMaterialOut] = []
    attachments: list[AttachmentOut] = []

    class Config:
        from_attributes = True

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(sum(m.line_total for m in self.materials), 2)


# ---- Comments ----
class CommentCreate(BaseModel):
    body: str


class CommentOut(BaseModel):
    id: int
    pin_id: int
    author_id: int
    body: str
    created_at: datetime
    author: UserOut
    attachments: list[AttachmentOut] = []

    class Config:
        from_attributes = True


# ---- Notifications ----
class NotificationOut(BaseModel):
    id: int
    type: str
    message: str
    project_id: int | None
    pin_id: int | None
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Materials ----
class MaterialVariantCreate(BaseModel):
    size: str
    unit: str | None = None
    price: float
    sku: str | None = None


class MaterialVariantUpdate(BaseModel):
    size: str | None = None
    unit: str | None = None
    price: float | None = None
    sku: str | None = None


class MaterialVariantOut(BaseModel):
    id: int
    material_id: int
    size: str
    unit: str | None
    price: float
    sku: str | None
    updated_at: datetime

    class Config:
        from_attributes = True


class MaterialCreate(BaseModel):
    name: str
    category: str | None = None
    notes: str | None = None
    variants: list[MaterialVariantCreate] = []


class MaterialUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    notes: str | None = None


class MaterialOut(BaseModel):
    id: int
    name: str
    category: str | None
    notes: str | None
    created_by_id: int
    created_at: datetime
    variants: list[MaterialVariantOut] = []

    class Config:
        from_attributes = True


# ---- Cost rollup ----
class MaterialCostLine(BaseModel):
    material_variant_id: int
    material_name: str
    material_category: str | None
    size: str
    unit: str | None
    total_quantity: float
    unit_price: float

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(self.total_quantity * self.unit_price, 2)


class ProjectCostSummary(BaseModel):
    project_id: int
    lines: list[MaterialCostLine]

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(sum(line.total_cost for line in self.lines), 2)


# ---- Dashboard ----
class DashboardCounts(BaseModel):
    counts: dict[str, int]


class ActivityItem(BaseModel):
    kind: str  # "pin_created" | "pin_status_changed" | "comment"
    message: str
    pin_id: int
    pin_title: str
    sheet_id: int
    actor_name: str
    created_at: datetime


class OverduePin(BaseModel):
    id: int
    sheet_id: int
    title: str
    status: PinStatus
    priority: PinPriority
    trade: UserRole | None
    days_open: int

    class Config:
        from_attributes = True


class ProjectDashboard(BaseModel):
    project_id: int
    total_pins: int
    by_status: dict[str, int]
    by_trade: dict[str, int]
    by_priority: dict[str, int]
    overdue: list[OverduePin]
    recent_activity: list[ActivityItem]


# ---- Search ----
class SearchPinHit(BaseModel):
    type: str = "pin"
    pin: PinOut
    sheet_id: int
    matched_on: str  # "title" | "comment"
    snippet: str | None = None


class SearchResults(BaseModel):
    query: str
    results: list[SearchPinHit]