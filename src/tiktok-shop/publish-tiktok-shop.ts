import { getEnv, requireEnv } from "../common/env.js";
import { retry } from "../common/retry.js";

export type TikTokShopProductInput = {
  product_name: string;
  description: string;
  price: number;
  stock: number;
  images: string[];
  video_url?: string;
  sku: string;
  category: string;
  source_id: string;
};

export async function publishTikTokShop(input: TikTokShopProductInput): Promise<{ productId?: string; raw: unknown }> {
  const baseUrl = getEnv("TIKTOK_SHOP_API_BASE_URL", "https://open-api.tiktokglobalshop.com").replace(/\/+$/, "");
  const accessToken = requireEnv("TIKTOK_SHOP_ACCESS_TOKEN");
  requireEnv("TIKTOK_SHOP_APP_KEY");
  requireEnv("TIKTOK_SHOP_APP_SECRET");
  requireEnv("TIKTOK_SHOP_ID");

  // TODO: Add TikTok Shop signature generation and exact product schema mapping per official API version.
  return retry(async () => {
    const response = await fetch(`${baseUrl}/product/202309/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tts-access-token": accessToken
      },
      body: JSON.stringify({
        save_mode: "LISTING",
        product_name: input.product_name,
        description: input.description,
        skus: [{ seller_sku: input.sku, price: { amount: String(input.price), currency: "VND" }, inventory: [{ quantity: input.stock }] }]
      })
    });
    const json = await response.json() as { data?: { product_id?: string }; message?: string; code?: number };
    if (!response.ok || json.code) throw new Error(json.message || `TikTok Shop HTTP ${response.status}`);
    return { productId: json.data?.product_id, raw: json };
  });
}

