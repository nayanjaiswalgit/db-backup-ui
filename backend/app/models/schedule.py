"""
Scheduling and retention policy models
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Text, Integer, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy import Enum as SQLEnum
from enum import Enum

from app.db.base import Base


class BackupType(str, Enum):
    """Backup types for scheduling"""
    FULL = "full"
    INCREMENTAL = "incremental"
    DIFFERENTIAL = "differential"


class Schedule(Base):
    """Backup schedule model"""
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)

    # Target
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), index=True)
    database_name: Mapped[str] = mapped_column(String(100))

    # Schedule
    cron_expression: Mapped[str] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    backup_type: Mapped[BackupType] = mapped_column(
        SQLEnum(BackupType),
        default=BackupType.FULL
    )

    # Retention
    retention_policy_id: Mapped[int] = mapped_column(
        ForeignKey("retention_policies.id"),
        nullable=True
    )

    # Settings
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_on_success: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_on_failure: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_channels: Mapped[dict] = mapped_column(JSON, nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    last_run: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    next_run: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # Relationships
    server: Mapped["Server"] = relationship("Server", back_populates="schedules")
    retention_policy: Mapped["RetentionPolicy"] = relationship(
        "RetentionPolicy",
        back_populates="schedules"
    )


class RetentionPolicy(Base):
    """Retention policy model"""
    __tablename__ = "retention_policies"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)

    # Retention rules
    keep_last_n: Mapped[int] = mapped_column(Integer, nullable=True)  # Keep last N backups
    keep_days: Mapped[int] = mapped_column(Integer, nullable=True)  # Keep for N days
    keep_daily: Mapped[int] = mapped_column(Integer, nullable=True)  # Keep N daily backups
    keep_weekly: Mapped[int] = mapped_column(Integer, nullable=True)  # Keep N weekly backups
    keep_monthly: Mapped[int] = mapped_column(Integer, nullable=True)  # Keep N monthly backups

    # Metadata
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
    schedules: Mapped[list["Schedule"]] = relationship(
        "Schedule",
        back_populates="retention_policy"
    )
