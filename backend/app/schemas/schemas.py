import os
from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, computed_field, model_validator

from app.models.enums import UserRole, PinStatus, PinPriority, ProjectRole, JobStatus, TaskStatus


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


class UserUpdate(BaseModel):
    full_name: str | None = None
    company_name: str | None = None
    role: UserRole | None = None
    phone: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ---- Projects ----
class ProjectCreate(BaseModel):
    name: str
    address: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
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
    task_id: int | None
    comment_id: int | None
    message_id: int | None = None
    channel_message_id: int | None = None
    file_path: str
    original_filename: str | None = None
    content_type: str | None = None
    uploaded_by_id: int
    uploaded_at: datetime

    class Config:
        from_attributes = True

    @computed_field
    @property
    def url(self) -> str:
        return f"/static/uploads/{os.path.basename(self.file_path)}"

    @computed_field
    @property
    def is_image(self) -> bool:
        ext = os.path.splitext(self.file_path)[1].lower()
        return ext in {".png", ".jpg", ".jpeg", ".webp"}


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
    pin_id: int | None
    task_id: int | None
    author_id: int
    body: str
    created_at: datetime
    author: UserOut
    attachments: list[AttachmentOut] = []

    class Config:
        from_attributes = True


# ---- Messages ----
class MessageCreate(BaseModel):
    body: str


class DirectMessageOut(BaseModel):
    id: int
    project_id: int
    sender_id: int
    recipient_id: int | None
    body: str
    task_id: int | None = None
    created_at: datetime
    read_at: datetime | None
    sender: UserOut
    attachments: list[AttachmentOut] = []

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    user: UserOut
    last_message: DirectMessageOut | None
    unread_count: int

    class Config:
        from_attributes = True


# ---- Channels ----
class ChannelCreate(BaseModel):
    name: str


class ChannelRename(BaseModel):
    name: str


class ChannelOut(BaseModel):
    id: int
    project_id: int
    name: str
    is_general: bool
    is_archived: bool
    created_by_id: int
    created_at: datetime
    archived_at: datetime | None
    unread_count: int = 0
    last_message_at: datetime | None = None
    muted: bool = False

    class Config:
        from_attributes = True


class ChannelMessageCreate(BaseModel):
    body: str


class ChannelMessageOut(BaseModel):
    id: int
    channel_id: int
    sender_id: int
    body: str
    task_id: int | None = None
    created_at: datetime
    sender: UserOut
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
    task_id: int | None = None
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Notification settings ----
class NotificationSettingsOut(BaseModel):
    notify_on_message: bool
    notify_on_mention: bool
    notify_on_task_assignment: bool
    desktop_enabled: bool

    class Config:
        from_attributes = True


class NotificationSettingsUpdate(BaseModel):
    notify_on_message: bool | None = None
    notify_on_mention: bool | None = None
    notify_on_task_assignment: bool | None = None
    desktop_enabled: bool | None = None


class ChannelMuteOut(BaseModel):
    channel_id: int
    muted: bool


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


class ActivityEventOut(BaseModel):
    """Generic project timeline entry (BS-201). `extra` carries whatever
    kind-specific ids the frontend needs to link back to the source object
    (pin_id, sheet_id, task_id, channel_id, etc) — shape varies by `kind`."""

    id: int
    project_id: int
    kind: str
    message: str
    actor_id: int | None
    actor_name: str
    extra: dict | None = None
    created_at: datetime

    class Config:
        from_attributes = True


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
    recent_activity: list[ActivityEventOut]


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


# ---- Scheduled jobs (calendar / scheduler) ----
class ScheduledJobCreate(BaseModel):
    title: str
    trade: UserRole | None = None
    pin_id: int | None = None
    task_id: int | None = None
    assigned_to_id: int | None = None
    depends_on_id: int | None = None
    start_time: datetime
    end_time: datetime

    @model_validator(mode="after")
    def _check_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ScheduledJobUpdate(BaseModel):
    title: str | None = None
    trade: UserRole | None = None
    status: JobStatus | None = None
    pin_id: int | None = None
    task_id: int | None = None
    assigned_to_id: int | None = None
    depends_on_id: int | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


