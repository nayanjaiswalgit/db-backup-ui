import express from "express";
import { execFile, spawn } from "child_process";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { promisify } from "util";
import { finished } from "stream/promises";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);

const app = express();
const PORT = Number(process.env.PORT || 8080);
const DEFAULT_DB_NAME = process.env.PG_DB || "postgres";
const DEFAULT_DB_USER = process.env.PG_USER || "postgres";
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "./backups");
const BACKUP_EXTENSION = ".dump";
const PG_IMAGE = process.env.PG_IMAGE || "postgres:16-alpine";
const WAIT_TIMEOUT_MS = Number(process.env.PG_WAIT_TIMEOUT_MS || 30000);
const DB_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

let currentContainer = process.env.PG_CONTAINER || null;
const containerPasswords = new Map();
if (currentContainer && process.env.PG_PASSWORD) {
  containerPasswords.set(currentContainer, process.env.PG_PASSWORD);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

app.use(express.json());
app.use(express.static("public"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setCurrentContainer(name) {
  currentContainer = name;
}

function setContainerPassword(name, password) {
  if (name && password) {
    containerPasswords.set(name, password);
  }
}

function getContainerPassword(name) {
  if (!name) return null;
  return containerPasswords.get(name) || null;
}

function assertValidDbName(value, required = true) {
  if (!value) {
    if (!required) return null;
    const error = new Error("Database name is required.");
    error.statusCode = 400;
    throw error;
  }
  if (typeof value !== "string") {
    const error = new Error("Database name must be a string.");
    error.statusCode = 400;
    throw error;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    const error = new Error("Database name cannot be empty.");
    error.statusCode = 400;
    throw error;
  }
  if (!DB_NAME_PATTERN.test(trimmed)) {
    const error = new Error(
      "Invalid database name. Use letters, numbers, underscores or hyphens."
    );
    error.statusCode = 400;
    throw error;
  }
  return trimmed;
}

async function dockerCommand(args, options = {}) {
  return execFileAsync("docker", args, {
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

async function isDockerAvailable() {
  try {
    await dockerCommand(["version", "--format", "{{.Server.Version}}"]);
    return true;
  } catch {
    return false;
  }
}

async function getContainerInfo(name) {
  try {
    const { stdout } = await dockerCommand(["inspect", "-f", "{{json .}}", name]);
    const info = JSON.parse(stdout.trim());
    const status = info?.State?.Status ?? "unknown";
    const portBinding = info?.NetworkSettings?.Ports?.["5432/tcp"];
    const hostPort =
      Array.isArray(portBinding) && portBinding.length > 0 ? portBinding[0].HostPort : null;
    const image = info?.Config?.Image ?? null;
    return {
      exists: true,
      status: status === "running" ? "running" : status === "exited" ? "stopped" : status,
      port: hostPort,
      image,
    };
  } catch (error) {
    const output = [error?.stderr, error?.stdout, error?.message].filter(Boolean).join(" ");
    if (error?.code === 1 && /No such (container|object)/i.test(output)) {
      return { exists: false };
    }
    throw error;
  }
}

function buildDockerExecArgs(container, password, commandArgs, { interactive = false } = {}) {
  const args = ["exec"];
  if (interactive) {
    args.push("-i");
  }
  if (password) {
    args.push("-e", `PGPASSWORD=${password}`);
  }
  args.push(container, ...commandArgs);
  return args;
}

async function detectContainer(preferredName = currentContainer) {
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    setCurrentContainer(null);
    return {
      status: "no-docker",
      container: null,
      port: null,
      image: null,
      message: "Docker is unavailable. Ensure Docker Desktop is running.",
    };
  }

  const candidateNames = new Set();
  if (preferredName) {
    candidateNames.add(preferredName);
  }
  if (process.env.PG_CONTAINER) {
    candidateNames.add(process.env.PG_CONTAINER);
  }

  const { stdout } = await dockerCommand([
    "ps",
    "--filter",
    "ancestor=postgres",
    "--format",
    "{{.Names}}",
  ]);
  stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((name) => candidateNames.add(name));

  for (const name of candidateNames) {
    const info = await getContainerInfo(name);
    if (!info.exists) continue;

    setCurrentContainer(name);
    const envPassword =
      name === process.env.PG_CONTAINER ? process.env.PG_PASSWORD || null : null;
    if (envPassword) {
      setContainerPassword(name, envPassword);
    }

    return {
      status: info.status,
      container: name,
      port: info.port,
      image: info.image,
      message:
        info.status === "running"
          ? `Using container "${name}".`
          : `Container "${name}" found but currently ${info.status}.`,
    };
  }

  setCurrentContainer(null);
  return {
    status: "not-found",
    container: null,
    port: null,
    image: null,
    message: "No Postgres containers detected. Launch one to get started.",
  };
}

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
}

async function removeBackupMetadata(fileName) {
  const metadataPath = path.join(BACKUP_DIR, `${fileName}.json`);
  try {
    await fsPromises.unlink(metadataPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function ensureBackupIsValid(name) {
  if (!name) {
    const error = new Error("Backup name is required.");
    error.statusCode = 400;
    throw error;
  }
  const safeName = path.basename(name);
  const filePath = path.join(BACKUP_DIR, safeName);
  let stats;
  try {
    stats = await fsPromises.stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      const notFound = new Error("Backup not found.");
      notFound.statusCode = 404;
      throw notFound;
    }
    throw error;
  }
  if (!stats.isFile()) {
    const invalid = new Error("Backup path is invalid.");
    invalid.statusCode = 400;
    throw invalid;
  }
  if (stats.size === 0) {
    const empty = new Error("Backup file is empty and cannot be used.");
    empty.statusCode = 422;
    throw empty;
  }
  const metadata = await readBackupMetadata(safeName);
  return { filePath, stats, metadata };
}

async function listBackups() {
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
  return dumps;
}

async function waitForContainerReady(container, password) {
  const start = Date.now();
  while (Date.now() - start < WAIT_TIMEOUT_MS) {
    try {
      const args = buildDockerExecArgs(container, password, [
        "pg_isready",
        "-U",
        DEFAULT_DB_USER,
        "-d",
        DEFAULT_DB_NAME,
      ]);
      await dockerCommand(args);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(
    `Timed out waiting for container "${container}" to accept connections.`
  );
}

async function ensureDatabaseExists(container, dbName, password) {
  const validated = assertValidDbName(dbName);
  const checkArgs = buildDockerExecArgs(container, password, [
    "psql",
    "-U",
    DEFAULT_DB_USER,
    "-d",
    DEFAULT_DB_NAME,
    "-t",
    "-A",
    "-c",
    `SELECT 1 FROM pg_database WHERE datname='${validated}'`,
  ]);
  try {
    const { stdout } = await dockerCommand(checkArgs);
    if (stdout.trim() === "1") {
      return;
    }
  } catch (error) {
    if (error?.code !== 1) {
      throw error;
    }
  }

  const createArgs = buildDockerExecArgs(container, password, [
    "createdb",
    "-U",
    DEFAULT_DB_USER,
    validated,
  ]);
  await dockerCommand(createArgs);
}

async function createBackup(container, dbName) {
  const password = getContainerPassword(container);
  const validatedDbName = assertValidDbName(dbName, false) || DEFAULT_DB_NAME;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileSafeDb = validatedDbName.replace(/[^A-Za-z0-9_-]/g, "_");
  const fileName = `backup_${fileSafeDb}_${timestamp}${BACKUP_EXTENSION}`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const dumpArgs = buildDockerExecArgs(container, password, [
    "pg_dump",
    "-U",
    DEFAULT_DB_USER,
    "-Fc",
    "--no-owner",
    "--no-privileges",
    validatedDbName,
  ]);

  const dump = spawn("docker", dumpArgs, { stdio: ["ignore", "pipe", "pipe"] });
  const fileStream = fs.createWriteStream(filePath);
  dump.stdout.pipe(fileStream);

  let stderr = "";
  dump.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await Promise.all([
      new Promise((resolve, reject) => {
        dump.on("error", (error) => {
          reject(new Error(`Failed to start backup: ${error.message}`));
        });
        dump.on("close", (code) => {
          if (code !== 0) {
            reject(
              new Error(stderr.trim() || `pg_dump exited with non-zero code (${code}).`)
            );
          } else {
            resolve();
          }
        });
      }),
      finished(fileStream),
    ]);
  } catch (error) {
    fileStream.destroy();
    await fsPromises.unlink(filePath).catch(() => {});
    throw error;
  }

  const stats = await fsPromises.stat(filePath);
  if (stats.size === 0) {
    await fsPromises.unlink(filePath).catch(() => {});
    throw new Error("Backup failed: dump file is empty.");
  }

  await writeBackupMetadata(fileName, {
    database: validatedDbName,
    createdAt: new Date().toISOString(),
    size: stats.size,
  });

  return { fileName, time: stats.mtime, size: stats.size, database: validatedDbName };
}

async function restoreBackup(container, backupName, overrideDbName) {
  const password = getContainerPassword(container);
  const { filePath, metadata } = await ensureBackupIsValid(backupName);
  const targetDbName = assertValidDbName(
    overrideDbName || metadata?.database || DEFAULT_DB_NAME
  );

  await ensureDatabaseExists(container, targetDbName, password);

  await new Promise((resolve, reject) => {
    const restoreArgs = buildDockerExecArgs(
      container,
      password,
      [
        "pg_restore",
        "-U",
        DEFAULT_DB_USER,
        "-d",
        targetDbName,
        "--clean",
        "--if-exists",
      ],
      { interactive: true }
    );
    const restore = spawn("docker", restoreArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const source = fs.createReadStream(filePath);
    let stderr = "";

    restore.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    restore.on("error", (error) => {
      reject(new Error(`Failed to start restore: ${error.message}`));
    });

    restore.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr.trim() || `pg_restore exited with non-zero code (${code}).`)
        );
      } else {
        resolve();
      }
    });

    source.on("error", (error) => {
      restore.kill("SIGTERM");
      reject(error);
    });

    source.on("end", () => {
      restore.stdin.end();
    });

    source.pipe(restore.stdin);
  });

  return targetDbName;
}

async function requireRunningContainer() {
  const info = await detectContainer();
  if (!info.container) {
    const error = new Error(
      info.status === "no-docker"
        ? "Docker is unavailable. Start Docker Desktop and try again."
        : "No Postgres container detected. Launch one first."
    );
    error.statusCode = info.status === "no-docker" ? 503 : 404;
    throw error;
  }
  if (info.status !== "running") {
    const error = new Error(
      `Container "${info.container}" is not running. Start it and retry.`
    );
    error.statusCode = 409;
    throw error;
  }
  return info;
}

async function listDatabases(container) {
  const password = getContainerPassword(container);
  const args = buildDockerExecArgs(container, password, [
    "psql",
    "-U",
    DEFAULT_DB_USER,
    "-d",
    DEFAULT_DB_NAME,
    "-t",
    "-A",
    "-F",
    ",",
    "-c",
    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
  ]);
  const { stdout } = await dockerCommand(args);
  return stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim())
    .filter(Boolean)
    .filter((name) => DB_NAME_PATTERN.test(name));
}

app.get("/api/container", async (req, res) => {
  try {
    const info = await detectContainer();
    res.json(info);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: error.message || "Failed to detect containers." });
  }
});

