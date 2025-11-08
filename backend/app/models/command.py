"""
Command automation models
"""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, Enum as SQLEnum, Text, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base


class CommandType(str, Enum):
    """Command execution types"""
    SHELL = "shell"
    DOCKER = "docker"
    KUBERNETES = "kubernetes"


class CommandStatus(str, Enum):
    """Command execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


class Command(Base):
    """Command template model"""
    __tablename__ = "commands"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    command_template: Mapped[str] = mapped_column(Text)
    type: Mapped[CommandType] = mapped_column(SQLEnum(CommandType))

    # Metadata
    tags: Mapped[str] = mapped_column(String(255), nullable=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
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
    creator: Mapped["User"] = relationship(
        "User",
        back_populates="commands",
        foreign_keys=[created_by_id]
    )
    executions: Mapped[list["CommandExecution"]] = relationship(
        "CommandExecution",
        back_populates="command",
        cascade="all, delete-orphan"
    )


class CommandExecution(Base):
    """Command execution history"""
    __tablename__ = "command_executions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    command_id: Mapped[int] = mapped_column(ForeignKey("commands.id"), index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), index=True)

    # Execution details
    command_text: Mapped[str] = mapped_column(Text)  # Rendered command with variables
    status: Mapped[CommandStatus] = mapped_column(
        SQLEnum(CommandStatus),
        default=CommandStatus.PENDING
    )
    exit_code: Mapped[int] = mapped_column(Integer, nullable=True)
    stdout: Mapped[str] = mapped_column(Text, nullable=True)
    stderr: Mapped[str] = mapped_column(Text, nullable=True)

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

    # Metadata
    executed_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # Relationships
    command: Mapped["Command"] = relationship("Command", back_populates="executions")
    server: Mapped["Server"] = relationship("Server", back_populates="command_executions")
    executor: Mapped["User"] = relationship(
        "User",
        back_populates="command_executions",
        foreign_keys=[executed_by_id]
    )
