import { getEnv } from "./env.js";
import { logger } from "./logger.js";
import { retry } from "./retry.js";

export type ContentRequest = {
  channel: "facebook" | "tiktok" | "shopee" | "tiktok-shop";
  topic: string;
  facts: Record<string, unknown>;
  format: string;
};

export async function generateContent(input: ContentRequest): Promise<string> {
  const provider = getEnv("AI_PROVIDER", "none").toLowerCase();
  const apiKey = getEnv("AI_API_KEY");
  if (!apiKey || provider === "none") {
    logger.warn("AI key missing; using fallback template", { channel: input.channel });
    return fallbackContent(input);
  }

  if (provider !== "openai") {
    // TODO: Add Gemini/Claude providers if required by production.
    logger.warn("Unsupported AI provider; using fallback template", { provider });
    return fallbackContent(input);
  }

  const model = getEnv("AI_MODEL", "gpt-4o-mini");
  const prompt = [
    `Channel: ${input.channel}`,
    `Topic: ${input.topic}`,
    `Facts: ${JSON.stringify(input.facts)}`,
    `Required format: ${input.format}`,
    "Return only final copy, no markdown explanation."
  ].join("\n");

  const response = await retry(async () => {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, input: prompt })
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ output_text?: string }>;
  });

  return response.output_text?.trim() || fallbackContent(input);
}

function fallbackContent(input: ContentRequest): string {
  return [
    `${input.topic}`,
    "",
    "Thong tin noi bat:",
    ...Object.entries(input.facts).slice(0, 5).map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "Nhan tin de duoc tu van chi tiet.",
    "#BongBanViet #TableTennis #BongBan"
  ].join("\n");
}

