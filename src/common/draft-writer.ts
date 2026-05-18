import fs from "node:fs/promises";
import path from "node:path";
import { getEnv } from "./env.js";

export type DraftFile = {
  filename: string;
  json: Record<string, unknown>;
  markdown: string;
};

export async function writeDraft(draft: DraftFile): Promise<{ jsonPath: string; mdPath: string }> {
  const outputDir = path.resolve(process.cwd(), getEnv("DRAFT_OUTPUT_DIR", "output"));
  await fs.mkdir(outputDir, { recursive: true });

  const base = draft.filename.replace(/\.[^.]+$/, "");
  const jsonPath = path.join(outputDir, `${base}.json`);
  const mdPath = path.join(outputDir, `${base}.md`);

  await fs.writeFile(jsonPath, JSON.stringify(draft.json, null, 2) + "\n", "utf8");
  await fs.writeFile(mdPath, draft.markdown, "utf8");

  return { jsonPath, mdPath };
}

export function draftFilename(channel: string, sourceId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safe = sourceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return `${channel}-${date}-${safe}`;
}
