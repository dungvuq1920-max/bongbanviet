import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getBoolEnv, n8nApiUrl, requireEnv } from "./env.js";
import { logger } from "./logger.js";
import { retry } from "./retry.js";

export type N8nWorkflow = {
  id?: string;
  name: string;
  active?: boolean;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  pinData?: unknown;
  tags?: unknown[];
  [key: string]: unknown;
};

export type N8nCredentialSummary = {
  id?: string;
  name: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type N8nListResponse<T> = {
  data?: T[];
  nextCursor?: string | null;
};

export type ExportResult = {
  workflowName: string;
  file: string;
  changed: boolean;
};

export const stableWorkflowFilenames = new Map([
  ["01_BBV_FACEBOOK_POST_AUTOMATION", "01-facebook-post.json"],
  ["02_BBV_TIKTOK_VIDEO_POST_AUTOMATION", "02-tiktok-video-post.json"],
  ["03_BBV_SHOPEE_PRODUCT_SYNC", "03-shopee-product-sync.json"],
  ["04_BBV_TIKTOK_SHOP_PRODUCT_CONTENT", "04-tiktok-shop-post.json"]
]);

const SECRET_KEY_PATTERN = /(access[_-]?token|api[_-]?key|secret|password|authorization|bearer|client[_-]?secret)/i;
const SECRET_HEADER_PATTERN = /^(authorization|x-api-key|api-key|apikey|access-token|x-access-token|token)$/i;
const REDACTED_SECRET = "__REDACTED_SECRET_USE_ENV_OR_N8N_CREDENTIAL__";

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-N8N-API-KEY": requireEnv("N8N_API_KEY")
  };
}

export async function n8nRequest<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  return retry(async () => {
    const response = await fetch(n8nApiUrl(pathName), {
      ...init,
      headers: { ...headers(), ...(init.headers || {}) }
    });
    const text = await response.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      if (!response.ok) throw new Error(`n8n API ${response.status}: ${text}`);
      throw new Error(`n8n API returned non-JSON response: ${text.slice(0, 200)}`);
    }
    if (!response.ok) throw new Error(`n8n API ${response.status}: ${text}`);
    return json as T;
  }, {
    attempts: 3,
    shouldRetry: (error) => !String((error as Error).message).includes("400")
  });
}

