import type { FacebookSourceData } from "../common/validators.js";

export function formatFacebookPost(data: FacebookSourceData): string {
  const price = data.price ? `Gia tham khao: ${data.price.toLocaleString("vi-VN")} VND` : "";
  const benefits = [
    data.category ? `Phu hop nhom: ${data.category}` : "",
    price,
    "Thong tin ro rang, uu tien tu van dung trinh do va ngan sach."
  ].filter(Boolean);

  return [
    `Ban dang tim ${data.title}?`,
    "",
    data.description,
    "",
    "Diem dang chu y:",
    ...benefits.map((item) => `- ${item}`),
    "",
    "Can BongBanViet tu van setup phu hop? Nhan tin hoac xem chi tiet tai link ben duoi.",
    data.product_url || "",
    "",
    "#BongBanViet #BongBan #TableTennis #TuVanBongBan"
  ].filter(Boolean).join("\n");
}

