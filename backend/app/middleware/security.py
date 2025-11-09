"""
Security middleware for FastAPI application.
Implements security headers, rate limiting, and request validation.
"""
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from collections import defaultdict
from datetime import datetime, timedelta
import time
from typing import Dict, Tuple


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all responses.
    Helps prevent XSS, clickjacking, and other common attacks.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Enable XSS protection
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Content Security Policy (restrictive for API)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'"
        )

        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions Policy (formerly Feature Policy)
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        # HSTS (Strict-Transport-Security) - only in production with HTTPS
        # Uncomment when using HTTPS in production
        # response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple in-memory rate limiting middleware.
    For production, consider using Redis-based rate limiting.
    """

    def __init__(
        self,
        app: ASGIApp,
        requests_per_minute: int = 60,
        burst: int = 10
    ):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.burst = burst
        # Store: {ip: [(timestamp, count)]}
        self.rate_limit_store: Dict[str, list] = defaultdict(list)
        self.cleanup_interval = 60  # Cleanup old entries every 60 seconds
        self.last_cleanup = time.time()

    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address from request"""
        # Check X-Forwarded-For header (for proxies)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()

        # Check X-Real-IP header
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # Fall back to client host
        return request.client.host if request.client else "unknown"

    def _cleanup_old_entries(self):
        """Remove entries older than 1 minute"""
        if time.time() - self.last_cleanup < self.cleanup_interval:
            return

        cutoff = datetime.now() - timedelta(minutes=1)
        for ip in list(self.rate_limit_store.keys()):
            self.rate_limit_store[ip] = [
                (ts, count) for ts, count in self.rate_limit_store[ip]
                if ts > cutoff
            ]
            if not self.rate_limit_store[ip]:
                del self.rate_limit_store[ip]

        self.last_cleanup = time.time()

    def _is_rate_limited(self, ip: str) -> Tuple[bool, int, int]:
        """
        Check if IP is rate limited.
        Returns: (is_limited, current_count, limit)
        """
        self._cleanup_old_entries()

        now = datetime.now()
        minute_ago = now - timedelta(minutes=1)

        # Get requests in last minute
        recent_requests = [
            count for ts, count in self.rate_limit_store[ip]
            if ts > minute_ago
        ]

        current_count = sum(recent_requests)

        # Check if over limit
        if current_count >= self.requests_per_minute:
            return True, current_count, self.requests_per_minute

        return False, current_count, self.requests_per_minute

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path == "/health":
            return await call_next(request)

        ip = self._get_client_ip(request)

        # Check rate limit
        is_limited, current_count, limit = self._is_rate_limited(ip)

        if is_limited:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": 60
                },
                headers={
                    "Retry-After": "60",
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + 60)
                }
            )

        # Record this request
        self.rate_limit_store[ip].append((datetime.now(), 1))

        # Process request
        response = await call_next(request)

        # Add rate limit headers to response
        remaining = max(0, limit - current_count - 1)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)

        return response


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Stricter rate limiting specifically for authentication endpoints.
    Prevents brute force attacks.
    """

    def __init__(
        self,
        app: ASGIApp,
        max_attempts: int = 5,
        window_minutes: int = 15
    ):
        super().__init__(app)
        self.max_attempts = max_attempts
        self.window_minutes = window_minutes
        # Store: {ip: [(timestamp, path)]}
        self.attempt_store: Dict[str, list] = defaultdict(list)

    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address from request"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _is_auth_endpoint(self, path: str) -> bool:
        """Check if path is an authentication endpoint"""
        auth_paths = ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/reset-password"]
        return any(path.startswith(p) for p in auth_paths)

    async def dispatch(self, request: Request, call_next):
        # Only apply to auth endpoints
        if not self._is_auth_endpoint(request.url.path):
            return await call_next(request)

        ip = self._get_client_ip(request)
        now = datetime.now()
        window_start = now - timedelta(minutes=self.window_minutes)

        # Clean old attempts
        self.attempt_store[ip] = [
            (ts, path) for ts, path in self.attempt_store[ip]
            if ts > window_start
        ]

        # Count recent auth attempts
        recent_attempts = len(self.attempt_store[ip])

        if recent_attempts >= self.max_attempts:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": f"Too many authentication attempts. Please try again in {self.window_minutes} minutes.",
                    "retry_after": self.window_minutes * 60
                },
                headers={"Retry-After": str(self.window_minutes * 60)}
            )

        # Record this attempt
        self.attempt_store[ip].append((now, request.url.path))

        # Process request
        response = await call_next(request)

        # If auth was successful (200 or 201), clear the counter
        if response.status_code in [200, 201]:
            self.attempt_store[ip] = []

        return response
