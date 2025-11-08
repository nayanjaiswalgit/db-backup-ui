# PostgreSQL Backup UI - Setup Summary

## What You Have Now

Your PostgreSQL Backup UI now supports **three different ways** to manage PostgreSQL backups:

### 1. 🐳 Local Docker Containers
- Backup/restore PostgreSQL running in local Docker containers
- Auto-detection of running containers
- Launch new containers from backups

### 2. 🌐 Remote Servers (SSH)
- Direct PostgreSQL servers accessed via SSH
- For standalone PostgreSQL installations
- Not for K3s/Kubernetes clusters

### 3. ☸️ K3s/Kubernetes Clusters

You now have **TWO ways** to access K3s clusters:

#### Option A: Local K3s Access (Manual Setup)
- For K3s clusters you already have kubeconfig for
- Requires manual kubeconfig setup
- Use "☸️ Add K3s Server" button
- Best for: Local clusters, VPN access, or existing kubeconfig

#### Option B: Remote K3s via SSH (Automatic)
- **NEW FEATURE** ✨
- For K3s clusters on remote servers accessed via SSH
- Automatically fetches kubeconfig from remote server
- Use "🔗 Add Remote K3s" button
- Best for: Remote K3s servers with SSH access

## Quick Start Guide

### For Remote K3s Clusters (Your Use Case)

Since your K3s is running on a remote server that you access via SSH:

1. **Click "🔗 Add Remote K3s"** button

2. **Fill in the form**:
   ```
   Cluster Name: Production K3s
   Server Host/IP: 172.21.51.25 (or your server IP)
   SSH Username: root (or your username)
   SSH Password: ********
   SSH Port: 22
   K3s API Port: 6443
   K3s Config Path: /etc/rancher/k3s/k3s.yaml
   ```

3. **Click "Add Cluster"** - The app will:
   - ✅ Connect via SSH
   - ✅ Fetch kubeconfig automatically
   - ✅ Save it locally
   - ✅ Update server addresses

4. **Go to K3s tab** to see your cluster with "Ready" status

5. **Select namespace** → Click "🔍 Discover PostgreSQL"

6. **Click "+ Add"** on any PostgreSQL pod

7. **Create backups** by clicking "📦 Backup"

## Files Created

### Backend Services
- `src/services/k3s-remote.js` - Remote K3s cluster management via SSH
- `src/config/index.js` - Updated with KUBECONFIG and K3S_CONTEXT
- `src/services/k3s.js` - Enhanced to support custom kubeconfig paths

### Frontend
- `public/index.html` - Added Remote K3s modal and UI elements
- `public/script.js` - Added Remote K3s cluster management functions

### Routes
- `src/routes/index.js` - Added 6 new API endpoints for remote K3s

### Documentation
- `K3S_SETUP.md` - Complete K3s configuration guide
- `REMOTE_K3S_GUIDE.md` - Detailed remote K3s access guide
- `SETUP_SUMMARY.md` - This file

### Configuration
- `.env` - Updated with K3s settings

## New API Endpoints

### Remote K3s Management
```
GET    /api/k3s/remote/clusters              - List remote K3s clusters
POST   /api/k3s/remote/clusters              - Add remote K3s cluster
DELETE /api/k3s/remote/clusters/:id          - Remove cluster
POST   /api/k3s/remote/clusters/:id/fetch-kubeconfig - Fetch kubeconfig
POST   /api/k3s/remote/clusters/:id/test     - Test SSH connection
GET    /api/k3s/remote/clusters/:id/kubeconfig - Get kubeconfig path
```

### Existing K3s Endpoints (still work)
```
GET    /api/k3s/available                    - Check kubectl availability
GET    /api/k3s/namespaces                   - List namespaces
GET    /api/k3s/discover/:namespace          - Discover PostgreSQL pods
POST   /api/k3s/servers                      - Add K3s server (pod)
GET    /api/k3s/servers                      - List configured servers
DELETE /api/k3s/servers/:id                  - Remove server
POST   /api/k3s/servers/:id/backup           - Create backup
POST   /api/k3s/servers/:id/restore          - Restore backup
```

## UI Buttons Explained

| Button | Purpose | When to Use |
|--------|---------|-------------|
| **🐳 Local Docker** tab | Manage local Docker PostgreSQL | Local development |
| **🌐 Remote Servers** tab | SSH-based standalone PostgreSQL | Remote PostgreSQL servers |
| **☸️ K3s/Kubernetes** tab | Manage K3s/Kubernetes clusters | All K3s scenarios |
| **🌐 Add Remote Server** | Add SSH PostgreSQL server | Standalone PostgreSQL only |
| **☸️ Add K3s Server** | Add local K3s pod | Local K3s or manual kubeconfig |
| **🔗 Add Remote K3s** | Add remote K3s cluster | **Your use case!** |

