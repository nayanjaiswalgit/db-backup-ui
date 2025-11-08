import { Client } from "ssh2";
import { spawn } from "child_process";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { finished } from "stream/promises";
import { BACKUP_DIR, BACKUP_EXTENSION, DEFAULT_DB_USER } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { assertValidDbName, createError } from "../utils/validation.js";

const remoteServers = new Map();

export function addRemoteServer(config) {
  const { id, name, host, port, username, password, privateKey, database, pgPort } = config;

  if (!id || !name || !host || !username) {
    throw createError("Missing required server configuration", 400);
  }

  remoteServers.set(id, {
    id,
    name,
    host,
    port: port || 22,
    username,
    password,
    privateKey,
    database: database || "postgres",
    pgPort: pgPort || 5432,
  });

  logger.info(`Added remote server: ${name} (${host})`);
  return { id, name };
}

export function getRemoteServer(id) {
  return remoteServers.get(id);
}

export function listRemoteServers() {
  return Array.from(remoteServers.values()).map(s => ({
    id: s.id,
    name: s.name,
    host: s.host,
    port: s.port,
    database: s.database,
    pgPort: s.pgPort,
  }));
}

export function removeRemoteServer(id) {
  const deleted = remoteServers.delete(id);
  if (deleted) {
    logger.info(`Removed remote server: ${id}`);
  }
  return deleted;
}

async function executeRemoteCommand(serverConfig, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        stream.on("close", (code, signal) => {
          conn.end();
          if (code === 0) {
            resolve({ stdout, stderr, code });
          } else {
            reject(createError(`Command failed with code ${code}: ${stderr}`, 500));
          }
        });

        stream.on("data", (data) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      });
    });

    conn.on("error", (err) => {
      reject(createError(`SSH connection failed: ${err.message}`, 500));
    });

    const connectConfig = {
      host: serverConfig.host,
      port: serverConfig.port,
      username: serverConfig.username,
    };

    if (serverConfig.password) {
      connectConfig.password = serverConfig.password;
    } else if (serverConfig.privateKey) {
      connectConfig.privateKey = serverConfig.privateKey;
    }

    conn.connect(connectConfig);
  });
}

export async function listRemoteDatabases(serverId) {
  const server = getRemoteServer(serverId);
  if (!server) {
    throw createError("Remote server not found", 404);
  }

  const command = `PGPASSWORD="${server.password || ''}" psql -h localhost -p ${server.pgPort} -U ${DEFAULT_DB_USER} -d ${server.database} -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;"`;

  try {
    const { stdout } = await executeRemoteCommand(server, command);
    const databases = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    logger.info(`Found ${databases.length} databases on remote server ${server.name}`);
    return databases;
  } catch (error) {
    logger.error(`Failed to list remote databases on ${server.name}`, { error: error.message });
    throw error;
  }
}

export async function createRemoteBackup(serverId, dbName) {
  const server = getRemoteServer(serverId);
  if (!server) {
    throw createError("Remote server not found", 404);
  }

  const validatedDbName = assertValidDbName(dbName, false) || server.database;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileSafeDb = validatedDbName.replace(/[^A-Za-z0-9_-]/g, "_");
  const fileName = `backup_remote_${server.name}_${fileSafeDb}_${timestamp}${BACKUP_EXTENSION}`;
  const localPath = path.join(BACKUP_DIR, fileName);

  logger.info(`Creating remote backup: ${server.name}/${validatedDbName}`);

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      const command = `PGPASSWORD="${server.password || ''}" pg_dump -h localhost -p ${server.pgPort} -U ${DEFAULT_DB_USER} -d ${validatedDbName} -Fc`;

      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        const fileStream = fs.createWriteStream(localPath);
        stream.pipe(fileStream);

        let stderrData = "";
        stream.stderr.on("data", (data) => {
          stderrData += data.toString();
        });

        stream.on("close", async (code) => {
          conn.end();

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
              host: server.host,
              createdAt: new Date().toISOString(),
              size: stats.size,
              type: "remote",
            };

            const metadataPath = path.join(BACKUP_DIR, `${fileName}.json`);
            await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

            logger.success(`Remote backup created: ${fileName} (${stats.size} bytes)`);
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

        fileStream.on("error", (error) => {
          conn.end();
          reject(error);
        });
      });
    });

    conn.on("error", (err) => {
      reject(createError(`SSH connection failed: ${err.message}`, 500));
    });

    const connectConfig = {
      host: server.host,
      port: server.port,
      username: server.username,
    };

    if (server.password) {
      connectConfig.password = server.password;
    } else if (server.privateKey) {
      connectConfig.privateKey = server.privateKey;
    }

    conn.connect(connectConfig);
  });
}

export async function restoreRemoteBackup(serverId, backupName, targetDbName) {
  const server = getRemoteServer(serverId);
  if (!server) {
    throw createError("Remote server not found", 404);
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

  const dbToRestore = assertValidDbName(targetDbName, false) || metadata?.database || server.database;

  logger.info(`Restoring remote backup ${backupName} to ${server.name}/${dbToRestore}`);

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      const command = `PGPASSWORD="${server.password || ''}" pg_restore -h localhost -p ${server.pgPort} -U ${DEFAULT_DB_USER} -d ${dbToRestore} --clean --if-exists --no-owner --no-acl --verbose`;

      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        const fileStream = fs.createReadStream(localPath);
        fileStream.pipe(stream.stdin);

        let stderrData = "";
        stream.stderr.on("data", (data) => {
          stderrData += data.toString();
        });

        stream.on("close", (code) => {
          conn.end();

          if (code !== 0) {
            logger.warn(`pg_restore completed with warnings for ${backupName}`);
          }

          logger.success(`Remote backup restored: ${backupName} to ${server.name}/${dbToRestore}`);
          resolve({ database: dbToRestore, server: server.name, backup: backupName });
        });

        stream.on("error", (error) => {
          conn.end();
          reject(createError(`Restore failed: ${error.message}`, 500));
        });

        fileStream.on("error", (error) => {
          conn.end();
          reject(error);
        });
      });
    });

    conn.on("error", (err) => {
      reject(createError(`SSH connection failed: ${err.message}`, 500));
    });

    const connectConfig = {
      host: server.host,
      port: server.port,
      username: server.username,
    };

    if (server.password) {
      connectConfig.password = server.password;
    } else if (server.privateKey) {
      connectConfig.privateKey = server.privateKey;
    }

    conn.connect(connectConfig);
  });
}
