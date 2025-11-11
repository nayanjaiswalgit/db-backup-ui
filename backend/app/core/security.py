"""
Security utilities for authentication and encryption
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from cryptography.fernet import Fernet

from app.core.config import settings

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Fernet encryption for sensitive data
fernet = Fernet(settings.ENCRYPTION_KEY.encode())


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def encrypt_data(data: str) -> str:
    """Encrypt sensitive data using Fernet"""
    return fernet.encrypt(data.encode()).decode()


def decrypt_data(encrypted_data: str) -> str:
    """Decrypt sensitive data using Fernet"""
    return fernet.decrypt(encrypted_data.encode()).decode()


def encrypt_dict(data: Dict[str, Any]) -> Dict[str, str]:
    """Encrypt dictionary values"""
    import json
    json_str = json.dumps(data)
    return {"encrypted": encrypt_data(json_str)}


def decrypt_dict(encrypted: Dict[str, str]) -> Dict[str, Any]:
    """Decrypt dictionary values"""
    import json
    json_str = decrypt_data(encrypted["encrypted"])
    return json.loads(json_str)
