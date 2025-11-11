"""
Database-specific backup engines
"""
import asyncio
import logging
import os
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path

from app.models.backup import DatabaseType, BackupType
from app.services.executor import ExecutorFactory, ExecutionResult

logger = logging.getLogger(__name__)


class BackupEngine(ABC):
    """Base class for database backup engines"""

    def __init__(self, executor, database_name: str, credentials: Dict[str, Any]):
        self.executor = executor
        self.database_name = database_name
        self.credentials = credentials

    @abstractmethod
    async def create_backup(
        self,
        backup_type: BackupType,
        output_path: str
    ) -> ExecutionResult:
        """Create a backup"""
        pass

    @abstractmethod
    async def restore_backup(
        self,
        backup_path: str,
        target_database: Optional[str] = None
    ) -> ExecutionResult:
        """Restore a backup"""
        pass

    @abstractmethod
    async def list_databases(self) -> list:
        """List all databases"""
        pass


class PostgreSQLEngine(BackupEngine):
    """PostgreSQL backup engine"""

    async def create_backup(
        self,
        backup_type: BackupType,
        output_path: str
    ) -> ExecutionResult:
        """Create PostgreSQL backup using pg_dump"""
        username = self.credentials.get("username", "postgres")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 5432)

        # Set password environment variable
        env_vars = f"PGPASSWORD={password}"

        if backup_type == BackupType.FULL:
            # Full backup with custom format
            command = (
                f"{env_vars} pg_dump "
                f"-h {host} -p {port} -U {username} "
                f"-d {self.database_name} "
                f"-Fc "  # Custom format (compressed)
                f"-f {output_path}"
            )
        elif backup_type == BackupType.INCREMENTAL:
            # Use pg_basebackup for incremental
            command = (
                f"{env_vars} pg_basebackup "
                f"-h {host} -p {port} -U {username} "
                f"-D {output_path} "
                f"-Fp -Xs -P"
            )
        else:
            return ExecutionResult(False, stderr="Unsupported backup type for PostgreSQL")

        logger.info(f"Executing PostgreSQL backup: {self.database_name}")
        result = await self.executor.execute(command)

        if result.success:
            logger.info(f"PostgreSQL backup completed: {output_path}")
        else:
            logger.error(f"PostgreSQL backup failed: {result.stderr}")

        return result

    async def restore_backup(
        self,
        backup_path: str,
        target_database: Optional[str] = None
    ) -> ExecutionResult:
        """Restore PostgreSQL backup using pg_restore"""
        username = self.credentials.get("username", "postgres")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 5432)

        db_name = target_database or self.database_name
        env_vars = f"PGPASSWORD={password}"

        # Drop and recreate database (optional, based on requirements)
        command = (
            f"{env_vars} pg_restore "
            f"-h {host} -p {port} -U {username} "
            f"-d {db_name} "
            f"--clean --if-exists "
            f"--no-owner --no-acl "
            f"{backup_path}"
        )

        logger.info(f"Executing PostgreSQL restore to: {db_name}")
        result = await self.executor.execute(command)

        if result.success:
            logger.info(f"PostgreSQL restore completed: {db_name}")
        else:
            logger.error(f"PostgreSQL restore failed: {result.stderr}")

        return result

    async def list_databases(self) -> list:
        """List all PostgreSQL databases"""
        username = self.credentials.get("username", "postgres")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 5432)

        env_vars = f"PGPASSWORD={password}"
        command = (
            f"{env_vars} psql "
            f"-h {host} -p {port} -U {username} "
            f"-t -c \"SELECT datname FROM pg_database WHERE datistemplate = false;\""
        )

        result = await self.executor.execute(command)

        if result.success:
            databases = [db.strip() for db in result.stdout.split('\n') if db.strip()]
            return databases
        return []


