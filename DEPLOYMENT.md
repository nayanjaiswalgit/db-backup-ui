# Deployment Guide

Comprehensive guide for deploying the DB Backup Platform in various environments.

## Table of Contents
- [Docker Compose Deployment](#docker-compose-deployment)
- [Kubernetes/K3s Deployment](#kubernetesk3s-deployment)
- [Bare Metal Deployment](#bare-metal-deployment)
- [Production Checklist](#production-checklist)
- [Scaling Guide](#scaling-guide)

## Docker Compose Deployment

### Development Environment

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/db-backup-platform.git
cd db-backup-platform
```

2. **Configure environment:**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your settings
```

3. **Start services:**
```bash
docker-compose up -d
```

4. **Initialize database:**
```bash
docker-compose exec backend alembic upgrade head
```

5. **Create admin user:**
```bash
docker-compose exec backend python -c "
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
import asyncio

async def create_admin():
    async with AsyncSessionLocal() as db:
        user = User(
            username='admin',
            email='admin@example.com',
            password_hash=get_password_hash('admin123'),
            role=UserRole.ADMIN
        )
        db.add(user)
        await db.commit()

asyncio.run(create_admin())
"
```

### Production Environment

1. **Create production docker-compose file:**
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    image: registry.example.com/dbbackup/backend:latest
    restart: always
    environment:
      - ENVIRONMENT=production
      - DEBUG=False
    # ... other production settings
```

2. **Set up SSL/TLS:**
```bash
# Using Certbot for Let's Encrypt
docker run -it --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly \
  --standalone \
  -d dbbackup.yourdomain.com
```

3. **Configure nginx reverse proxy:**
```nginx
server {
    listen 443 ssl http2;
    server_name dbbackup.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/dbbackup.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dbbackup.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Kubernetes/K3s Deployment

### Prerequisites

- K3s/Kubernetes cluster running
- kubectl configured
- Persistent storage provisioner (local-path, longhorn, etc.)

### Installation Steps

1. **Create namespace:**
```bash
kubectl create namespace db-backup-platform
```

2. **Create secrets:**
```bash
# Generate encryption key
ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# Create secret
kubectl create secret generic backend-secret \
  --from-literal=SECRET_KEY=$(openssl rand -hex 32) \
  --from-literal=ENCRYPTION_KEY=$ENCRYPTION_KEY \
  -n db-backup-platform
```

3. **Configure persistent volumes:**
```bash
# If using local-path provisioner
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolume
metadata:
  name: postgres-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: /data/postgres
EOF
```

4. **Deploy using Kustomize:**
```bash
kubectl apply -k k8s/
```

5. **Verify deployment:**
```bash
kubectl get pods -n db-backup-platform
kubectl get svc -n db-backup-platform
```

6. **Configure ingress:**
```bash
# Update k8s/ingress.yaml with your domain
# Apply cert-manager for automatic TLS
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

7. **Access the application:**
```bash
# Via port-forward (development)
kubectl port-forward -n db-backup-platform svc/frontend 3000:80

# Via ingress (production)
# Access at https://dbbackup.yourdomain.com
```

### Scaling

```bash
# Scale backend
kubectl scale deployment backend -n db-backup-platform --replicas=5

# Scale Celery workers
kubectl scale deployment celery-worker -n db-backup-platform --replicas=10

# Auto-scaling
kubectl autoscale deployment backend \
  -n db-backup-platform \
  --min=3 \
  --max=10 \
  --cpu-percent=70
```

## Bare Metal Deployment

### System Requirements

- Ubuntu 22.04 LTS or similar
- Python 3.11+
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Nginx

### Installation

1. **Install system dependencies:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python
sudo apt install -y python3.11 python3.11-venv python3-pip

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Redis
sudo apt install -y redis-server

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx
```

2. **Set up PostgreSQL:**
```bash
sudo -u postgres psql <<EOF
CREATE DATABASE dbbackup;
CREATE USER dbbackup WITH PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE dbbackup TO dbbackup;
EOF
```

3. **Clone and configure backend:**
```bash
cd /opt
sudo git clone https://github.com/yourusername/db-backup-platform.git
sudo chown -R $(whoami):$(whoami) db-backup-platform
cd db-backup-platform/backend

python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with production settings

# Run migrations
alembic upgrade head
```

4. **Set up frontend:**
```bash
cd /opt/db-backup-platform/frontend
npm install
npm run build
```

5. **Configure systemd services:**

**/etc/systemd/system/dbbackup-api.service:**
```ini
[Unit]
Description=DB Backup Platform API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/db-backup-platform/backend
Environment="PATH=/opt/db-backup-platform/backend/venv/bin"
ExecStart=/opt/db-backup-platform/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4
Restart=always

[Install]
WantedBy=multi-user.target
```

**/etc/systemd/system/dbbackup-celery-worker.service:**
```ini
[Unit]
Description=DB Backup Platform Celery Worker
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/db-backup-platform/backend
Environment="PATH=/opt/db-backup-platform/backend/venv/bin"
ExecStart=/opt/db-backup-platform/backend/venv/bin/celery -A app.celery.celery_app worker --loglevel=info
Restart=always

[Install]
WantedBy=multi-user.target
```

**/etc/systemd/system/dbbackup-celery-beat.service:**
```ini
[Unit]
Description=DB Backup Platform Celery Beat
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/db-backup-platform/backend
Environment="PATH=/opt/db-backup-platform/backend/venv/bin"
ExecStart=/opt/db-backup-platform/backend/venv/bin/celery -A app.celery.celery_app beat --loglevel=info
Restart=always

[Install]
WantedBy=multi-user.target
```

6. **Enable and start services:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable dbbackup-api dbbackup-celery-worker dbbackup-celery-beat
sudo systemctl start dbbackup-api dbbackup-celery-worker dbbackup-celery-beat
sudo systemctl status dbbackup-api
```

7. **Configure Nginx:**

**/etc/nginx/sites-available/dbbackup:**
```nginx
server {
    listen 80;
    server_name dbbackup.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dbbackup.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/dbbackup.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dbbackup.yourdomain.com/privkey.pem;

    root /opt/db-backup-platform/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/dbbackup /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Production Checklist

### Security
- [ ] Change all default passwords
- [ ] Generate strong SECRET_KEY and ENCRYPTION_KEY
- [ ] Enable HTTPS/TLS with valid certificates
- [ ] Configure firewall (ufw, iptables, security groups)
- [ ] Enable fail2ban for SSH protection
- [ ] Restrict database access to localhost
- [ ] Set up VPN for administrative access
- [ ] Enable audit logging
- [ ] Configure CORS properly
- [ ] Disable debug mode

### Database
- [ ] Configure PostgreSQL for production
- [ ] Set up database backups
- [ ] Configure connection pooling
- [ ] Optimize PostgreSQL settings
- [ ] Set up replication (if needed)

### Performance
- [ ] Configure Redis maxmemory and eviction
- [ ] Set appropriate worker counts
- [ ] Configure rate limiting
- [ ] Enable gzip compression
- [ ] Set up CDN for static assets
- [ ] Configure caching headers

### Monitoring
- [ ] Set up health checks
- [ ] Configure alerting
- [ ] Set up log aggregation
- [ ] Monitor disk space
- [ ] Monitor memory usage
- [ ] Monitor CPU usage
- [ ] Set up uptime monitoring

### Backup
- [ ] Back up PostgreSQL database
- [ ] Back up configuration files
- [ ] Back up encryption keys
- [ ] Test restore procedures
- [ ] Document recovery process

## Scaling Guide

### Horizontal Scaling

1. **API Servers:**
```bash
# Docker Compose
docker-compose up -d --scale backend=3

# Kubernetes
kubectl scale deployment backend --replicas=5 -n db-backup-platform
```

2. **Celery Workers:**
```bash
# Docker Compose
docker-compose up -d --scale celery-worker=10

# Kubernetes
kubectl scale deployment celery-worker --replicas=20 -n db-backup-platform
```

3. **Load Balancer:**
```nginx
upstream backend {
    least_conn;
    server backend-1:8000;
    server backend-2:8000;
    server backend-3:8000;
}

server {
    location /api/ {
        proxy_pass http://backend;
    }
}
```

### Vertical Scaling

Update resource limits in docker-compose.yml or K8s manifests:

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "2Gi"
    cpu: "1000m"
```

### Database Scaling

1. **Connection Pooling:**
```python
# backend/app/core/config.py
DATABASE_POOL_SIZE = 40
DATABASE_MAX_OVERFLOW = 20
```

2. **Read Replicas:**
Set up PostgreSQL streaming replication for read-only queries.

3. **Partitioning:**
Partition large tables (backups, audit_logs) by date.

### Caching Strategy

1. **Redis Cluster:**
Deploy Redis in cluster mode for high availability.

2. **Application Caching:**
Cache frequently accessed data with appropriate TTLs.

## Troubleshooting

### Check Service Status
```bash
# Docker Compose
docker-compose ps
docker-compose logs backend

# Systemd
sudo systemctl status dbbackup-api
sudo journalctl -u dbbackup-api -f

# Kubernetes
kubectl get pods -n db-backup-platform
kubectl logs -f deployment/backend -n db-backup-platform
```

### Common Issues

**Database connection failed:**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection string
psql "postgresql://dbbackup:password@localhost/dbbackup"
```

**Redis connection failed:**
```bash
# Check Redis is running
sudo systemctl status redis

# Test connection
redis-cli ping
```

**Celery tasks not executing:**
```bash
# Check worker status
celery -A app.celery.celery_app inspect active

# Check queue length
redis-cli LLEN celery
```

## Maintenance

### Regular Tasks

1. **Update dependencies:**
```bash
cd backend
pip install --upgrade -r requirements.txt

cd ../frontend
npm update
```

2. **Rotate logs:**
```bash
# Configure logrotate
sudo nano /etc/logrotate.d/dbbackup
```

3. **Vacuum database:**
```bash
psql -U dbbackup -d dbbackup -c "VACUUM ANALYZE;"
```

4. **Monitor disk space:**
```bash
df -h
du -sh /var/lib/postgresql/data
```

### Backup Platform Data

```bash
# Backup PostgreSQL
pg_dump -U dbbackup dbbackup > dbbackup_$(date +%Y%m%d).sql

# Backup configuration
tar -czf config_$(date +%Y%m%d).tar.gz backend/.env

# Backup encryption keys (store securely!)
```