async function listPaginated<T>(basePath: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null | undefined;

  do {
    const query = cursor ? `${basePath.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : "";
    const result = await n8nRequest<N8nListResponse<T> | T[]>(`${basePath}${query}`);
    if (Array.isArray(result)) {
      items.push(...result);
      cursor = null;
    } else {
      items.push(...(result.data || []));
      cursor = result.nextCursor;
    }
  } while (cursor);

  return items;
}

export async function listN8nWorkflows(): Promise<N8nWorkflow[]> {
  return listPaginated<N8nWorkflow>("/api/v1/workflows");
}

export async function getN8nWorkflow(id: string): Promise<N8nWorkflow> {
  return n8nRequest<N8nWorkflow>(`/api/v1/workflows/${encodeURIComponent(id)}`);
}

export async function listFullN8nWorkflows(): Promise<N8nWorkflow[]> {
  const summaries = await listN8nWorkflows();
  const workflows: N8nWorkflow[] = [];

  for (const summary of summaries) {
    if (!summary.id) {
      workflows.push(summary);
      continue;
    }

    try {
      workflows.push(await getN8nWorkflow(summary.id));
    } catch (error) {
      logger.warn("Falling back to workflow list payload", {
        workflowName: summary.name,
        id: summary.id,
        error: (error as Error).message
      });
      workflows.push(summary);
    }
  }

  return workflows;
}

export async function listN8nCredentials(): Promise<N8nCredentialSummary[]> {
  return listPaginated<N8nCredentialSummary>("/api/v1/credentials");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeSecretExpression(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.trim() === "") return true;
  return value.includes("$env.") || value.includes("process.env") || value.trim().startsWith("={{");
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (!isRecord(value)) {
    if (SECRET_KEY_PATTERN.test(key) && !isSafeSecretExpression(value)) return REDACTED_SECRET;
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(entryKey) && !isSafeSecretExpression(entryValue)) {
      output[entryKey] = REDACTED_SECRET;
    } else {
      output[entryKey] = sanitizeValue(entryValue, entryKey);
    }
  }

  const name = typeof output.name === "string" ? output.name : "";
  if (name && SECRET_HEADER_PATTERN.test(name) && typeof output.value === "string" && !isSafeSecretExpression(output.value)) {
    output.value = REDACTED_SECRET;
  }

  return output;
}

function sanitizeNode(node: Record<string, unknown>, preserveCredentialReferences: boolean): Record<string, unknown> {
  const sanitized = sanitizeValue(node) as Record<string, unknown>;
  if (!preserveCredentialReferences) {
    const { credentials: _credentials, ...rest } = sanitized;
    return rest;
  }
  return sanitized;
}

export function sanitizeWorkflowForRepo(
  workflow: N8nWorkflow,
  options: { preserveCredentialReferences?: boolean } = {}
): N8nWorkflow {
  const preserveCredentialReferences = options.preserveCredentialReferences ?? true;

  return {
    name: workflow.name,
    nodes: workflow.nodes.map((node) => sanitizeNode(node, preserveCredentialReferences)),
    connections: workflow.connections || {},
    settings: workflow.settings || { executionOrder: "v1" },
    ...(workflow.tags ? { tags: sanitizeValue(workflow.tags) as unknown[] } : {})
  };
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workflow";
}

function workflowFilename(workflow: N8nWorkflow, includeUnknown: boolean): string | null {
  const stable = stableWorkflowFilenames.get(workflow.name);
  if (stable) return stable;
  if (!includeUnknown) return null;
  return `custom-${slugify(workflow.name)}.json`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
  const nextHash = hash(content);
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (hash(existing) === nextHash) return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return true;
}

export async function exportWorkflowsToRepo(options: {
  workflowDir?: string;
  includeUnknown?: boolean;
  preserveCredentialReferences?: boolean;
} = {}): Promise<ExportResult[]> {
  requireEnv("N8N_BASE_URL");
  requireEnv("N8N_API_KEY");

  const workflowDir = options.workflowDir || path.join(process.cwd(), "workflows");
  const includeUnknown = options.includeUnknown ?? getBoolEnv("N8N_SYNC_INCLUDE_UNKNOWN", false);
  const preserveCredentialReferences = options.preserveCredentialReferences ?? getBoolEnv("N8N_SYNC_PRESERVE_CREDENTIAL_REFERENCES", true);
  const workflows = await listFullN8nWorkflows();
  const results: ExportResult[] = [];

  for (const workflow of workflows) {
    const filename = workflowFilename(workflow, includeUnknown);
    if (!filename) continue;

    const filePath = path.join(workflowDir, filename);
    const sanitized = sanitizeWorkflowForRepo(workflow, { preserveCredentialReferences });
    const content = `${JSON.stringify(sanitized, null, 2)}\n`;
    const changed = await writeIfChanged(filePath, content);
    results.push({ workflowName: workflow.name, file: filePath, changed });

    logger.info(changed ? "Workflow synced from n8n UI" : "Workflow unchanged", {
      name: workflow.name,
      file: filename,
      preserveCredentialReferences
    });
  }

  return results;
}

export async function writeCredentialManifest(options: {
  credentialsDir?: string;
} = {}): Promise<{ file: string; changed: boolean; count: number }> {
  requireEnv("N8N_BASE_URL");
  requireEnv("N8N_API_KEY");

  const credentialsDir = options.credentialsDir || path.join(process.cwd(), "credentials");
  const credentials = await listN8nCredentials();
  const safeCredentials = credentials
    .map((credential) => ({
      id: credential.id,
      name: credential.name,
      type: credential.type,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt
    }))
    .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));

  const filePath = path.join(credentialsDir, "manifest.json");
  const content = `${JSON.stringify({
    note: "Credential metadata only. Secret values are never exported.",
    credentials: safeCredentials
  }, null, 2)}\n`;
  const changed = await writeIfChanged(filePath, content);

  logger.info(changed ? "Credential manifest synced" : "Credential manifest unchanged", {
    file: path.relative(process.cwd(), filePath),
    count: safeCredentials.length
  });

  return { file: filePath, changed, count: safeCredentials.length };
}
