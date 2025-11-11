"""
Logging configuration
"""
import logging
import sys
from pythonjsonlogger import jsonlogger

from app.core.config import settings


def setup_logging():
    """Setup application logging"""
    log_level = getattr(logging, settings.LOG_LEVEL.upper())

    # Create root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers
    root_logger.handlers.clear()

    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)

    # Set formatter based on configuration
    if settings.LOG_FORMAT == "json":
        formatter = jsonlogger.JsonFormatter(
            "%(asctime)s %(name)s %(levelname)s %(message)s"
        )
    else:
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )

    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Set specific loggers
    logging.getLogger("uvicorn").setLevel(log_level)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
    logging.getLogger("alembic").setLevel(logging.INFO)
