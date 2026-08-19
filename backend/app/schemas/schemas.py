import os
import re
from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator, model_validator

from app.models.enums import UserRole, PinStatus, PinPriority, ProjectRole, JobStatus, TaskStatus


# Shared password policy: min 10 chars, at least one letter and one digit.
# Kept as a plain function (not a validator mixin) so it can be reused
# across every schema that carries a raw new-password field.
_PASSWORD_MIN_LENGTH = 10
_PASSWORD_MAX_LENGTH = 128
_MAX_ID = 2_147_483_647
_MAX_QUANTITY = 1_000_000
_MAX_PRICE = 100_000_000
_MAX_DIMENSION = 1_000_000
_MAX_LIST_ITEMS = 100
_MAX_CATEGORIES = 20
_MAX_WASTE_FACTOR = 1.0


def _validate_non_blank(value: str, field_name: str = "Value") -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{field_name} cannot be blank")
    return value


def _validate_optional_non_blank(value: str | None, field_name: str = "Value") -> str | None:
    if value is None:
        return None
    return _validate_non_blank(value, field_name)


def _validate_password_strength(password: str) -> str:
    if len(password) < _PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {_PASSWORD_MIN_LENGTH} characters")
    if len(password) > _PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must be at most {_PASSWORD_MAX_LENGTH} characters")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 UTF-8 bytes")
    if not re.search(r"[A-Za-z]", password):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one number")
    return password


# ---- Auth ----
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str = Field(min_length=1, max_length=200)
    company_name: str | None = Field(default=None, max_length=200)
    role: UserRole = UserRole.OTHER
    phone: str | None = Field(default=None, max_length=32)

    @field_validator("full_name")
    @classmethod
    def _full_name_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Full name")

    @field_validator("company_name", "phone")
    @classmethod
    def _optional_strings_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v)

    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    company_name: str | None
    role: UserRole
    phone: str | None

    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    """Minimal user info for attribution (who posted/owns something) without
    exposing contact details to every viewer of a comment, message, or task —
    unlike UserOut, which is appropriate for an actual team-roster or DM
    context where seeing a teammate's contact info is the point."""
    id: int
    full_name: str
    role: UserRole

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
    token: str = Field(min_length=1, max_length=512)
    new_password: str

    @field_validator("token")
    @classmethod
    def _token_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Reset token")

    @field_validator("new_password")
    @classmethod
    def _check_new_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserUpdate(BaseModel):
    # Role is intentionally not accepted here. Allowing a user to PATCH their
    # own role would permit privilege escalation to an administrative role.
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, min_length=1, max_length=32)

    @field_validator("full_name", "company_name", "phone")
    @classmethod
    def _profile_strings_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=_PASSWORD_MAX_LENGTH)
    new_password: str

    @field_validator("current_password")
    @classmethod
    def _current_password_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Current password")

    @field_validator("new_password")
    @classmethod
    def _check_new_password(cls, v: str) -> str:
        return _validate_password_strength(v)


# ---- Projects ----
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Project name")

    @field_validator("address")
    @classmethod
    def _address_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v, "Address")


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    address: str | None = Field(default=None, min_length=1, max_length=500)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v, "Project name")

    @field_validator("address")
    @classmethod
    def _address_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v, "Address")


class ProjectOut(BaseModel):
    id: int
    name: str
    address: str | None
    created_by_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectMemberAdd(BaseModel):
    user_id: int = Field(gt=0, le=_MAX_ID)
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
    sheet_id: int = Field(gt=0, le=_MAX_ID)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    title: str = Field(min_length=1, max_length=255)
    trade: UserRole | None = None
    priority: PinPriority = PinPriority.NORMAL
    assigned_to_id: int | None = Field(default=None, gt=0, le=_MAX_ID)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Pin title")


class PinUpdate(BaseModel):
    status: PinStatus | None = None
    priority: PinPriority | None = None
    assigned_to_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    trade: UserRole | None = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v, "Pin title")


class PinMaterialCreate(BaseModel):
    material_variant_id: int = Field(gt=0, le=_MAX_ID)
    quantity: float = Field(default=1, gt=0, le=_MAX_QUANTITY)


class PinMaterialUpdate(BaseModel):
    quantity: float = Field(gt=0, le=_MAX_QUANTITY)


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
    materials: list[PinMaterialOut] = Field(default_factory=list)
    attachments: list[AttachmentOut] = Field(default_factory=list)

    class Config:
        from_attributes = True

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(sum(m.line_total for m in self.materials), 2)


