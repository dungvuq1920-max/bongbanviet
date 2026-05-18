import { logger } from "../src/common/logger.js";

async function main(): Promise<void> {
  logger.info("Post-build deployment hook started");
  logger.info("Run npm run import:workflows after Railway deployment when N8N_BASE_URL and N8N_API_KEY are available");
  // TODO: If this repo is deployed in the same Railway service as n8n, call import-workflows here.
  // Keeping this hook non-destructive prevents accidental production workflow overwrite during builds.
}

main().catch((error) => {
  logger.error("Deploy hook failed", { error: (error as Error).message });
  process.exit(1);
});

