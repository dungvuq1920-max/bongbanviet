import "dotenv/config";

export type Env = Record<string, string | undefined>;

export const REQUIRED_N8N_ENV = ["N8N_BASE_URL", "N8N_API_KEY"] as const;

export const PLATFORM_ENV_GROUPS = {
  facebook: ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_ACCESS_TOKEN"],
  shopee: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_SHOP_ID", "SHOPEE_ACCESS_TOKEN"],
  tiktokShop: ["TIKTOK_SHOP_APP_KEY", "TIKTOK_SHOP_APP_SECRET", "TIKTOK_SHOP_ACCESS_TOKEN", "TIKTOK_SHOP_ID"]
} as const;

export function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function getBoolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function validateEnv(options: { requireN8n?: boolean; requirePlatforms?: boolean } = {}): string[] {
  if (getBoolEnv("SKIP_ENV_VALIDATION", false)) return [];

  const missing: string[] = [];
  if (options.requireN8n) {
    for (const name of REQUIRED_N8N_ENV) {
      if (!process.env[name]) missing.push(name);
    }
  }

  if (options.requirePlatforms || getBoolEnv("REQUIRE_PLATFORM_ENVS", false)) {
    for (const names of Object.values(PLATFORM_ENV_GROUPS)) {
      for (const name of names) {
        if (!process.env[name]) missing.push(name);
      }
    }
  }

  return missing;
}

export function n8nApiUrl(path: string): string {
  const base = requireEnv("N8N_BASE_URL").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