# ---- Comments ----
class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5_000)

    @field_validator("body")
    @classmethod
    def _body_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Comment")


class CommentOut(BaseModel):
    id: int
    pin_id: int | None
    task_id: int | None
    author_id: int
    body: str
    created_at: datetime
    author: UserBrief
    attachments: list[AttachmentOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


# ---- Messages ----
class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5_000)

    @field_validator("body")
    @classmethod
    def _body_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Message")


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
    attachments: list[AttachmentOut] = Field(default_factory=list)

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
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Channel name")


class ChannelRename(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Channel name")


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
    body: str = Field(min_length=1, max_length=5_000)
    task_id: int | None = Field(default=None, gt=0, le=_MAX_ID)

    @field_validator("body")
    @classmethod
    def _body_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Message")


class ChannelMessageOut(BaseModel):
    id: int
    channel_id: int
    sender_id: int
    body: str
    task_id: int | None = None
    created_at: datetime
    sender: UserBrief
    attachments: list[AttachmentOut] = Field(default_factory=list)

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
    size: str = Field(min_length=1, max_length=100)
    unit: str | None = Field(default=None, max_length=50)
    price: float = Field(ge=0, le=_MAX_PRICE)
    sku: str | None = Field(default=None, max_length=100)

    @field_validator("size")
    @classmethod
    def _size_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Material size")

    @field_validator("unit", "sku")
    @classmethod
    def _optional_variant_strings_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v)


class MaterialVariantUpdate(BaseModel):
    size: str | None = Field(default=None, min_length=1, max_length=100)
    unit: str | None = Field(default=None, min_length=1, max_length=50)
    price: float | None = Field(default=None, ge=0, le=_MAX_PRICE)
    sku: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("size", "unit", "sku")
    @classmethod
    def _optional_variant_strings_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v)


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
    name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=10_000)
    variants: list[MaterialVariantCreate] = Field(default_factory=list, max_length=_MAX_LIST_ITEMS)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Material name")

    @field_validator("category", "notes")
    @classmethod
    def _optional_material_strings_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v)


class MaterialUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    notes: str | None = Field(default=None, min_length=1, max_length=10_000)

    @field_validator("name", "category", "notes")
    @classmethod
    def _optional_material_strings_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v)


class MaterialOut(BaseModel):
    id: int
    name: str
    category: str | None
    notes: str | None
    created_by_id: int
    created_at: datetime
    variants: list[MaterialVariantOut] = Field(default_factory=list)

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
    title: str = Field(min_length=1, max_length=255)
    trade: UserRole | None = None
    pin_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    task_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    assigned_to_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    depends_on_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    start_time: datetime
    end_time: datetime

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Scheduled job title")

    @model_validator(mode="after")
    def _check_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ScheduledJobUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    trade: UserRole | None = None
    status: JobStatus | None = None
    pin_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    task_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    assigned_to_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    depends_on_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    start_time: datetime | None = None
    end_time: datetime | None = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError("Scheduled job title cannot be null when provided")
        return _validate_non_blank(v, "Scheduled job title")

    @field_validator("start_time", "end_time")
    @classmethod
    def _time_not_null(cls, v: datetime | None) -> datetime | None:
        if v is None:
            raise ValueError("Schedule times cannot be null when provided")
        return v

    @model_validator(mode="after")
    def _check_times(self):
        if self.start_time is not None and self.end_time is not None and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


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
    material_variant_id: int = Field(gt=0, le=_MAX_ID)
    quantity: float = Field(default=1, gt=0, le=_MAX_QUANTITY)


