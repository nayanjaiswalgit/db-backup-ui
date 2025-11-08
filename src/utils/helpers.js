export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function sanitizeContainerName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function formatBytes(bytes) {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(2)} ${units[exponent]}`;
}

export function isOlderThanDays(date, days) {
  const now = Date.now();
  const ageInMs = now - new Date(date).getTime();
  const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
  return ageInDays > days;
}
