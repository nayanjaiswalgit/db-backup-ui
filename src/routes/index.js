import express from "express";
import { logger } from "../utils/logger.js";
import { assertValidDbName } from "../utils/validation.js";
import {
  detectContainer,
  startContainer,
  listDatabases,
  ensureDatabaseExists,
  getCurrentContainer,
  getContainerPassword,
} from "../services/docker.js";
import {
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  cleanupOldBackups,
} from "../services/backup.js";
import {
  addRemoteServer,
  getRemoteServer,
  listRemoteServers,
  removeRemoteServer,
  listRemoteDatabases,
  createRemoteBackup,
  restoreRemoteBackup,
} from "../services/remote.js";
import {
  isKubectlAvailable,
  listK3sNamespaces,
  discoverPostgresPods,
  discoverPostgresServices,
  addK3sServer,
  getK3sServer,
  listK3sServers,
  removeK3sServer,
  listK3sDatabases,
  createK3sBackup,
  restoreK3sBackup,
} from "../services/k3s.js";
import {
  addRemoteK3sCluster,
  getRemoteK3sCluster,
  listRemoteK3sClusters,
  removeRemoteK3sCluster,
  fetchKubeconfigFromRemote,
  testRemoteK3sConnection,
  getRemoteKubeconfig,
} from "../services/k3s-remote.js";

const router = express.Router();

