"""
Celery application configuration
"""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "dbbackup",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.celery.tasks.backup_tasks",
        "app.celery.tasks.schedule_tasks",
        "app.celery.tasks.notification_tasks",
    ]
)

# Celery configuration
celery_app.conf.update(
    task_track_started=settings.CELERY_TASK_TRACK_STARTED,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    result_expires=3600,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Celery beat schedule (for periodic tasks)
celery_app.conf.beat_schedule = {
    "check-scheduled-backups": {
        "task": "app.celery.tasks.schedule_tasks.check_scheduled_backups",
        "schedule": 60.0,  # Every minute
    },
    "cleanup-old-backups": {
        "task": "app.celery.tasks.schedule_tasks.cleanup_old_backups",
        "schedule": 3600.0,  # Every hour
    },
    "check-server-health": {
        "task": "app.celery.tasks.schedule_tasks.check_server_health",
        "schedule": 60.0,  # Every minute
    },
}
