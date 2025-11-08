const COLORS = {
  RESET: "\x1b[0m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  GREEN: "\x1b[32m",
  BLUE: "\x1b[36m",
  GRAY: "\x1b[90m",
};

function formatTimestamp() {
  return new Date().toISOString();
}

function log(level, color, message, meta = {}) {
  const timestamp = formatTimestamp();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  console.log(`${color}[${timestamp}] [${level}]${COLORS.RESET} ${message}${metaStr}`);
}

export const logger = {
  error: (message, meta) => log("ERROR", COLORS.RED, message, meta),
  warn: (message, meta) => log("WARN", COLORS.YELLOW, message, meta),
  info: (message, meta) => log("INFO", COLORS.BLUE, message, meta),
  success: (message, meta) => log("SUCCESS", COLORS.GREEN, message, meta),
  debug: (message, meta) => log("DEBUG", COLORS.GRAY, message, meta),
};
