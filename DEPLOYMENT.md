# Bóng Bàn Việt — local, GitHub và Railway

## Chạy local

Yêu cầu Node.js 20 trở lên.

```powershell
npm install
npm start
```

Storefront SPA: `http://localhost:24680/`

Trang công cụ local: `http://localhost:24680/local`

Admin: `http://localhost:24680/admin.html`

Có thể dùng `scripts/start-bongbanviet-local.ps1` để tự mở storefront đúng port.

## Database cũ

Ứng dụng tiếp tục dùng SQLite qua `better-sqlite3`. Local mặc định đọc
`db/bongbanviet.db`; trên Railway, đặt `DATA_DIR` đến Railway Volume hiện tại.
Không đổi đường dẫn Volume khi deploy nếu muốn giữ nguyên toàn bộ dữ liệu cũ.

Storefront đọc trực tiếp `products`, `categories`, `brands`, `combos` và
`articles`. Đơn COD mới được ghi vào bảng `orders`; giá và trạng thái còn hàng
được server đọc lại từ database trước khi tạo đơn.

## Quy trình deploy hiện tại

1. Kiểm tra local tại port 24680.
2. Commit và push lên repository GitHub hiện tại.
3. Railway tự build bằng Nixpacks và chạy `node server.js`.
4. Railway tự cung cấp biến `PORT`; không đặt cứng 24680 trên Railway.
5. Xác nhận Railway Volume vẫn mount đúng `DATA_DIR` trước khi deploy production.

Các secret chỉ cấu hình trong Railway Variables hoặc file `.env` local không
commit. `.env.example` chỉ liệt kê tên biến.
