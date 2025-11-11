# Database Backup & Restore Platform

Enterprise-grade platform for managing database backups and restores across multiple servers, environments, and database types with comprehensive monitoring, automation, and security features.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Docker%20%7C%20K3s%20%7C%20Bare--metal-green.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![React](https://img.shields.io/badge/react-18-blue.svg)

## Features

### Core Capabilities
- **Multi-Database Support**: PostgreSQL, MySQL, MongoDB, Redis
- **Multi-Environment**: Docker, docker-compose, K3s/Kubernetes, bare-metal Linux
- **Server Management**: Register multiple servers, secure credential storage, health monitoring
- **Backup Types**: Full, incremental, and differential backups
- **Encryption & Compression**: AES-256-GCM encryption, gzip/lz4/zstd compression
- **S3-Compatible Storage**: Local filesystem or S3-compatible object storage (MinIO, AWS S3)
- **Scheduling**: Cron-based backup scheduling with flexible retention policies
- **Cross-Environment Restore**: Restore production backups to staging with optional data masking
- **Command Automation**: Save and execute shell/Docker/K8s commands on remote machines
- **Real-Time Monitoring**: Live logs, heartbeat monitoring, health metrics
- **Notifications**: Slack, Email (SMTP), custom webhooks
- **Audit Trail**: Complete audit logging for compliance
- **RBAC**: Role-based access control (Admin, Operator, Viewer)

### Technical Highlights
- **Backend**: FastAPI (Python 3.11+) with async/await
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Database**: PostgreSQL 15+ with SQLAlchemy ORM
- **Cache**: Redis 7+ for caching and task queue
- **Task Queue**: Celery for async background jobs
- **API Documentation**: Auto-generated OpenAPI/Swagger docs
- **Containerization**: Docker & Docker Compose
- **Orchestration**: Kubernetes/K3s ready with Helm charts

## Quick Start

### Prerequisites
- Docker & Docker Compose
- OR Kubernetes/K3s cluster
- OR Python 3.11+ and Node.js 20+

### Option 1: Docker Compose (Recommended for Development)

```bash
# Clone the repository
git clone https://github.com/nayanjaiswalgit/db-backup-ui.git
cd db-backup-ui

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
```

Access the application:
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/api/v1/docs
- **MinIO Console**: http://localhost:9001

Default credentials:
- **Username**: admin
- **Password**: admin123

### Option 2: Kubernetes/K3s Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -k k8s/

# Check deployment status
kubectl get pods -n db-backup-platform

# Get service endpoints
kubectl get svc -n db-backup-platform

# Access via port-forward
kubectl port-forward -n db-backup-platform svc/frontend 3000:80
```

### Option 3: Local Development

#### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Run database migrations
alembic upgrade head

# Start the backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# In another terminal, start Celery worker
celery -A app.celery.celery_app worker --loglevel=info

# In another terminal, start Celery beat
celery -A app.celery.celery_app beat --loglevel=info
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## Architecture

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed system architecture, data flow, and design decisions.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React UI  │────▶│  FastAPI    │────▶│ PostgreSQL  │
│  (Frontend) │     │  (Backend)  │     │  (Database) │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ├────────┐
                           ▼        ▼
                    ┌─────────┐ ┌──────────┐
                    │  Redis  │ │  MinIO   │
                    │ (Cache) │ │ (S3 API) │
                    └─────────┘ └──────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Celery    │
                    │  (Workers)  │
                    └─────────────┘
```

## Configuration

### Environment Variables

Key environment variables (see `backend/.env.example` for full list):

```bash
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/dbbackup

# Redis
REDIS_URL=redis://localhost:6379/0

# Security
SECRET_KEY=your-super-secret-key-change-in-production
ENCRYPTION_KEY=your-fernet-encryption-key

# S3 Storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=db-backups

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Generating Encryption Key

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Usage Guide

### 1. Server Management

**Add a server:**

```bash
curl -X POST http://localhost:8000/api/v1/servers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production DB Server",
    "type": "docker",
    "environment": "production",
    "host": "192.168.1.100",
    "port": 22,
    "credentials": {
      "username": "admin",
      "password": "secure-password"
    }
  }'
