const backupListEl = document.getElementById("backups");
const backupSummaryEl = document.getElementById("backup-summary");
const backupSelectionInfoEl = document.getElementById("backup-selection-info");
const takeBackupBtn = document.getElementById("backup-btn");
const cleanupBtn = document.getElementById("cleanup-btn");
const refreshBtn = document.getElementById("refresh-btn");
const databaseSelectEl = document.getElementById("database-select");

const containerStatusEl = document.getElementById("container-status");
const containerNameEl = document.getElementById("container-name");
const containerMessageEl = document.getElementById("container-message");
const detectBtn = document.getElementById("detect-btn");
const containerListEl = document.getElementById("container-list");
const containerListSectionEl = document.getElementById("container-list-section");
const dockerHelpSectionEl = document.getElementById("docker-help-section");

const addRemoteBtn = document.getElementById("add-remote-btn");
const remoteModal = document.getElementById("remote-modal");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const remoteServerForm = document.getElementById("remote-server-form");
const remoteServerListEl = document.getElementById("remote-server-list");
const remoteEmptyEl = document.getElementById("remote-empty");

const toastEl = document.getElementById("toast");
const toastMessageEl = document.getElementById("toast-message");

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const sizeFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

let backupsCache = [];
let databasesCache = [];
let currentContainer = null;
let containerRunning = false;
let backupBusy = false;
let restoreBusy = false;
let deleteBusy = false;
let deployBusy = false;
let cleanupBusy = false;
let allContainers = [];
let remoteServers = [];
let currentMode = "local"; // "local" or "remote"
let selectedRemoteServer = null;

function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  const formatted = exponent === 0 ? value.toFixed(0) : sizeFormatter.format(value);
  return `${formatted} ${units[exponent]}`;
}

function showToast(message, type = "info", timeout = 3200) {
  toastEl.className = `toast toast-${type}`;
  toastMessageEl.textContent = message;
  toastEl.classList.remove("hidden");

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toastEl.classList.add("hidden");
  }, timeout);
}

function setContainerStatus({ status, name, message }) {
  const statusClasses = {
    running: { text: "Running", className: "badge-success" },
    stopped: { text: "Stopped", className: "badge-warning" },
    "not-found": { text: "Not found", className: "badge-neutral" },
    "no-docker": { text: "Docker unavailable", className: "badge-danger" },
    error: { text: "Error", className: "badge-danger" },
    checking: { text: "Checking…", className: "badge-warning" },
  };

  const statusInfo = statusClasses[status] ?? statusClasses.error;
  containerStatusEl.textContent = statusInfo.text;
  containerStatusEl.className = `badge ${statusInfo.className}`;
  containerNameEl.textContent = name ?? "—";
  containerMessageEl.textContent = message ?? "";
}

function toggleBackupActions() {
  const hasDatabase = Boolean(databaseSelectEl.value) && !databaseSelectEl.disabled;
  takeBackupBtn.disabled = !containerRunning || backupBusy || !hasDatabase;
}

function getBackupByName(name) {
  if (!name) return null;
  return backupsCache.find((backup) => backup.name === name) || null;
}

function updateBackupSelectionInfo() {
  // Info is now shown on each item, so this can be simplified or removed
  backupSelectionInfoEl.textContent = "";
}

function updateBackupActionButtons() {
  // Update all restore/delete button states in the list
  const allRestoreBtns = backupListEl.querySelectorAll('.backup-item__restore');
  const allDeleteBtns = backupListEl.querySelectorAll('[data-action="delete"]');

  allRestoreBtns.forEach(btn => {
    btn.disabled = !containerRunning || restoreBusy;
  });

  allDeleteBtns.forEach(btn => {
    btn.disabled = deleteBusy;
  });
}

function closeAllMenus() {
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.classList.add('hidden');
  });
  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.classList.remove('active');
  });
}

function toggleMenu(menuId, buttonEl) {
  const menu = document.getElementById(menuId);
  const wasHidden = menu.classList.contains('hidden');

  // Close all menus first
  closeAllMenus();

  // If the menu was hidden, show it
  if (wasHidden) {
    menu.classList.remove('hidden');
    buttonEl.classList.add('active');
  }
}


