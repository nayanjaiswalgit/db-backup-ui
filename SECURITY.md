# Security Guide

This document outlines the security measures implemented in the DB Backup Platform and best practices for secure deployment.

## Security Features Implemented

### 1. Input Validation & Sanitization

**Location**: `backend/app/core/validation.py`

All user inputs are validated before processing:

- **Hostname validation**: Prevents command injection in SSH/network operations
- **Port validation**: Ensures ports are in valid range (1-65535)
- **Database name validation**: Prevents SQL injection
- **Username validation**: Alphanumeric + underscore/hyphen only
- **File path validation**: Prevents directory traversal attacks
- **Container/namespace validation**: Follows Docker/Kubernetes naming conventions
- **Email validation**: Basic format checking
- **Password strength validation**: Enforces strong password requirements

#### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character
- Not a common password

### 2. Command Injection Prevention

**Location**: `backend/app/services/executor.py`

All command execution is protected by:

- **Whitelist-based command validation**: Only allowed commands can execute
- **Dangerous pattern detection**: Blocks `;`, `|`, `&`, `$()`, backticks, etc.
- **Safe pipe handling**: Only allows piping to compression tools
- **Command logging**: All commands are logged for audit

#### Allowed Commands
```python
# Database tools
pg_dump, pg_restore, psql
mysqldump, mysql
mongodump, mongorestore
redis-cli

# Compression tools
tar, gzip, gunzip, zstd, lz4

# Basic utilities
cat, ls, mkdir, rm, cp, mv, du, df
```

### 3. Security Headers

**Location**: `backend/app/middleware/security.py`

All HTTP responses include security headers:

```http
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; ...
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), ...
```

For HTTPS deployments, also enable:
```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 4. Rate Limiting

**Location**: `backend/app/middleware/security.py`

Two-tier rate limiting system:

#### General API Rate Limiting
- **Limit**: 60 requests per minute per IP
- **Burst**: 10 requests
- **Response**: HTTP 429 with `Retry-After` header

#### Authentication Rate Limiting
- **Limit**: 5 failed attempts per 15 minutes
- **Endpoints**: `/api/v1/auth/login`, `/api/v1/auth/register`
- **Auto-reset**: On successful authentication
- **Purpose**: Prevents brute force attacks

### 5. Encryption

**Sensitive Data Encryption**: `backend/app/core/security.py`

- **Algorithm**: AES-256-GCM (Fernet)
- **Usage**: Encrypts database credentials, API keys, SSH keys
- **Key Storage**: Environment variable (never hardcoded)

**Backup Encryption**: `backend/app/services/encryption.py`

- **Algorithm**: AES-256-GCM
- **Compression**: gzip, lz4, or zstd before encryption
- **Checksums**: SHA-256 for integrity verification

### 6. Authentication & Authorization

- **JWT Tokens**: HS256 algorithm, 30-minute expiration
- **Refresh Tokens**: 7-day expiration
- **Password Hashing**: bcrypt with automatic salt
- **RBAC**: Role-based access control (Admin, Operator, Viewer)

### 7. Environment Variable Validation

**Location**: `backend/app/core/config.py`

Critical configuration is validated on startup:

```python
# SECRET_KEY validation
- Minimum 32 characters
- Cannot be common/default values
- Fails fast if weak

# ENCRYPTION_KEY validation
- Must be valid Fernet key (44 characters base64)
- Fails fast if invalid format
```

## Security Best Practices

### For Development

1. **Generate Strong Keys**
   ```bash
   # Generate SECRET_KEY
   python -c "import secrets; print(secrets.token_urlsafe(32))"

   # Generate ENCRYPTION_KEY
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

2. **Never Commit Secrets**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for templates
   - Never hardcode secrets in code

3. **Use HTTPS in Production**
   - Enable SSL/TLS for all connections
   - Set `S3_USE_SSL=true`
   - Uncomment HSTS header in production

4. **Restrict CORS Origins**
   ```env
   # Development
   CORS_ORIGINS=http://localhost:3000

   # Production
   CORS_ORIGINS=https://yourdomain.com
   ```

### For Production

1. **Use a Secrets Manager**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Google Cloud Secret Manager

2. **Enable All Security Features**
   ```env
   DEBUG=false
   ENVIRONMENT=production
   S3_USE_SSL=true
   ```

3. **Set Up Monitoring**
   - Enable audit logging
   - Monitor failed authentication attempts
   - Set up alerts for suspicious activity
   - Review logs regularly

4. **Network Security**
   - Use private networks for database connections
   - Enable firewall rules
   - Use VPN for remote access
   - Isolate backup storage

5. **Regular Security Audits**
   - Update dependencies regularly
   - Run security scanners (bandit, safety)
   - Perform penetration testing
   - Review access logs

6. **Backup Security**
   - Encrypt all backups
   - Use separate credentials for backup storage
   - Implement retention policies
   - Test restore procedures regularly

### SSH/Database Credentials

1. **Use SSH Keys (Not Passwords)**
   - Generate separate keys for each server
   - Use passphrase-protected keys
   - Rotate keys periodically

2. **Database User Permissions**
   - Create dedicated backup users
   - Grant minimum required permissions
   - Use read-only replicas when possible

3. **Credential Rotation**
   - Rotate credentials every 90 days
   - Update encrypted credentials in database
   - Invalidate old credentials

## Security Checklist

Before deploying to production:

- [ ] Changed SECRET_KEY to a strong random value
- [ ] Changed ENCRYPTION_KEY to a valid Fernet key
- [ ] Set DEBUG=false
- [ ] Configured CORS_ORIGINS to production domain only
- [ ] Enabled HTTPS/SSL for all connections
- [ ] Set up proper firewall rules
- [ ] Configured secure database connections
- [ ] Enabled audit logging
- [ ] Set up monitoring and alerting
- [ ] Configured backup encryption
- [ ] Tested disaster recovery procedures
- [ ] Reviewed and limited user permissions
- [ ] Set up secrets manager
- [ ] Configured rate limiting appropriately
- [ ] Enabled security headers
- [ ] Set up regular security audits

## Vulnerability Reporting

If you discover a security vulnerability, please:

1. **Do NOT** create a public issue
2. Email security contact with details
3. Include steps to reproduce
4. Allow time for fix before disclosure

## Security Updates

- Review this document quarterly
- Update dependencies monthly
- Audit access logs weekly
- Rotate credentials every 90 days

## Compliance

This platform implements security controls that help meet:

- SOC 2 Type II requirements
- GDPR data protection standards
- HIPAA security requirements (with proper configuration)
- PCI DSS requirements for data encryption

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [Python Security Best Practices](https://python.readthedocs.io/en/stable/library/security_warnings.html)

---

**Last Updated**: 2025-11-09
**Next Review**: 2026-02-09
