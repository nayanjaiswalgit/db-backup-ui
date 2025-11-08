import { execFile } from "child_process";
import { promisify } from "util";
import { spawn } from "child_process";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { BACKUP_DIR, BACKUP_EXTENSION, DEFAULT_DB_USER, KUBECONFIG, K3S_CONTEXT } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { assertValidDbName, createError } from "../utils/validation.js";

const execFileAsync = promisify(execFile);

const k3sServers = new Map();

async function kubectlCommand(args, options = {}) {
  try {
    const env = { ...process.env };

    // Set KUBECONFIG if configured
    if (KUBECONFIG) {
      env.KUBECONFIG = KUBECONFIG;
      logger.debug(`Using KUBECONFIG: ${KUBECONFIG}`);
    }

    // Add context flag if specified
    if (K3S_CONTEXT && !args.includes("--context")) {
      args = ["--context", K3S_CONTEXT, ...args];
    }

    return await execFileAsync("kubectl", args, {
      maxBuffer: 10 * 1024 * 1024,
      env,
      ...options,
    });
  } catch (error) {
    logger.error(`kubectl command failed: kubectl ${args.join(" ")}`, {
      error: error.message,
    });
    throw error;
  }
}

export async function isKubectlAvailable() {
  try {
    await kubectlCommand(["version", "--client", "--short"]);
    return true;
  } catch {
    return false;
  }
}

export async function listK3sNamespaces() {
  try {
    const { stdout } = await kubectlCommand(["get", "namespaces", "-o", "jsonpath={.items[*].metadata.name}"]);
    const namespaces = stdout.trim().split(/\s+/).filter(Boolean);
    logger.info(`Found ${namespaces.length} namespaces`);
    return namespaces;
  } catch (error) {
    logger.error("Failed to list namespaces", { error: error.message });
    throw createError("Failed to list K3s namespaces", 500);
  }
}

export async function discoverPostgresPods(namespace = "default") {
  try {
    // Find pods with postgres in the name or label
    const { stdout } = await kubectlCommand([
      "get",
      "pods",
      "-n",
      namespace,
      "-o",
      "json",
    ]);

    const data = JSON.parse(stdout);
    const postgresPods = [];

    for (const pod of data.items || []) {
      const podName = pod.metadata.name;
      const labels = pod.metadata.labels || {};
      const containers = pod.spec.containers || [];

      // Check if it's a postgres pod
      const isPostgres =
        podName.toLowerCase().includes("postgres") ||
        podName.toLowerCase().includes("postgresql") ||
        labels.app === "postgres" ||
        labels.app === "postgresql" ||
        containers.some(c => c.image?.includes("postgres"));

      if (isPostgres) {
        const status = pod.status.phase || "Unknown";
        const containerName = containers.find(c => c.image?.includes("postgres"))?.name || containers[0]?.name;

        postgresPods.push({
          name: podName,
          namespace,
          status,
          containerName,
          labels,
          isRunning: status === "Running",
        });
      }
    }

    logger.info(`Found ${postgresPods.length} PostgreSQL pods in namespace: ${namespace}`);
    return postgresPods;
  } catch (error) {
    logger.error(`Failed to discover PostgreSQL pods in ${namespace}`, { error: error.message });
    throw createError(`Failed to discover PostgreSQL pods: ${error.message}`, 500);
  }
}

export async function discoverPostgresServices(namespace = "default") {
  try {
    const { stdout } = await kubectlCommand([
      "get",
      "services",
      "-n",
      namespace,
      "-o",
      "json",
    ]);

    const data = JSON.parse(stdout);
    const postgresServices = [];

    for (const svc of data.items || []) {
      const svcName = svc.metadata.name;
      const labels = svc.metadata.labels || {};
      const ports = svc.spec.ports || [];

      const isPostgres =
        svcName.toLowerCase().includes("postgres") ||
        svcName.toLowerCase().includes("postgresql") ||
        labels.app === "postgres" ||
        labels.app === "postgresql" ||
        ports.some(p => p.port === 5432);

      if (isPostgres) {
        const port = ports.find(p => p.port === 5432)?.port || ports[0]?.port || 5432;

        postgresServices.push({
          name: svcName,
          namespace,
          port,
          type: svc.spec.type,
          clusterIP: svc.spec.clusterIP,
        });
      }
    }

    logger.info(`Found ${postgresServices.length} PostgreSQL services in namespace: ${namespace}`);
    return postgresServices;
  } catch (error) {
    logger.error(`Failed to discover PostgreSQL services in ${namespace}`, { error: error.message });
    return [];
  }
}