function renderBackups(backups) {
  backupsCache = Array.isArray(backups) ? backups : [];
  backupListEl.innerHTML = "";

  if (!Array.isArray(backups) || backups.length === 0) {
    backupSummaryEl.textContent = "No backups yet";
    backupSelectionInfoEl.textContent = "";

    const empty = document.createElement("li");
    empty.className = "backup-item empty";
    empty.textContent = "No backups yet — create one to get started.";
    backupListEl.appendChild(empty);

    toggleBackupActions();
    return;
  }

  backups.sort((a, b) => new Date(b.time) - new Date(a.time));

  backups.forEach((backup) => {
    const li = document.createElement("li");
    li.className = "backup-item";
    li.dataset.name = backup.name;
    const when = new Date(backup.time);
    const menuId = `menu-${backup.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

    li.innerHTML = `
      <div class="backup-item__meta">
        <span class="backup-item__name">${backup.name}</span>
        <span class="backup-item__sub">
          ${dateFormatter.format(when)} • ${formatBytes(backup.size) || "—"}
        </span>
      </div>
      <span class="backup-item__badge">${backup.database || "unknown"}</span>
      <div class="backup-item__actions">
        <button class="ghost-btn backup-item__restore" data-backup-name="${backup.name}">♻️ Restore</button>
        <button class="menu-btn" data-menu-id="${menuId}" aria-label="More options">⋮</button>
        <div class="dropdown-menu hidden" id="${menuId}">
          <button class="dropdown-item" data-action="deploy" data-backup-name="${backup.name}">
            🚀 Deploy
          </button>
          <button class="dropdown-item danger" data-action="delete" data-backup-name="${backup.name}">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    const restoreBtn = li.querySelector('.backup-item__restore');
    const menuBtn = li.querySelector('.menu-btn');
    const menu = li.querySelector('.dropdown-menu');
    const deployBtn = menu.querySelector('[data-action="deploy"]');
    const deleteBtn = menu.querySelector('[data-action="delete"]');

    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      restoreBackupByName(backup.name, backup);
    });

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(menuId, menuBtn);
    });

    deployBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      deployBackup(backup);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      deleteBackupByName(backup.name);
    });

    backupListEl.appendChild(li);
  });

  const latest = backups[0];
  const latestDate = new Date(latest.time);
  backupSummaryEl.textContent = `${backups.length} backup${backups.length > 1 ? "s" : ""} • Latest ${dateFormatter.format(
    latestDate
  )} • Database ${latest.database || "unknown"}`;

  toggleBackupActions();
  updateBackupActionButtons();
}

function resetDatabaseSelect(message, disabled = true) {
  databaseSelectEl.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = message;
  databaseSelectEl.appendChild(option);
  databaseSelectEl.disabled = disabled;
  databasesCache = [];
}

async function loadBackups(showToastOnSuccess = false) {
  try {
    const res = await fetch("/api/backups");
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || "Failed to fetch backups");
    }
    const backups = await res.json();
    renderBackups(backups);
    if (showToastOnSuccess) {
      showToast("Backups refreshed", "success");
    }
  } catch (error) {
    console.error(error);
    backupsCache = [];
    backupSummaryEl.textContent = "Unable to load backups";
    backupListEl.innerHTML =
      '<li class="backup-item empty">Unable to load backups.</li>';
    backupSelectionInfoEl.textContent = "";
    showToast(error.message || "Unable to load backups", "error");
  }
}

async function loadDatabases(showToastOnSuccess = false) {
  if (!databaseSelectEl) return;

  if (!containerRunning) {
    resetDatabaseSelect("No running container");
    toggleBackupActions();
    return;
  }

  const previous = databaseSelectEl.value;
  resetDatabaseSelect("Loading databases…", true);

  try {
    const res = await fetch("/api/databases");
    const payload = await res.json().catch(async () => ({ message: await res.text() }));
    if (!res.ok) {
      throw new Error(payload.message || "Failed to fetch databases");
    }

    if (!payload.databases || payload.databases.length === 0) {
      resetDatabaseSelect("No databases found", true);
      showToast("No databases detected in container.", "warning");
      toggleBackupActions();
      return;
    }

    databasesCache = payload.databases;
    databaseSelectEl.innerHTML = "";
    payload.databases.forEach((db) => {
      const option = document.createElement("option");
      option.value = db;
      option.textContent = db;
      databaseSelectEl.appendChild(option);
    });
    if (previous && payload.databases.includes(previous)) {
      databaseSelectEl.value = previous;
    }
    databaseSelectEl.disabled = false;
    if (showToastOnSuccess) {
      showToast("Databases refreshed", "success");
    }
  } catch (error) {
    console.error(error);
    resetDatabaseSelect("Unable to load databases", true);
    showToast(error.message || "Unable to load databases", "error");
  } finally {
    toggleBackupActions();
  }
}

function renderContainerList(containers, activeContainerName) {
  allContainers = containers || [];

  if (!containers || containers.length === 0) {
    containerListSectionEl.classList.add("hidden");
    return;
  }

  containerListSectionEl.classList.remove("hidden");
  containerListEl.innerHTML = "";

  containers.forEach((container) => {
    const li = document.createElement("li");
    li.className = "container-list-item";
    if (container.name === activeContainerName) {
      li.classList.add("active");
    }

    const statusBadgeClass = container.isRunning ? "running" : "stopped";
    const port = container.port ? `:${container.port}` : "";

    li.innerHTML = `
      <div class="container-list-item__info">
        <span class="container-list-item__name">${container.name}</span>
        <span class="container-list-item__meta">
          <span>${container.image}${port}</span>
        </span>
      </div>
      <span class="container-list-item__badge ${statusBadgeClass}">${container.status}</span>
    `;

    li.addEventListener("click", () => switchContainer(container.name));
    containerListEl.appendChild(li);
  });
}

