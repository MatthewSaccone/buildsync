import enum


class UserRole(str, enum.Enum):
    ARCHITECT = "architect"
    BUILDER = "builder"
    GENERAL_CONTRACTOR = "general_contractor"
    ELECTRICIAN = "electrician"
    PLUMBER = "plumber"
    HVAC = "hvac"
    FRAMER = "framer"
    OWNER = "owner"
    OTHER = "other"


class PinStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    RESOLVED = "resolved"
    VERIFIED = "verified"


class PinPriority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class ProjectRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"
