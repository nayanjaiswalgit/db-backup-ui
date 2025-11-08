# K3s Remote Cluster Configuration Guide

This guide explains how to configure the PostgreSQL Backup UI to connect to remote K3s clusters.

## Overview

The application can connect to one or multiple remote K3s clusters to manage PostgreSQL backups and restores running in Kubernetes pods.

## Prerequisites

1. **kubectl installed**: Ensure `kubectl` is installed on the machine running this application
2. **kubeconfig files**: Obtain kubeconfig files for your remote K3s clusters
3. **Network access**: Ensure the application server can reach the K3s API server

## Configuration Steps

### Step 1: Obtain Kubeconfig from Remote K3s Server

On your remote K3s server, locate the kubeconfig file:

```bash
# Default location on K3s server
sudo cat /etc/rancher/k3s/k3s.yaml
```

Copy this file to your local machine where the backup UI is running.

### Step 2: Update Kubeconfig Server Address

Edit the copied kubeconfig file and change the server address from `127.0.0.1` to your remote server's IP or hostname:

```yaml
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ...
    server: https://YOUR_REMOTE_SERVER_IP:6443  # Change this line
  name: default
```

### Step 3: Create Kubeconfigs Directory

Create a directory to store your kubeconfig files:

```bash
mkdir -p kubeconfigs
```

Save your kubeconfig file(s) in this directory. For example:
- `kubeconfigs/config` (single cluster)
- `kubeconfigs/cluster1.yaml`, `kubeconfigs/cluster2.yaml` (multiple clusters)

### Step 4: Configure Environment Variables

Edit the `.env` file:

#### For a Single Cluster:

```env
KUBECONFIG=./kubeconfigs/config
```

#### For Multiple Clusters:

```env
# Separate multiple kubeconfig files with colons (:)
KUBECONFIG=./kubeconfigs/cluster1.yaml:./kubeconfigs/cluster2.yaml:./kubeconfigs/cluster3.yaml
```

#### Optional: Set Default Context

If you have multiple contexts in your kubeconfig and want to specify a default:

```env
K3S_CONTEXT=my-cluster-context
```

## Testing the Connection

1. Start the application:
```bash
npm start
```

2. Test kubectl connectivity:
```bash
kubectl get nodes
kubectl get namespaces
```

3. Open the web UI at `http://localhost:8081`

4. Navigate to the K3s section and:
   - Click "Discover K3s Resources"
   - Select a namespace
   - View discovered PostgreSQL pods

## Managing Multiple Clusters

### Switching Between Clusters

You can specify which cluster to use in several ways:

1. **Set default context in .env**:
```env
K3S_CONTEXT=cluster1-context
```

2. **Use kubectl to switch context**:
```bash
kubectl config use-context cluster2-context
```

3. **View available contexts**:
```bash
kubectl config get-contexts
```

### Context Naming

Each kubeconfig typically contains a context name. You can view and manage contexts:

```bash
# List all contexts
kubectl config get-contexts

# Switch context
kubectl config use-context my-context

# View current context
kubectl config current-context
```

## Common Issues and Solutions

### Issue: "Unable to connect to the server"

**Solution**: Check that:
- The remote K3s server IP/hostname is correct in kubeconfig
- The K3s server is running: `sudo systemctl status k3s`
- Network connectivity: `ping YOUR_SERVER_IP`
- Firewall allows port 6443: `sudo ufw allow 6443/tcp`

### Issue: "x509: certificate is valid for 127.0.0.1, not YOUR_IP"

**Solution**: Either:
1. Regenerate K3s certificates with your server's IP
2. Use `--insecure-skip-tls-verify=true` (not recommended for production)

### Issue: "Permission denied"

**Solution**: Ensure the kubeconfig file has proper permissions:
```bash
chmod 600 kubeconfigs/config
```

## Security Best Practices

1. **Restrict kubeconfig access**: Store kubeconfig files with restricted permissions (600)
2. **Use RBAC**: Create service accounts with limited permissions instead of using admin credentials
3. **Network security**: Use VPN or SSH tunnels for accessing remote clusters
4. **Rotate credentials**: Regularly rotate certificates and tokens

## Example: Complete Setup for Remote K3s

1. On remote K3s server (`192.168.1.100`):
```bash
sudo cat /etc/rancher/k3s/k3s.yaml > k3s-config.yaml
```

2. On your local machine:
```bash
# Copy kubeconfig
scp user@192.168.1.100:~/k3s-config.yaml ./kubeconfigs/production.yaml

# Edit the server address
sed -i 's/127.0.0.1/192.168.1.100/g' ./kubeconfigs/production.yaml
```

3. Update `.env`:
```env
KUBECONFIG=./kubeconfigs/production.yaml
PORT=8081
BACKUP_DIR=./backups
```

4. Start the application:
```bash
npm start
```

## Advanced Configuration

### Using SSH Tunneling

For added security, you can use SSH tunneling:

```bash
# Create SSH tunnel to K3s server
ssh -L 6443:localhost:6443 user@remote-k3s-server -N

# In .env, keep server as localhost
# The tunnel will forward to the remote server
```

### Service Account with Limited Permissions

Create a dedicated service account for backups:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: postgres-backup
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: default
  name: postgres-backup-role
rules:
- apiGroups: [""]
  resources: ["pods", "pods/exec"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: postgres-backup-binding
  namespace: default
subjects:
- kind: ServiceAccount
  name: postgres-backup
roleRef:
  kind: Role
  name: postgres-backup-role
  apiGroup: rbac.authorization.k8s.io
```

## Support

For issues or questions, please check the application logs and kubectl output for detailed error messages.
