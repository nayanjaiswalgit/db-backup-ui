# Database Backup & Restore Platform - System Architecture

## Overview

Enterprise-grade platform for managing database backups and restores across multiple servers, environments, and database types with comprehensive monitoring, automation, and security features.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Load Balancer / Ingress                         │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                  │
┌───────▼────────┐                                ┌───────▼────────┐
│   Web UI       │                                │   API Gateway  │
│   (React +     │◄──────── WebSocket ───────────┤   (FastAPI)    │
│   Tailwind)    │                                │                │
└────────────────┘                                └───────┬────────┘
                                                          │
                    ┌─────────────────────────────────────┼─────────────────┐
                    │                                     │                 │
            ┌───────▼────────┐                  ┌─────────▼────────┐   ┌───▼────┐
            │  Auth Service  │                  │  Core Services   │   │ Redis  │
            │  (JWT + RBAC)  │                  │                  │   │ Cache  │
            └────────────────┘                  └─────────┬────────┘   └────────┘
                                                          │
                    ┌─────────────────────────────────────┼─────────────────────┐
                    │                                     │                     │
            ┌───────▼────────┐              ┌─────────────▼──────────┐  ┌───────▼────────┐
            │ Server Manager │              │  Backup Orchestrator   │  │  Task Queue    │
            │  - Registration│              │  - Multi-DB Engines    │  │  (Celery +     │
            │  - Health Check│              │  - Encryption          │  │   Redis)       │
            │  - Heartbeat   │              │  - Compression         │  └────────────────┘
            └────────────────┘              │  - Scheduling          │
                                            │  - Retention           │
                                            └─────────┬──────────────┘
                                                      │
                    ┌─────────────────────────────────┼──────────────────────────┐
                    │                                 │                          │
        ┌───────────▼──────────┐        ┌─────────────▼────────────┐  ┌──────────▼────────┐
        │  Storage Manager     │        │  Notification Service    │  │  Audit Logger     │
        │  - Local Storage     │        │  - Slack                 │  │  - History        │
        │  - S3 Compatible     │        │  - Email (SMTP)          │  │  - Compliance     │
        │  - Retention Policy  │        │  - Webhooks              │  └───────────────────┘
        └──────────────────────┘        └──────────────────────────┘
                    │
        ┌───────────▼──────────┐
        │  PostgreSQL DB       │
        │  - Users/Roles       │
        │  - Servers           │
        │  - Backups Metadata  │
        │  - Schedules         │
        │  - Audit Logs        │
        └──────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         Remote Execution Layer                           │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │ SSH Executor │  │Docker Executor│  │ K8s Executor │  │ Agent-Based ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐        ┌─────────▼────────┐      ┌──────────▼─────────┐