router.get("/container", async (req, res, next) => {
  try {
    const result = await detectContainer();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/container/switch", async (req, res, next) => {
  try {
    const { containerName } = req.body;
    if (!containerName) {
      return res.status(400).json({ message: "Container name is required." });
    }

    const result = await detectContainer(containerName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/container", async (req, res, next) => {
  try {
    const { name, password, port, backupName } = req.body;

    if (!name || !password || !port) {
      return res.status(400).json({ message: "Container name, password, and port are required." });
    }

    const containerName = await startContainer(name, password, port);

    if (backupName) {
      logger.info(`Restoring backup ${backupName} into new container`);
      try {
        await restoreBackup(containerName, backupName);
      } catch (restoreError) {
        logger.error(`Failed to restore backup during container launch`, {
          error: restoreError.message,
        });
        return res.json({
          container: containerName,
          message: `Container "${containerName}" is running, but backup restore failed: ${restoreError.message}`,
        });
      }
    }

    res.json({
      container: containerName,
      message: backupName
        ? `Container "${containerName}" is running with backup "${backupName}" restored.`
        : `Container "${containerName}" is running.`,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/databases", async (req, res, next) => {
  try {
    const container = getCurrentContainer();
    if (!container) {
      return res.status(400).json({ message: "No active container detected." });
    }

    const password = getContainerPassword(container);
    const databases = await listDatabases(container, password);

    res.json({ databases });
  } catch (error) {
    next(error);
  }
});

router.get("/backups", async (req, res, next) => {
  try {
    const backups = await listBackups();
    res.json(backups);
  } catch (error) {
    next(error);
  }
});

router.post("/backup", async (req, res, next) => {
  try {
    const { dbName } = req.body;
    const container = getCurrentContainer();

    if (!container) {
      return res.status(400).json({ message: "No active container detected." });
    }

    const validatedDbName = assertValidDbName(dbName, true);
    const password = getContainerPassword(container);

    await ensureDatabaseExists(container, password, validatedDbName);
    const backup = await createBackup(container, validatedDbName);

    res.json(backup);
  } catch (error) {
    next(error);
  }
});

router.post("/restore", async (req, res, next) => {
  try {
    const { name, dbName } = req.body;
    const container = getCurrentContainer();

    if (!container) {
      return res.status(400).json({ message: "No active container detected." });
    }

    if (!name) {
      return res.status(400).json({ message: "Backup name is required." });
    }

    const password = getContainerPassword(container);
    const targetDb = assertValidDbName(dbName, false);

    if (targetDb) {
      await ensureDatabaseExists(container, password, targetDb);
    }

    const result = await restoreBackup(container, name, targetDb);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/backup/:name", async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!name) {
      return res.status(400).json({ message: "Backup name is required." });
    }

    const result = await deleteBackup(name);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/cleanup", async (req, res, next) => {
  try {
    const { maxAgeDays } = req.body;
    const result = await cleanupOldBackups(maxAgeDays);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Remote server routes
router.get("/remote/servers", async (req, res, next) => {
  try {
    const servers = listRemoteServers();
    res.json({ servers });
  } catch (error) {
    next(error);
  }
});

router.post("/remote/servers", async (req, res, next) => {
  try {
    const result = addRemoteServer(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/remote/servers/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = removeRemoteServer(id);
    if (!deleted) {
      return res.status(404).json({ message: "Server not found" });
    }
    res.json({ message: "Server removed", id });
  } catch (error) {
    next(error);
  }
});

router.get("/remote/servers/:id/databases", async (req, res, next) => {
  try {
    const { id } = req.params;
    const databases = await listRemoteDatabases(id);
    res.json({ databases });
  } catch (error) {
    next(error);
  }
});

router.post("/remote/servers/:id/backup", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dbName } = req.body;
    const result = await createRemoteBackup(id, dbName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/remote/servers/:id/restore", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { backupName, dbName } = req.body;
    const result = await restoreRemoteBackup(id, backupName, dbName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// K3s routes
router.get("/k3s/available", async (req, res, next) => {
  try {
    const available = await isKubectlAvailable();
    res.json({ available });
  } catch (error) {
    next(error);
  }
});

router.get("/k3s/namespaces", async (req, res, next) => {
  try {
    const namespaces = await listK3sNamespaces();
    res.json({ namespaces });
  } catch (error) {
    next(error);
  }
});

router.get("/k3s/discover/:namespace", async (req, res, next) => {
  try {
    const { namespace } = req.params;
    const [pods, services] = await Promise.all([
      discoverPostgresPods(namespace),
      discoverPostgresServices(namespace),
    ]);
    res.json({ pods, services });
  } catch (error) {
    next(error);
  }
});

router.get("/k3s/servers", async (req, res, next) => {
  try {
    const servers = listK3sServers();
    res.json({ servers });
  } catch (error) {
    next(error);
  }
});

router.post("/k3s/servers", async (req, res, next) => {
  try {
    const result = addK3sServer(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/k3s/servers/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = removeK3sServer(id);
    if (!deleted) {
      return res.status(404).json({ message: "Server not found" });
    }
    res.json({ message: "Server removed", id });
  } catch (error) {
    next(error);
  }
});

router.get("/k3s/servers/:id/databases", async (req, res, next) => {
  try {
    const { id } = req.params;
    const databases = await listK3sDatabases(id);
    res.json({ databases });
  } catch (error) {
    next(error);
  }
});

router.post("/k3s/servers/:id/backup", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dbName } = req.body;
    const result = await createK3sBackup(id, dbName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/k3s/servers/:id/restore", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { backupName, dbName } = req.body;
    const result = await restoreK3sBackup(id, backupName, dbName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Remote K3s cluster routes (K3s clusters accessed via SSH)
router.get("/k3s/remote/clusters", async (req, res, next) => {
  try {
    const clusters = listRemoteK3sClusters();
    res.json({ clusters });
  } catch (error) {
    next(error);
  }
});

router.post("/k3s/remote/clusters", async (req, res, next) => {
  try {
    const result = addRemoteK3sCluster(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/k3s/remote/clusters/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = removeRemoteK3sCluster(id);
    if (!deleted) {
      return res.status(404).json({ message: "Remote K3s cluster not found" });
    }
    res.json({ message: "Remote K3s cluster removed", id });
  } catch (error) {
    next(error);
  }
});

router.post("/k3s/remote/clusters/:id/fetch-kubeconfig", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await fetchKubeconfigFromRemote(id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/k3s/remote/clusters/:id/test", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await testRemoteK3sConnection(id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/k3s/remote/clusters/:id/kubeconfig", async (req, res, next) => {
  try {
    const { id } = req.params;
    const kubeconfigPath = await getRemoteKubeconfig(id);
    res.json({ kubeconfigPath });
  } catch (error) {
    next(error);
  }
});

export default router;
