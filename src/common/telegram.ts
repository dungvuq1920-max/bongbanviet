import { getEnv } from "./env.js";
import { logger } from "./logger.js";

export async function notifyTelegram(text: string): Promise<boolean> {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const chatId = getEnv("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return false;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  const body = await response.text();
  if (!response.ok) {
    logger.warn("Telegram notification failed", { status: response.status, body });
    return false;
  }

  return true;
}