## Solving Your Issue

### Before (The Error You Had)
```
SSH connection failed: getaddrinfo ENOTFOUND 172.21.51.25
```

**Problem**: You were trying to add a K3s server using "🌐 Add Remote Server" button, which is designed for standalone PostgreSQL servers, not K3s clusters.

### After (The Solution)
```
✅ Use "🔗 Add Remote K3s" button instead
✅ Automatically fetches kubeconfig via SSH
✅ Works with remote K3s clusters
✅ No manual kubeconfig copying needed
```

## System Architecture

```
Your Computer (Running Backup UI)
    │
    ├─── Docker ────────────> Local PostgreSQL containers
    │
    ├─── SSH ──────────────> Remote standalone PostgreSQL
    │
    └─── Remote K3s (via SSH)
         │
         ├─ Step 1: SSH to fetch kubeconfig
         ├─ Step 2: Save kubeconfig locally
         └─ Step 3: kubectl commands to K3s API
              │
              └──> PostgreSQL pods in K3s
```

## Environment Variables

Your `.env` file now includes:

```env
# Server Configuration
PORT=8081

# Postgres Container Configuration
PG_CONTAINER=db30031_containers
PG_USER=postgres
PG_DB=postgres

# Backup Directory
BACKUP_DIR=./backups

# K3s Configuration (Optional - for manual kubeconfig)
KUBECONFIG=./kubeconfigs/config
K3S_CONTEXT=my-cluster-context
```

**Note**: For Remote K3s via SSH, you don't need to set KUBECONFIG manually - it's managed automatically!

## What Happens When You Add Remote K3s

1. **You fill the form** with SSH credentials
2. **App connects via SSH** to your remote server
3. **Reads `/etc/rancher/k3s/k3s.yaml`** from remote server
4. **Updates server address** from `127.0.0.1` to your actual server IP
5. **Saves to `./kubeconfigs/`** directory locally
6. **Uses kubectl** with this kubeconfig to manage resources

## Directory Structure

```
postgres-backup-ui/
├── backups/                    # Backup files stored here
├── kubeconfigs/                # Auto-fetched kubeconfigs (created automatically)
│   ├── remote-k3s-123_Production.yaml
│   └── remote-k3s-456_Staging.yaml
├── src/
│   ├── config/
│   │   └── index.js           # Configuration with K3s settings
│   ├── services/
│   │   ├── backup.js          # Local backup service
│   │   ├── docker.js          # Docker container service
│   │   ├── remote.js          # SSH remote PostgreSQL
│   │   ├── k3s.js             # Local K3s service
│   │   └── k3s-remote.js      # 🆕 Remote K3s via SSH
│   └── routes/
│       └── index.js           # API routes (updated)
├── public/
│   ├── index.html             # UI (updated with Remote K3s modal)
│   ├── script.js              # Frontend logic (updated)
│   └── style.css              # Styles
├── .env                       # Environment configuration
├── K3S_SETUP.md              # K3s setup guide
├── REMOTE_K3S_GUIDE.md       # 🆕 Remote K3s guide
└── SETUP_SUMMARY.md          # 🆕 This file
```

## Next Steps

1. **Start the application**:
   ```bash
   npm start
   ```

2. **Open browser**: http://localhost:8081

3. **Go to K3s tab**: Click "☸️ K3s/Kubernetes"

4. **Add your remote K3s cluster**: Click "🔗 Add Remote K3s"

5. **Follow the guide**: See REMOTE_K3S_GUIDE.md for detailed instructions

## Troubleshooting

If you encounter issues, check:

1. **SSH access works**:
   ```bash
   ssh root@172.21.51.25
   ```

2. **K3s is running on remote server**:
   ```bash
   sudo systemctl status k3s
   ```

3. **Firewall allows port 6443**:
   ```bash
   sudo ufw allow 6443/tcp
   ```

4. **Check application logs** in the terminal

5. **Read REMOTE_K3S_GUIDE.md** for detailed troubleshooting

## Security Notes

- SSH credentials are stored in memory only (not persisted)
- Kubeconfig files are saved locally in `./kubeconfigs/`
- Add `kubeconfigs/` to `.gitignore` to avoid committing secrets
- Consider using SSH keys instead of passwords for production

## Support

For help:
- Check the guides: `K3S_SETUP.md` and `REMOTE_K3S_GUIDE.md`
- Review error messages in browser console and terminal
- Verify SSH and network connectivity
- Test kubectl commands manually
