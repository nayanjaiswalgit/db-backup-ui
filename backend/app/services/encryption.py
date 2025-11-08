"""
Encryption and compression services
"""
import gzip
import lz4.frame
import zstandard as zstd
import hashlib
import logging
from pathlib import Path
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
import os

from app.models.backup import CompressionType
from app.core.config import settings

logger = logging.getLogger(__name__)


class EncryptionService:
    """File encryption service using AES-256-GCM"""

    def __init__(self, key: Optional[bytes] = None):
        if key is None:
            # Derive key from settings
            key = settings.ENCRYPTION_KEY.encode()
        self.key = self._derive_key(key)

    def _derive_key(self, password: bytes) -> bytes:
        """Derive 256-bit key from password"""
        if len(password) == 32:
            return password

        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'dbbackup_platform',  # In production, use unique salt per backup
            iterations=100000,
        )
        return kdf.derive(password)

    def encrypt_file(self, input_path: str, output_path: str) -> bool:
        """Encrypt file using AES-256-GCM"""
        try:
            # Generate random nonce
            nonce = os.urandom(12)

            # Create cipher
            aesgcm = AESGCM(self.key)

            # Read input file
            with open(input_path, 'rb') as f:
                plaintext = f.read()

            # Encrypt
            ciphertext = aesgcm.encrypt(nonce, plaintext, None)

            # Write nonce + ciphertext to output
            with open(output_path, 'wb') as f:
                f.write(nonce)
                f.write(ciphertext)

            logger.info(f"Encrypted {input_path} to {output_path}")
            return True

        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            return False

    def decrypt_file(self, input_path: str, output_path: str) -> bool:
        """Decrypt file"""
        try:
            # Read encrypted file
            with open(input_path, 'rb') as f:
                # Read nonce (first 12 bytes)
                nonce = f.read(12)
                # Read ciphertext
                ciphertext = f.read()

            # Create cipher
            aesgcm = AESGCM(self.key)

            # Decrypt
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)

            # Write decrypted data
            with open(output_path, 'wb') as f:
                f.write(plaintext)

            logger.info(f"Decrypted {input_path} to {output_path}")
            return True

        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            return False


class CompressionService:
    """File compression service"""

    @staticmethod
    def compress_file(
        input_path: str,
        output_path: str,
        compression_type: CompressionType = CompressionType.GZIP
    ) -> bool:
        """Compress file"""
        try:
            if compression_type == CompressionType.GZIP:
                return CompressionService._compress_gzip(input_path, output_path)
            elif compression_type == CompressionType.LZ4:
                return CompressionService._compress_lz4(input_path, output_path)
            elif compression_type == CompressionType.ZSTD:
                return CompressionService._compress_zstd(input_path, output_path)
            else:
                # No compression, just copy
                import shutil
                shutil.copy2(input_path, output_path)
                return True

        except Exception as e:
            logger.error(f"Compression failed: {e}")
            return False

    @staticmethod
    def _compress_gzip(input_path: str, output_path: str) -> bool:
        """Compress using gzip"""
        with open(input_path, 'rb') as f_in:
            with gzip.open(output_path, 'wb', compresslevel=6) as f_out:
                f_out.writelines(f_in)
        logger.info(f"Compressed {input_path} with gzip")
        return True

    @staticmethod
    def _compress_lz4(input_path: str, output_path: str) -> bool:
        """Compress using LZ4"""
        with open(input_path, 'rb') as f_in:
            with lz4.frame.open(output_path, 'wb') as f_out:
                f_out.write(f_in.read())
        logger.info(f"Compressed {input_path} with LZ4")
        return True

    @staticmethod
    def _compress_zstd(input_path: str, output_path: str) -> bool:
        """Compress using Zstandard"""
        cctx = zstd.ZstdCompressor(level=3)
        with open(input_path, 'rb') as f_in:
            with open(output_path, 'wb') as f_out:
                f_out.write(cctx.compress(f_in.read()))
        logger.info(f"Compressed {input_path} with Zstandard")
        return True

    @staticmethod
    def decompress_file(
        input_path: str,
        output_path: str,
        compression_type: CompressionType
    ) -> bool:
        """Decompress file"""
        try:
            if compression_type == CompressionType.GZIP:
                return CompressionService._decompress_gzip(input_path, output_path)
            elif compression_type == CompressionType.LZ4:
                return CompressionService._decompress_lz4(input_path, output_path)
            elif compression_type == CompressionType.ZSTD:
                return CompressionService._decompress_zstd(input_path, output_path)
            else:
                # No compression
                import shutil
                shutil.copy2(input_path, output_path)
                return True

        except Exception as e:
            logger.error(f"Decompression failed: {e}")
            return False

    @staticmethod
    def _decompress_gzip(input_path: str, output_path: str) -> bool:
        """Decompress gzip"""
        with gzip.open(input_path, 'rb') as f_in:
            with open(output_path, 'wb') as f_out:
                f_out.write(f_in.read())
        logger.info(f"Decompressed {input_path} (gzip)")
        return True

    @staticmethod
    def _decompress_lz4(input_path: str, output_path: str) -> bool:
        """Decompress LZ4"""
        with lz4.frame.open(input_path, 'rb') as f_in:
            with open(output_path, 'wb') as f_out:
                f_out.write(f_in.read())
        logger.info(f"Decompressed {input_path} (LZ4)")
        return True

    @staticmethod
    def _decompress_zstd(input_path: str, output_path: str) -> bool:
        """Decompress Zstandard"""
        dctx = zstd.ZstdDecompressor()
        with open(input_path, 'rb') as f_in:
            with open(output_path, 'wb') as f_out:
                f_out.write(dctx.decompress(f_in.read()))
        logger.info(f"Decompressed {input_path} (Zstandard)")
        return True


class ChecksumService:
    """File checksum service"""

    @staticmethod
    def calculate_checksum(file_path: str, algorithm: str = 'sha256') -> str:
        """Calculate file checksum"""
        if algorithm == 'sha256':
            hasher = hashlib.sha256()
        elif algorithm == 'md5':
            hasher = hashlib.md5()
        else:
            raise ValueError(f"Unsupported algorithm: {algorithm}")

        with open(file_path, 'rb') as f:
            # Read in chunks to handle large files
            for chunk in iter(lambda: f.read(4096), b''):
                hasher.update(chunk)

        checksum = hasher.hexdigest()
        logger.debug(f"Checksum ({algorithm}): {checksum}")
        return checksum

    @staticmethod
    def verify_checksum(file_path: str, expected_checksum: str, algorithm: str = 'sha256') -> bool:
        """Verify file checksum"""
        actual_checksum = ChecksumService.calculate_checksum(file_path, algorithm)
        is_valid = actual_checksum == expected_checksum

        if is_valid:
            logger.info(f"Checksum verified: {file_path}")
        else:
            logger.error(f"Checksum mismatch: expected {expected_checksum}, got {actual_checksum}")

        return is_valid
