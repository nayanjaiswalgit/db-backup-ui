"""
Storage service for S3-compatible and local storage
"""
import asyncio
import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
import aioboto3
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Base class for storage backends"""

    @abstractmethod
    async def upload(self, local_path: str, remote_path: str) -> bool:
        """Upload file to storage"""
        pass

    @abstractmethod
    async def download(self, remote_path: str, local_path: str) -> bool:
        """Download file from storage"""
        pass

    @abstractmethod
    async def delete(self, remote_path: str) -> bool:
        """Delete file from storage"""
        pass

    @abstractmethod
    async def exists(self, remote_path: str) -> bool:
        """Check if file exists"""
        pass

    @abstractmethod
    async def get_size(self, remote_path: str) -> Optional[int]:
        """Get file size in bytes"""
        pass


class S3Storage(StorageBackend):
    """S3-compatible storage backend"""

    def __init__(self):
        self.endpoint = settings.S3_ENDPOINT
        self.access_key = settings.S3_ACCESS_KEY
        self.secret_key = settings.S3_SECRET_KEY
        self.bucket = settings.S3_BUCKET
        self.region = settings.S3_REGION
        self.use_ssl = settings.S3_USE_SSL

    async def _get_client(self):
        """Get S3 client"""
        session = aioboto3.Session()
        return session.client(
            's3',
            endpoint_url=self.endpoint,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
            use_ssl=self.use_ssl
        )

    async def _ensure_bucket(self):
        """Ensure bucket exists"""
        async with await self._get_client() as s3:
            try:
                await s3.head_bucket(Bucket=self.bucket)
            except ClientError:
                # Bucket doesn't exist, create it
                try:
                    await s3.create_bucket(Bucket=self.bucket)
                    logger.info(f"Created S3 bucket: {self.bucket}")
                except Exception as e:
                    logger.error(f"Failed to create bucket: {e}")
                    raise

    async def upload(self, local_path: str, remote_path: str) -> bool:
        """Upload file to S3"""
        try:
            await self._ensure_bucket()

            async with await self._get_client() as s3:
                with open(local_path, 'rb') as f:
                    await s3.upload_fileobj(f, self.bucket, remote_path)

                logger.info(f"Uploaded {local_path} to s3://{self.bucket}/{remote_path}")
                return True

        except Exception as e:
            logger.error(f"S3 upload failed: {e}")
            return False

    async def download(self, remote_path: str, local_path: str) -> bool:
        """Download file from S3"""
        try:
            # Ensure local directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            async with await self._get_client() as s3:
                with open(local_path, 'wb') as f:
                    await s3.download_fileobj(self.bucket, remote_path, f)

                logger.info(f"Downloaded s3://{self.bucket}/{remote_path} to {local_path}")
                return True

        except Exception as e:
            logger.error(f"S3 download failed: {e}")
            return False

    async def delete(self, remote_path: str) -> bool:
        """Delete file from S3"""
        try:
            async with await self._get_client() as s3:
                await s3.delete_object(Bucket=self.bucket, Key=remote_path)

                logger.info(f"Deleted s3://{self.bucket}/{remote_path}")
                return True

        except Exception as e:
            logger.error(f"S3 delete failed: {e}")
            return False

    async def exists(self, remote_path: str) -> bool:
        """Check if file exists in S3"""
        try:
            async with await self._get_client() as s3:
                await s3.head_object(Bucket=self.bucket, Key=remote_path)
                return True
        except ClientError:
            return False

    async def get_size(self, remote_path: str) -> Optional[int]:
        """Get file size from S3"""
        try:
            async with await self._get_client() as s3:
                response = await s3.head_object(Bucket=self.bucket, Key=remote_path)
                return response['ContentLength']
        except Exception as e:
            logger.error(f"Failed to get file size: {e}")
            return None

    async def get_presigned_url(self, remote_path: str, expiration: int = 3600) -> Optional[str]:
        """Generate presigned download URL"""
        try:
            async with await self._get_client() as s3:
                url = await s3.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': self.bucket, 'Key': remote_path},
                    ExpiresIn=expiration
                )
                return url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None


class LocalStorage(StorageBackend):
    """Local filesystem storage backend"""

    def __init__(self, base_path: str = "/var/backups"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _get_full_path(self, remote_path: str) -> Path:
        """Get full local path"""
        return self.base_path / remote_path

    async def upload(self, local_path: str, remote_path: str) -> bool:
        """Copy file to local storage"""
        try:
            dest_path = self._get_full_path(remote_path)
            dest_path.parent.mkdir(parents=True, exist_ok=True)

            # Use shutil for efficient copying
            import shutil
            await asyncio.to_thread(shutil.copy2, local_path, dest_path)

            logger.info(f"Copied {local_path} to {dest_path}")
            return True

        except Exception as e:
            logger.error(f"Local copy failed: {e}")
            return False

    async def download(self, remote_path: str, local_path: str) -> bool:
        """Copy file from local storage"""
        try:
            src_path = self._get_full_path(remote_path)

            if not src_path.exists():
                logger.error(f"File not found: {src_path}")
                return False

            # Ensure destination directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            import shutil
            await asyncio.to_thread(shutil.copy2, src_path, local_path)

            logger.info(f"Copied {src_path} to {local_path}")
            return True

        except Exception as e:
            logger.error(f"Local copy failed: {e}")
            return False

    async def delete(self, remote_path: str) -> bool:
        """Delete file from local storage"""
        try:
            file_path = self._get_full_path(remote_path)

            if file_path.exists():
                await asyncio.to_thread(file_path.unlink)
                logger.info(f"Deleted {file_path}")
                return True
            else:
                logger.warning(f"File not found: {file_path}")
                return False

        except Exception as e:
            logger.error(f"Delete failed: {e}")
            return False

    async def exists(self, remote_path: str) -> bool:
        """Check if file exists"""
        file_path = self._get_full_path(remote_path)
        return file_path.exists()

    async def get_size(self, remote_path: str) -> Optional[int]:
        """Get file size"""
        try:
            file_path = self._get_full_path(remote_path)
            if file_path.exists():
                return file_path.stat().st_size
            return None
        except Exception as e:
            logger.error(f"Failed to get file size: {e}")
            return None


# Global storage instance
storage: StorageBackend = S3Storage()


def get_storage() -> StorageBackend:
    """Get storage backend instance"""
    return storage
