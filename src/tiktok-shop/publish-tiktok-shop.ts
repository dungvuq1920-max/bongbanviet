import { writeDraft, draftFilename } from "../common/draft-writer.js";
import { logger } from "../common/logger.js";

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

export type TikTokShopDraftResult = {
  mode: "draft";
  jsonPath: string;
  mdPath: string;
};

export async function publishTikTokShop(input: TikTokShopProductInput): Promise<TikTokShopDraftResult> {
  const json = {
    channel: "tiktok-shop",
    generated_at: new Date().toISOString(),
    source_id: input.source_id,
    listing: {
      product_name: input.product_name,
      description: input.description,
      price_vnd: input.price,
      stock: input.stock,
      seller_sku: input.sku,
      category_hint: input.category,
      images: input.images,
      video_url: input.video_url || null
    },
    checklist: [
      "Vào TikTok Seller Centre → Sản phẩm → Thêm sản phẩm mới",
      "Điền tên sản phẩm (product_name) — rõ ràng, có từ khoá",
      "Chọn danh mục phù hợp với category_hint",
      "Upload ảnh sản phẩm từ danh sách images (tối thiểu 1, tối đa 9)",
      "Upload video sản phẩm nếu có (video_url)",
      "Điền mô tả chi tiết (description)",
      "Thêm biến thể (SKU): điền seller_sku, giá (price_vnd VND), tồn kho (stock)",
      "Thiết lập vận chuyển và thời gian xử lý",
      "Điền các thuộc tính theo danh mục đã chọn",
      "Xem lại → Gửi duyệt / Đăng sản phẩm"
    ]
  };

  const imageList = input.images.map((url, i) => `${i + 1}. [Ảnh ${i + 1}](${url})`).join("\n") || "—";

  const markdown = `# TikTok Shop Draft — ${new Date().toISOString().slice(0, 10)}

## Thông tin sản phẩm

| Trường | Giá trị |
|--------|---------|
| Source ID | \`${input.source_id}\` |
| SKU | \`${input.sku}\` |
| Tên sản phẩm | ${input.product_name} |
| Giá bán | ${input.price.toLocaleString("vi-VN")} VND |
| Tồn kho | ${input.stock} |
| Danh mục gợi ý | ${input.category} |
| Video | ${input.video_url ? `[Xem video](${input.video_url})` : "—"} |
| Tạo lúc | ${new Date().toLocaleString("vi-VN")} |

## Mô tả (copy vào TikTok Shop)

\`\`\`
${input.description}
\`\`\`

## Ảnh sản phẩm

${imageList}

## Checklist đăng thủ công trên TikTok Seller Centre

${json.checklist.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;

  const { jsonPath, mdPath } = await writeDraft({
    filename: draftFilename("tiktok-shop", input.source_id),
    json,
    markdown
  });

  logger.info("TikTok Shop draft exported", { source_id: input.source_id, jsonPath, mdPath });
  return { mode: "draft", jsonPath, mdPath };
}
