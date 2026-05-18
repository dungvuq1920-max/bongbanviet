export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export type FacebookSourceData = {
  title: string;
  description: string;
  price?: number;
  image_url?: string;
  product_url?: string;
  category?: string;
  source_id: string;
};

export type VideoData = {
  video_url: string;
  title: string;
  product_name?: string;
  description?: string;
  hashtags?: string[];
  source_id: string;
};

export type ProductData = {
  name: string;
  description: string;
  price: number;
  stock: number;
  sku: string;
  images: string[];
  category: string;
  attributes?: Record<string, unknown>;
  weight?: number;
  dimensions?: { length?: number; width?: number; height?: number };
};

export function validateFacebookPostData(data: Partial<FacebookSourceData>): ValidationResult {
  const errors: string[] = [];
  if (!isNonEmptyString(data.title)) errors.push("title is required");
  if (!isNonEmptyString(data.description)) errors.push("description is required");
  if (!isNonEmptyString(data.source_id)) errors.push("source_id is required");
  if (data.price != null && !isPositiveNumber(data.price)) errors.push("price must be positive when provided");
  return { ok: errors.length === 0, errors };
}

export function validateVideoData(data: Partial<VideoData>): ValidationResult {
  const errors: string[] = [];
  if (!isNonEmptyString(data.video_url)) errors.push("video_url is required");
  if (!isNonEmptyString(data.title)) errors.push("title is required");
  if (!isNonEmptyString(data.source_id)) errors.push("source_id is required");
  if (data.video_url && !/^https?:\/\//i.test(data.video_url)) errors.push("video_url must be an absolute URL");
  return { ok: errors.length === 0, errors };
}

export function validateProductData(data: Partial<ProductData>): ValidationResult {
  const errors: string[] = [];
  if (!isNonEmptyString(data.name)) errors.push("name is required");
  if (!isNonEmptyString(data.description)) errors.push("description is required");
  if (!isPositiveNumber(data.price)) errors.push("price must be positive");
  if (typeof data.stock !== "number" || data.stock < 0) errors.push("stock must be zero or positive");
  if (!isNonEmptyString(data.sku)) errors.push("sku is required");
  if (!Array.isArray(data.images) || data.images.length === 0) errors.push("images must contain at least one URL");
  if (!isNonEmptyString(data.category)) errors.push("category is required");
  return { ok: errors.length === 0, errors };
}

