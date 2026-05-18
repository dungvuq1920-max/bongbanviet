import crypto from "node:crypto";
import { getEnv, requireEnv } from "../common/env.js";
import type { ProductData } from "../common/validators.js";
import { retry } from "../common/retry.js";

function shopeeSign(path: string, timestamp: number): string {
  const partnerId = requireEnv("SHOPEE_PARTNER_ID");
  const partnerKey = requireEnv("SHOPEE_PARTNER_KEY");
  const shopId = requireEnv("SHOPEE_SHOP_ID");
  const accessToken = requireEnv("SHOPEE_ACCESS_TOKEN");
  const base = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex");
}

export async function publishShopee(product: ProductData): Promise<{ itemId?: number; raw: unknown }> {
  const baseUrl = getEnv("SHOPEE_API_BASE_URL", "https://partner.shopeemobile.com").replace(/\/+$/, "");
  const path = "/api/v2/product/add_item";
  const timestamp = Math.floor(Date.now() / 1000);
  const partnerId = requireEnv("SHOPEE_PARTNER_ID");
  const shopId = requireEnv("SHOPEE_SHOP_ID");
  const accessToken = requireEnv("SHOPEE_ACCESS_TOKEN");
  const sign = shopeeSign(path, timestamp);

  // TODO: Map category_id, logistics, brand, tax, pre-order, and attributes using Shopee Open Platform.
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("partner_id", partnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("shop_id", shopId);
  url.searchParams.set("sign", sign);

  return retry(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: product.name,
        description: product.description,
        original_price: product.price,
        stock: product.stock,
        item_sku: product.sku
      })
    });
    const json = await response.json() as { response?: { item_id?: number }; error?: string; message?: string };
    if (!response.ok || json.error) throw new Error(json.message || json.error || `Shopee HTTP ${response.status}`);
    return { itemId: json.response?.item_id, raw: json };
  });
}

