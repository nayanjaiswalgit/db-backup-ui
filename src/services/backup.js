import { spawn } from "child_process";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { finished } from "stream/promises";
import { BACKUP_DIR, BACKUP_EXTENSION, DEFAULT_DB_NAME, DEFAULT_DB_USER, MAX_BACKUP_AGE_DAYS } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { isOlderThanDays } from "../utils/helpers.js";
import { assertValidDbName, createError } from "../utils/validation.js";
import { buildDockerExecArgs, getContainerPassword } from "./docker.js";

fs.mkdirSync(BACKUP_DIR, { recursive: true });

async function readBackupMetadata(fileName) {
  const metadataPath = path.join(BACKUP_DIR, `${fileName}.json`);
  try {
    const data = await fsPromises.readFile(metadataPath, "utf8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function writeBackupMetadata(fileName, metadata) {
  const metadataPath = path.join(BACKUP_DIR, `${fileName}.json`);
  await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  logger.debug(`Metadata written for backup: ${fileName}`);
}

async function removeBackupMetadata(fileName) {
  const metadataPath = path.join(BACKUP_DIR, `${fileName}.json`);
  try {
    await fsPromises.unlink(metadataPath);
    logger.debug(`Metadata removed for backup: ${fileName}`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function ensureBackupIsValid(name) {
  if (!name) {
    throw createError("Backup name is required.", 400);
  }
  const safeName = path.basename(name);
  const filePath = path.join(BACKUP_DIR, safeName);

  let stats;
  try {
    stats = await fsPromises.stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createError("Backup not found.", 404);
    }
    throw error;
  }

  if (!stats.isFile()) {
    throw createError("Backup path is invalid.", 400);
  }
  if (stats.size === 0) {
    throw createError("Backup file is empty and cannot be used.", 422);
  }

  const metadata = await readBackupMetadata(safeName);
  return { filePath, stats, metadata };
}

export async function listBackups() {
  const entries = await fsPromises.readdir(BACKUP_DIR);
  const dumps = await Promise.all(
    entries
      .filter((name) => name.endsWith(BACKUP_EXTENSION))
      .map(async (name) => {
        const safeName = path.basename(name);
        const stats = await fsPromises.stat(path.join(BACKUP_DIR, safeName));
        const metadata = await readBackupMetadata(safeName);
        return {
          name: safeName,
          time: stats.mtime,
          size: stats.size,
          database: metadata?.database || DEFAULT_DB_NAME,
          createdAt: metadata?.createdAt || stats.mtime,
        };
      })
  );
  dumps.sort((a, b) => new Date(b.time) - new Date(a.time));
  logger.info(`Listed ${dumps.length} backups`);
  return dumps;
}

export async function createBackup(container, dbName) {
  const password = getContainerPassword(container);
  const validatedDbName = assertValidDbName(dbName, false) || DEFAULT_DB_NAME;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileSafeDb = validatedDbName.replace(/[^A-Za-z0-9_-]/g, "_");
  const fileName = `backup_${fileSafeDb}_${timestamp}${BACKUP_EXTENSION}`;
  const filePath = path.join(BACKUP_DIR, fileName);

  logger.info(`Creating backup for database: ${validatedDbName}`);

  const dumpArgs = buildDockerExecArgs(
    container,
    password,
    ["pg_dump", "-U", DEFAULT_DB_USER, "-d", validatedDbName, "-Fc"],
    { interactive: true }
  );

  const dockerProcess = spawn("docker", dumpArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const fileStream = fs.createWriteStream(filePath);
  dockerProcess.stdout.pipe(fileStream);

  let stderrData = "";
  dockerProcess.stderr.on("data", (chunk) => {
    stderrData += chunk.toString();
  });

  try {
    await finished(fileStream);
    const exitCode = await new Promise((resolve, reject) => {
      dockerProcess.on("exit", resolve);
      dockerProcess.on("error", reject);
    });

    if (exitCode !== 0) {
      await fsPromises.unlink(filePath).catch(() => {});
      throw createError(`pg_dump failed: ${stderrData}`, 500);
    }

    const stats = await fsPromises.stat(filePath);
    const metadata = {
      database: validatedDbName,
      container,
      createdAt: new Date().toISOString(),
      size: stats.size,
    };

    await writeBackupMetadata(fileName, metadata);
    logger.success(`Backup created: ${fileName} (${stats.size} bytes)`);

    return {
      name: fileName,
      database: validatedDbName,
      size: stats.size,
      createdAt: metadata.createdAt,
    };
  } catch (error) {
    await fsPromises.unlink(filePath).catch(() => {});
    logger.error(`Backup creation failed: ${validatedDbName}`, { error: error.message });
    throw error;
  }
}

export async function restoreBackup(container, backupName, targetDbName) {
  const password = getContainerPassword(container);
  const { filePath, metadata } = await ensureBackupIsValid(backupName);
  const dbToRestore = assertValidDbName(targetDbName, false) || metadata?.database || DEFAULT_DB_NAME;

  logger.info(`Restoring backup ${backupName} to database: ${dbToRestore}`);

  const restoreArgs = buildDockerExecArgs(
    container,
    password,
    [
      "pg_restore",
      "-U",
      DEFAULT_DB_USER,
      "-d",
      dbToRestore,
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--verbose",
    ],
    { interactive: true }
  );

  const dockerProcess = spawn("docker", restoreArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(dockerProcess.stdin);

  let stderrData = "";
  dockerProcess.stderr.on("data", (chunk) => {
    stderrData += chunk.toString();
  });

  try {
    const exitCode = await new Promise((resolve, reject) => {
      dockerProcess.on("exit", resolve);
      dockerProcess.on("error", reject);
    });

    if (exitCode !== 0) {
      logger.warn(`pg_restore completed with warnings/errors for ${backupName}`);
    }

    logger.success(`Backup restored: ${backupName} to ${dbToRestore}`);
    return { database: dbToRestore, backup: backupName };
  } catch (error) {
    logger.error(`Restore failed: ${backupName}`, { error: error.message });
    throw createError(`Restore failed: ${error.message}`, 500);
  }
}

export async function deleteBackup(backupName) {
  const safeName = path.basename(backupName);
  const filePath = path.join(BACKUP_DIR, safeName);

  logger.info(`Deleting backup: ${backupName}`);

  try {
    await fsPromises.unlink(filePath);
    await removeBackupMetadata(safeName);
    logger.success(`Backup deleted: ${backupName}`);
    return { deleted: safeName };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createError("Backup not found.", 404);
    }
    logger.error(`Failed to delete backup: ${backupName}`, { error: error.message });
    throw error;
  }
}

export async function cleanupOldBackups(maxAgeDays = MAX_BACKUP_AGE_DAYS) {
  const backups = await listBackups();
  const oldBackups = backups.filter((backup) => isOlderThanDays(backup.createdAt, maxAgeDays));

  if (oldBackups.length === 0) {
    logger.info("No old backups to clean up");
    return { deleted: 0, backups: [] };
  }

  logger.info(`Cleaning up ${oldBackups.length} old backups (older than ${maxAgeDays} days)`);

  const deleted = [];
  for (const backup of oldBackups) {
    try {
      await deleteBackup(backup.name);
      deleted.push(backup.name);
    } catch (error) {
      logger.error(`Failed to delete old backup: ${backup.name}`, { error: error.message });
    }
  }

  logger.success(`Cleanup completed: ${deleted.length} backups deleted`);
  return { deleted: deleted.length, backups: deleted };
}
