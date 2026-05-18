import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getBoolEnv, getNumberEnv } from "../src/common/env.js";
import { exportWorkflowsToRepo, writeCredentialManifest } from "../src/common/n8n-api.js";
import { logger } from "../src/common/logger.js";
import { notifyTelegram } from "../src/common/telegram.js";

const execFileAsync = promisify(execFile);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runGit(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: process.cwd() });
  return stdout.trim();
}

async function isGitRepo(): Promise<boolean> {
  try {
    await runGit(["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

async function gitCommitAndPush(files: string[]): Promise<void> {
  if (!getBoolEnv("N8N_SYNC_GIT_COMMIT", false) && !getBoolEnv("N8N_SYNC_GIT_PUSH", false)) return;
  if (!(await isGitRepo())) {
    logger.warn("Git auto commit skipped because current folder is not a git repository");
    return;
  }

  const relativeFiles = files.map((file) => path.relative(process.cwd(), file));
  await runGit(["add", "--", ...relativeFiles]);

  if (getBoolEnv("N8N_SYNC_GIT_COMMIT", false)) {
    try {
      await runGit(["diff", "--cached", "--quiet"]);
      logger.info("Git commit skipped because no staged changes exist");
    } catch {
      const message = `chore(n8n): sync UI changes ${new Date().toISOString()}`;
      await runGit(["commit", "-m", message]);
      logger.info("Git commit created", { message });
    }
  }

  if (getBoolEnv("N8N_SYNC_GIT_PUSH", false)) {
    await runGit(["push"]);
    logger.info("Git push completed");
  }
}

async function syncOnce(): Promise<number> {
  const workflowResults = await exportWorkflowsToRepo();
  const changedFiles = workflowResults.filter((result) => result.changed).map((result) => result.file);

  if (getBoolEnv("N8N_SYNC_CREDENTIAL_MANIFEST", true)) {
    try {
      const manifest = await writeCredentialManifest();
      if (manifest.changed) changedFiles.push(manifest.file);
    } catch (error) {
      logger.warn("Credential manifest sync skipped", { error: (error as Error).message });
    }
  }

  if (changedFiles.length > 0) {
    await gitCommitAndPush(changedFiles);
    const message = [
      "BBV n8n UI sync completed",
      `Changed files: ${changedFiles.length}`,
      ...changedFiles.slice(0, 8).map((file) => `- ${path.relative(process.cwd(), file)}`)
    ].join("\n");
    await notifyTelegram(message);
  } else {
    logger.info("No n8n UI changes detected");
  }

  return changedFiles.length;
}

async function main(): Promise<void> {
  const watch = process.argv.includes("--watch") || getBoolEnv("N8N_SYNC_WATCH", false);
  const intervalSeconds = Math.max(15, getNumberEnv("N8N_SYNC_INTERVAL_SECONDS", 60));
  let running = true;

  process.on("SIGINT", () => {
    running = false;
    logger.info("Stopping n8n UI sync watcher");
  });
  process.on("SIGTERM", () => {
    running = false;
    logger.info("Stopping n8n UI sync watcher");
  });

  do {
    await syncOnce();
    if (!watch) break;
    await sleep(intervalSeconds * 1000);
  } while (running);
}

main().catch((error) => {
  logger.error("n8n UI sync failed", { error: (error as Error).message });
  process.exit(1);
});