│  Docker Hosts  │        │  K3s Clusters    │      │  Bare Metal Linux  │
│  - PostgreSQL  │        │  - PostgreSQL    │      │  - PostgreSQL      │
│  - MySQL       │        │  - MySQL         │      │  - MySQL           │
│  - MongoDB     │        │  - MongoDB       │      │  - MongoDB         │
│  - Redis       │        │  - Redis         │      │  - Redis           │
└────────────────┘        └──────────────────┘      └────────────────────┘
```

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15+ (main data store)
- **Cache**: Redis 7+ (caching, session, task queue)
- **Task Queue**: Celery + Redis
- **ORM**: SQLAlchemy 2.0
- **Migrations**: Alembic
- **Authentication**: JWT (python-jose)
- **Validation**: Pydantic V2
- **API Docs**: OpenAPI/Swagger (auto-generated)

### Frontend
- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS 3
- **State Management**: Zustand + React Query
- **Routing**: React Router v6
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts
- **WebSocket**: Socket.io-client
- **HTTP Client**: Axios

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Orchestration**: K3s / Kubernetes
- **Storage**: S3-compatible (MinIO, AWS S3, etc.)
- **Reverse Proxy**: Nginx
- **TLS**: Let's Encrypt / cert-manager

## Core Modules

### 1. Authentication & Authorization
- JWT-based authentication
- Role-Based Access Control (RBAC)
- User management with roles: Admin, Operator, Viewer
- API key management for automation
- Session management with Redis

### 2. Server Management
- Multi-server registration
- Credential encryption (Fernet)
- Connection type support: SSH, Docker API, K8s API
- Health check monitoring
- Heartbeat tracking
- Server grouping by environment

### 3. Database Engine Support
- **PostgreSQL**: pg_dump, pg_restore, pg_basebackup
- **MySQL**: mysqldump, mysql, xtrabackup
- **MongoDB**: mongodump, mongorestore
- **Redis**: SAVE, BGSAVE, RDB snapshots

### 4. Backup Orchestration
- Backup types: Full, Incremental, Differential
- Encryption: AES-256-GCM
- Compression: gzip, lz4, zstd
- Parallel backup execution
- Backup verification
- Metadata tracking

### 5. Storage Management
- Local filesystem storage
- S3-compatible object storage
- Multi-tier storage (hot/cold)
- Retention policies
- Automatic cleanup
- Storage quota management

### 6. Scheduling & Retention
- Cron-based scheduling
- Flexible retention policies:
  - Keep last N backups
  - Keep backups for N days
  - Keep daily/weekly/monthly
- Automated cleanup
- Schedule conflict detection

### 7. Command Automation
- Shell command templates
- Docker command execution
- Kubernetes command execution
- Variable substitution
- Command history
- Output streaming

### 8. Notifications
- Multi-channel support:
  - Slack webhooks
  - Email (SMTP)
  - Custom webhooks
- Event-based triggers:
  - Backup success/failure
  - Server health changes
  - Storage warnings
- Notification templates

### 9. Audit & Compliance
- Complete audit trail
- User action logging
- Change history
- Compliance reports
- Retention of audit logs
- Export capabilities

### 10. Monitoring & Logs
- Real-time log streaming (WebSocket)
- Backup job monitoring
- Server health metrics
- Storage utilization
- Performance metrics
- Alerting

## Data Flow

### Backup Creation Flow
```
1. User/Schedule → API Request
2. API → Validate & Create Job
3. Job → Celery Task Queue
4. Worker → Connect to Target Server
5. Worker → Execute Backup Command
6. Worker → Stream Data to Storage
7. Worker → Encrypt & Compress
8. Worker → Upload to S3
9. Worker → Update Metadata
10. Worker → Send Notifications
11. Worker → Log Audit Entry
```

### Restore Flow
```
1. User → Select Backup & Target
2. API → Validate Permissions
3. API → Optional Data Masking
4. Job → Download from Storage
5. Worker → Decrypt & Decompress
6. Worker → Connect to Target
7. Worker → Execute Restore
8. Worker → Verify Integrity
9. Worker → Send Notifications
10. Worker → Log Audit Entry
```

## Security Architecture

### Data Security
- Secrets encrypted at rest (Fernet encryption)
- TLS for all external communication
- Backup encryption (AES-256-GCM)
- Secure credential storage
- Key rotation support

### Access Control
- Role-based permissions
- API key authentication
- IP whitelisting (optional)
- Rate limiting
- Session timeout

### Network Security
- HTTPS only
- CORS configuration
- Security headers
- Input validation
- SQL injection prevention

## Scalability Design

### Horizontal Scaling
- Stateless API servers
- Multiple Celery workers
- Load balancer ready
- Session store in Redis
- Database connection pooling

### Performance Optimization
- Redis caching layer
- Database indexing
- Async operations
- Stream processing
- Query optimization

### High Availability
- Multi-instance deployment
- Database replication
- Redis Sentinel/Cluster
- Health checks
- Auto-restart policies

## Database Schema (Core Tables)

```sql
-- Users & Authentication
users (id, username, email, password_hash, role, created_at, updated_at)
api_keys (id, user_id, key_hash, name, expires_at, created_at)