class MySQLEngine(BackupEngine):
    """MySQL/MariaDB backup engine"""

    async def create_backup(
        self,
        backup_type: BackupType,
        output_path: str
    ) -> ExecutionResult:
        """Create MySQL backup using mysqldump"""
        username = self.credentials.get("username", "root")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 3306)

        if backup_type == BackupType.FULL:
            command = (
                f"mysqldump "
                f"-h {host} -P {port} -u {username} -p{password} "
                f"--single-transaction --quick --lock-tables=false "
                f"{self.database_name} > {output_path}"
            )
        else:
            return ExecutionResult(False, stderr="Only full backups supported for MySQL")

        logger.info(f"Executing MySQL backup: {self.database_name}")
        result = await self.executor.execute(command)

        if result.success:
            logger.info(f"MySQL backup completed: {output_path}")
        else:
            logger.error(f"MySQL backup failed: {result.stderr}")

        return result

    async def restore_backup(
        self,
        backup_path: str,
        target_database: Optional[str] = None
    ) -> ExecutionResult:
        """Restore MySQL backup"""
        username = self.credentials.get("username", "root")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 3306)

        db_name = target_database or self.database_name

        command = (
            f"mysql "
            f"-h {host} -P {port} -u {username} -p{password} "
            f"{db_name} < {backup_path}"
        )

        logger.info(f"Executing MySQL restore to: {db_name}")
        result = await self.executor.execute(command)

        if result.success:
            logger.info(f"MySQL restore completed: {db_name}")
        else:
            logger.error(f"MySQL restore failed: {result.stderr}")

        return result

    async def list_databases(self) -> list:
        """List all MySQL databases"""
        username = self.credentials.get("username", "root")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 3306)

        command = (
            f"mysql -h {host} -P {port} -u {username} -p{password} "
            f"-e \"SHOW DATABASES;\""
        )

        result = await self.executor.execute(command)

        if result.success:
            databases = [
                db.strip() for db in result.stdout.split('\n')[1:]  # Skip header
                if db.strip() and db not in ['information_schema', 'performance_schema', 'mysql', 'sys']
            ]
            return databases
        return []


class MongoDBEngine(BackupEngine):
    """MongoDB backup engine"""

    async def create_backup(
        self,
        backup_type: BackupType,
        output_path: str
    ) -> ExecutionResult:
        """Create MongoDB backup using mongodump"""
        username = self.credentials.get("username", "")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 27017)

        auth_str = ""
        if username and password:
            auth_str = f"-u {username} -p {password} --authenticationDatabase admin"

        command = (
            f"mongodump "
            f"--host {host} --port {port} {auth_str} "
            f"--db {self.database_name} "
            f"--out {output_path}"
        )

        logger.info(f"Executing MongoDB backup: {self.database_name}")
        result = await self.executor.execute(command)

        if result.success:
            logger.info(f"MongoDB backup completed: {output_path}")
        else:
            logger.error(f"MongoDB backup failed: {result.stderr}")

        return result

    async def restore_backup(
        self,
        backup_path: str,
        target_database: Optional[str] = None
    ) -> ExecutionResult:
        """Restore MongoDB backup using mongorestore"""
        username = self.credentials.get("username", "")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 27017)

        db_name = target_database or self.database_name

        auth_str = ""
        if username and password:
            auth_str = f"-u {username} -p {password} --authenticationDatabase admin"

        command = (
            f"mongorestore "
            f"--host {host} --port {port} {auth_str} "
            f"--db {db_name} "
            f"--drop "
            f"{backup_path}/{self.database_name}"
        )

        logger.info(f"Executing MongoDB restore to: {db_name}")
        result = await self.executor.execute(command)

        if result.success:
            logger.info(f"MongoDB restore completed: {db_name}")
        else:
            logger.error(f"MongoDB restore failed: {result.stderr}")

        return result

    async def list_databases(self) -> list:
        """List all MongoDB databases"""
        username = self.credentials.get("username", "")
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 27017)

        auth_str = ""
        if username and password:
            auth_str = f"-u {username} -p {password} --authenticationDatabase admin"

        command = (
            f"mongo --host {host} --port {port} {auth_str} "
            f"--eval 'db.adminCommand({ listDatabases: 1 })' --quiet"
        )

        result = await self.executor.execute(command)

        if result.success:
            import json
            data = json.loads(result.stdout)
            databases = [db['name'] for db in data.get('databases', [])]
            return databases
        return []


