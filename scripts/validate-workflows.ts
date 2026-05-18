import fs from "node:fs/promises";
import path from "node:path";
import { validateEnv } from "../src/common/env.js";
import { logger } from "../src/common/logger.js";

type WorkflowFile = {
  name?: string;
  nodes?: unknown[];
  connections?: Record<string, unknown>;
};

const root = process.cwd();
const workflowDir = path.join(root, "workflows");

async function readWorkflowFiles(): Promise<string[]> {
  const entries = await fs.readdir(workflowDir);
  return entries
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(workflowDir, name));
}

function validateWorkflowObject(file: string, workflow: WorkflowFile): string[] {
  const errors: string[] = [];
  if (!workflow.name || typeof workflow.name !== "string") errors.push("missing string field: name");
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) errors.push("missing non-empty array field: nodes");
  if (!workflow.connections || typeof workflow.connections !== "object") errors.push("missing object field: connections");

  const names = new Set<string>();
  for (const node of workflow.nodes || []) {
    const item = node as { name?: unknown; type?: unknown; parameters?: unknown };
    if (typeof item.name !== "string" || !item.name) errors.push("node missing name");
    if (typeof item.type !== "string" || !item.type) errors.push(`node ${String(item.name)} missing type`);
    if (item.name && names.has(item.name as string)) errors.push(`duplicate node name: ${String(item.name)}`);
    if (item.name) names.add(item.name as string);
  }

  if (!path.basename(file).match(/^\d{2}-.+\.json$/)) {
    errors.push("workflow filename should be stable and prefixed, e.g. 01-name.json");
  }
  return errors;
}

async function main(): Promise<void> {
  const missingEnv = validateEnv({ requireN8n: true, requirePlatforms: false });
  const errors: string[] = [];
  if (missingEnv.length) {
    errors.push(`Missing env vars: ${missingEnv.join(", ")}. Set them or use SKIP_ENV_VALIDATION=true for local JSON-only validation.`);
  }

  const files = await readWorkflowFiles();
  if (!files.length) errors.push("No workflow JSON files found in /workflows.");

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const workflow = JSON.parse(raw) as WorkflowFile;
      const workflowErrors = validateWorkflowObject(file, workflow);
      if (workflowErrors.length) {
        for (const error of workflowErrors) errors.push(`${path.basename(file)}: ${error}`);
      } else {
        logger.info("Workflow validated", { file: path.basename(file), name: workflow.name });
      }
    } catch (error) {
      errors.push(`${path.basename(file)}: invalid JSON - ${(error as Error).message}`);
    }
  }

  if (errors.length) {
    for (const error of errors) logger.error(error);
    process.exit(1);
  }
  logger.info("Validation completed", { workflows: files.length });
}

main().catch((error) => {
  logger.error("Validation failed", { error: (error as Error).message });
  process.exit(1);
});