```

**Test connection:**

```bash
curl -X POST http://localhost:8000/api/v1/servers/1/test-connection \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Create Backup

```bash
curl -X POST http://localhost:8000/api/v1/backups \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "server_id": 1,
    "database_name": "myapp_production",
    "db_type": "postgresql",
    "backup_type": "full",
    "compress": true,
    "encrypt": true
  }'
```

### 3. Schedule Automatic Backups

```bash
curl -X POST http://localhost:8000/api/v1/schedules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Production Backup",
    "server_id": 1,
    "database_name": "myapp_production",
    "cron_expression": "0 2 * * *",
    "backup_type": "full",
    "retention_policy_id": 1,
    "enabled": true
  }'
```

### 4. Restore Backup

```bash
curl -X POST http://localhost:8000/api/v1/backups/123/restore \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_server_id": 2,
    "target_database": "myapp_staging",
    "mask_sensitive_data": true
  }'
```

### 5. Execute Remote Command

```bash
curl -X POST http://localhost:8000/api/v1/commands/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "command_template": "docker ps",
    "server_id": 1,
    "type": "docker"
  }'
```

## API Documentation

Once the backend is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/api/v1/docs
- **ReDoc**: http://localhost:8000/api/v1/redoc
- **OpenAPI Schema**: http://localhost:8000/api/v1/openapi.json

### Authentication

The platform uses JWT-based authentication. To access protected endpoints:

1. **Login** to get access token:
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

