import type { VideoData } from "../common/validators.js";

export function prepareTikTokCaption(data: VideoData): string {
  const tags = (data.hashtags || [])
    .map((tag) => tag.startsWith("#") ? tag : `#${tag}`)
    .join(" ");

  return [
    data.product_name ? `${data.product_name}: co gi dang chu y?` : data.title,
    data.description || "Goi y nhanh cho nguoi choi bong ban phong trao.",
    "Xem het video va nhan tin neu ban can tu van setup.",
    tags || "#BongBanViet #TableTennis #BongBan"
  ].join("\n");
}

