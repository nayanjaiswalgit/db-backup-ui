import { Client } from "ssh2";
import { promises as fsPromises } from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import { createError } from "../utils/validation.js";

const remoteK3sClusters = new Map();
const KUBECONFIG_DIR = path.resolve("./kubeconfigs");

// Ensure kubeconfigs directory exists
async function ensureKubeconfigDir() {
  try {
    await fsPromises.mkdir(KUBECONFIG_DIR, { recursive: true });
  } catch (error) {
    logger.error("Failed to create kubeconfigs directory", { error: error.message });
  }
}

/**
 * Add a remote K3s cluster configuration
 * @param {Object} config - Cluster configuration
 * @param {string} config.id - Unique identifier
 * @param {string} config.name - Cluster name
 * @param {string} config.host - Remote server IP/hostname
 * @param {number} config.port - SSH port (default 22)
 * @param {string} config.username - SSH username
 * @param {string} config.password - SSH password (optional if using privateKey)
 * @param {string} config.privateKey - SSH private key (optional)
 * @param {string} config.k3sConfigPath - Path to k3s.yaml on remote server (default /etc/rancher/k3s/k3s.yaml)
 * @param {number} config.k3sPort - K3s API port (default 6443)
 */
export function addRemoteK3sCluster(config) {
  const {
    id,
    name,
    host,
    port = 22,
    username,
    password,
    privateKey,
    k3sConfigPath = "/etc/rancher/k3s/k3s.yaml",
    k3sPort = 6443,
  } = config;

  if (!id || !name || !host || !username) {
    throw createError("Missing required remote K3s cluster configuration", 400);
  }

  if (!password && !privateKey) {
    throw createError("Either password or privateKey must be provided", 400);
  }

  remoteK3sClusters.set(id, {
    id,
    name,
    host,
    port,
    username,
    password,
    privateKey,
    k3sConfigPath,
    k3sPort,
    kubeconfigPath: null, // Will be set after fetching
  });

  logger.info(`Added remote K3s cluster: ${name} (${host})`);
  return { id, name };
}

export function getRemoteK3sCluster(id) {
  return remoteK3sClusters.get(id);
}

export function listRemoteK3sClusters() {
  return Array.from(remoteK3sClusters.values()).map(c => ({
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    k3sPort: c.k3sPort,
    kubeconfigFetched: !!c.kubeconfigPath,
  }));
}

export function removeRemoteK3sCluster(id) {
  const cluster = remoteK3sClusters.get(id);
  if (cluster && cluster.kubeconfigPath) {
    // Clean up kubeconfig file
    fsPromises.unlink(cluster.kubeconfigPath).catch(() => {});
  }

  const deleted = remoteK3sClusters.delete(id);
  if (deleted) {
    logger.info(`Removed remote K3s cluster: ${id}`);
  }
  return deleted;
}

/**
 * Fetch kubeconfig from remote K3s server via SSH
 */
export async function fetchKubeconfigFromRemote(clusterId) {
  const cluster = getRemoteK3sCluster(clusterId);
  if (!cluster) {
    throw createError("Remote K3s cluster not found", 404);
  }

  await ensureKubeconfigDir();

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let kubeconfigContent = "";

    conn.on("ready", () => {
      // Read the k3s.yaml file from remote server
      const command = `sudo cat ${cluster.k3sConfigPath}`;

      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(createError(`Failed to read kubeconfig: ${err.message}`, 500));
        }

        stream.on("close", async (code) => {
          conn.end();

          if (code !== 0) {
            return reject(createError("Failed to read kubeconfig from remote server", 500));
          }

          try {
            // Update server URL from 127.0.0.1 to actual host
            const updatedConfig = kubeconfigContent.replace(
              /https?:\/\/127\.0\.0\.1:(\d+)/g,
              `https://${cluster.host}:$1`
            ).replace(
              /https?:\/\/localhost:(\d+)/g,
              `https://${cluster.host}:$1`
            );

            // Save to local file
            const kubeconfigFileName = `${cluster.id}_${cluster.name.replace(/[^a-zA-Z0-9]/g, '_')}.yaml`;
            const kubeconfigPath = path.join(KUBECONFIG_DIR, kubeconfigFileName);

            await fsPromises.writeFile(kubeconfigPath, updatedConfig, "utf8");

            // Update cluster configuration
            cluster.kubeconfigPath = kubeconfigPath;
            remoteK3sClusters.set(clusterId, cluster);

            logger.success(`Fetched kubeconfig for ${cluster.name}: ${kubeconfigPath}`);
            resolve({
              kubeconfigPath,
              clusterName: cluster.name,
            });
          } catch (error) {
            reject(createError(`Failed to save kubeconfig: ${error.message}`, 500));
          }
        });

        stream.on("data", (data) => {
          kubeconfigContent += data.toString();
        });

        stream.stderr.on("data", (data) => {
          logger.warn(`stderr from remote: ${data.toString()}`);
        });
      });
    });

    conn.on("error", (err) => {
      reject(createError(`SSH connection failed: ${err.message}`, 500));
    });

    const connectConfig = {
      host: cluster.host,
      port: cluster.port,
      username: cluster.username,
      readyTimeout: 10000,
    };

    if (cluster.password) {
      connectConfig.password = cluster.password;
    } else if (cluster.privateKey) {
      connectConfig.privateKey = cluster.privateKey;
    }

    conn.connect(connectConfig);
  });
}

/**
 * Test SSH connection to remote K3s server
 */
export async function testRemoteK3sConnection(clusterId) {
  const cluster = getRemoteK3sCluster(clusterId);
  if (!cluster) {
    throw createError("Remote K3s cluster not found", 404);
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      // Test kubectl command
      conn.exec("kubectl version --client --short", (err, stream) => {
        if (err) {
          conn.end();
          return reject(createError("kubectl not found on remote server", 500));
        }

        let output = "";
        stream.on("data", (data) => {
          output += data.toString();
        });

        stream.on("close", (code) => {
          conn.end();
          if (code === 0) {
            resolve({ success: true, message: "Connection successful", output });
          } else {
            reject(createError("kubectl test failed", 500));
          }
        });
      });
    });

    conn.on("error", (err) => {
      reject(createError(`SSH connection failed: ${err.message}`, 500));
    });

    const connectConfig = {
      host: cluster.host,
      port: cluster.port,
      username: cluster.username,
      readyTimeout: 10000,
    };

    if (cluster.password) {
      connectConfig.password = cluster.password;
    } else if (cluster.privateKey) {
      connectConfig.privateKey = cluster.privateKey;
    }

    conn.connect(connectConfig);
  });
}

/**
 * Get the kubeconfig path for a remote cluster
 * Fetches it if not already cached
 */
export async function getRemoteKubeconfig(clusterId) {
  const cluster = getRemoteK3sCluster(clusterId);
  if (!cluster) {
    throw createError("Remote K3s cluster not found", 404);
  }

  if (cluster.kubeconfigPath) {
    // Check if file still exists
    try {
      await fsPromises.access(cluster.kubeconfigPath);
      return cluster.kubeconfigPath;
    } catch {
      // File doesn't exist, fetch again
      cluster.kubeconfigPath = null;
    }
  }

  // Fetch kubeconfig
  const result = await fetchKubeconfigFromRemote(clusterId);
  return result.kubeconfigPath;
}
