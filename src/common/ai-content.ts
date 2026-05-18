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

  if (provider === "openai") return generateOpenAI(input, apiKey);
  if (provider === "claude" || provider === "anthropic") return generateClaude(input, apiKey);

  logger.warn("AI provider không được hỗ trợ; dùng fallback", { provider });
  return fallbackContent(input);
}

async function generateOpenAI(input: ContentRequest, apiKey: string): Promise<string> {
  const model = getEnv("AI_MODEL", "gpt-4o-mini");
  const prompt = buildPrompt(input);

  const response = await retry(async () => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512,
        temperature: 0.7
      })
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ choices?: Array<{ message?: { content?: string } }> }>;
  });

  return response.choices?.[0]?.message?.content?.trim() || fallbackContent(input);
}

async function generateClaude(input: ContentRequest, apiKey: string): Promise<string> {
  const model = getEnv("AI_MODEL", "claude-haiku-4-5-20251001");
  const prompt = buildPrompt(input);

  const response = await retry(async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Claude API HTTP ${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ content?: Array<{ type: string; text?: string }> }>;
  });

  const text = response.content?.find((b) => b.type === "text")?.text?.trim();
  return text || fallbackContent(input);
}

function buildPrompt(input: ContentRequest): string {
  return [
    `Kênh: ${input.channel}`,
    `Chủ đề: ${input.topic}`,
    `Thông tin: ${JSON.stringify(input.facts)}`,
    `Định dạng yêu cầu: ${input.format}`,
    "Viết bằng tiếng Việt, tự nhiên, phù hợp mạng xã hội. Chỉ trả về nội dung bài đăng, không giải thích thêm."
  ].join("\n");
}

function fallbackContent(input: ContentRequest): string {
  return [
    `${input.topic}`,
    "",
    "Thông tin nổi bật:",
    ...Object.entries(input.facts)
      .slice(0, 5)
      .map(([key, value]) => `• ${key}: ${String(value)}`),
    "",
    "Nhắn tin để được tư vấn chi tiết.",
    "#BongBanViet #TableTennis #BóngBàn"
  ].join("\n");
}
