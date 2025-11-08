# Remote K3s Access Guide

This guide explains how to access K3s clusters running on remote servers through SSH.

## Overview

When your K3s cluster is running on a remote server that you can only access via SSH, this application provides **automatic kubeconfig fetching** - no manual file copying needed!

## How It Works

1. **SSH Connection**: The app connects to your remote server via SSH
2. **Kubeconfig Fetch**: Automatically reads `/etc/rancher/k3s/k3s.yaml` from the server
3. **Local Storage**: Saves the kubeconfig locally in `./kubeconfigs/` directory
4. **Auto-Update**: Updates the server address from `127.0.0.1` to your actual server IP
5. **kubectl Access**: Uses the local kubeconfig to manage K3s resources

## Setup Steps

### 1. Add Remote K3s Cluster via UI

1. **Open the application** and navigate to the **☸️ K3s/Kubernetes** tab
2. Click **"🔗 Add Remote K3s"** button
3. Fill in the connection details:

   | Field | Description | Example |
   |-------|-------------|---------|
   | **Cluster Name** | Friendly name for the cluster | `Production K3s` |
   | **Server Host/IP** | IP address or hostname | `192.168.1.100` |
   | **SSH Username** | Username with sudo access | `root` or `ubuntu` |
   | **SSH Password** | Password for SSH login | `your-password` |
   | **SSH Port** | SSH port (default 22) | `22` |
   | **K3s API Port** | K3s API port (default 6443) | `6443` |
   | **K3s Config Path** | Path to k3s.yaml on server | `/etc/rancher/k3s/k3s.yaml` |

4. Click **"Add Cluster"**
5. The app will automatically:
   - Connect via SSH
   - Fetch the kubeconfig
   - Save it locally
   - Update the server address

### 2. Verify Connection

After adding the cluster, you'll see it in the "Remote K3s Clusters" section with:
- **✅ Ready** badge if kubeconfig was fetched successfully
- **⚠️ Pending** badge if fetch failed

Click **🔍 Test** to verify the SSH connection.

### 3. Discover PostgreSQL Pods

Once the cluster is added and ready:

1. **Select namespace** from the dropdown (e.g., `default`)
2. Click **"🔍 Discover PostgreSQL"**
3. The app will show all PostgreSQL pods in that namespace
4. Click **"+ Add"** on any pod to configure it for backups

### 4. Create Backups

After adding a pod:
1. Go to **"Configured K3s Servers"** section
2. Find your server
3. Click **"📦 Backup"**
4. Enter the database name (e.g., `postgres`)
5. Backup will be created and stored locally

## Requirements

### On Your Local Machine (running the app)

- ✅ Node.js installed
- ✅ kubectl installed (optional, but recommended)
- ✅ Network access to remote server

### On Your Remote Server (K3s cluster)

- ✅ K3s installed and running
- ✅ SSH server running (port 22 or custom)
- ✅ User with sudo access (to read `/etc/rancher/k3s/k3s.yaml`)
- ✅ Network access: allow port 6443 (K3s API)

## Network Requirements

The app needs access to these ports on your remote server:

| Port | Protocol | Purpose |
|------|----------|---------|
| **22** | TCP/SSH | SSH connection to fetch kubeconfig |
| **6443** | TCP/HTTPS | K3s API server (kubectl commands) |

### Firewall Configuration

On your remote K3s server:

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow K3s API
sudo ufw allow 6443/tcp

# Enable firewall
sudo ufw enable
```

## Troubleshooting

### Issue: "SSH connection failed: getaddrinfo ENOTFOUND"

**Cause**: Cannot resolve the hostname/IP address

**Solution**:
- Verify the server IP/hostname is correct
- Check network connectivity: `ping 192.168.1.100`
- Ensure no typos in the host field

### Issue: "SSH connection failed: Authentication failed"

**Cause**: Wrong username or password

**Solution**:
- Verify SSH credentials
- Test manual SSH: `ssh username@192.168.1.100`
- Check if user has proper permissions

### Issue: "Failed to read kubeconfig from remote server"

**Cause**: User doesn't have permission to read k3s.yaml

**Solution**:
```bash
# On the remote server, grant permission
sudo chmod 644 /etc/rancher/k3s/k3s.yaml