async function switchContainer(containerName) {
  if (containerName === currentContainer) return;

  try {
    const res = await fetch("/api/container/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ containerName }),
    });
    const payload = await res.json();

    if (!res.ok) {
      throw new Error(payload.message || "Failed to switch container");
    }

    currentContainer = payload.container || null;
    containerRunning = payload.status === "running";
    allContainers = payload.allContainers || [];

    setContainerStatus({
      status: payload.status,
      name: payload.container ?? "None",
      message: payload.message,
    });

    renderContainerList(allContainers, currentContainer);
    await loadDatabases();
    showToast(`Switched to container: ${containerName}`, "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to switch container", "error");
  }
}

async function showContainer(showToastOnRefresh = false) {
  setContainerStatus({
    status: "checking",
    name: currentContainer ?? "Detecting…",
    message: "Checking Docker for running containers.",
  });

  // Hide help section while checking
  dockerHelpSectionEl.classList.add("hidden");

  try {
    const res = await fetch("/api/container");
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await res.json() : { message: await res.text() };

    if (!res.ok) {
      throw new Error(payload.message || "Failed to detect container");
    }

    currentContainer = payload.container || null;
    containerRunning = payload.status === "running";
    allContainers = payload.allContainers || [];

    setContainerStatus({
      status: payload.status,
      name: payload.container ?? "None",
      message: payload.message,
    });

    // Show/hide Docker help based on status
    if (payload.status === "no-docker") {
      dockerHelpSectionEl.classList.remove("hidden");
    } else {
      dockerHelpSectionEl.classList.add("hidden");
    }

    renderContainerList(allContainers, currentContainer);
  } catch (error) {
    console.error(error);
    currentContainer = null;
    containerRunning = false;
    allContainers = [];
    setContainerStatus({
      status: "error",
      name: "Unavailable",
      message: error.message || "Unable to communicate with Docker.",
    });
    dockerHelpSectionEl.classList.add("hidden");
    renderContainerList([], null);
    showToast(error.message || "Unable to detect container", "error");
  } finally {
    toggleBackupActions();
    await loadDatabases(showToastOnRefresh);
  }
}

async function takeBackup() {
  if (!containerRunning || backupBusy) return;
  const dbName = databaseSelectEl.value;
  if (!dbName) {
    showToast("Select a database to back up.", "warning");
    return;
  }

  backupBusy = true;
  const originalLabel = takeBackupBtn.textContent;
  takeBackupBtn.textContent = "Creating…";
  toggleBackupActions();

  try {
    const res = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbName }),
    });
    const payload = await res.json().catch(async () => ({ message: await res.text() }));
    if (!res.ok) {
      throw new Error(payload.message || "Backup failed");
    }

    await loadBackups();
    showToast(`Backup created for "${dbName}"`, "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Backup failed", "error");
  } finally {
    backupBusy = false;
    takeBackupBtn.textContent = originalLabel;
    toggleBackupActions();
  }
}

async function restoreBackupByName(name, backup) {
  if (!name || restoreBusy) return;
  if (!backup) {
    showToast("Unable to locate the selected backup.", "error");
    return;
  }
  if (
    !confirm(
      `Restore database "${backup.database}" from backup ${name}? This will overwrite existing data.`
    )
  ) {
    return;
  }

  restoreBusy = true;
  updateBackupActionButtons();

  try {
    const res = await fetch("/api/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, dbName: backup.database }),
    });
    const payload = await res.json().catch(async () => ({ message: await res.text() }));
    if (!res.ok) {
      throw new Error(payload.message || "Restore failed");
    }
    showToast(`Restore completed for "${payload.database || backup.database}"`, "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Restore failed", "error");
  } finally {
    restoreBusy = false;
    updateBackupActionButtons();
  }
}

