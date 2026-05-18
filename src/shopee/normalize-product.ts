import type { ProductData } from "../common/validators.js";
import { validateProductData } from "../common/validators.js";

export function normalizeProduct(input: Partial<ProductData>): ProductData {
  const product: ProductData = {
    name: String(input.name || "").trim().slice(0, 120),
    description: String(input.description || "").trim(),
    price: Number(input.price || 0),
    stock: Math.max(0, Number(input.stock || 0)),
    sku: String(input.sku || "").trim(),
    images: Array.isArray(input.images) ? input.images.map(String).filter(Boolean) : [],
    category: String(input.category || "").trim(),
    attributes: input.attributes || {},
    weight: input.weight == null ? undefined : Number(input.weight),
    dimensions: input.dimensions || {}
  };

  const validation = validateProductData(product);
  if (!validation.ok) throw new Error(`Invalid product: ${validation.errors.join(", ")}`);
  return product;
}

