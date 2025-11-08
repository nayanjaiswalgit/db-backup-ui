import { execFile } from "child_process";
import { promisify } from "util";
import { PG_IMAGE, DEFAULT_DB_USER, DEFAULT_DB_NAME, WAIT_TIMEOUT_MS } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { sleep } from "../utils/helpers.js";
import { createError } from "../utils/validation.js";

const execFileAsync = promisify(execFile);

let currentContainer = process.env.PG_CONTAINER || null;
const containerPasswords = new Map();

if (currentContainer && process.env.PG_PASSWORD) {
  containerPasswords.set(currentContainer, process.env.PG_PASSWORD);
}

export function getCurrentContainer() {
  return currentContainer;
}

export function setCurrentContainer(name) {
  currentContainer = name;
  logger.info(`Current container set to: ${name || "null"}`);
}

export function getContainerPassword(name) {
  if (!name) return null;
  return containerPasswords.get(name) || null;
}

export function setContainerPassword(name, password) {
  if (name && password) {
    containerPasswords.set(name, password);
    logger.debug(`Password stored for container: ${name}`);
  }
}

export async function dockerCommand(args, options = {}) {
  try {
    return await execFileAsync("docker", args, {
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    logger.error(`Docker command failed: docker ${args.join(" ")}`, {
      error: error.message,
    });
    throw error;
  }
}

export async function isDockerAvailable() {
  try {
    await dockerCommand(["version", "--format", "{{.Server.Version}}"]);
    return true;
  } catch {
    return false;
  }
}

export async function getContainerInfo(name) {
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

export function buildDockerExecArgs(container, password, commandArgs, { interactive = false } = {}) {
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

export async function listAllPostgresContainers() {
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    return [];
  }

  try {
    // List all containers (running and stopped) with postgres image
    const { stdout: runningOutput } = await dockerCommand([
      "ps",
      "-a",
      "--filter",
      "ancestor=postgres",
      "--format",
      "{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}",
    ]);

    // Also search for containers with "postgres" in the name
    const { stdout: namedOutput } = await dockerCommand([
      "ps",
      "-a",
      "--filter",
      "name=postgres",
      "--format",
      "{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}",
    ]);

    const allLines = new Set([
      ...runningOutput.trim().split(/\r?\n/).filter(Boolean),
      ...namedOutput.trim().split(/\r?\n/).filter(Boolean),
    ]);

    const containers = [];
    for (const line of allLines) {
      const [name, image, status, ports] = line.split("|");

      // Only include actual postgres containers
      if (!image.toLowerCase().includes("postgres")) continue;

      const info = await getContainerInfo(name);
      if (info.exists) {
        containers.push({
          name,
          image: info.image || image,
          status: info.status,
          port: info.port,
          isRunning: info.status === "running",
        });
      }
    }

    logger.info(`Found ${containers.length} Postgres container(s)`);
    return containers;
  } catch (error) {
    logger.error("Failed to list Postgres containers", { error: error.message });
    return [];
  }
}

export async function detectContainer(preferredName = currentContainer) {
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    setCurrentContainer(null);
    return {
      status: "no-docker",
      container: null,
      port: null,
      image: null,
      message: "Docker is unavailable. Ensure Docker Desktop is running.",
      allContainers: [],
    };
  }

  const allContainers = await listAllPostgresContainers();

  // Priority: preferred name > env var > first running container > first container
  let selectedContainer = null;

  if (preferredName) {
    selectedContainer = allContainers.find(c => c.name === preferredName);
  }

  if (!selectedContainer && process.env.PG_CONTAINER) {
    selectedContainer = allContainers.find(c => c.name === process.env.PG_CONTAINER);
  }

  if (!selectedContainer) {
    selectedContainer = allContainers.find(c => c.isRunning);
  }

  if (!selectedContainer && allContainers.length > 0) {
    selectedContainer = allContainers[0];
  }

  if (selectedContainer) {
    setCurrentContainer(selectedContainer.name);
    const envPassword =
      selectedContainer.name === process.env.PG_CONTAINER ? process.env.PG_PASSWORD || null : null;
    if (envPassword) {
      setContainerPassword(selectedContainer.name, envPassword);
    }

    return {
      status: selectedContainer.status,
      container: selectedContainer.name,
      port: selectedContainer.port,
      image: selectedContainer.image,
      message:
        selectedContainer.status === "running"
          ? `Using container "${selectedContainer.name}".`
          : `Container "${selectedContainer.name}" found but currently ${selectedContainer.status}.`,
      allContainers,
    };
  }

  setCurrentContainer(null);
  return {
    status: "not-found",
    container: null,
    port: null,
    image: null,
    message: "No Postgres containers detected. Launch one to get started.",
    allContainers: [],
  };
}

export async function waitForContainerReady(containerName, password, timeoutMs = WAIT_TIMEOUT_MS) {
  const startTime = Date.now();
  logger.info(`Waiting for container ${containerName} to be ready...`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const args = buildDockerExecArgs(
        containerName,
        password,
        ["pg_isready", "-U", DEFAULT_DB_USER],
        { interactive: false }
      );
      await dockerCommand(args);
      logger.success(`Container ${containerName} is ready`);
      return true;
    } catch {
      await sleep(1000);
    }
  }

  throw createError(`Container ${containerName} did not become ready within ${timeoutMs}ms`, 500);
}

export async function startContainer(containerName, password, hostPort) {
  logger.info(`Starting container: ${containerName}`);

  const info = await getContainerInfo(containerName);
  if (info.exists && info.status === "running") {
    setCurrentContainer(containerName);
    setContainerPassword(containerName, password);
    await waitForContainerReady(containerName, password);
    return containerName;
  }

  if (info.exists && info.status === "stopped") {
    await dockerCommand(["start", containerName]);
    setCurrentContainer(containerName);
    setContainerPassword(containerName, password);
    await waitForContainerReady(containerName, password);
    logger.success(`Container ${containerName} started`);
    return containerName;
  }

  const runArgs = [
    "run",
    "-d",
    "--name",
    containerName,
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
  setCurrentContainer(containerName);
  setContainerPassword(containerName, password);
  await waitForContainerReady(containerName, password);
  logger.success(`Container ${containerName} created and started`);
  return containerName;
}

export async function listDatabases(containerName, password) {
  const args = buildDockerExecArgs(
    containerName,
    password,
    [
      "psql",
      "-U",
      DEFAULT_DB_USER,
      "-d",
      DEFAULT_DB_NAME,
      "-t",
      "-c",
      "SELECT datname FROM pg_database WHERE datistemplate = false;",
    ],
    { interactive: false }
  );

  const { stdout } = await dockerCommand(args);
  const databases = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  logger.info(`Found ${databases.length} databases in ${containerName}`);
  return databases;
}

export async function ensureDatabaseExists(containerName, password, dbName) {
  try {
    const checkArgs = buildDockerExecArgs(
      containerName,
      password,
      [
        "psql",
        "-U",
        DEFAULT_DB_USER,
        "-d",
        DEFAULT_DB_NAME,
        "-tAc",
        `SELECT 1 FROM pg_database WHERE datname='${dbName}'`,
      ],
      { interactive: false }
    );

    const { stdout } = await dockerCommand(checkArgs);
    if (stdout.trim() === "1") {
      logger.debug(`Database ${dbName} already exists`);
      return;
    }

    const createArgs = buildDockerExecArgs(
      containerName,
      password,
      ["psql", "-U", DEFAULT_DB_USER, "-d", DEFAULT_DB_NAME, "-c", `CREATE DATABASE "${dbName}"`],
      { interactive: false }
    );

    await dockerCommand(createArgs);
    logger.success(`Database ${dbName} created`);
  } catch (error) {
    logger.error(`Failed to ensure database exists: ${dbName}`, { error: error.message });
    throw error;
  }
}