export function addK3sServer(config) {
  const { id, name, namespace, podName, containerName, password } = config;

  if (!id || !name || !namespace || !podName) {
    throw createError("Missing required K3s configuration", 400);
  }

  k3sServers.set(id, {
    id,
    name,
    namespace,
    podName,
    containerName: containerName || null,
    password: password || null,
    type: "k3s",
  });

  logger.info(`Added K3s server: ${name} (${namespace}/${podName})`);
  return { id, name };
}

export function getK3sServer(id) {
  return k3sServers.get(id);
}

export function listK3sServers() {
  return Array.from(k3sServers.values()).map(s => ({
    id: s.id,
    name: s.name,
    namespace: s.namespace,
    podName: s.podName,
    type: s.type,
  }));
}

export function removeK3sServer(id) {
  const deleted = k3sServers.delete(id);
  if (deleted) {
    logger.info(`Removed K3s server: ${id}`);
  }
  return deleted;
}

export async function listK3sDatabases(serverId) {
  const server = getK3sServer(serverId);
  if (!server) {
    throw createError("K3s server not found", 404);
  }

  const args = [
    "exec",
    "-n",
    server.namespace,
    server.podName,
  ];

  if (server.containerName) {
    args.push("-c", server.containerName);
  }

  args.push("--", "psql", "-U", DEFAULT_DB_USER, "-d", "postgres", "-t", "-c");
  args.push("SELECT datname FROM pg_database WHERE datistemplate = false;");

  if (server.password) {
    args.splice(args.indexOf("--") + 1, 0, "bash", "-c");
    args[args.length - 1] = `PGPASSWORD="${server.password}" psql -U ${DEFAULT_DB_USER} -d postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;"`;
  }

  try {
    const { stdout } = await kubectlCommand(args);
    const databases = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    logger.info(`Found ${databases.length} databases in ${server.name}`);
    return databases;
  } catch (error) {
    logger.error(`Failed to list databases on ${server.name}`, { error: error.message });
    throw error;
  }
}