2. **Use the token** in subsequent requests:
```bash
curl -X GET http://localhost:8000/api/v1/servers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Main Endpoints

- **Auth**: `/api/v1/auth/*` - Authentication endpoints
- **Users**: `/api/v1/users/*` - User management
- **Servers**: `/api/v1/servers/*` - Server management
- **Backups**: `/api/v1/backups/*` - Backup operations
- **Schedules**: `/api/v1/schedules/*` - Schedule management
- **Commands**: `/api/v1/commands/*` - Command automation
- **Notifications**: `/api/v1/notifications/*` - Notification channels
- **Audit**: `/api/v1/audit/*` - Audit logs

## Database Schema

The platform uses PostgreSQL with the following main tables:

- `users` - User accounts and authentication
- `api_keys` - API key management
- `servers` - Registered servers
- `server_groups` - Server grouping
- `backups` - Backup metadata
- `backup_metadata` - Extended backup information
- `schedules` - Backup schedules
- `retention_policies` - Retention policy definitions
- `commands` - Command templates
- `command_executions` - Command execution history
- `notification_channels` - Notification configurations
- `notifications` - Notification log
- `audit_logs` - Audit trail

## Security Best Practices

1. **Change default credentials** immediately after deployment
2. **Use strong SECRET_KEY** and **ENCRYPTION_KEY**
3. **Enable HTTPS/TLS** in production with valid certificates
4. **Restrict API access** using firewall rules or VPN
5. **Rotate credentials** regularly
6. **Enable audit logging** for compliance
7. **Use RBAC** to limit user permissions
8. **Backup encryption** should always be enabled
9. **Secure S3 storage** with proper IAM policies
10. **Keep dependencies updated** regularly

## Monitoring & Logging

### Health Checks

- **Backend**: http://localhost:8000/health
- **Frontend**: http://localhost:3000/health

### Metrics

The platform exposes metrics for monitoring:

- Backup success/failure rates
- Server health status
- Storage utilization
- API response times
- Worker queue length

### Logging

Logs are structured in JSON format for easy parsing:

```bash
# View backend logs
docker-compose logs -f backend

# View Celery worker logs
docker-compose logs -f celery-worker

# View all logs
docker-compose logs -f
```

## Backup Types Explained

### Full Backup
Complete snapshot of the entire database. Recommended for daily/weekly schedules.

### Incremental Backup
Only backs up data changed since the last backup (full or incremental). Faster but requires all previous backups for restore.

### Differential Backup
Backs up data changed since the last full backup. Restore requires only the last full backup and the differential.

## Retention Policies

Retention policies automatically clean up old backups based on rules:

- **Keep last N backups**: Keep the most recent N backups
- **Keep for N days**: Keep backups newer than N days
- **Keep daily/weekly/monthly**: Keep 1 backup per day/week/month for N periods

Example policy:
- Keep last 7 daily backups
- Keep last 4 weekly backups
- Keep last 12 monthly backups
- Delete everything else

## Troubleshooting

### Backend won't start

```bash
# Check database connection
docker-compose logs postgres

# Check Redis connection
docker-compose logs redis

# Verify environment variables
docker-compose config
```

### Backups failing

```bash
# Check Celery worker logs
docker-compose logs celery-worker

# Verify S3/MinIO access
docker-compose logs minio

# Test server connectivity
curl -X POST http://localhost:8000/api/v1/servers/1/test-connection
```

### Frontend can't connect to backend

```bash
# Check CORS settings in backend/.env
CORS_ORIGINS=http://localhost:3000

# Verify backend is running
curl http://localhost:8000/health
```

## Development

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

### Code Quality

```bash
# Backend linting
cd backend
black app/
flake8 app/
mypy app/

# Frontend linting
cd frontend
npm run lint
```

### Database Migrations

```bash
# Create a new migration
cd backend
alembic revision --autogenerate -m "Add new field"

# Apply migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1
```

## Production Deployment

### Docker Compose Production

1. Update `docker-compose.yml` with production settings
2. Set strong passwords and keys in `.env`
3. Configure proper storage volumes
4. Set up SSL/TLS certificates
5. Configure firewall rules

### Kubernetes/K3s Production

1. Update K8s manifests with production settings
2. Create secrets for sensitive data:
```bash
kubectl create secret generic backend-secret \
  --from-literal=SECRET_KEY=your-secret-key \
  --from-literal=ENCRYPTION_KEY=your-encryption-key \
  -n db-backup-platform
```
3. Configure Ingress with TLS
4. Set up persistent volumes
5. Configure resource limits
6. Set up monitoring and alerting

### Bare Metal Production

1. Install Python 3.11+ and Node.js 20+
2. Install PostgreSQL 15+ and Redis 7+
3. Configure nginx as reverse proxy
4. Set up systemd services for auto-start
5. Configure SSL certificates
6. Set up log rotation
7. Configure backup of the platform itself

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

Quick steps:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT License - see [LICENSE](LICENSE) file for details

## Documentation

- **Quick Start**: This README
- **Architecture**: [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Deployment Guide**: [DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Usage Guide**: [USAGE_GUIDE.md](docs/USAGE_GUIDE.md)
- **API Schema**: [API_SCHEMA.md](docs/API_SCHEMA.md)
- **Security**: [SECURITY.md](SECURITY.md)
- **Practical Scenarios**: [PRACTICAL_SCENARIOS.md](docs/PRACTICAL_SCENARIOS.md)
- **K3s Setup**: [K3S_SETUP.md](docs/K3S_SETUP.md)

## Support

- **Issues**: [GitHub Issues](https://github.com/nayanjaiswalgit/db-backup-ui/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nayanjaiswalgit/db-backup-ui/discussions)
- **Security Issues**: See [SECURITY.md](SECURITY.md)

## Roadmap

- [ ] Support for additional databases (Oracle, SQL Server)
- [ ] Built-in data masking rules
- [ ] Backup verification and integrity checks
- [ ] Multi-tenancy support
- [ ] Grafana dashboard integration
- [ ] Terraform provider
- [ ] Ansible playbooks
- [ ] Mobile app for monitoring

## Acknowledgments

Built with:
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [SQLAlchemy](https://www.sqlalchemy.org/)
- [Celery](https://docs.celeryq.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [MinIO](https://min.io/)
