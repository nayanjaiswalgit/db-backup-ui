"""
Application configuration using Pydantic Settings
"""
from typing import List
from pydantic_settings import BaseSettings
from pydantic import validator, Field


class Settings(BaseSettings):
    """Application settings"""

    # Application
    APP_NAME: str = "DB Backup Platform"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_PREFIX: str = "/api/v1"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4

    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10

    # Redis
    REDIS_URL: str
    REDIS_CACHE_DB: int = 1
    REDIS_CELERY_DB: int = 2

    # Security
    SECRET_KEY: str
    ENCRYPTION_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = Field(default_factory=list)

    @validator("CORS_ORIGINS", pre=True)
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    # S3 Storage
    S3_ENDPOINT: str
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_BUCKET: str = "db-backups"
    S3_REGION: str = "us-east-1"
    S3_USE_SSL: bool = False

    # Celery
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    CELERY_TASK_TRACK_STARTED: bool = True
    CELERY_TASK_TIME_LIMIT: int = 3600

    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_USE_TLS: bool = True

    # Slack
    SLACK_WEBHOOK_URL: str = ""

    # Backup Settings
    BACKUP_TEMP_DIR: str = "/tmp/backups"
    BACKUP_RETENTION_DAYS: int = 30
    MAX_CONCURRENT_BACKUPS: int = 5

    # Monitoring
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
