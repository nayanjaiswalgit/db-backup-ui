"""
Backup management models
"""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, Enum as SQLEnum, Text, Integer, BigInteger, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base


class DatabaseType(str, Enum):
    """Supported database types"""
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"
    MONGODB = "mongodb"
    REDIS = "redis"


class BackupType(str, Enum):
    """Backup types"""
    FULL = "full"
    INCREMENTAL = "incremental"
    DIFFERENTIAL = "differential"


class BackupStatus(str, Enum):
    """Backup status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    DELETED = "deleted"


class CompressionType(str, Enum):
    """Compression algorithms"""
    NONE = "none"
    GZIP = "gzip"
    LZ4 = "lz4"
    ZSTD = "zstd"


class Backup(Base):
    """Backup model"""
    __tablename__ = "backups"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), index=True)

    # Backup details
    database_name: Mapped[str] = mapped_column(String(100))
    db_type: Mapped[DatabaseType] = mapped_column(SQLEnum(DatabaseType))
    backup_type: Mapped[BackupType] = mapped_column(
        SQLEnum(BackupType),
        default=BackupType.FULL
    )
    status: Mapped[BackupStatus] = mapped_column(
        SQLEnum(BackupStatus),
        default=BackupStatus.PENDING
    )

    # Storage
    storage_path: Mapped[str] = mapped_column(String(500))  # S3 key or local path
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=True)
    checksum: Mapped[str] = mapped_column(String(128), nullable=True)  # SHA-256

    # Security
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=True)
    encryption_algorithm: Mapped[str] = mapped_column(
        String(50),
        default="AES-256-GCM"
    )
    is_compressed: Mapped[bool] = mapped_column(Boolean, default=True)
    compression_type: Mapped[CompressionType] = mapped_column(
        SQLEnum(CompressionType),
        default=CompressionType.GZIP
    )

    # Timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=True)

    # Error handling
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Metadata
    parent_backup_id: Mapped[int] = mapped_column(
        ForeignKey("backups.id"),
        nullable=True
    )  # For incremental/differential
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    deleted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # Relationships
    server: Mapped["Server"] = relationship("Server", back_populates="backups")
    metadata_entries: Mapped[list["BackupMetadata"]] = relationship(
        "BackupMetadata",
        back_populates="backup",
        cascade="all, delete-orphan"
    )


class BackupMetadata(Base):
    """Backup metadata (key-value pairs)"""
    __tablename__ = "backup_metadata"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    backup_id: Mapped[int] = mapped_column(ForeignKey("backups.id"), index=True)
    key: Mapped[str] = mapped_column(String(100))
    value: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # Relationships
    backup: Mapped["Backup"] = relationship("Backup", back_populates="metadata_entries")
