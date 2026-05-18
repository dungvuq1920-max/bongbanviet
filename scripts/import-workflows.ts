import fs from "node:fs/promises";
import path from "node:path";
import { getBoolEnv, n8nApiUrl, requireEnv } from "../src/common/env.js";
import { logger } from "../src/common/logger.js";
import { retry } from "../src/common/retry.js";

type N8nWorkflow = {
  id?: string;
  name: string;
  active?: boolean;
  nodes: unknown[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown> | null;
};

type N8nListResponse<T> = {
  data?: T[];
  nextCursor?: string | null;
};

const workflowDir = path.join(process.cwd(), "workflows");

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-N8N-API-KEY": requireEnv("N8N_API_KEY")
  };
}

async function n8nRequest<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  return retry(async () => {
    const response = await fetch(n8nApiUrl(pathName), {
      ...init,
      headers: { ...headers(), ...(init.headers || {}) }
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`n8n API ${response.status}: ${text}`);
    return json as T;
  }, {
    attempts: 3,
    shouldRetry: (error) => !String((error as Error).message).includes("400")
  });
}

function cleanWorkflowForImport(workflow: N8nWorkflow): N8nWorkflow {
  const { id: _id, active: _active, staticData: _staticData, ...rest } = workflow;
  return {
    ...rest,
    settings: {
      executionOrder: "v1",
      ...(rest.settings || {})
    }
  };
}

async function listWorkflows(): Promise<N8nWorkflow[]> {
  const workflows: N8nWorkflow[] = [];
  let cursor: string | null | undefined;

  do {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const result = await n8nRequest<N8nListResponse<N8nWorkflow> | N8nWorkflow[]>(`/api/v1/workflows${query}`);
    if (Array.isArray(result)) {
      workflows.push(...result);
      cursor = null;
    } else {
      workflows.push(...(result.data || []));
      cursor = result.nextCursor;
    }
  } while (cursor);

  return workflows;
}

async function upsertWorkflow(file: string, existing: Map<string, N8nWorkflow>): Promise<void> {
  const raw = await fs.readFile(file, "utf8");
  const workflow = cleanWorkflowForImport(JSON.parse(raw) as N8nWorkflow);
  const current = existing.get(workflow.name);
  const activate = getBoolEnv("N8N_ACTIVATE_IMPORTED", false);

  if (current?.id) {
    const updated = await n8nRequest<N8nWorkflow>(`/api/v1/workflows/${current.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...workflow, active: activate || current.active || false })
    });
    logger.info("Workflow updated", { file: path.basename(file), name: workflow.name, id: updated.id || current.id });
  } else {
    const created = await n8nRequest<N8nWorkflow>("/api/v1/workflows", {
      method: "POST",
      body: JSON.stringify({ ...workflow, active: activate })
    });
    logger.info("Workflow created", { file: path.basename(file), name: workflow.name, id: created.id });
  }
}

async function main(): Promise<void> {
  requireEnv("N8N_BASE_URL");
  requireEnv("N8N_API_KEY");
  const files = (await fs.readdir(workflowDir))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(workflowDir, name));

  const workflows = await listWorkflows();
  const byName = new Map(workflows.map((workflow) => [workflow.name, workflow]));
  for (const file of files) await upsertWorkflow(file, byName);
  logger.info("Workflow import completed", { count: files.length });
}

main().catch((error) => {
  logger.error("Workflow import failed", { error: (error as Error).message });
  process.exit(1);
});
