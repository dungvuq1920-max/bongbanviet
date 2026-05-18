type LogLevel = "debug" | "info" | "warn" | "error";

const SECRET_PATTERNS = [
  /access[_-]?token/i,
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /authorization/i
];

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 12) return `${value.slice(0, 4)}...${value.slice(-4)}`;
    return "***";
  }
  return "***";
}

export function redactSecrets(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(redactSecrets);

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(key))) {
      output[key] = redactValue(value);
    } else if (value && typeof value === "object") {
      output[key] = redactSecrets(value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? { meta: redactSecrets(meta) } : {})
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta)
};
