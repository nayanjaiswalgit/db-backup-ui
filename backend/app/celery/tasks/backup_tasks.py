"""
Celery tasks for backup operations
"""
import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path

from celery import Task
from sqlalchemy import select

from app.celery.celery_app import celery_app
from app.db.session import AsyncSessionLocal
from app.models.backup import Backup, BackupStatus, BackupType, CompressionType
from app.models.server import Server
from app.services.executor import ExecutorFactory
from app.services.backup_engines import BackupEngineFactory
from app.services.encryption import EncryptionService, CompressionService, ChecksumService
from app.services.storage import get_storage
from app.services.notification import NotificationService
from app.models.audit import AuditLog, AuditAction, ResourceType

logger = logging.getLogger(__name__)


class BackupTask(Task):
    """Base backup task with error handling"""

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        logger.error(f"Task {task_id} failed: {exc}")


@celery_app.task(base=BackupTask, bind=True)
async def create_backup_task(
    self,
    backup_id: int,
    server_id: int,
    database_name: str,
    db_type: str,
    backup_type: str,
    compress: bool = True,
    compression_type: str = "gzip",
    encrypt: bool = True,
    user_id: int = None
):
    """
    Create backup task

    Args:
        backup_id: Backup record ID
        server_id: Server ID
        database_name: Database name
        db_type: Database type
        backup_type: Backup type (full/incremental/differential)
        compress: Whether to compress
        compression_type: Compression algorithm
        encrypt: Whether to encrypt
        user_id: User who initiated the backup
    """
    async with AsyncSessionLocal() as db:
        try:
            # Update backup status
            result = await db.execute(select(Backup).where(Backup.id == backup_id))
            backup = result.scalar_one()
            backup.status = BackupStatus.IN_PROGRESS
            backup.started_at = datetime.utcnow()
            await db.commit()

            # Get server info
            result = await db.execute(select(Server).where(Server.id == server_id))
            server = result.scalar_one()

            # Create executor
            executor = await ExecutorFactory.create_executor(
                server.type,
                server.host,
                server.port,
                server.credentials_encrypted
            )

            # Create backup engine
            from app.core.security import decrypt_dict
            import json
            db_credentials = decrypt_dict(json.loads(server.credentials_encrypted))

            engine = BackupEngineFactory.create_engine(
                getattr(BackupType, db_type.upper()),
                executor,
                database_name,
                db_credentials
            )

            # Create temporary file for backup
            with tempfile.NamedTemporaryFile(delete=False, suffix='.backup') as tmp_file:
                temp_backup_path = tmp_file.name

            # Execute backup
            logger.info(f"Starting backup for {database_name} on server {server.name}")
            result = await engine.create_backup(
                getattr(BackupType, backup_type.upper()),
                temp_backup_path
            )

            if not result.success:
                raise Exception(f"Backup failed: {result.stderr}")

            # Get file size
            file_size = os.path.getsize(temp_backup_path)
            logger.info(f"Backup created: {file_size} bytes")

            # Compress if requested
            if compress:
                compressed_path = f"{temp_backup_path}.compressed"
                compression_service = CompressionService()

                success = await compression_service.compress_file(
                    temp_backup_path,
                    compressed_path,
                    getattr(CompressionType, compression_type.upper())
                )

                if not success:
                    raise Exception("Compression failed")

                os.remove(temp_backup_path)
                temp_backup_path = compressed_path
                file_size = os.path.getsize(temp_backup_path)
                logger.info(f"Backup compressed: {file_size} bytes")

            # Encrypt if requested
            if encrypt:
                encrypted_path = f"{temp_backup_path}.enc"
                encryption_service = EncryptionService()

                success = await encryption_service.encrypt_file(
                    temp_backup_path,
                    encrypted_path
                )

                if not success:
                    raise Exception("Encryption failed")

                os.remove(temp_backup_path)
                temp_backup_path = encrypted_path
                file_size = os.path.getsize(temp_backup_path)
                logger.info(f"Backup encrypted: {file_size} bytes")

            # Calculate checksum
            checksum = ChecksumService.calculate_checksum(temp_backup_path)

            # Upload to storage
            timestamp = datetime.utcnow().strftime("%Y/%m/%d")
            storage_path = f"backups/{timestamp}/backup_{backup_id}.dat"

            storage = get_storage()
            success = await storage.upload(temp_backup_path, storage_path)

            if not success:
                raise Exception("Upload to storage failed")

            logger.info(f"Backup uploaded to: {storage_path}")

            # Update backup record
            backup.status = BackupStatus.COMPLETED
            backup.completed_at = datetime.utcnow()
            backup.duration_seconds = (backup.completed_at - backup.started_at).seconds
            backup.size_bytes = file_size
            backup.storage_path = storage_path
            backup.checksum = f"sha256:{checksum}"
            backup.is_compressed = compress
            backup.compression_type = getattr(CompressionType, compression_type.upper()) if compress else CompressionType.NONE
            backup.is_encrypted = encrypt

            # Create audit log
            audit = AuditLog(
                user_id=user_id,
                action=AuditAction.BACKUP_CREATE,
                resource_type=ResourceType.BACKUP,
                resource_id=backup_id,
                details={
                    "database": database_name,
                    "server": server.name,
                    "size_bytes": file_size,
                    "duration_seconds": backup.duration_seconds
                }
            )
            db.add(audit)

            await db.commit()

            # Send success notification
            await NotificationService.send_backup_notification(
                backup_id=backup_id,
                success=True,
                message=f"Backup completed for {database_name}"
            )

            # Cleanup temp file
            if os.path.exists(temp_backup_path):
                os.remove(temp_backup_path)

            logger.info(f"Backup task completed successfully: {backup_id}")

        except Exception as e:
            logger.error(f"Backup task failed: {e}", exc_info=True)

            # Update backup status
            backup.status = BackupStatus.FAILED
            backup.completed_at = datetime.utcnow()
            if backup.started_at:
                backup.duration_seconds = (backup.completed_at - backup.started_at).seconds
            backup.error_message = str(e)
            await db.commit()

            # Send failure notification
            await NotificationService.send_backup_notification(
                backup_id=backup_id,
                success=False,
                message=f"Backup failed for {database_name}: {str(e)}"
            )

            raise