async function deleteBackupByName(name) {
  if (!name || deleteBusy) return;
  if (!confirm(`Delete backup ${name}? This cannot be undone.`)) return;

  deleteBusy = true;
  updateBackupActionButtons();

  try {
    const res = await fetch(`/api/backup/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    const payload = await res.json().catch(async () => ({ message: await res.text() }));
    if (!res.ok) {
      throw new Error(payload.message || "Failed to delete backup");
    }
    await loadBackups();
    showToast("Backup deleted", "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to delete backup", "error");
  } finally {
    deleteBusy = false;
    updateBackupActionButtons();
  }
}

async function cleanupOldBackups() {
  if (cleanupBusy) return;

  const maxAgeDays = prompt("Delete backups older than how many days?", "30");
  if (!maxAgeDays) return;

  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) {
    showToast("Invalid number of days", "error");
    return;
  }

  if (!confirm(`Delete all backups older than ${days} days? This cannot be undone.`)) {
    return;
  }

  cleanupBusy = true;
  const originalLabel = cleanupBtn.textContent;
  cleanupBtn.textContent = "Cleaning...";
  cleanupBtn.disabled = true;

  try {
    const res = await fetch("/api/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxAgeDays: days }),
    });
    const payload = await res.json().catch(async () => ({ message: await res.text() }));
    if (!res.ok) {
      throw new Error(payload.message || "Cleanup failed");
    }

    await loadBackups();
    if (payload.deleted === 0) {
      showToast("No old backups found to delete", "info");
    } else {
      showToast(`✅ Cleaned up ${payload.deleted} old backup(s)`, "success", 4000);
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "Cleanup failed", "error");
  } finally {
    cleanupBusy = false;
    cleanupBtn.textContent = originalLabel;
    cleanupBtn.disabled = false;
  }
}

async function deployBackup(backup) {
  if (!backup) {
    showToast("Unable to locate the selected backup.", "error");
    return;
  }

  // Prompt for container details
  const containerName = prompt(`Container name for deployment:`, `${backup.database}_container`);
  if (!containerName || !containerName.trim()) {
    return;
  }

  const password = prompt("PostgreSQL password for new container:");
  if (!password) {
    return;
  }

  const portStr = prompt("Host port (e.g., 5432):", "5432");
  const port = Number(portStr);
  if (!Number.isFinite(port) || port <= 0) {
    showToast("Invalid port number.", "error");
    return;
  }

  deployBusy = true;
  showToast(`Deploying ${backup.name}...`, "info");

  try {
    const res = await fetch("/api/container", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: containerName.trim(),
        password,
        port,
        backupName: backup.name,
      }),
    });
    const payload = await res.json().catch(async () => ({ message: await res.text() }));
    if (!res.ok) {
      throw new Error(payload.message || "Failed to deploy container");
    }

    showToast(`✅ Deployed ${containerName} with backup ${backup.name}`, "success", 5000);
    await showContainer();
    await loadBackups();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Deployment failed", "error");
  } finally {
    deployBusy = false;
  }
}

databaseSelectEl.addEventListener("change", toggleBackupActions);

takeBackupBtn.addEventListener("click", takeBackup);
cleanupBtn.addEventListener("click", cleanupOldBackups);
refreshBtn.addEventListener("click", () => {
  showContainer(true);
  loadBackups(true);
});
detectBtn.addEventListener("click", () => showContainer(true));

// Close all dropdown menus when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest('.menu-btn') && !e.target.closest('.dropdown-menu')) {
    closeAllMenus();
  }
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    currentMode = tab;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show/hide content
    document.getElementById('local-tab').classList.toggle('hidden', tab !== 'local');
    document.getElementById('remote-tab').classList.toggle('hidden', tab !== 'remote');

    if (tab === 'remote') {
      loadRemoteServers();
    }
  });
});

// Modal handlers
addRemoteBtn.addEventListener('click', () => {
  remoteModal.classList.remove('hidden');
});

modalCloseBtn.addEventListener('click', () => {
  remoteModal.classList.add('hidden');
  remoteServerForm.reset();
});

modalCancelBtn.addEventListener('click', () => {
  remoteModal.classList.add('hidden');
  remoteServerForm.reset();
});

// Close modal on outside click
remoteModal.addEventListener('click', (e) => {
  if (e.target === remoteModal) {
    remoteModal.classList.add('hidden');
    remoteServerForm.reset();
  }
});

// Remote server form submit
remoteServerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await addRemoteServer(e);
});

async function addRemoteServer(event) {
  event.preventDefault();

  const formData = new FormData(remoteServerForm);
  const serverConfig = {
    id: Date.now().toString(),
    name: formData.get('name'),
    host: formData.get('host'),
    username: formData.get('username'),
    password: formData.get('password'),
    port: Number(formData.get('port')) || 22,
    pgPort: Number(formData.get('pgPort')) || 5432,
    database: formData.get('database') || 'postgres',
  };

  try {
    const res = await fetch('/api/remote/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serverConfig),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to add server');
    }

    showToast(`✅ Added server: ${serverConfig.name}`, 'success');
    remoteModal.classList.add('hidden');
    remoteServerForm.reset();
    await loadRemoteServers();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Failed to add server', 'error');
  }
}

async function loadRemoteServers() {
  try {
    const res = await fetch('/api/remote/servers');
    const data = await res.json();
    remoteServers = data.servers || [];

    renderRemoteServers();
  } catch (error) {
    console.error(error);
    showToast('Failed to load remote servers', 'error');
  }
}

function renderRemoteServers() {
  if (remoteServers.length === 0) {
    remoteServerListEl.classList.add('hidden');
    remoteEmptyEl.style.display = 'block';
    return;
  }

  remoteServerListEl.classList.remove('hidden');
  remoteEmptyEl.style.display = 'none';
  remoteServerListEl.innerHTML = '';

  remoteServers.forEach(server => {
    const li = document.createElement('li');
    li.className = 'container-list-item';
    if (selectedRemoteServer === server.id) {
      li.classList.add('active');
    }

    li.innerHTML = `
      <div class="container-list-item__info">
        <span class="container-list-item__name">${server.name}</span>
        <span class="container-list-item__meta">
          <span>${server.host}:${server.port} → PG:${server.pgPort}</span>
        </span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="ghost-btn" style="padding: 6px 12px; font-size: 0.8rem;" data-action="backup" data-server-id="${server.id}">
          📦 Backup
        </button>
        <button class="danger-btn" style="padding: 6px 12px; font-size: 0.8rem;" data-action="delete" data-server-id="${server.id}">
          🗑️ Remove
        </button>
      </div>
    `;

    const backupBtn = li.querySelector('[data-action="backup"]');
    const deleteBtn = li.querySelector('[data-action="delete"]');

    backupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      createRemoteServerBackup(server.id, server.name);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRemoteServer(server.id, server.name);
    });

    li.addEventListener('click', () => {
      selectedRemoteServer = server.id;
      renderRemoteServers();
    });

    remoteServerListEl.appendChild(li);
  });
}

async function createRemoteServerBackup(serverId, serverName) {
  const dbName = prompt(`Enter database name to backup from ${serverName}:`, 'postgres');
  if (!dbName) return;

  try {
    showToast(`Creating backup from ${serverName}...`, 'info');

    const res = await fetch(`/api/remote/servers/${serverId}/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbName }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Backup failed');
    }

    const result = await res.json();
    showToast(`✅ Backup created: ${result.name}`, 'success', 5000);
    await loadBackups();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Backup failed', 'error');
  }
}

