import { getEnv } from "../common/env.js";
import type { ProductData } from "../common/validators.js";

export async function fetchProductInfo(input: { sourceUrl?: string; sku?: string }): Promise<Partial<ProductData>> {
  const apiUrl = input.sourceUrl || getEnv("SOURCE_PRODUCT_API_URL");
  if (!apiUrl) throw new Error("Missing sourceUrl or SOURCE_PRODUCT_API_URL");

  const url = new URL(apiUrl);
  if (input.sku) url.searchParams.set("sku", input.sku);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Product source HTTP ${response.status}: ${await response.text()}`);
  return response.json() as Promise<Partial<ProductData>>;
}