@celery_app.task(base=BackupTask)
async def restore_backup_task(
    backup_id: int,
    target_server_id: int,
    target_database: str,
    mask_data: bool = False,
    user_id: int = None
):
    """
    Restore backup task

    Args:
        backup_id: Backup ID to restore
        target_server_id: Target server ID
        target_database: Target database name
        mask_data: Whether to mask sensitive data
        user_id: User who initiated the restore
    """
    async with AsyncSessionLocal() as db:
        try:
            # Get backup info
            result = await db.execute(select(Backup).where(Backup.id == backup_id))
            backup = result.scalar_one()

            # Get target server
            result = await db.execute(select(Server).where(Server.id == target_server_id))
            target_server = result.scalar_one()

            # Download backup from storage
            with tempfile.NamedTemporaryFile(delete=False, suffix='.backup') as tmp_file:
                temp_restore_path = tmp_file.name

            storage = get_storage()
            success = await storage.download(backup.storage_path, temp_restore_path)

            if not success:
                raise Exception("Failed to download backup from storage")

            # Decrypt if needed
            if backup.is_encrypted:
                decrypted_path = f"{temp_restore_path}.dec"
                encryption_service = EncryptionService()

                success = await encryption_service.decrypt_file(
                    temp_restore_path,
                    decrypted_path
                )

                if not success:
                    raise Exception("Decryption failed")

                os.remove(temp_restore_path)
                temp_restore_path = decrypted_path

            # Decompress if needed
            if backup.is_compressed:
                decompressed_path = f"{temp_restore_path}.decompressed"
                compression_service = CompressionService()

                success = await compression_service.decompress_file(
                    temp_restore_path,
                    decompressed_path,
                    backup.compression_type
                )

                if not success:
                    raise Exception("Decompression failed")

                os.remove(temp_restore_path)
                temp_restore_path = decompressed_path

            # Verify checksum
            if backup.checksum:
                expected_checksum = backup.checksum.split(':')[1]
                if not ChecksumService.verify_checksum(temp_restore_path, expected_checksum):
                    raise Exception("Checksum verification failed")

            # Create executor for target server
            executor = await ExecutorFactory.create_executor(
                target_server.type,
                target_server.host,
                target_server.port,
                target_server.credentials_encrypted
            )

            # Create restore engine
            from app.core.security import decrypt_dict
            import json
            db_credentials = decrypt_dict(json.loads(target_server.credentials_encrypted))

            engine = BackupEngineFactory.create_engine(
                backup.db_type,
                executor,
                target_database,
                db_credentials
            )

            # Execute restore
            logger.info(f"Starting restore to {target_database} on server {target_server.name}")
            result = await engine.restore_backup(temp_restore_path, target_database)

            if not result.success:
                raise Exception(f"Restore failed: {result.stderr}")

            # Create audit log
            audit = AuditLog(
                user_id=user_id,
                action=AuditAction.BACKUP_RESTORE,
                resource_type=ResourceType.BACKUP,
                resource_id=backup_id,
                details={
                    "target_database": target_database,
                    "target_server": target_server.name,
                    "masked": mask_data
                }
            )
            db.add(audit)
            await db.commit()

            # Send success notification
            await NotificationService.send_restore_notification(
                backup_id=backup_id,
                success=True,
                message=f"Restore completed to {target_database}"
            )

            # Cleanup
            if os.path.exists(temp_restore_path):
                os.remove(temp_restore_path)

            logger.info(f"Restore task completed successfully")

        except Exception as e:
            logger.error(f"Restore task failed: {e}", exc_info=True)

            # Send failure notification
            await NotificationService.send_restore_notification(
                backup_id=backup_id,
                success=False,
                message=f"Restore failed: {str(e)}"
            )

            raise
