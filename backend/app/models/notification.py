"""
Notification models
"""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, Enum as SQLEnum, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base


class NotificationType(str, Enum):
    """Notification channel types"""
    SLACK = "slack"
    EMAIL = "email"
    WEBHOOK = "webhook"


class NotificationStatus(str, Enum):
    """Notification delivery status"""
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class NotificationEvent(str, Enum):
    """Event types that trigger notifications"""
    BACKUP_SUCCESS = "backup_success"
    BACKUP_FAILURE = "backup_failure"
    RESTORE_SUCCESS = "restore_success"
    RESTORE_FAILURE = "restore_failure"
    SERVER_UNHEALTHY = "server_unhealthy"
    STORAGE_WARNING = "storage_warning"
    SCHEDULE_FAILED = "schedule_failed"


class NotificationChannel(Base):
    """Notification channel configuration"""
    __tablename__ = "notification_channels"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    type: Mapped[NotificationType] = mapped_column(SQLEnum(NotificationType))
    config_encrypted: Mapped[str] = mapped_column(Text)  # Encrypted configuration
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relationships
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        back_populates="channel",
        cascade="all, delete-orphan"
    )


class Notification(Base):
    """Notification log"""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    channel_id: Mapped[int] = mapped_column(index=True)
    event_type: Mapped[NotificationEvent] = mapped_column(
        SQLEnum(NotificationEvent),
        index=True
    )
    subject: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[NotificationStatus] = mapped_column(
        SQLEnum(NotificationStatus),
        default=NotificationStatus.PENDING
    )
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # Relationships
    channel: Mapped["NotificationChannel"] = relationship(
        "NotificationChannel",
        back_populates="notifications"
    )