class RedisEngine(BackupEngine):
    """Redis backup engine"""

    async def create_backup(
        self,
        backup_type: BackupType,
        output_path: str
    ) -> ExecutionResult:
        """Create Redis backup using BGSAVE"""
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 6379)
        db_num = self.credentials.get("db", 0)

        auth_str = f"-a {password}" if password else ""

        # Trigger background save
        command = f"redis-cli -h {host} -p {port} {auth_str} -n {db_num} BGSAVE"

        logger.info(f"Executing Redis backup: DB {db_num}")
        result = await self.executor.execute(command)

        if not result.success:
            return result

        # Wait for BGSAVE to complete
        await asyncio.sleep(1)

        # Get RDB file location
        command = f"redis-cli -h {host} -p {port} {auth_str} CONFIG GET dir"
        result = await self.executor.execute(command)

        if result.success:
            lines = result.stdout.split('\n')
            rdb_dir = lines[1] if len(lines) > 1 else "/var/lib/redis"

            # Copy RDB file to output path
            copy_cmd = f"cp {rdb_dir}/dump.rdb {output_path}"
            copy_result = await self.executor.execute(copy_cmd)

            if copy_result.success:
                logger.info(f"Redis backup completed: {output_path}")
            else:
                logger.error(f"Redis backup copy failed: {copy_result.stderr}")

            return copy_result

        return result

    async def restore_backup(
        self,
        backup_path: str,
        target_database: Optional[str] = None
    ) -> ExecutionResult:
        """Restore Redis backup"""
        password = self.credentials.get("password", "")
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", 6379)

        auth_str = f"-a {password}" if password else ""

        # Get Redis data directory
        command = f"redis-cli -h {host} -p {port} {auth_str} CONFIG GET dir"
        result = await self.executor.execute(command)

        if not result.success:
            return result

        lines = result.stdout.split('\n')
        rdb_dir = lines[1] if len(lines) > 1 else "/var/lib/redis"

        # Stop Redis (or use SHUTDOWN NOSAVE)
        stop_cmd = f"redis-cli -h {host} -p {port} {auth_str} SHUTDOWN NOSAVE"
        await self.executor.execute(stop_cmd)

        # Copy backup file
        copy_cmd = f"cp {backup_path} {rdb_dir}/dump.rdb"
        copy_result = await self.executor.execute(copy_cmd)

        if not copy_result.success:
            return copy_result

        # Start Redis again (platform-dependent)
        start_cmd = "redis-server --daemonize yes"
        start_result = await self.executor.execute(start_cmd)

        logger.info(f"Redis restore completed")
        return start_result

    async def list_databases(self) -> list:
        """List Redis databases (0-15 typically)"""
        return [f"DB {i}" for i in range(16)]


class BackupEngineFactory:
    """Factory for creating backup engines"""

    @staticmethod
    def create_engine(
        db_type: DatabaseType,
        executor,
        database_name: str,
        credentials: Dict[str, Any]
    ) -> BackupEngine:
        """Create appropriate backup engine"""

        if db_type == DatabaseType.POSTGRESQL:
            return PostgreSQLEngine(executor, database_name, credentials)
        elif db_type == DatabaseType.MYSQL:
            return MySQLEngine(executor, database_name, credentials)
        elif db_type == DatabaseType.MONGODB:
            return MongoDBEngine(executor, database_name, credentials)
        elif db_type == DatabaseType.REDIS:
            return RedisEngine(executor, database_name, credentials)
        else:
            raise ValueError(f"Unsupported database type: {db_type}")
