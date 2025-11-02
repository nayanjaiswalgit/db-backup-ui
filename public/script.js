const backupListEl = document.getElementById("backups");
const backupSummaryEl = document.getElementById("backup-summary");
const backupSelectionInfoEl = document.getElementById("backup-selection-info");
const takeBackupBtn = document.getElementById("backup-btn");
const refreshBtn = document.getElementById("refresh-btn");
const databaseSelectEl = document.getElementById("database-select");

const containerStatusEl = document.getElementById("container-status");
const containerNameEl = document.getElementById("container-name");
const containerMessageEl = document.getElementById("container-message");
const detectBtn = document.getElementById("detect-btn");
const containerForm = document.getElementById("container-form");
const launchBtn = document.getElementById("launch-btn");
const containerBackupSelectEl = document.getElementById("container-backup-select");
const containerBackupHelpEl = document.getElementById("container-backup-help");

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
let launchBusy = false;

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
  const allDeleteBtns = backupListEl.querySelectorAll('.backup-item__delete');
  
  allRestoreBtns.forEach(btn => {
    btn.disabled = !containerRunning || restoreBusy;
  });
  
  allDeleteBtns.forEach(btn => {
    btn.disabled = deleteBusy;
  });
}

function updateContainerBackupHelp() {
  const value = containerBackupSelectEl.value;
  if (!value) {
    containerBackupHelpEl.textContent =
      "Select a backup to restore into a new container, or leave blank to start fresh.";
    return;
  }
  const backup = getBackupByName(value);
  if (backup) {
    containerBackupHelpEl.textContent = `We will restore database "${backup.database}" created on ${dateFormatter.format(
      new Date(backup.time)
    )}.`;
  } else {
    containerBackupHelpEl.textContent =
      "We will attempt to restore this backup after launching the container.";
  }
}

function renderBackups(backups) {
  backupsCache = Array.isArray(backups) ? backups : [];
  backupListEl.innerHTML = "";
  containerBackupSelectEl.innerHTML = "";

  if (!Array.isArray(backups) || backups.length === 0) {
    containerBackupSelectEl.disabled = true;
    backupSummaryEl.textContent = "No backups yet";
    backupSelectionInfoEl.textContent = "";

    const empty = document.createElement("li");
    empty.className = "backup-item empty";
    empty.textContent = "No backups yet — create one to get started.";
    backupListEl.appendChild(empty);

    const freshOption = document.createElement("option");
    freshOption.value = "";
    freshOption.textContent = "Start with an empty database";
    containerBackupSelectEl.appendChild(freshOption);
    updateContainerBackupHelp();
    toggleBackupActions();
    return;
  }

  backups.sort((a, b) => new Date(b.time) - new Date(a.time));

  backups.forEach((backup) => {
    const formOption = document.createElement("option");
    formOption.value = backup.name;
    formOption.textContent = `${backup.name} • ${backup.database || "unknown"}`;
    containerBackupSelectEl.appendChild(formOption);

    const li = document.createElement("li");
    li.className = "backup-item";
    li.dataset.name = backup.name;
    const when = new Date(backup.time);
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
        <button class="danger-btn backup-item__delete" data-backup-name="${backup.name}">🗑 Delete</button>
      </div>
    `;
    
    // Add event listeners for the buttons
    const restoreBtn = li.querySelector('.backup-item__restore');
    const deleteBtn = li.querySelector('.backup-item__delete');
    
    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      restoreBackupByName(backup.name, backup);
    });
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBackupByName(backup.name);
    });
    
    backupListEl.appendChild(li);
  });

  containerBackupSelectEl.disabled = false;
  containerBackupSelectEl.insertAdjacentHTML(
    "afterbegin",
    '<option value="">Start with an empty database</option>'
  );
  containerBackupSelectEl.value = "";
  updateContainerBackupHelp();

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
    backupSelectEl.innerHTML = "";
    backupSelectEl.disabled = true;
    containerBackupSelectEl.innerHTML =
      '<option value="">Start with an empty database</option>';
    containerBackupSelectEl.disabled = true;
    backupSelectionInfoEl.textContent = "";
    containerBackupHelpEl.textContent =
      "Unable to load backups right now. Try refreshing once the server is available.";
    showToast(error.message || "Unable to load backups", "error");
  } finally {
    highlightSelectedBackup();
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

async function showContainer(showToastOnRefresh = false) {
  setContainerStatus({
    status: "checking",
    name: currentContainer ?? "Detecting…",
    message: "Checking Docker for running containers.",
  });

  try {
    const res = await fetch("/api/container");
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await res.json() : { message: await res.text() };

    if (!res.ok) {
      throw new Error(payload.message || "Failed to detect container");
    }

    currentContainer = payload.container || null;
    containerRunning = payload.status === "running";

    setContainerStatus({
      status: payload.status,
      name: payload.container ?? "None",
      message: payload.message,
    });
  } catch (error) {
    console.error(error);
    currentContainer = null;
    containerRunning = false;
    setContainerStatus({
      status: "error",
      name: "Unavailable",
      message: error.message || "Unable to communicate with Docker.",
    });
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

async function launchContainer(event) {
  event.preventDefault();
  if (launchBusy) return;

  const formData = new FormData(containerForm);
  const name = formData.get("containerName")?.toString().trim();
  const password = formData.get("containerPassword")?.toString();
  const port = Number(formData.get("containerPort"));
  const backupName = formData.get("containerBackup")?.toString().trim() || "";

  if (!name || !password || !Number.isFinite(port)) {
    showToast("Provide container name, password, and port.", "error");
    return;
  }

  launchBusy = true;
  const originalLabel = launchBtn.textContent;
  launchBtn.textContent = "Launching…";
  launchBtn.disabled = true;

  try {
    const res = await fetch("/api/container", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        password,
        port,
        backupName: backupName || undefined,
      }),
    });
    const payload = await res.json().catch(async () => ({ message: await res.text() }));
    if (!res.ok) {
      throw new Error(payload.message || "Failed to launch container");
    }

    containerForm.reset();
    showToast(payload.message || "Container is ready", "success");
    await showContainer();
    await loadBackups();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to launch container", "error");
  } finally {
    launchBusy = false;
    launchBtn.textContent = originalLabel;
    launchBtn.disabled = false;
    toggleBackupActions();
  }
}

backupSelectEl.addEventListener("change", highlightSelectedBackup);
containerBackupSelectEl.addEventListener("change", updateContainerBackupHelp);
databaseSelectEl.addEventListener("change", toggleBackupActions);

takeBackupBtn.addEventListener("click", takeBackup);
refreshBtn.addEventListener("click", () => {
  showContainer(true);
  loadBackups(true);
});
detectBtn.addEventListener("click", () => showContainer(true));
containerForm.addEventListener("submit", launchContainer);

showContainer();
loadBackups();
