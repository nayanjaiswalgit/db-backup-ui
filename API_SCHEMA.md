# API Schema Documentation

Complete API reference for the DB Backup Platform.

## Base URL
```
http://localhost:8000/api/v1
```

## Authentication

All API endpoints (except `/auth/login` and `/auth/register`) require authentication.

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### Using Authentication
Include the access token in the Authorization header:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Servers

### List Servers
```http
GET /servers
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Production DB Server",
    "type": "docker",
    "environment": "production",
    "host": "192.168.1.100",
    "port": 22,
    "health_status": "healthy",
    "last_heartbeat": "2024-01-15T10:30:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Create Server
```http
POST /servers
Content-Type: application/json

{
  "name": "Production DB Server",
  "description": "Main production database",
  "type": "docker",
  "environment": "production",
  "host": "192.168.1.100",
  "port": 22,
  "credentials": {
    "username": "admin",
    "password": "secure-password",
    "ssh_key": "optional-ssh-private-key"
  },
  "tags": {
    "region": "us-east-1",
    "team": "platform"
  }
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Production DB Server",
  "type": "docker",
  "environment": "production",
  "health_status": "unknown",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Get Server
```http
GET /servers/{id}
```

### Update Server
```http
PUT /servers/{id}
Content-Type: application/json

{
  "name": "Updated Server Name",
  "tags": {
    "region": "us-west-2"
  }
}
```

### Delete Server
```http
DELETE /servers/{id}
```

### Test Server Connection
```http
POST /servers/{id}/test-connection
```

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "latency_ms": 45
}
```

### List Databases on Server
```http
GET /servers/{id}/databases
```

**Response:**
```json
{
  "databases": [
    {
      "name": "myapp_production",
      "size_mb": 2048,
      "type": "postgresql"
    },
    {
      "name": "analytics",
      "size_mb": 1024,
      "type": "postgresql"
    }
  ]
}
```

## Backups

### List Backups
```http
GET /backups?server_id=1&db_type=postgresql&limit=50
```

**Query Parameters:**
- `server_id` (optional): Filter by server
- `db_type` (optional): Filter by database type
- `status` (optional): Filter by status
- `limit` (optional): Limit results (default: 100)
- `offset` (optional): Offset for pagination

**Response:**
```json
{
  "total": 248,
  "items": [
    {
      "id": 123,
      "server_id": 1,
      "database_name": "myapp_production",
      "db_type": "postgresql",
      "backup_type": "full",
      "status": "completed",
      "size_bytes": 2147483648,
      "storage_path": "s3://backups/2024/01/15/backup_123.sql.gz.enc",
      "is_encrypted": true,
      "is_compressed": true,
      "compression_type": "gzip",
      "checksum": "sha256:abc123...",
      "started_at": "2024-01-15T02:00:00Z",
      "completed_at": "2024-01-15T02:15:30Z",
      "duration_seconds": 930,
      "created_at": "2024-01-15T02:00:00Z"
    }
  ]
}
```

### Create Backup
```http
POST /backups
Content-Type: application/json

{
  "server_id": 1,
  "database_name": "myapp_production",
  "db_type": "postgresql",
  "backup_type": "full",
  "compress": true,
  "compression_type": "gzip",
  "encrypt": true
}
```

**Response:**
```json
{
  "id": 124,
  "status": "pending",
  "message": "Backup job queued",
  "task_id": "celery-task-uuid"
}
```

### Get Backup
```http
GET /backups/{id}
```

### Download Backup
```http
POST /backups/{id}/download
```

**Response:**
```json
{
  "download_url": "https://presigned-s3-url...",
  "expires_at": "2024-01-15T15:00:00Z"
}
```

### Restore Backup
```http
POST /backups/{id}/restore
Content-Type: application/json

{
  "target_server_id": 2,
  "target_database": "myapp_staging",
  "mask_sensitive_data": true,
  "masking_rules": {
    "email": "hash",
    "phone": "randomize",
    "ssn": "null"
  }
}
```

**Response:**
```json
{
  "task_id": "celery-task-uuid",
  "status": "pending",
  "message": "Restore job queued"
}
```

### Delete Backup
```http
DELETE /backups/{id}
```

## Schedules

### List Schedules
```http
GET /schedules
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Daily Production Backup",
    "server_id": 1,
    "database_name": "myapp_production",
    "cron_expression": "0 2 * * *",
    "timezone": "UTC",
    "backup_type": "full",
    "enabled": true,
    "last_run": "2024-01-15T02:00:00Z",
    "next_run": "2024-01-16T02:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Create Schedule
```http
POST /schedules
Content-Type: application/json

{
  "name": "Daily Production Backup",
  "description": "Automated daily backup",
  "server_id": 1,
  "database_name": "myapp_production",
  "cron_expression": "0 2 * * *",
  "timezone": "UTC",
  "backup_type": "full",
  "retention_policy_id": 1,
  "enabled": true,
  "notify_on_success": false,
  "notify_on_failure": true
}
```

