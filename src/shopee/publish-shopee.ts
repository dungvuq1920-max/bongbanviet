import { writeDraft, draftFilename } from "../common/draft-writer.js";
import type { ProductData } from "../common/validators.js";
import { logger } from "../common/logger.js";

export type ShopeeDraftResult = {
  mode: "draft";
  jsonPath: string;
  mdPath: string;
};

export async function publishShopee(product: ProductData): Promise<ShopeeDraftResult> {
  const sourceId = product.sku || `shopee-${Date.now()}`;

  const json = {
    channel: "shopee",
    generated_at: new Date().toISOString(),
    source_id: sourceId,
    listing: {
      item_name: product.name,
      description: product.description,
      original_price: product.price,
      stock: product.stock,
      item_sku: product.sku,
      category_hint: product.category,
      images: product.images,
      attributes: product.attributes || {},
      weight: product.weight,
      dimensions: product.dimensions || {}
    },
    checklist: [
      "Vào Shopee Seller Centre → Quản lý sản phẩm → Thêm sản phẩm mới",
      "Điền tên sản phẩm (item_name) — tối đa 120 ký tự",
      "Chọn danh mục phù hợp với category_hint",
      "Upload ảnh từ danh sách images (tối thiểu 1, khuyến nghị 5-9 ảnh)",
      "Điền mô tả sản phẩm (description)",
      "Điền giá bán (original_price) theo VND",
      "Điền tồn kho (stock)",
      "Điền mã SKU (item_sku)",
      "Điền cân nặng (weight) nếu có — đơn vị gram",
      "Điền kích thước (dimensions) nếu có — đơn vị cm",
      "Điền các thuộc tính sản phẩm (attributes) theo danh mục đã chọn",
      "Thiết lập vận chuyển (chọn đơn vị vận chuyển, phí ship)",
      "Xem lại và nhấn Lưu / Đăng sản phẩm"
    ]
  };

  const attrRows = Object.entries(product.attributes || {})
    .map(([k, v]) => `| ${k} | ${String(v)} |`)
    .join("\n") || "| — | — |";

  const imageList = product.images.map((url, i) => `${i + 1}. [Ảnh ${i + 1}](${url})`).join("\n");

  const markdown = `# Shopee Product Draft — ${new Date().toISOString().slice(0, 10)}

## Thông tin sản phẩm

| Trường | Giá trị |
|--------|---------|
| SKU | \`${product.sku}\` |
| Tên sản phẩm | ${product.name} |
| Giá bán | ${product.price.toLocaleString("vi-VN")} VND |
| Tồn kho | ${product.stock} |
| Danh mục gợi ý | ${product.category} |
| Cân nặng | ${product.weight ? product.weight + " gram" : "—"} |
| Tạo lúc | ${new Date().toLocaleString("vi-VN")} |

## Mô tả (copy vào Shopee)

\`\`\`
${product.description}
\`\`\`

## Ảnh sản phẩm

${imageList}

## Thuộc tính sản phẩm

| Thuộc tính | Giá trị |
|-----------|---------|
${attrRows}

## Kích thước

- Dài: ${product.dimensions?.length ?? "—"} cm
- Rộng: ${product.dimensions?.width ?? "—"} cm
- Cao: ${product.dimensions?.height ?? "—"} cm

## Checklist đăng thủ công trên Shopee Seller Centre

${json.checklist.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;

  const { jsonPath, mdPath } = await writeDraft({
    filename: draftFilename("shopee", sourceId),
    json,
    markdown
  });

  logger.info("Shopee draft exported", { sku: product.sku, jsonPath, mdPath });
  return { mode: "draft", jsonPath, mdPath };
}