class TaskMaterialUpdate(BaseModel):
    quantity: float = Field(gt=0, le=_MAX_QUANTITY)


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
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    priority: PinPriority = PinPriority.NORMAL
    owner_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    due_date: datetime | None = None
    related_pin_ids: list[int] = Field(default_factory=list, max_length=_MAX_LIST_ITEMS)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, v: str) -> str:
        return _validate_non_blank(v, "Task title")

    @field_validator("description")
    @classmethod
    def _description_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v, "Task description")

    @field_validator("related_pin_ids")
    @classmethod
    def _related_pin_ids_valid(cls, v: list[int]) -> list[int]:
        if any(pin_id <= 0 or pin_id > _MAX_ID for pin_id in v):
            raise ValueError("related_pin_ids must contain positive IDs")
        if len(set(v)) != len(v):
            raise ValueError("related_pin_ids cannot contain duplicates")
        return v


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=20_000)
    status: TaskStatus | None = None
    priority: PinPriority | None = None
    owner_id: int | None = Field(default=None, gt=0, le=_MAX_ID)
    due_date: datetime | None = None
    related_pin_ids: list[int] | None = Field(default=None, max_length=_MAX_LIST_ITEMS)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v, "Task title")

    @field_validator("description")
    @classmethod
    def _description_not_blank(cls, v: str | None) -> str | None:
        return _validate_optional_non_blank(v, "Task description")

    @field_validator("related_pin_ids")
    @classmethod
    def _related_pin_ids_valid(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return None
        if any(pin_id <= 0 or pin_id > _MAX_ID for pin_id in v):
            raise ValueError("related_pin_ids must contain positive IDs")
        if len(set(v)) != len(v):
            raise ValueError("related_pin_ids cannot contain duplicates")
        return v


class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: PinPriority
    owner_id: int | None
    owner: UserBrief | None
    due_date: datetime | None
    created_by_id: int
    created_at: datetime
    completed_at: datetime | None
    comments: list[CommentOut] = Field(default_factory=list)
    attachments: list[AttachmentOut] = Field(default_factory=list)
    related_pins: list[TaskPinRef] = Field(default_factory=list)
    materials: list[TaskMaterialOut] = Field(default_factory=list)

    class Config:
        from_attributes = True

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(sum(m.line_total for m in self.materials), 2)


# ---- Estimates (drawing -> materials cost) ----
class EstimateSessionCreate(BaseModel):
    sheet_id: int = Field(gt=0, le=_MAX_ID)


class DimensionConfirm(BaseModel):
    """User-confirmed values sent back after reviewing the raw extraction.
    Anything left null falls back to the extracted value if present."""
    scale_ratio: float | None = Field(default=None, gt=0, le=100_000)
    wall_length_ft: float = Field(ge=0, le=_MAX_DIMENSION)
    wall_height_ft: float = Field(default=8.0, ge=0, le=_MAX_DIMENSION)
    opening_sqft: float = Field(default=0.0, ge=0, le=_MAX_DIMENSION)
    floor_area_sqft: float = Field(default=0.0, ge=0, le=_MAX_DIMENSION)
    roof_area_sqft: float = Field(default=0.0, ge=0, le=_MAX_DIMENSION)
    include_categories: list[str] | None = Field(default=None, max_length=_MAX_CATEGORIES)
    waste_factor_overrides: dict[str, float] | None = None

    @field_validator("include_categories")
    @classmethod
    def _categories_valid(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned = [_validate_non_blank(category, "Estimate category") for category in v]
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("include_categories cannot contain duplicates")
        if any(len(category) > 50 for category in cleaned):
            raise ValueError("Estimate category names must be at most 50 characters")
        return cleaned

    @field_validator("waste_factor_overrides")
    @classmethod
    def _waste_factors_valid(cls, v: dict[str, float] | None) -> dict[str, float] | None:
        if v is None:
            return None
        if len(v) > _MAX_CATEGORIES:
            raise ValueError(f"At most {_MAX_CATEGORIES} waste-factor overrides are allowed")
        cleaned: dict[str, float] = {}
        for category, factor in v.items():
            category = _validate_non_blank(category, "Waste-factor category")
            if len(category) > 50:
                raise ValueError("Waste-factor category names must be at most 50 characters")
            if factor < 0 or factor > _MAX_WASTE_FACTOR:
                raise ValueError("Waste factors must be between 0 and 1")
            cleaned[category] = factor
        return cleaned

    @model_validator(mode="after")
    def _dimensions_are_consistent(self):
        if self.opening_sqft > self.wall_length_ft * self.wall_height_ft:
            raise ValueError("opening_sqft cannot exceed the gross wall area")
        return self


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
    alternates: list[MaterialOptionOut] = Field(default_factory=list)
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
    lines: list[EstimateLineOut] = Field(default_factory=list)

    class Config:
        from_attributes = True

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(sum(line.line_total for line in self.lines), 2)


class EstimateLineOverride(BaseModel):
    material_variant_id: int = Field(gt=0, le=_MAX_ID)
