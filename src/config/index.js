import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const PORT = Number(process.env.PORT || 8080);
export const DEFAULT_DB_NAME = process.env.PG_DB || "postgres";
export const DEFAULT_DB_USER = process.env.PG_USER || "postgres";
export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "./backups");
export const BACKUP_EXTENSION = ".dump";
export const PG_IMAGE = process.env.PG_IMAGE || "postgres:17-alpine";
export const WAIT_TIMEOUT_MS = Number(process.env.PG_WAIT_TIMEOUT_MS || 30000);
export const DB_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
export const MAX_BACKUP_AGE_DAYS = Number(process.env.MAX_BACKUP_AGE_DAYS || 30);
export const AUTO_CLEANUP_ENABLED = process.env.AUTO_CLEANUP_ENABLED === "true";

// K3s Configuration
export const KUBECONFIG = process.env.KUBECONFIG || null;
export const K3S_CONTEXT = process.env.K3S_CONTEXT || null;

export const config = {
  PORT,
  DEFAULT_DB_NAME,
  DEFAULT_DB_USER,
  BACKUP_DIR,
  BACKUP_EXTENSION,
  PG_IMAGE,
  WAIT_TIMEOUT_MS,
  DB_NAME_PATTERN,
  MAX_BACKUP_AGE_DAYS,
  AUTO_CLEANUP_ENABLED,
  KUBECONFIG,
  K3S_CONTEXT,
};
