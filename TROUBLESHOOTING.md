# Troubleshooting Guide

Common issues and their solutions for the DB Backup Platform.

## Table of Contents
- [Docker Issues](#docker-issues)
- [Service Startup Issues](#service-startup-issues)
- [Connection Issues](#connection-issues)
- [Performance Issues](#performance-issues)
- [Common Error Messages](#common-error-messages)

## Docker Issues

### Docker Not Installed

**Symptom:**
```
bash: docker: command not found
```

**Solution:**
1. Run the installation script:
   ```bash
   ./install-docker.sh
   ```
2. Or install manually following [Docker's official guide](https://docs.docker.com/engine/install/)
3. After installation, log out and log back in

### Permission Denied

**Symptom:**
```
Got permission denied while trying to connect to the Docker daemon socket
```

**Solution:**
```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and log back in, or run:
newgrp docker

# Verify it works
docker ps
```

### Docker Compose Not Found

**Symptom:**
```
docker-compose: command not found
```

**Solution:**
Modern Docker includes Compose as a plugin. Use `docker compose` (with a space) instead of `docker-compose`:
```bash
docker compose up -d
```

If you need the standalone version:
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Port Already in Use

**Symptom:**
```
Error starting userland proxy: listen tcp4 0.0.0.0:8000: bind: address already in use
```

**Solution:**
```bash
# Find what's using the port
sudo lsof -i :8000
sudo lsof -i :3000
sudo lsof -i :5432

# Kill the process or change ports in docker-compose.yml
# For example, to use port 8080 instead of 8000:
# Edit docker-compose.yml and change:
# ports:
#   - "8080:8000"
```

### Disk Space Issues

**Symptom:**
```
no space left on device
```

**Solution:**
```bash
# Remove unused Docker resources
docker system prune -a

# Check disk space
df -h

# Remove old volumes
docker volume ls
docker volume rm <volume_name>
```

## Service Startup Issues

### Backend Won't Start

**Check the logs:**
```bash
docker compose logs backend
```

**Common causes:**

1. **Database connection failed:**
   ```bash
   # Verify PostgreSQL is running
   docker compose ps postgres
   docker compose logs postgres

   # Check connection
   docker compose exec postgres pg_isready -U postgres
   ```

2. **Missing environment variables:**
   ```bash
   # Ensure backend/.env exists
   ls -la backend/.env

   # If missing, create it:
   cp backend/.env.example backend/.env
   ```

3. **Port conflict:**
   ```bash
   # Check if port 8000 is in use
   sudo lsof -i :8000
   ```

### Frontend Won't Start

**Check the logs:**
```bash
docker compose logs frontend
```

**Common causes:**

1. **Build failed:**
   ```bash
   # Rebuild the frontend
   docker compose build frontend
   docker compose up -d frontend
   ```

2. **Backend not accessible:**
   ```bash
   # Verify backend is running
   curl http://localhost:8000/health
   ```

### PostgreSQL Won't Start

**Check the logs:**
```bash
docker compose logs postgres
```

**Common causes:**

1. **Data directory corruption:**
   ```bash
   # Stop services
   docker compose down

   # Remove volume (WARNING: This deletes all data!)
   docker volume rm db-backup-ui_postgres_data

   # Restart
   docker compose up -d
   ```

2. **Permission issues:**
   ```bash
   docker compose down
   docker volume inspect db-backup-ui_postgres_data
   # Check permissions on the mount point
   ```

### Celery Worker Not Processing Tasks

**Check the logs:**
```bash
docker compose logs celery-worker
```

**Common causes:**

1. **Redis not running:**
   ```bash
   docker compose ps redis
   docker compose logs redis

   # Test Redis connection
   docker compose exec redis redis-cli ping
   ```

2. **Worker crashed:**
   ```bash
   # Restart the worker
   docker compose restart celery-worker
   ```

3. **Task queue backed up:**
   ```bash
   # Check queue length
   docker compose exec redis redis-cli LLEN celery

   # Inspect active tasks
   docker compose exec celery-worker celery -A app.celery.celery_app inspect active
   ```

### MinIO Won't Start

**Check the logs:**
```bash
docker compose logs minio
```

**Common causes:**

1. **Port conflict:**
   ```bash
   sudo lsof -i :9000
   sudo lsof -i :9001
   ```

2. **Data corruption:**
   ```bash
   docker compose down
   docker volume rm db-backup-ui_minio_data
   docker compose up -d minio
   ```

## Connection Issues

### Can't Access Frontend

**Symptom:**
Browser shows "Unable to connect" at http://localhost:3000

**Solution:**
```bash
# Check if frontend is running
docker compose ps frontend

# Check logs
docker compose logs frontend

# Verify nginx is working inside container
docker compose exec frontend wget -O- http://localhost:80

# Check if port is accessible from host
curl http://localhost:3000
```

### Can't Access Backend API

**Symptom:**
```
Failed to fetch
```

**Solution:**
```bash
# Check if backend is running
docker compose ps backend

# Test health endpoint
curl http://localhost:8000/health

# Check if backend is listening
docker compose exec backend netstat -tlnp | grep 8000

# Check CORS settings in backend/.env
# Ensure CORS_ORIGINS includes your frontend URL
```

### Database Connection Errors

**Symptom:**
```
sqlalchemy.exc.OperationalError: could not connect to server
```

**Solution:**
```bash
# Verify PostgreSQL is running and healthy
docker compose ps postgres
docker compose exec postgres pg_isready -U postgres

# Check connection from backend container
docker compose exec backend psql postgresql://postgres:postgres@postgres:5432/dbbackup -c "SELECT 1"

# Verify DATABASE_URL in backend/.env or docker-compose.yml
```

### Redis Connection Errors

**Symptom:**
```
redis.exceptions.ConnectionError: Error connecting to Redis
```

**Solution:**
```bash
# Verify Redis is running
docker compose ps redis

# Test Redis connection
docker compose exec redis redis-cli ping

# Test from backend
docker compose exec backend redis-cli -h redis ping

# Check REDIS_URL in environment variables
```

## Performance Issues

### Slow Response Times

**Diagnosis:**
```bash
# Check resource usage
docker stats

# Check backend logs for slow queries
docker compose logs backend | grep -i "slow"

# Check database performance
docker compose exec postgres psql -U postgres -d dbbackup -c "SELECT * FROM pg_stat_activity;"
```

**Solutions:**
1. Increase worker count in docker-compose.yml
2. Add database indexes
3. Increase memory/CPU limits
4. Enable Redis caching

### High Memory Usage

**Check usage:**
```bash
docker stats
```

**Solutions:**
```bash
# Limit container memory in docker-compose.yml
# Add under each service:
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M

# Configure Redis maxmemory
docker compose exec redis redis-cli CONFIG SET maxmemory 256mb
docker compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Database Growing Too Large

**Check size:**
```bash
docker compose exec postgres psql -U postgres -d dbbackup -c "
SELECT pg_size_pretty(pg_database_size('dbbackup'));"
```

**Solutions:**
```bash
# Vacuum database
docker compose exec postgres psql -U postgres -d dbbackup -c "VACUUM FULL;"

# Clean up old backups through the API or UI

# Set up retention policies to auto-delete old backups
```

## Common Error Messages

### "Network db-backup-network Error"

**Error:**
```
ERROR: Network db-backup-network declared as external, but could not be found
```

**Solution:**
```bash
docker network create db-backup-network
# Or remove 'external: true' from docker-compose.yml
```

### "No such file or directory"

**Error:**
```
ERROR: .FileNotFoundError: [Errno 2] No such file or directory: '/app/app/main.py'
```

**Solution:**
```bash
# Ensure you're in the project root directory
pwd
ls backend/app/main.py

# Rebuild the image
docker compose build backend
docker compose up -d backend
```

### "Build failed" Errors

**Solution:**
```bash
# Clean build cache
docker builder prune -a

# Rebuild without cache
docker compose build --no-cache

# If still failing, check the Dockerfile and ensure all files exist
```

### "Health check failed"

**Error:**
Services stuck in "health: starting" state

**Solution:**
```bash
# Check health check command
docker compose ps

# View detailed logs
docker compose logs <service_name>

# Manually test health check
docker compose exec backend curl -f http://localhost:8000/health

# Temporarily disable health checks by commenting them out in docker-compose.yml
```

### "Permission denied" in Logs

**Error:**
```
PermissionError: [Errno 13] Permission denied: '/tmp/backups'
```

**Solution:**
```bash
# Fix volume permissions
docker compose down
docker volume rm db-backup-ui_backup_temp
docker compose up -d

# Or mount with correct permissions in docker-compose.yml
```

## Getting Help

If none of these solutions work:

1. **Check all logs:**
   ```bash
   docker compose logs --tail=100
   ```

2. **Verify configuration:**
   ```bash
   docker compose config
   ```

3. **Check service dependencies:**
   ```bash
   docker compose ps
   ```

4. **Start services one by one:**
   ```bash
   docker compose up -d postgres redis minio
   # Wait for them to be healthy
   docker compose up -d backend
   # Wait for backend to be healthy
   docker compose up -d frontend
   ```

5. **Full reset** (WARNING: Deletes all data):
   ```bash
   docker compose down -v
   docker compose up -d
   ```

6. **Check the documentation:**
   - [README.md](README.md)
   - [QUICK_START.md](QUICK_START.md)
   - [DEPLOYMENT.md](DEPLOYMENT.md)
   - [USAGE_GUIDE.md](USAGE_GUIDE.md)

7. **Still stuck?**
   - Create an issue with:
     - Your OS and Docker version
     - Output of `docker compose config`
     - Relevant logs from `docker compose logs`
     - What you've already tried