-- Server Management
servers (id, name, type, environment, host, port, credentials_encrypted, health_status, last_heartbeat, created_at)
server_groups (id, name, description, created_at)
server_group_members (server_id, group_id)

-- Backup Management
backups (id, server_id, database_name, db_type, backup_type, status, size, storage_path, encrypted, compressed, created_at)
backup_metadata (backup_id, key, value)

-- Scheduling
schedules (id, name, server_id, database_name, cron_expression, backup_type, retention_policy, enabled, created_at)
retention_policies (id, name, keep_last_n, keep_days, keep_daily, keep_weekly, keep_monthly)

-- Command Automation
commands (id, name, command_template, type, description, created_by, created_at)
command_executions (id, command_id, server_id, status, output, executed_by, executed_at)

-- Notifications
notification_channels (id, type, config_encrypted, enabled, created_at)
notifications (id, channel_id, event_type, message, sent_at, status)

-- Audit
audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
```

## API Structure

### REST API Endpoints

```
/api/v1
├── /auth
│   ├── POST   /login
│   ├── POST   /logout
│   ├── POST   /refresh
│   └── GET    /me
├── /users
│   ├── GET    /
│   ├── POST   /
│   ├── GET    /:id
│   ├── PUT    /:id
│   └── DELETE /:id
├── /servers
│   ├── GET    /
│   ├── POST   /
│   ├── GET    /:id
│   ├── PUT    /:id
│   ├── DELETE /:id
│   ├── POST   /:id/test-connection
│   └── GET    /:id/databases
├── /backups
│   ├── GET    /
│   ├── POST   /
│   ├── GET    /:id
│   ├── DELETE /:id
│   ├── POST   /:id/restore
│   └── POST   /:id/download
├── /schedules
│   ├── GET    /
│   ├── POST   /
│   ├── GET    /:id
│   ├── PUT    /:id
│   └── DELETE /:id
├── /commands
│   ├── GET    /
│   ├── POST   /
│   ├── POST   /:id/execute
│   └── GET    /:id/executions
├── /notifications
│   ├── GET    /channels
│   ├── POST   /channels
│   └── POST   /test
└── /audit
    ├── GET    /logs
    └── GET    /export
```

## Deployment Architecture

### Docker Compose (Development/Small Scale)
```yaml
services:
  - api (FastAPI)
  - frontend (Nginx + React)
  - postgres (PostgreSQL)
  - redis (Redis)
  - worker (Celery)
  - beat (Celery Beat)
  - minio (S3 Storage)
```

### Kubernetes/K3s (Production)
```yaml
Deployments:
  - api-deployment (3 replicas)
  - frontend-deployment (2 replicas)
  - worker-deployment (5 replicas)

StatefulSets:
  - postgres-statefulset
  - redis-statefulset

Jobs:
  - db-migration-job
  - celery-beat-deployment
```

## Configuration Management

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `SECRET_KEY`: JWT signing key
- `ENCRYPTION_KEY`: Fernet encryption key
- `S3_ENDPOINT`: S3-compatible endpoint
- `S3_ACCESS_KEY`: S3 access key
- `S3_SECRET_KEY`: S3 secret key
- `SMTP_*`: Email configuration
- `SLACK_WEBHOOK_URL`: Slack notifications

## Monitoring & Observability

### Metrics
- Backup success/failure rates
- Backup duration trends
- Storage utilization
- Server health status
- API response times
- Worker queue length

### Logging
- Structured JSON logging
- Log levels: DEBUG, INFO, WARNING, ERROR
- Centralized log aggregation ready
- Request/response logging
- Error tracking

## Disaster Recovery

### Backup Strategy
- Platform database backed up daily
- Configuration exported regularly
- Secrets backed up securely
- Multi-region storage replication

### Recovery Procedures
- Database restore procedures
- Configuration restoration
- Secret recovery process
- Rollback capabilities
