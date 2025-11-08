import { DB_NAME_PATTERN } from "../config/index.js";

export function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function assertValidDbName(value, required = true) {
  if (!value) {
    if (!required) return null;
    throw createError("Database name is required.", 400);
  }
  if (typeof value !== "string") {
    throw createError("Database name must be a string.", 400);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw createError("Database name cannot be empty.", 400);
  }
  if (!DB_NAME_PATTERN.test(trimmed)) {
    throw createError(
      "Invalid database name. Use letters, numbers, underscores or hyphens.",
      400
    );
  }
  return trimmed;
}
