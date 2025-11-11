"""
Celery tasks for schedule management and server health monitoring
"""
import logging
from datetime import datetime, timedelta
from croniter import croniter
from sqlalchemy import select

from app.celery.celery_app import celery_app
from app.db.session import AsyncSessionLocal
from app.models.schedule import Schedule
from app.models.server import Server, HealthStatus
from app.models.backup import Backup, BackupStatus
from app.services.executor import ExecutorFactory
from app.services.notification import NotificationService
from app.celery.tasks.backup_tasks import create_backup_task

logger = logging.getLogger(__name__)


@celery_app.task
async def check_scheduled_backups():
    """Check and trigger scheduled backups"""
    async with AsyncSessionLocal() as db:
        try:
            # Get all enabled schedules
            result = await db.execute(
                select(Schedule).where(Schedule.enabled == True)
            )
            schedules = result.scalars().all()

            now = datetime.utcnow()

            for schedule in schedules:
                # Check if it's time to run
                if schedule.next_run and schedule.next_run <= now:
                    logger.info(f"Triggering scheduled backup: {schedule.name}")

                    # Create backup record
                    backup = Backup(
                        server_id=schedule.server_id,
                        database_name=schedule.database_name,
                        db_type=schedule.database_name,  # This should come from server
                        backup_type=schedule.backup_type,
                        status=BackupStatus.PENDING
                    )
                    db.add(backup)
                    await db.flush()

                    # Queue backup task
                    create_backup_task.delay(
                        backup_id=backup.id,
                        server_id=schedule.server_id,
                        database_name=schedule.database_name,
                        db_type="postgresql",  # Should be determined from server
                        backup_type=schedule.backup_type.value,
                        compress=True,
                        encrypt=True
                    )

                    # Update schedule
                    schedule.last_run = now
                    cron = croniter(schedule.cron_expression, now)
                    schedule.next_run = cron.get_next(datetime)

                    await db.commit()

        except Exception as e:
            logger.error(f"Error checking scheduled backups: {e}", exc_info=True)


@celery_app.task
async def cleanup_old_backups():
    """Clean up old backups based on retention policies"""
    async with AsyncSessionLocal() as db:
        try:
            # Get all schedules with retention policies
            result = await db.execute(
                select(Schedule).where(Schedule.retention_policy_id.isnot(None))
            )
            schedules = result.scalars().all()

            for schedule in schedules:
                if not schedule.retention_policy:
                    continue

                policy = schedule.retention_policy

                # Get backups for this schedule's server and database
                result = await db.execute(
                    select(Backup)
                    .where(Backup.server_id == schedule.server_id)
                    .where(Backup.database_name == schedule.database_name)
                    .where(Backup.status == BackupStatus.COMPLETED)
                    .order_by(Backup.created_at.desc())
                )
                backups = result.scalars().all()

                backups_to_keep = set()

                # Keep last N backups
                if policy.keep_last_n:
                    for backup in backups[:policy.keep_last_n]:
                        backups_to_keep.add(backup.id)

                # Keep backups for N days
                if policy.keep_days:
                    cutoff_date = datetime.utcnow() - timedelta(days=policy.keep_days)
                    for backup in backups:
                        if backup.created_at >= cutoff_date:
                            backups_to_keep.add(backup.id)

                # Keep daily/weekly/monthly backups
                if policy.keep_daily:
                    daily_backups = {}
                    for backup in backups:
                        date_key = backup.created_at.date()
                        if date_key not in daily_backups:
                            daily_backups[date_key] = backup
                            backups_to_keep.add(backup.id)
                        if len(daily_backups) >= policy.keep_daily:
                            break

                # Delete old backups
                for backup in backups:
                    if backup.id not in backups_to_keep:
                        logger.info(f"Deleting old backup: {backup.id}")
                        backup.status = BackupStatus.DELETED
                        backup.deleted_at = datetime.utcnow()

                await db.commit()

        except Exception as e:
            logger.error(f"Error cleaning up old backups: {e}", exc_info=True)


@celery_app.task
async def check_server_health():
    """Check health of all servers"""
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Server).where(Server.is_active == True))
            servers = result.scalars().all()

            now = datetime.utcnow()

            for server in servers:
                try:
                    # Create executor
                    executor = await ExecutorFactory.create_executor(
                        server.type,
                        server.host,
                        server.port,
                        server.credentials_encrypted
                    )

                    # Test connection
                    result = await executor.execute("echo 'ping'")

                    if result.success:
                        # Server is healthy
                        previous_status = server.health_status
                        server.health_status = HealthStatus.HEALTHY
                        server.last_heartbeat = now

                        # Send alert if server recovered
                        if previous_status == HealthStatus.UNHEALTHY:
                            await NotificationService.send_server_health_alert(
                                server.name,
                                "HEALTHY",
                                "Server has recovered and is now healthy"
                            )
                    else:
                        # Server is unhealthy
                        previous_status = server.health_status
                        server.health_status = HealthStatus.UNHEALTHY

                        # Send alert if server just became unhealthy
                        if previous_status != HealthStatus.UNHEALTHY:
                            await NotificationService.send_server_health_alert(
                                server.name,
                                "UNHEALTHY",
                                f"Server is not responding: {result.stderr}"
                            )

                except Exception as e:
                    logger.error(f"Health check failed for server {server.name}: {e}")
                    server.health_status = HealthStatus.UNKNOWN

                await db.commit()

        except Exception as e:
            logger.error(f"Error checking server health: {e}", exc_info=True)
