import type { FacebookSourceData } from "../common/validators.js";

export function formatFacebookPost(data: FacebookSourceData): string {
  const price = data.price
    ? `Giá tham khảo: ${data.price.toLocaleString("vi-VN")} VND`
    : "";

  const bullets = [
    data.category ? `Phù hợp nhóm: ${data.category}` : "",
    price,
    "Tư vấn theo trình độ, ngân sách và lối chơi của bạn."
  ].filter(Boolean);

  return [
    `Bạn đang tìm ${data.title}?`,
    "",
    data.description,
    "",
    "Điểm đáng chú ý:",
    ...bullets.map((item) => `• ${item}`),
    "",
    "Cần BongBanViet tư vấn setup phù hợp? Nhắn tin hoặc xem chi tiết tại link bên dưới.",
    data.product_url || "",
    "",
    "#BongBanViet #BóngBàn #TableTennis #TưVấnBóngBàn"
  ]
    .filter(Boolean)
    .join("\n");
}
