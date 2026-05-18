import { exportWorkflowsToRepo } from "../src/common/n8n-api.js";
import { logger } from "../src/common/logger.js";

async function main(): Promise<void> {
  const results = await exportWorkflowsToRepo();
  const changed = results.filter((result) => result.changed).length;
  logger.info("Workflow export completed", { count: results.length, changed });
}

main().catch((error) => {
  logger.error("Workflow export failed", { error: (error as Error).message });
  process.exit(1);
});
