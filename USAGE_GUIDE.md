# Complete Usage Guide - DB Backup Platform

## Table of Contents
1. [Getting Started](#getting-started)
2. [Server Management](#server-management)
3. [Creating Backups](#creating-backups)
4. [Restoring Backups](#restoring-backups)
5. [Scheduling Backups](#scheduling-backups)
6. [Command Automation](#command-automation)
7. [Real-time Monitoring](#real-time-monitoring)
8. [Data Masking](#data-masking)
9. [Advanced Features](#advanced-features)
10. [Troubleshooting](#troubleshooting)

## Getting Started

### Initial Setup

1. **Deploy the platform** using one of the methods in [DEPLOYMENT.md](DEPLOYMENT.md)

2. **Access the web interface**:
   ```
   http://localhost:3000
   ```

3. **Login with default credentials**:
   - Username: `admin`
   - Password: `admin123`

4. **Change your password** (Settings → User Profile → Change Password)

### First-Time Configuration

1. **Configure S3 Storage** (if using external S3):
   - Go to Settings → Storage
   - Enter S3 endpoint, access key, and secret key
   - Test connection

2. **Set up notifications**:
   - Go to Notifications → Add Channel
   - Configure Slack webhook or Email SMTP

3. **Create your first server**:
   - Go to Servers → Add Server
   - Follow the server configuration guide below

## Server Management

### Adding a Docker Server

Navigate to **Servers → Add Server**, then configure:

```json
{
  "name": "Production Docker Host",
  "type": "docker",
  "environment": "production",
  "host": "192.168.1.100",
  "port": 2375,
  "credentials": {
    "username": "admin",
    "password": "secure-password"
  }
}
```

**For docker-compose stacks**, use the same configuration. The platform will detect all containers.

### Adding a K3s/Kubernetes Server

```json
{
  "name": "K3s Production Cluster",
  "type": "kubernetes",
  "environment": "production",
  "host": "k3s.example.com",
  "port": 6443,
  "credentials": {
    "kubeconfig": "<<< paste kubeconfig content >>>",
    "namespace": "default"
  }
}
```

**Getting kubeconfig**:
```bash
# From K3s master node
sudo cat /etc/rancher/k3s/k3s.yaml
```

### Adding a Bare-metal Server

```json
{
  "name": "Production Database Server",
  "type": "bare_metal",
  "environment": "production",
  "host": "db.example.com",
  "port": 22,
  "credentials": {
    "username": "ubuntu",
    "password": "secure-password",
    // OR use SSH key:
    "ssh_key": "-----BEGIN RSA PRIVATE KEY-----\n..."
  }
}
```

### Testing Server Connection

After adding a server:
1. Click on the server name
2. Click **Test Connection**
3. Verify green status and response time

### Server Health Monitoring

The platform automatically:
- Checks server health every 60 seconds
- Sends alerts when servers become unhealthy
- Displays health status in the dashboard
- Tracks last heartbeat timestamp

## Creating Backups

### Manual Backup

1. Navigate to **Backups → Create Backup**

2. Fill in the form:
   ```
   Server: Production Docker Host
   Database: myapp_production
   Database Type: PostgreSQL
   Backup Type: Full
   Compression: gzip
   Encryption: Enabled
   ```

3. Click **Create Backup**

4. Monitor progress in real-time (progress bar shows status)

### Backup Types Explained

**Full Backup**:
- Complete database dump
- Can be restored independently
- Larger file size
- Recommended for: Daily/weekly backups

**Incremental Backup**:
- Only changes since last backup
- Smaller file size
- Requires all previous backups for restore
- Recommended for: Hourly backups

**Differential Backup**:
- Changes since last full backup
- Medium file size
- Requires only last full backup
- Recommended for: Daily backups between full backups

### Environment-Specific Backups

**Docker Container Backup**:
```bash
# Automatic - platform handles:
docker exec <container> pg_dump -U postgres myapp > backup.sql
```

**K3s Pod Backup**:
```bash
# Automatic - platform handles:
kubectl exec -n default <pod> -- pg_dump -U postgres myapp > backup.sql
```

**Bare-metal Backup**:
```bash
# Automatic - platform executes via SSH:
pg_dump -h localhost -U postgres myapp > backup.sql
```

## Restoring Backups

### Simple Restore (Same Environment)

1. Navigate to **Backups**
2. Find the backup you want to restore
3. Click **Restore**
4. Select target:
   ```
   Target Server: Production Docker Host (same)
   Target Database: myapp_production
   ```
5. Click **Start Restore**

### Cross-Environment Restore (Production → Staging)

1. Navigate to **Backups**
2. Find production backup
3. Click **Restore**
4. Configure restore:
   ```
   Target Server: Staging Docker Host
   Target Database: myapp_staging
   Enable Data Masking: Yes
   ```
5. Configure masking rules:
   ```json
   {
     "email": "email",
     "phone": "phone",
     "ssn": "null",
     "credit_card": "credit_card",
     "customer_name": "name"
   }
   ```
6. Click **Start Restore**

### Point-in-Time Restore

For incremental backups:
1. Select the point-in-time backup
2. Platform automatically determines required backup chain
3. Restores in correct order

## Scheduling Backups

### Creating a Schedule

1. Navigate to **Schedules → Create Schedule**

2. Configure schedule:
   ```
   Name: Daily Production Backup
   Server: Production Docker Host
   Database: myapp_production

   Schedule (Cron): 0 2 * * *  (2 AM daily)
   Backup Type: Full

   Retention Policy: Standard (see below)

   Notifications:
   ✓ Notify on failure
   □ Notify on success
   ```

3. Click **Create Schedule**

### Cron Expression Examples

```bash
0 2 * * *       # Every day at 2 AM
0 */6 * * *     # Every 6 hours
0 0 * * 0       # Every Sunday at midnight
0 3 1 * *       # First day of month at 3 AM
*/30 * * * *    # Every 30 minutes
```

### Retention Policies

**Standard Policy**:
```json
{
  "keep_last_n": 7,
  "keep_daily": 7,
  "keep_weekly": 4,
  "keep_monthly": 12
}
```

**Long-term Compliance**:
```json
{
  "keep_days": 2555,
  "keep_monthly": 84
}
```

**Development/Staging**:
```json
{
  "keep_last_n": 3,
  "keep_days": 7
}
```

### Enabling/Disabling Schedules

- Toggle the **Enabled** switch on any schedule
- Disabled schedules won't run but keep configuration
- Re-enable anytime without reconfiguration

## Command Automation

### Creating Command Templates

1. Navigate to **Commands → New Command**

2. Create a shell command:
   ```
   Name: Check Disk Space
   Type: shell
   Command: df -h | grep /data
   ```

3. Create a Docker command with variables:
   ```
   Name: Restart Container
   Type: docker
   Command: docker restart {{container_name}}
   ```

4. Create a K8s command:
   ```
   Name: Scale Deployment
   Type: kubernetes
   Command: kubectl scale deployment {{deployment}} --replicas={{replicas}}
   ```

### Executing Commands

1. Go to **Commands**
2. Find your command
3. Click **Execute**
4. Fill in variables (if any):
   ```
   container_name: myapp_web
   ```
5. Select target server
6. Click **Run**
7. View output in real-time

### Command History

- All executions are logged
- View stdout/stderr for each execution
- Export command history
- Filter by status (success/failed)

## Real-time Monitoring

### Real-time Log Viewer

The platform includes a built-in log viewer:

1. **Toggle Log Viewer**: Click terminal icon (bottom-right)
2. **Filter Logs**: Select log level (All, Error, Warning, Info, Debug)
3. **Monitor Events**:
   - Backup progress
   - Restore progress
   - Server health changes
   - Command execution output

### WebSocket Channels

The platform uses WebSocket for real-time updates:

- **Backup Progress**: Live progress bars during backups
- **Server Health**: Instant health status updates
- **Notifications**: Real-time alerts
- **Command Output**: Live command execution output

### Dashboard Metrics

Dashboard auto-refreshes every 30 seconds showing:
- Total servers and health status
- Recent backups with status
- Upcoming scheduled backups
- Storage utilization
- Success rates

## Data Masking

### Available Masking Types

| Type | Description | Example |
|------|-------------|---------|
| `email` | Hash email, use @example.com | user@example.com |
| `phone` | Randomize digits, keep format | (555) 123-4567 |
| `ssn` | Random SSN format | 123-45-6789 |
| `credit_card` | Mask middle digits | 1234 **** **** 5678 |
| `name` | Generate fake name | John Smith |
| `address` | Generate fake address | 123 Main St |
| `hash` | SHA-256 hash | a1b2c3... |
| `randomize` | Random string | xY9kL2... |
| `null` | Set to NULL | NULL |

### Configuring Masking Rules

When restoring to non-production:

```json
{
  "users.email": "email",
  "users.phone": "phone",
  "customers.ssn": "null",
  "payments.credit_card": "credit_card",
  "users.first_name": "name",
  "users.last_name": "name",
  "addresses.street": "address"
}
```

### SQL-based Masking

For in-database masking:

```sql
-- Generated automatically by platform
UPDATE users SET email = MD5(email) || '@example.com';
UPDATE users SET phone = NULL;
UPDATE payments SET credit_card = SUBSTR(credit_card, 1, 4) || '********' || SUBSTR(credit_card, -4);
```

## Advanced Features

### Multi-Database Backup in One Schedule

Create separate schedules for each database:
- `myapp_db` → Full backup daily
- `analytics_db` → Full backup weekly
- `cache_db` → Skip (ephemeral data)

### Backup to Multiple Storage Locations

Configure multiple storage backends:
1. Primary: S3 (MinIO)
2. Secondary: Local filesystem
3. Archive: AWS S3 Glacier

### Custom Compression Levels

In `backend/.env`:
```bash
# Fast compression (LZ4)
COMPRESSION_TYPE=lz4

# Best compression (Zstandard)
COMPRESSION_TYPE=zstd

# Standard (gzip)
COMPRESSION_TYPE=gzip
```

### Parallel Backups

Platform automatically runs multiple backups in parallel:
- Configured in `backend/.env`: `MAX_CONCURRENT_BACKUPS=5`
- Celery workers scale horizontally
- No configuration needed

### Backup Verification

Every backup is verified:
1. SHA-256 checksum calculated
2. Checksum stored in database
3. Verified before restore
4. Alert if checksum mismatch

## Troubleshooting

### Backup Failed: Connection Timeout

**Cause**: Cannot reach target server

**Solution**:
1. Check server is running: `docker ps` or `kubectl get pods`
2. Test connection: Servers → Test Connection
3. Verify firewall rules allow connection
4. Check credentials are correct

### Restore Failed: Checksum Mismatch

**Cause**: Backup file corrupted

**Solution**:
1. Re-download backup from storage
2. Verify S3 connectivity
3. Check disk space on worker
4. Create new backup

### Schedule Not Running

**Cause**: Schedule disabled or Celery beat not running

**Solution**:
1. Check schedule is **Enabled**
2. Verify Celery beat is running:
   ```bash
   docker-compose ps celery-beat
   ```
3. Check cron expression is valid
4. View Celery logs for errors

### WebSocket Not Connecting

**Cause**: Nginx not proxying WebSocket

**Solution**:
1. Check nginx.conf includes WebSocket headers
2. Restart nginx: `docker-compose restart frontend`
3. Check browser console for errors

### Out of Storage Space

**Cause**: Too many backups, retention not working

**Solution**:
1. Check retention policy is configured
2. Manually run cleanup: Backups → Cleanup Old Backups
3. Increase storage capacity
4. Delete unnecessary backups

### SSH Connection Refused

**Cause**: SSH not accessible or wrong port

**Solution**:
1. Test SSH manually: `ssh user@host -p 22`
2. Verify SSH service is running
3. Check firewall allows port 22
4. Update server port in platform

### K8s Permissions Denied

**Cause**: Kubeconfig doesn't have required permissions

**Solution**:
1. Verify kubeconfig has exec permissions
2. Create service account with proper RBAC:
   ```bash
   kubectl create sa backup-operator
   kubectl create clusterrolebinding backup-operator \
     --clusterrole=cluster-admin \
     --serviceaccount=default:backup-operator
   ```

### Data Masking Not Applied

**Cause**: Masking rules not configured correctly

**Solution**:
1. Check field names match database schema
2. Use format: `table.column`
3. Verify masking type is supported
4. Test with single table first

## Best Practices

### Security
- ✓ Change default admin password immediately
- ✓ Use SSH keys instead of passwords
- ✓ Enable encryption for all backups
- ✓ Rotate credentials monthly
- ✓ Use RBAC with least privilege
- ✓ Enable audit logging

### Backup Strategy
- ✓ Full backup daily at minimum
- ✓ Keep 7 daily, 4 weekly, 12 monthly
- ✓ Test restores monthly
- ✓ Store backups off-site (S3)
- ✓ Monitor backup success rates
- ✓ Alert on failures immediately

### Performance
- ✓ Schedule backups during low traffic
- ✓ Use compression to reduce storage
- ✓ Scale Celery workers for parallel backups
- ✓ Monitor worker queue length
- ✓ Use incremental backups for large databases

### Compliance
- ✓ Enable audit logging
- ✓ Export audit logs monthly
- ✓ Mask PII when restoring to non-prod
- ✓ Document backup/restore procedures
- ✓ Test disaster recovery plan

## Getting Help

- **Documentation**: See [README.md](README.md)
- **API Reference**: See [API_SCHEMA.md](API_SCHEMA.md)
- **Deployment Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)

For support, check logs:
```bash
# Backend logs
docker-compose logs -f backend

# Celery worker logs
docker-compose logs -f celery-worker

# Real-time logs in UI
Click terminal icon (bottom-right)
```