app.get("/api/databases", async (req, res) => {
  try {
    const info = await requireRunningContainer();
    const databases = await listDatabases(info.container);
    res.json({ databases });
  } catch (error) {
    console.error(error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to list databases." });
  }
});

app.post("/api/container", async (req, res) => {
  const { name, password, port, backupName } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "Container name is required." });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ message: "Container password is required." });
  }
  const hostPort = Number(port);
  if (!Number.isInteger(hostPort) || hostPort < 1024 || hostPort > 65535) {
    return res.status(400).json({ message: "Provide a valid host port (1024-65535)." });
  }

  let backupInfo = null;
  try {
    if (backupName) {
      backupInfo = await ensureBackupIsValid(backupName);
    }

    if (!(await isDockerAvailable())) {
      return res
        .status(503)
        .json({ message: "Docker is unavailable. Start Docker Desktop and retry." });
    }

    const info = await getContainerInfo(name);
    if (info.exists) {
      await dockerCommand(["start", name]).catch((error) => {
        if (error?.code !== 1) throw error;
        return null;
      });

      setCurrentContainer(name);
      setContainerPassword(name, password);

      try {
        await waitForContainerReady(name, password);
      } catch (error) {
        return res.status(504).json({ message: error.message });
      }

      if (backupName) {
        const restoredDb = await restoreBackup(name, backupName);
        const refreshed = await detectContainer(name);
        return res.json({
          message: `Container "${name}" is ready and has been restored into "${restoredDb}".`,
          restoredDatabase: restoredDb,
          ...refreshed,
        });
      }

      const refreshed = await detectContainer(name);
      return res.json({
        message: `Container "${name}" is ready.`,
        ...refreshed,
      });
    }

    const runArgs = [
      "run",
      "-d",
      "--name",
      name,
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-e",
      `POSTGRES_USER=${DEFAULT_DB_USER}`,
      "-e",
      `POSTGRES_DB=${DEFAULT_DB_NAME}`,
      "-p",
      `${hostPort}:5432`,
      PG_IMAGE,
    ];
    await dockerCommand(runArgs);

    setCurrentContainer(name);
    setContainerPassword(name, password);

    try {
      await waitForContainerReady(name, password);
    } catch (error) {
      return res.status(504).json({ message: error.message });
    }

    let restoredDatabase = null;
    if (backupInfo) {
      restoredDatabase = await restoreBackup(name, backupName);
    }

    const refreshed = await detectContainer(name);
    return res.json({
      message: restoredDatabase
        ? `Container "${name}" launched and restored into "${restoredDatabase}".`
        : `Container "${name}" launched successfully.`,
      restoredDatabase,
      ...refreshed,
    });
  } catch (error) {
    console.error(error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to manage container." });
  }
});

app.get("/api/backups", async (req, res) => {
  try {
    const backups = await listBackups();
    res.json(backups);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to list backups." });
  }
});

app.post("/api/backup", async (req, res) => {
  const { dbName } = req.body || {};
  try {
    const info = await requireRunningContainer();
    const backup = await createBackup(info.container, dbName);
    res.json({ success: true, file: backup.fileName, ...backup });
  } catch (error) {
    console.error(error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Backup failed." });
  }
});

app.post("/api/restore", async (req, res) => {
  const { name, dbName } = req.body || {};
  if (!name) {
    return res.status(400).json({ message: "Backup name is required." });
  }
  try {
    const info = await requireRunningContainer();
    const database = await restoreBackup(info.container, name, dbName);
    res.json({ success: true, database });
  } catch (error) {
    console.error(error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Restore failed." });
  }
});

app.delete("/api/backup/:name", async (req, res) => {
  const safeName = path.basename(req.params.name);
  const filePath = path.join(BACKUP_DIR, safeName);
  try {
    await fsPromises.unlink(filePath);
    await removeBackupMetadata(safeName);
    res.json({ success: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ message: "Backup not found." });
    }
    console.error(error);
    res.status(500).json({ message: "Failed to delete backup." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
