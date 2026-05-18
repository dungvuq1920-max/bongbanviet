import type { ProductData, VideoData } from "../common/validators.js";

export function formatTikTokShopContent(input: { product: Partial<ProductData>; video?: Partial<VideoData> }): string {
  const name = input.product.name || input.video?.product_name || input.video?.title || "San pham BongBanViet";
  const price = input.product.price ? `Gia: ${Number(input.product.price).toLocaleString("vi-VN")} VND` : "";
  return [
    `${name} - goi y nhanh cho nguoi choi bong ban`,
    input.product.description || input.video?.description || "",
    price,
    "Dat hang tren TikTok Shop va nhan tu van setup phu hop.",
    "#BongBanViet #TikTokShop #BongBan"
  ].filter(Boolean).join("\n");
}