### Update Schedule
```http
PUT /schedules/{id}
Content-Type: application/json

{
  "enabled": false
}
```

### Delete Schedule
```http
DELETE /schedules/{id}
```

## Retention Policies

### List Retention Policies
```http
GET /retention-policies
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Standard Retention",
    "description": "Keep last 7 daily, 4 weekly, 12 monthly",
    "keep_last_n": null,
    "keep_days": null,
    "keep_daily": 7,
    "keep_weekly": 4,
    "keep_monthly": 12,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Create Retention Policy
```http
POST /retention-policies
Content-Type: application/json

{
  "name": "Long-term Retention",
  "description": "Keep backups for compliance",
  "keep_days": 2555,
  "keep_daily": 30,
  "keep_weekly": 52,
  "keep_monthly": 84
}
```

## Commands

### List Commands
```http
GET /commands
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Check Disk Space",
    "description": "Check available disk space",
    "command_template": "df -h",
    "type": "shell",
    "created_by": "admin",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Create Command
```http
POST /commands
Content-Type: application/json

{
  "name": "Restart Docker Container",
  "description": "Restart a specific container",
  "command_template": "docker restart {{container_name}}",
  "type": "docker",
  "tags": "docker,restart"
}
```

### Execute Command
```http
POST /commands/{id}/execute
Content-Type: application/json

{
  "server_id": 1,
  "variables": {
    "container_name": "myapp_web"
  }
}
```

**Response:**
```json
{
  "execution_id": 42,
  "status": "running",
  "task_id": "celery-task-uuid"
}
```

### Get Command Executions
```http
GET /commands/{id}/executions
```

**Response:**
```json
[
  {
    "id": 42,
    "command_id": 1,
    "server_id": 1,
    "command_text": "docker restart myapp_web",
    "status": "completed",
    "exit_code": 0,
    "stdout": "myapp_web\n",
    "stderr": "",
    "started_at": "2024-01-15T10:00:00Z",
    "completed_at": "2024-01-15T10:00:05Z",
    "duration_seconds": 5,
    "executed_by": "admin"
  }
]
```

## Notifications

### List Notification Channels
```http
GET /notifications/channels
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Slack Alerts",
    "type": "slack",
    "is_enabled": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Create Notification Channel
```http
POST /notifications/channels
Content-Type: application/json

{
  "name": "Slack Alerts",
  "type": "slack",
  "config": {
    "webhook_url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "channel": "#alerts"
  },
  "is_enabled": true
}
```

### Test Notification
```http
POST /notifications/test
Content-Type: application/json

{
  "channel_id": 1,
  "message": "Test notification"
}
```

## Audit Logs

### List Audit Logs
```http
GET /audit/logs?action=backup_create&limit=100
```

**Query Parameters:**
- `user_id` (optional): Filter by user
- `action` (optional): Filter by action type
- `resource_type` (optional): Filter by resource
- `start_date` (optional): Filter from date
- `end_date` (optional): Filter to date
- `limit` (optional): Limit results
- `offset` (optional): Offset for pagination

**Response:**
```json
{
  "total": 1542,
  "items": [
    {
      "id": 1234,
      "user_id": 1,
      "username": "admin",
      "action": "backup_create",
      "resource_type": "backup",
      "resource_id": 123,
      "details": {
        "database": "myapp_production",
        "backup_type": "full"
      },
      "ip_address": "192.168.1.50",
      "created_at": "2024-01-15T02:00:00Z"
    }
  ]
}
```

### Export Audit Logs
```http
GET /audit/export?format=csv&start_date=2024-01-01&end_date=2024-01-31
```

## Users (Admin Only)

### List Users
```http
GET /users
```

### Create User
```http
POST /users
Content-Type: application/json

{
  "username": "operator1",
  "email": "operator@example.com",
  "password": "secure-password",
  "full_name": "Operations User",
  "role": "operator"
}
```

### Update User
```http
PUT /users/{id}
Content-Type: application/json

{
  "role": "admin",
  "is_active": true
}
```

### Delete User
```http
DELETE /users/{id}
```

## WebSocket Events

Connect to WebSocket for real-time updates:
```
ws://localhost:8000/ws
```

### Event Types

**Backup Progress:**
```json
{
  "type": "backup_progress",
  "backup_id": 123,
  "progress": 45,
  "status": "in_progress"
}
```

**Server Health Update:**
```json
{
  "type": "server_health",
  "server_id": 1,
  "health_status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Notification:**
```json
{
  "type": "notification",
  "level": "error",
  "message": "Backup failed for myapp_production",
  "details": {
    "backup_id": 123,
    "error": "Connection timeout"
  }
}
```

## Error Responses

All error responses follow this format:

```json
{
  "detail": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

### Example Validation Error

```json
{
  "detail": [
    {
      "loc": ["body", "server_id"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```