async function removeRemoteServer(serverId, serverName) {
  if (!confirm(`Remove server "${serverName}"? This will not delete backups.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/remote/servers/${serverId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to remove server');
    }

    showToast(`✅ Removed server: ${serverName}`, 'success');
    await loadRemoteServers();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Failed to remove server', 'error');
  }
}

// K3s Modal and Server Management
const addK3sBtn = document.getElementById("add-k3s-btn");
const k3sModal = document.getElementById("k3s-modal");
const k3sModalCloseBtn = document.getElementById("k3s-modal-close-btn");
const k3sModalCancelBtn = document.getElementById("k3s-modal-cancel-btn");
const k3sServerForm = document.getElementById("k3s-server-form");
const k3sServerListEl = document.getElementById("k3s-server-list");
const k3sEmptyEl = document.getElementById("k3s-empty");
const k3sStatusEl = document.getElementById("k3s-status");
const k3sUnavailableSection = document.getElementById("k3s-unavailable-section");
const k3sAvailableSection = document.getElementById("k3s-available-section");
const namespaceSelect = document.getElementById("namespace-select");
const discoverK3sBtn = document.getElementById("discover-k3s-btn");
const k3sRecheckBtn = document.getElementById("k3s-recheck-btn");
const discoveredPostgresSection = document.getElementById("discovered-postgres-section");
const discoveredPodsList = document.getElementById("discovered-pods-list");
const discoveredServicesList = document.getElementById("discovered-services-list");
const noPodsMessage = document.getElementById("no-pods-message");
const noServicesMessage = document.getElementById("no-services-message");

let k3sServers = [];
let k3sAvailable = false;

// Open K3s modal
addK3sBtn?.addEventListener("click", () => {
  k3sModal.classList.remove("hidden");
});

// Close K3s modal
k3sModalCloseBtn?.addEventListener("click", () => {
  k3sModal.classList.add("hidden");
  k3sServerForm.reset();
});

k3sModalCancelBtn?.addEventListener("click", () => {
  k3sModal.classList.add("hidden");
  k3sServerForm.reset();
});

// Submit K3s server form
k3sServerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(k3sServerForm);
  const config = {
    id: `k3s-${Date.now()}`,
    name: formData.get("name"),
    namespace: formData.get("namespace"),
    podName: formData.get("podName"),
    containerName: formData.get("containerName") || null,
    password: formData.get("password") || null,
  };

  try {
    const res = await fetch("/api/k3s/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Failed to add K3s server");
    }

    showToast(`✅ Added K3s server: ${config.name}`, "success");
    k3sModal.classList.add("hidden");
    k3sServerForm.reset();
    await loadK3sServers();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to add K3s server", "error");
  }
});

// Check if kubectl is available
async function checkK3sAvailability() {
  try {
    const res = await fetch("/api/k3s/available");
    const data = await res.json();
    k3sAvailable = data.available;

    if (k3sAvailable) {
      k3sStatusEl.textContent = "Available";
      k3sStatusEl.className = "badge badge-success";
      k3sUnavailableSection.classList.add("hidden");
      k3sAvailableSection.classList.remove("hidden");
      await loadK3sNamespaces();
      await loadK3sServers();
    } else {
      k3sStatusEl.textContent = "Unavailable";
      k3sStatusEl.className = "badge badge-danger";
      k3sUnavailableSection.classList.remove("hidden");
      k3sAvailableSection.classList.add("hidden");
    }
  } catch (error) {
    console.error("Failed to check K3s availability:", error);
    k3sStatusEl.textContent = "Error";
    k3sStatusEl.className = "badge badge-danger";
    k3sUnavailableSection.classList.remove("hidden");
    k3sAvailableSection.classList.add("hidden");
  }
}

// Load K3s namespaces
async function loadK3sNamespaces() {
  try {
    const res = await fetch("/api/k3s/namespaces");
    const data = await res.json();

    namespaceSelect.innerHTML = '<option value="">Select namespace...</option>';
    data.namespaces.forEach(ns => {
      const option = document.createElement("option");
      option.value = ns;
      option.textContent = ns;
      namespaceSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Failed to load namespaces:", error);
    showToast("Failed to load namespaces", "error");
  }
}

// Enable/disable discover button based on namespace selection
namespaceSelect?.addEventListener("change", () => {
  discoverK3sBtn.disabled = !namespaceSelect.value;
});

// Discover PostgreSQL pods in selected namespace
discoverK3sBtn?.addEventListener("click", async () => {
  const namespace = namespaceSelect.value;
  if (!namespace) return;

  try {
    showToast(`Discovering PostgreSQL in ${namespace}...`, "info");
    const res = await fetch(`/api/k3s/discover/${namespace}`);
    const data = await res.json();

    displayDiscoveredResources(data.pods, data.services, namespace);
  } catch (error) {
    console.error("Failed to discover resources:", error);
    showToast("Failed to discover PostgreSQL resources", "error");
  }
});

// Display discovered pods and services
function displayDiscoveredResources(pods, services, namespace) {
  discoveredPostgresSection.classList.remove("hidden");

  // Display pods
  discoveredPodsList.innerHTML = "";
  if (pods && pods.length > 0) {
    noPodsMessage.classList.add("hidden");
    pods.forEach(pod => {
      const li = document.createElement("li");
      li.className = "backup-item";
      li.innerHTML = `
        <div class="backup-item__meta">
          <span class="backup-item__name">${pod.name}</span>
          <span class="backup-item__sub">Namespace: ${pod.namespace} • Container: ${pod.containerName || 'default'}</span>
        </div>
        <span class="backup-item__badge ${pod.isRunning ? 'badge-success' : 'badge-warning'}">${pod.status}</span>
        <div class="backup-item__actions">
          <button class="primary-btn add-k3s-pod-btn" data-pod='${JSON.stringify(pod)}'>+ Add</button>
        </div>
      `;

      const addBtn = li.querySelector(".add-k3s-pod-btn");
      addBtn.addEventListener("click", () => addDiscoveredPod(pod));

      discoveredPodsList.appendChild(li);
    });
  } else {
    noPodsMessage.classList.remove("hidden");
  }

  // Display services
  discoveredServicesList.innerHTML = "";
  if (services && services.length > 0) {
    noServicesMessage.classList.add("hidden");
    services.forEach(svc => {
      const li = document.createElement("li");
      li.className = "backup-item";
      li.innerHTML = `
        <div class="backup-item__meta">
          <span class="backup-item__name">${svc.name}</span>
          <span class="backup-item__sub">Port: ${svc.port} • Type: ${svc.type} • IP: ${svc.clusterIP}</span>
        </div>
      `;
      discoveredServicesList.appendChild(li);
    });
  } else {
    noServicesMessage.classList.remove("hidden");
  }

  showToast(`Found ${pods.length} pods and ${services.length} services`, "success");
}

// Add discovered pod as K3s server
async function addDiscoveredPod(pod) {
  const name = prompt(`Name for this K3s server:`, pod.name);
  if (!name) return;

  const password = prompt(`PostgreSQL password (optional):`, "");

  const config = {
    id: `k3s-${Date.now()}`,
    name,
    namespace: pod.namespace,
    podName: pod.name,
    containerName: pod.containerName,
    password: password || null,
  };

  try {
    const res = await fetch("/api/k3s/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Failed to add K3s server");
    }

    showToast(`✅ Added K3s server: ${name}`, "success");
    await loadK3sServers();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to add K3s server", "error");
  }
}

// Load configured K3s servers
async function loadK3sServers() {
  try {
    const res = await fetch("/api/k3s/servers");
    const data = await res.json();
    k3sServers = data.servers || [];

    renderK3sServers();
  } catch (error) {
    console.error("Failed to load K3s servers:", error);
  }
}

// Render K3s servers list
function renderK3sServers() {
  k3sServerListEl.innerHTML = "";

  if (k3sServers.length === 0) {
    k3sEmptyEl.classList.remove("hidden");
    return;
  }

  k3sEmptyEl.classList.add("hidden");

  k3sServers.forEach(server => {
    const li = document.createElement("li");
    li.className = "backup-item";
    li.innerHTML = `
      <div class="backup-item__meta">
        <span class="backup-item__name">${server.name}</span>
        <span class="backup-item__sub">${server.namespace}/${server.podName}</span>
      </div>
      <div class="backup-item__actions">
        <button class="ghost-btn k3s-backup-btn" data-server-id="${server.id}">📦 Backup</button>
        <button class="ghost-btn danger k3s-delete-btn" data-server-id="${server.id}">🗑️ Delete</button>
      </div>
    `;

    const backupBtn = li.querySelector(".k3s-backup-btn");
    const deleteBtn = li.querySelector(".k3s-delete-btn");

    backupBtn.addEventListener("click", () => createK3sServerBackup(server.id, server.name));
    deleteBtn.addEventListener("click", () => removeK3sServer(server.id, server.name));

    k3sServerListEl.appendChild(li);
  });
}

// Create backup from K3s server
async function createK3sServerBackup(serverId, serverName) {
  const dbName = prompt(`Enter database name to backup from ${serverName}:`, 'postgres');
  if (!dbName) return;

  try {
    showToast(`Creating backup from ${serverName}...`, 'info');

    const res = await fetch(`/api/k3s/servers/${serverId}/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbName }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Backup failed');
    }

    const result = await res.json();
    showToast(`✅ Backup created: ${result.name}`, 'success', 5000);
    await loadBackups();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Backup failed', 'error');
  }
}

