"""
Server management models
"""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, Enum as SQLEnum, Text, Integer, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy import ForeignKey, Table, Column

from app.db.base import Base


class ServerType(str, Enum):
    """Server deployment type"""
    DOCKER = "docker"
    KUBERNETES = "kubernetes"
    BARE_METAL = "bare_metal"


class ServerEnvironment(str, Enum):
    """Server environment"""
    PRODUCTION = "production"
    STAGING = "staging"
    DEVELOPMENT = "development"
    TESTING = "testing"


class HealthStatus(str, Enum):
    """Server health status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class Server(Base):
    """Server model"""
    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    type: Mapped[ServerType] = mapped_column(SQLEnum(ServerType))
    environment: Mapped[ServerEnvironment] = mapped_column(
        SQLEnum(ServerEnvironment),
        default=ServerEnvironment.DEVELOPMENT
    )

    # Connection details
    host: Mapped[str] = mapped_column(String(255))
    port: Mapped[int] = mapped_column(Integer, nullable=True)
    credentials_encrypted: Mapped[str] = mapped_column(Text)  # Encrypted JSON

    # Health monitoring
    health_status: Mapped[HealthStatus] = mapped_column(
        SQLEnum(HealthStatus),
        default=HealthStatus.UNKNOWN
    )
    last_heartbeat: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    heartbeat_interval: Mapped[int] = mapped_column(
        Integer,
        default=60  # seconds
    )

    # Metadata
    tags: Mapped[dict] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
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
    backups: Mapped[list["Backup"]] = relationship(
        "Backup",
        back_populates="server",
        cascade="all, delete-orphan"
    )
    schedules: Mapped[list["Schedule"]] = relationship(
        "Schedule",
        back_populates="server",
        cascade="all, delete-orphan"
    )
    command_executions: Mapped[list["CommandExecution"]] = relationship(
        "CommandExecution",
        back_populates="server"
    )


class ServerGroup(Base):
    """Server group for organizing servers"""
    __tablename__ = "server_groups"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )


# Association table for many-to-many relationship
server_group_members = Table(
    "server_group_members",
    Base.metadata,
    Column("server_id", Integer, ForeignKey("servers.id"), primary_key=True),
    Column("group_id", Integer, ForeignKey("server_groups.id"), primary_key=True),
)


class ServerGroupMember(Base):
    """Server group membership (if you need additional fields)"""
    __tablename__ = "server_group_members_extended"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"))
    group_id: Mapped[int] = mapped_column(ForeignKey("server_groups.id"))
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