# Or use a user that has sudo access
```

### Issue: "kubectl command failed"

**Cause**: K3s API server not accessible

**Solution**:
- Check K3s is running: `sudo systemctl status k3s`
- Verify firewall allows port 6443
- Check server address in kubeconfig is correct

### Issue: "Connection timeout on port 6443"

**Cause**: Firewall blocking K3s API

**Solution**:
```bash
# On remote server
sudo ufw allow 6443/tcp
sudo ufw reload

# Verify K3s is listening
sudo netstat -tlnp | grep 6443
```

## Security Considerations

### 1. Use SSH Keys Instead of Passwords

For production use, consider using SSH key authentication:

```bash
# Generate SSH key on local machine
ssh-keygen -t rsa -b 4096 -f ~/.ssh/k3s_server

# Copy to remote server
ssh-copy-id -i ~/.ssh/k3s_server.pub username@remote-server
```

**Note**: The UI currently supports password authentication. SSH key support can be added if needed.

### 2. Create Limited User for Backups

Instead of using root, create a dedicated user:

```bash
# On remote server
sudo useradd -m -s /bin/bash k3s-backup
sudo usermod -aG sudo k3s-backup
sudo passwd k3s-backup

# Grant read access to k3s.yaml
sudo setfacl -m u:k3s-backup:r /etc/rancher/k3s/k3s.yaml
```

### 3. Network Security

- Use VPN for accessing remote servers
- Restrict SSH access by IP in firewall
- Use fail2ban to prevent brute force attacks
- Enable SSH key-only authentication

## Advanced: Manual Kubeconfig Setup

If you prefer to manually set up kubeconfig:

1. **On remote server**, copy the kubeconfig:
   ```bash
   sudo cat /etc/rancher/k3s/k3s.yaml
   ```

2. **On local machine**, create kubeconfig file:
   ```bash
   mkdir -p kubeconfigs
   nano kubeconfigs/my-cluster.yaml
   ```

3. **Paste the content** and update the server line:
   ```yaml
   server: https://192.168.1.100:6443  # Change from 127.0.0.1
   ```

4. **Update `.env`**:
   ```env
   KUBECONFIG=./kubeconfigs/my-cluster.yaml
   ```

5. **Use the local K3s features** instead of remote K3s features

## Comparison: Remote K3s vs Local K3s Access

| Feature | Remote K3s (via SSH) | Local K3s Access |
|---------|---------------------|------------------|
| **Setup** | Automatic via UI | Manual kubeconfig setup |
| **Kubeconfig** | Auto-fetched | Manual copy required |
| **Requirements** | SSH access | kubectl + manual config |
| **Updates** | Re-fetch via UI | Manual update |
| **Security** | SSH credentials needed | Kubeconfig file only |
| **Best For** | Remote servers with SSH | Local clusters or VPN access |

## Example Workflow

### Scenario: Backup PostgreSQL from Remote K3s

1. **Add cluster**: Click "🔗 Add Remote K3s"
   - Name: `Production K3s`
   - Host: `192.168.1.100`
   - Username: `root`
   - Password: `***`

2. **Wait for success**: See "✅ Ready" badge

3. **Discover pods**: Select `default` namespace → Click "🔍 Discover"

4. **Add pod**: Click "+ Add" on `postgres-0`

5. **Create backup**: Click "📦 Backup" → Enter `mydb` → Done!

6. **Download backup**: Go to Backups section → Your backup is listed

## Next Steps

- Set up automated backup schedules (coming soon)
- Restore backups to different clusters
- Monitor backup sizes and ages
- Set up retention policies

## Support

For issues or questions:
- Check application logs
- Verify SSH access manually
- Test kubectl commands locally
- Review firewall settings