// Remove K3s server
async function removeK3sServer(serverId, serverName) {
  if (!confirm(`Remove K3s server "${serverName}"? This will not delete backups.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/k3s/servers/${serverId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to remove server');
    }

    showToast(`✅ Removed K3s server: ${serverName}`, 'success');
    await loadK3sServers();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Failed to remove server', 'error');
  }
}

// Re-check kubectl availability
k3sRecheckBtn?.addEventListener("click", checkK3sAvailability);

// Remote K3s Cluster Management
const addRemoteK3sBtn = document.getElementById("add-remote-k3s-btn");
const remoteK3sModal = document.getElementById("remote-k3s-modal");
const remoteK3sModalCloseBtn = document.getElementById("remote-k3s-modal-close-btn");
const remoteK3sModalCancelBtn = document.getElementById("remote-k3s-modal-cancel-btn");
const remoteK3sForm = document.getElementById("remote-k3s-form");
const remoteK3sClustersListEl = document.getElementById("remote-k3s-clusters-list");
const remoteK3sEmptyEl = document.getElementById("remote-k3s-empty");

let remoteK3sClusters = [];

// Open Remote K3s modal
addRemoteK3sBtn?.addEventListener("click", () => {
  remoteK3sModal.classList.remove("hidden");
});

// Close Remote K3s modal
remoteK3sModalCloseBtn?.addEventListener("click", () => {
  remoteK3sModal.classList.add("hidden");
  remoteK3sForm.reset();
});

remoteK3sModalCancelBtn?.addEventListener("click", () => {
  remoteK3sModal.classList.add("hidden");
  remoteK3sForm.reset();
});

// Submit Remote K3s cluster form
remoteK3sForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(remoteK3sForm);
  const config = {
    id: `remote-k3s-${Date.now()}`,
    name: formData.get("name"),
    host: formData.get("host"),
    username: formData.get("username"),
    password: formData.get("password"),
    port: parseInt(formData.get("port")) || 22,
    k3sPort: parseInt(formData.get("k3sPort")) || 6443,
    k3sConfigPath: formData.get("k3sConfigPath") || "/etc/rancher/k3s/k3s.yaml",
  };

  try {
    showToast(`Adding remote K3s cluster: ${config.name}...`, "info");

    const res = await fetch("/api/k3s/remote/clusters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Failed to add remote K3s cluster");
    }

    const result = await res.json();

    // Fetch kubeconfig immediately
    showToast(`Fetching kubeconfig from ${config.name}...`, "info");

    const fetchRes = await fetch(`/api/k3s/remote/clusters/${result.id}/fetch-kubeconfig`, {
      method: "POST",
    });

    if (!fetchRes.ok) {
      const error = await fetchRes.json();
      throw new Error(`Failed to fetch kubeconfig: ${error.message}`);
    }

    showToast(`✅ Added remote K3s cluster: ${config.name}`, "success");
    remoteK3sModal.classList.add("hidden");
    remoteK3sForm.reset();
    await loadRemoteK3sClusters();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to add remote K3s cluster", "error");
  }
});

// Load remote K3s clusters
async function loadRemoteK3sClusters() {
  try {
    const res = await fetch("/api/k3s/remote/clusters");
    const data = await res.json();
    remoteK3sClusters = data.clusters || [];

    renderRemoteK3sClusters();
  } catch (error) {
    console.error("Failed to load remote K3s clusters:", error);
  }
}

// Render remote K3s clusters
function renderRemoteK3sClusters() {
  remoteK3sClustersListEl.innerHTML = "";

  if (remoteK3sClusters.length === 0) {
    remoteK3sEmptyEl.classList.remove("hidden");
    return;
  }

  remoteK3sEmptyEl.classList.add("hidden");

  remoteK3sClusters.forEach(cluster => {
    const li = document.createElement("li");
    li.className = "backup-item";

    const statusBadge = cluster.kubeconfigFetched
      ? '<span class="backup-item__badge badge-success">Ready</span>'
      : '<span class="backup-item__badge badge-warning">Pending</span>';

    li.innerHTML = `
      <div class="backup-item__meta">
        <span class="backup-item__name">${cluster.name}</span>
        <span class="backup-item__sub">${cluster.host}:${cluster.k3sPort}</span>
      </div>
      ${statusBadge}
      <div class="backup-item__actions">
        <button class="ghost-btn remote-k3s-test-btn" data-cluster-id="${cluster.id}">🔍 Test</button>
        <button class="ghost-btn remote-k3s-fetch-btn" data-cluster-id="${cluster.id}" ${cluster.kubeconfigFetched ? 'disabled' : ''}>📥 Fetch Config</button>
        <button class="ghost-btn danger remote-k3s-delete-btn" data-cluster-id="${cluster.id}">🗑️ Delete</button>
      </div>
    `;

    const testBtn = li.querySelector(".remote-k3s-test-btn");
    const fetchBtn = li.querySelector(".remote-k3s-fetch-btn");
    const deleteBtn = li.querySelector(".remote-k3s-delete-btn");

    testBtn.addEventListener("click", () => testRemoteK3sCluster(cluster.id, cluster.name));
    fetchBtn.addEventListener("click", () => fetchRemoteK3sKubeconfig(cluster.id, cluster.name));
    deleteBtn.addEventListener("click", () => removeRemoteK3sCluster(cluster.id, cluster.name));

    remoteK3sClustersListEl.appendChild(li);
  });
}

// Test remote K3s cluster connection
async function testRemoteK3sCluster(clusterId, clusterName) {
  try {
    showToast(`Testing connection to ${clusterName}...`, "info");

    const res = await fetch(`/api/k3s/remote/clusters/${clusterId}/test`, {
      method: "POST",
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Connection test failed");
    }

    const result = await res.json();
    showToast(`✅ Connection successful: ${clusterName}`, "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Connection test failed", "error");
  }
}

// Fetch kubeconfig from remote K3s cluster
async function fetchRemoteK3sKubeconfig(clusterId, clusterName) {
  try {
    showToast(`Fetching kubeconfig from ${clusterName}...`, "info");

    const res = await fetch(`/api/k3s/remote/clusters/${clusterId}/fetch-kubeconfig`, {
      method: "POST",
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Failed to fetch kubeconfig");
    }

    const result = await res.json();
    showToast(`✅ Kubeconfig fetched: ${result.kubeconfigPath}`, "success");
    await loadRemoteK3sClusters();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to fetch kubeconfig", "error");
  }
}

// Remove remote K3s cluster
async function removeRemoteK3sCluster(clusterId, clusterName) {
  if (!confirm(`Remove remote K3s cluster "${clusterName}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/k3s/remote/clusters/${clusterId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Failed to remove cluster");
    }

    showToast(`✅ Removed remote K3s cluster: ${clusterName}`, "success");
    await loadRemoteK3sClusters();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to remove cluster", "error");
  }
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;

    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      if (content.id === `${tab}-tab`) {
        content.classList.remove('hidden');
      } else if (content.id !== 'backups-card') {
        content.classList.add('hidden');
      }
    });

    // Load data for the selected tab
    if (tab === 'k3s') {
      checkK3sAvailability();
      loadRemoteK3sClusters();
    } else if (tab === 'remote') {
      loadRemoteServers();
    }
  });
});

showContainer();
loadBackups();
checkK3sAvailability();
loadRemoteK3sClusters();