class ScheduledJobOut(BaseModel):
    id: int
    project_id: int
    pin_id: int | None
    task_id: int | None
    title: str
    trade: UserRole | None
    status: JobStatus
    assigned_to_id: int | None
    depends_on_id: int | None
    start_time: datetime
    end_time: datetime
    created_by_id: int
    created_at: datetime

    # Denormalized display fields, filled in by the router so the calendar
    # doesn't need a second round-trip per project/user.
    project_name: str | None = None
    project_address: str | None = None
    assignee_name: str | None = None
    pin_title: str | None = None
    task_title: str | None = None

    class Config:
        from_attributes = True

# ---- Tasks ----
class TaskPinRef(BaseModel):
    id: int
    title: str
    sheet_id: int
    status: PinStatus

    class Config:
        from_attributes = True


class TaskMaterialCreate(BaseModel):
    material_variant_id: int
    quantity: float = 1


class TaskMaterialUpdate(BaseModel):
    quantity: float


class TaskMaterialOut(BaseModel):
    id: int
    task_id: int
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
    def _from_task_material_orm(cls, data):
        # Same shape as PinMaterialOut — accept a dict as-is, or pull the
        # display fields off a TaskMaterial ORM instance's nested variant.
        if isinstance(data, dict):
            return data
        variant = data.material_variant
        return {
            "id": data.id,
            "task_id": data.task_id,
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


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: PinPriority = PinPriority.NORMAL
    owner_id: int | None = None
    due_date: datetime | None = None
    related_pin_ids: list[int] = []


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: PinPriority | None = None
    owner_id: int | None = None
    due_date: datetime | None = None
    related_pin_ids: list[int] | None = None


class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: PinPriority
    owner_id: int | None
    owner: UserOut | None
    due_date: datetime | None
    created_by_id: int
    created_at: datetime
    completed_at: datetime | None
    comments: list[CommentOut] = []
    attachments: list[AttachmentOut] = []
    related_pins: list[TaskPinRef] = []
    materials: list[TaskMaterialOut] = []

    class Config:
        from_attributes = True

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(sum(m.line_total for m in self.materials), 2)


# ---- Estimates (drawing -> materials cost) ----
class EstimateSessionCreate(BaseModel):
    sheet_id: int


class DimensionConfirm(BaseModel):
    """User-confirmed values sent back after reviewing the raw extraction.
    Anything left null falls back to the extracted value if present."""
    scale_ratio: float | None = None
    wall_length_ft: float
    wall_height_ft: float = 8.0
    opening_sqft: float = 0.0
    floor_area_sqft: float = 0.0
    roof_area_sqft: float = 0.0
    include_categories: list[str] | None = None
    waste_factor_overrides: dict[str, float] | None = None


class MaterialOptionOut(BaseModel):
    variant_id: int
    variant_label: str
    unit_price: float
    purchase_quantity: int
    line_total: float


class EstimateLineOut(BaseModel):
    id: int
    category: str
    material_variant_id: int | None
    material_label: str | None
    raw_quantity_needed: float
    waste_factor: float
    purchase_quantity: float
    unit_price_snapshot: float | None
    alternates: list[MaterialOptionOut] = []
    unmatched: bool
    user_overridden: bool

    class Config:
        from_attributes = True

    @computed_field
    @property
    def line_total(self) -> float:
        if self.unit_price_snapshot is None:
            return 0.0
        return round(self.purchase_quantity * self.unit_price_snapshot, 2)


class EstimateSessionOut(BaseModel):
    id: int
    project_id: int
    sheet_id: int
    status: str
    scale_ratio: float | None
    scale_confirmed: bool
    wall_height_ft: float
    extracted_dimensions: dict | None
    low_confidence_fields: list | None
    created_at: datetime
    finalized_at: datetime | None
    lines: list[EstimateLineOut] = []

    class Config:
        from_attributes = True

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(sum(line.line_total for line in self.lines), 2)


class EstimateLineOverride(BaseModel):
    material_variant_id: int