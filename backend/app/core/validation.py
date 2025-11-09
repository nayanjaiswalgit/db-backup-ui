"""
Input validation and sanitization utilities.
Prevents injection attacks and ensures data integrity.
"""
import re
from pathlib import Path
from typing import Optional


class ValidationError(Exception):
    """Raised when validation fails"""
    pass


def validate_hostname(hostname: str) -> str:
    """
    Validate hostname/IP address.
    Prevents command injection in SSH/network operations.
    """
    # Allow: alphanumeric, dots, hyphens, and underscores
    # Length: 1-253 characters
    if not hostname or len(hostname) > 253:
        raise ValidationError("Invalid hostname length")

    # Pattern for valid hostname/IP
    pattern = r'^[a-zA-Z0-9]([a-zA-Z0-9\-\.]{0,251}[a-zA-Z0-9])?$'
    if not re.match(pattern, hostname):
        raise ValidationError("Invalid hostname format")

    # Prevent command injection characters
    dangerous_chars = [';', '|', '&', '$', '`', '\n', '\r', '>', '<']
    if any(char in hostname for char in dangerous_chars):
        raise ValidationError("Hostname contains invalid characters")

    return hostname


def validate_port(port: int) -> int:
    """Validate port number"""
    if not isinstance(port, int):
        raise ValidationError("Port must be an integer")

    if port < 1 or port > 65535:
        raise ValidationError("Port must be between 1 and 65535")

    return port


def validate_database_name(name: str) -> str:
    """
    Validate database name.
    Prevents SQL injection and command injection.
    """
    if not name or len(name) > 63:
        raise ValidationError("Invalid database name length")

    # Allow only alphanumeric, underscore, and hyphen
    pattern = r'^[a-zA-Z0-9_\-]+$'
    if not re.match(pattern, name):
        raise ValidationError("Database name can only contain alphanumeric, underscore, and hyphen")

    # Prevent SQL injection keywords as database names
    sql_keywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'SELECT', 'EXEC', 'EXECUTE']
    if name.upper() in sql_keywords:
        raise ValidationError("Database name cannot be a SQL keyword")

    return name


def validate_username(username: str) -> str:
    """Validate username for SSH/database connections"""
    if not username or len(username) > 32:
        raise ValidationError("Invalid username length")

    # Allow alphanumeric, underscore, and hyphen
    pattern = r'^[a-zA-Z0-9_\-]+$'
    if not re.match(pattern, username):
        raise ValidationError("Username can only contain alphanumeric, underscore, and hyphen")

    return username


def validate_file_path(file_path: str, allowed_base: Optional[str] = None) -> str:
    """
    Validate file path and prevent directory traversal attacks.

    Args:
        file_path: The file path to validate
        allowed_base: Base directory that path must be within (optional)

    Returns:
        Normalized absolute path

    Raises:
        ValidationError: If path is invalid or attempts traversal
    """
    if not file_path:
        raise ValidationError("File path cannot be empty")

    # Prevent null bytes
    if '\0' in file_path:
        raise ValidationError("File path contains null bytes")

    # Resolve to absolute path and normalize
    try:
        path = Path(file_path).resolve()
    except (ValueError, OSError) as e:
        raise ValidationError(f"Invalid file path: {e}")

    # Check for directory traversal attempts
    if '..' in Path(file_path).parts:
        raise ValidationError("Directory traversal not allowed")

    # If base directory specified, ensure path is within it
    if allowed_base:
        try:
            base = Path(allowed_base).resolve()
            # Check if path is relative to base
            path.relative_to(base)
        except ValueError:
            raise ValidationError(f"Path must be within {allowed_base}")

    return str(path)


def validate_container_name(name: str) -> str:
    """Validate Docker container name"""
    if not name or len(name) > 255:
        raise ValidationError("Invalid container name length")

    # Docker naming: alphanumeric, underscore, period, hyphen
    pattern = r'^[a-zA-Z0-9][a-zA-Z0-9_\.\-]*$'
    if not re.match(pattern, name):
        raise ValidationError("Invalid container name format")

    return name


def validate_namespace(namespace: str) -> str:
    """Validate Kubernetes namespace"""
    if not namespace or len(namespace) > 63:
        raise ValidationError("Invalid namespace length")

    # K8s naming: lowercase alphanumeric and hyphen
    pattern = r'^[a-z0-9]([\-a-z0-9]*[a-z0-9])?$'
    if not re.match(pattern, namespace):
        raise ValidationError("Invalid namespace format (must be lowercase alphanumeric with hyphens)")

    return namespace


def sanitize_shell_arg(arg: str) -> str:
    """
    Sanitize argument for shell command execution.
    Use with caution - prefer parameterized commands when possible.
    """
    if not arg:
        return ""

    # Remove dangerous characters
    dangerous_chars = [';', '|', '&', '$', '`', '\n', '\r', '>', '<', '(', ')', '{', '}']
    sanitized = arg
    for char in dangerous_chars:
        sanitized = sanitized.replace(char, '')

    # Escape single quotes
    sanitized = sanitized.replace("'", "'\\''")

    return sanitized


def validate_cron_expression(expression: str) -> str:
    """Basic validation for cron expressions"""
    if not expression or len(expression) > 100:
        raise ValidationError("Invalid cron expression length")

    parts = expression.split()
    if len(parts) not in [5, 6]:
        raise ValidationError("Cron expression must have 5 or 6 fields")

    # Basic pattern check (not comprehensive but catches obvious issues)
    allowed_chars = set('0123456789*,-/ ')
    if not all(c in allowed_chars for c in expression):
        raise ValidationError("Cron expression contains invalid characters")

    return expression


def validate_email(email: str) -> str:
    """Basic email validation"""
    if not email or len(email) > 254:
        raise ValidationError("Invalid email length")

    # Simple email pattern
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        raise ValidationError("Invalid email format")

    return email.lower()


def validate_password_strength(password: str) -> str:
    """
    Validate password meets minimum security requirements.

    Requirements:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    if not password:
        raise ValidationError("Password cannot be empty")

    if len(password) < 8:
        raise ValidationError("Password must be at least 8 characters long")

    if len(password) > 128:
        raise ValidationError("Password too long (max 128 characters)")

    if not re.search(r'[A-Z]', password):
        raise ValidationError("Password must contain at least one uppercase letter")

    if not re.search(r'[a-z]', password):
        raise ValidationError("Password must contain at least one lowercase letter")

    if not re.search(r'\d', password):
        raise ValidationError("Password must contain at least one digit")

    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        raise ValidationError("Password must contain at least one special character")

    # Check for common passwords (basic check)
    common_passwords = ['password', '12345678', 'qwerty', 'admin123']
    if password.lower() in common_passwords:
        raise ValidationError("Password is too common")

    return password
