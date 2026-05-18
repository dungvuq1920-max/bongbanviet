import { getEnv } from "../common/env.js";
import type { FacebookSourceData } from "../common/validators.js";
import { validateFacebookPostData } from "../common/validators.js";

export async function fetchSourceData(input: { sourceUrl?: string; sourceId?: string }): Promise<FacebookSourceData> {
  const apiUrl = input.sourceUrl || getEnv("SOURCE_PRODUCT_API_URL");
  if (!apiUrl) throw new Error("Missing sourceUrl or SOURCE_PRODUCT_API_URL");

  const url = new URL(apiUrl);
  if (input.sourceId) url.searchParams.set("source_id", input.sourceId);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Source API HTTP ${response.status}: ${await response.text()}`);
  const raw = await response.json() as Partial<FacebookSourceData>;

  const normalized: FacebookSourceData = {
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    price: raw.price == null ? undefined : Number(raw.price),
    image_url: raw.image_url,
    product_url: raw.product_url,
    category: raw.category,
    source_id: String(raw.source_id || input.sourceId || "")
  };

  const validation = validateFacebookPostData(normalized);
  if (!validation.ok) throw new Error(`Invalid Facebook source data: ${validation.errors.join(", ")}`);
  return normalized;
}