export async function createK3sBackup(serverId, dbName) {
  const server = getK3sServer(serverId);
  if (!server) {
    throw createError("K3s server not found", 404);
  }

  const validatedDbName = assertValidDbName(dbName, false) || "postgres";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileSafeDb = validatedDbName.replace(/[^A-Za-z0-9_-]/g, "_");
  const fileName = `backup_k3s_${server.name}_${fileSafeDb}_${timestamp}${BACKUP_EXTENSION}`;
  const localPath = path.join(BACKUP_DIR, fileName);

  logger.info(`Creating K3s backup: ${server.namespace}/${server.podName}/${validatedDbName}`);

  return new Promise((resolve, reject) => {
    const args = [];

    // Add context if specified
    if (K3S_CONTEXT) {
      args.push("--context", K3S_CONTEXT);
    }

    args.push(
      "exec",
      "-n",
      server.namespace,
      server.podName
    );

    if (server.containerName) {
      args.push("-c", server.containerName);
    }

    args.push("-i", "--");

    if (server.password) {
      args.push("bash", "-c", `PGPASSWORD="${server.password}" pg_dump -U ${DEFAULT_DB_USER} -d ${validatedDbName} -Fc`);
    } else {
      args.push("pg_dump", "-U", DEFAULT_DB_USER, "-d", validatedDbName, "-Fc");
    }

    const env = { ...process.env };
    if (KUBECONFIG) {
      env.KUBECONFIG = KUBECONFIG;
    }

    const kubectlProcess = spawn("kubectl", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    const fileStream = fs.createWriteStream(localPath);
    kubectlProcess.stdout.pipe(fileStream);

    let stderrData = "";
    kubectlProcess.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    kubectlProcess.on("close", async (code) => {
      if (code !== 0) {
        await fsPromises.unlink(localPath).catch(() => {});
        return reject(createError(`pg_dump failed: ${stderrData}`, 500));
      }

      try {
        const stats = await fsPromises.stat(localPath);
        const metadata = {
          database: validatedDbName,
          server: server.name,
          serverId: server.id,
          namespace: server.namespace,
          podName: server.podName,
          createdAt: new Date().toISOString(),
          size: stats.size,
          type: "k3s",
        };

        const metadataPath = path.join(BACKUP_DIR, `${fileName}.json`);
        await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

        logger.success(`K3s backup created: ${fileName} (${stats.size} bytes)`);
        resolve({
          name: fileName,
          database: validatedDbName,
          server: server.name,
          size: stats.size,
          createdAt: metadata.createdAt,
        });
      } catch (error) {
        await fsPromises.unlink(localPath).catch(() => {});
        reject(error);
      }
    });

    kubectlProcess.on("error", (error) => {
      reject(createError(`kubectl exec failed: ${error.message}`, 500));
    });

    fileStream.on("error", (error) => {
      kubectlProcess.kill();
      reject(error);
    });
  });
}

export async function restoreK3sBackup(serverId, backupName, targetDbName) {
  const server = getK3sServer(serverId);
  if (!server) {
    throw createError("K3s server not found", 404);
  }

  const safeName = path.basename(backupName);
  const localPath = path.join(BACKUP_DIR, safeName);

  let stats;
  try {
    stats = await fsPromises.stat(localPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createError("Backup not found.", 404);
    }
    throw error;
  }

  if (!stats.isFile() || stats.size === 0) {
    throw createError("Invalid backup file.", 400);
  }

  const metadataPath = path.join(BACKUP_DIR, `${safeName}.json`);
  let metadata = null;
  try {
    const data = await fsPromises.readFile(metadataPath, "utf8");
    metadata = JSON.parse(data);
  } catch {
    // Metadata not found, continue anyway
  }

  const dbToRestore = assertValidDbName(targetDbName, false) || metadata?.database || "postgres";

  logger.info(`Restoring K3s backup ${backupName} to ${server.namespace}/${server.podName}/${dbToRestore}`);

  return new Promise((resolve, reject) => {
    const args = [];

    // Add context if specified
    if (K3S_CONTEXT) {
      args.push("--context", K3S_CONTEXT);
    }

    args.push(
      "exec",
      "-n",
      server.namespace,
      server.podName
    );

    if (server.containerName) {
      args.push("-c", server.containerName);
    }

    args.push("-i", "--");

    if (server.password) {
      args.push(
        "bash",
        "-c",
        `PGPASSWORD="${server.password}" pg_restore -U ${DEFAULT_DB_USER} -d ${dbToRestore} --clean --if-exists --no-owner --no-acl --verbose`
      );
    } else {
      args.push(
        "pg_restore",
        "-U",
        DEFAULT_DB_USER,
        "-d",
        dbToRestore,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--verbose"
      );
    }

    const env = { ...process.env };
    if (KUBECONFIG) {
      env.KUBECONFIG = KUBECONFIG;
    }

    const kubectlProcess = spawn("kubectl", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    const fileStream = fs.createReadStream(localPath);
    fileStream.pipe(kubectlProcess.stdin);

    let stderrData = "";
    kubectlProcess.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    kubectlProcess.on("close", (code) => {
      if (code !== 0) {
        logger.warn(`pg_restore completed with warnings for ${backupName}`);
      }

      logger.success(`K3s backup restored: ${backupName} to ${server.name}/${dbToRestore}`);
      resolve({ database: dbToRestore, server: server.name, backup: backupName });
    });

    kubectlProcess.on("error", (error) => {
      reject(createError(`kubectl exec failed: ${error.message}`, 500));
    });

    fileStream.on("error", (error) => {
      kubectlProcess.kill();
      reject(error);
    });
  });
}
