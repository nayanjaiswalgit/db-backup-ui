"""
Audit logging models
"""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, Enum as SQLEnum, Text, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class AuditAction(str, Enum):
    """Audit actions"""
    # User actions
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DELETE = "user_delete"

    # Server actions
    SERVER_CREATE = "server_create"
    SERVER_UPDATE = "server_update"
    SERVER_DELETE = "server_delete"

    # Backup actions
    BACKUP_CREATE = "backup_create"
    BACKUP_DELETE = "backup_delete"
    BACKUP_RESTORE = "backup_restore"
    BACKUP_DOWNLOAD = "backup_download"

    # Schedule actions
    SCHEDULE_CREATE = "schedule_create"
    SCHEDULE_UPDATE = "schedule_update"
    SCHEDULE_DELETE = "schedule_delete"

    # Command actions
    COMMAND_CREATE = "command_create"
    COMMAND_EXECUTE = "command_execute"
    COMMAND_DELETE = "command_delete"


class ResourceType(str, Enum):
    """Resource types for audit"""
    USER = "user"
    SERVER = "server"
    BACKUP = "backup"
    SCHEDULE = "schedule"
    COMMAND = "command"
    NOTIFICATION = "notification"


class AuditLog(Base):
    """Audit log model"""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    username: Mapped[str] = mapped_column(String(50), nullable=True)
    action: Mapped[AuditAction] = mapped_column(SQLEnum(AuditAction), index=True)
    resource_type: Mapped[ResourceType] = mapped_column(
        SQLEnum(ResourceType),
        nullable=True
    )
    resource_id: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)  # IPv6 compatible
    user_agent: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True
    )
