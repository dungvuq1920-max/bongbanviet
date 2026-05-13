# FB Agent — Tự Động Tạo & Schedule Bài Facebook

AI Agent tự động tạo caption Facebook từ chủ đề bằng GPT, sau đó schedule lên Facebook Page qua Graph API. Thiết kế cho BÓNG BÀN VIỆT nhưng dễ tùy chỉnh cho bất kỳ page nào.

---

## Tính Năng

- Đọc danh sách chủ đề từ file CSV
- Dùng OpenAI GPT tạo caption + hashtag + CTA tự động
- Lưu bài dưới dạng **draft** để review trước
- Chỉ đăng sau khi người dùng **approve** (thay status = "approved")
- Schedule bài lên Facebook Page qua Graph API
- Retry tự động khi API lỗi (exponential backoff)
- Log chi tiết ra console + file `logs/agent.log`

---

## Cấu Trúc Thư Mục

```
fb-agent/
├── src/
│   ├── logger.js           # Structured logger (console + file)
│   ├── data_store.js       # Đọc/ghi CSV
│   ├── ai_writer.js        # Gọi OpenAI tạo caption
│   ├── facebook_client.js  # Gọi Facebook Graph API (có retry)
│   └── scheduler.js        # Cron job kiểm tra & schedule bài
├── main.js                 # Entry point
├── posts.csv               # Dữ liệu bài viết
├── .env.example            # Template biến môi trường
├── package.json
└── logs/
    └── agent.log           # Log file (tự tạo khi chạy)
```

---

## Cài Đặt

### Yêu Cầu

- Node.js >= 18
- Tài khoản OpenAI (lấy API key tại https://platform.openai.com)
- Facebook Page với quyền quản trị viên

### Bước 1: Cài dependencies

```bash
cd fb-agent
npm install
```

### Bước 2: Tạo file .env

```bash
cp .env.example .env
```

Điền các giá trị vào `.env`:

```env
OPENAI_API_KEY=sk-proj-...
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_PAGE_ACCESS_TOKEN=EAAxxxxx...
```

### Bước 3: Kiểm tra token Facebook

```bash
node main.js verify
```

Nếu thấy `Token hợp lệ` và tên Page → sẵn sàng.

---

## Cách Sử Dụng

### Workflow Chuẩn

```
1. Thêm topic vào posts.csv
2. node main.js agent      ← AI tạo caption → lưu draft
3. Mở posts.csv, xem draft
4. Đổi status "draft" → "approved"
5. node main.js scheduler  ← Tự động schedule lên Facebook
```

---

### 1. Thêm Chủ Đề Vào CSV

Mở `posts.csv` và thêm dòng mới. Chỉ cần điền 4 cột đầu:

| id | topic | brand_voice | scheduled_time | status |
|----|-------|-------------|----------------|--------|
| 6  | Hướng dẫn vệ sinh mặt vợt đúng cách | thân thiện | 2025-06-10 10:00:00 | *(để trống)* |

**Lưu ý về `scheduled_time`:**
- Format: `YYYY-MM-DD HH:mm:ss` (theo giờ Việt Nam — UTC+7)
- Phải cách thời điểm chạy scheduler ít nhất **10 phút** (yêu cầu của Facebook)

---

### 2. Chạy Agent Tạo Draft

```bash
node main.js agent
# hoặc
npm run agent
```

Agent sẽ:
1. Đọc các dòng có `status` trống hoặc `= "new"`
2. Gọi OpenAI để tạo `caption` và `hashtags`
3. Cập nhật `status = "draft"`

Sau khi chạy, mở `posts.csv` để xem kết quả.

---

### 3. Approve Bài

Mở `posts.csv` bằng Excel, Google Sheets, hoặc text editor:

1. Đọc caption trong cột `caption`
2. Chỉnh sửa nếu cần
3. Đổi cột `status` từ `"draft"` → `"approved"`
4. Lưu file

**Chưa approve = chưa đăng.** Scheduler sẽ bỏ qua mọi bài không có `status = "approved"`.

---

### 4. Chạy Scheduler

```bash
node main.js scheduler
# hoặc
npm run scheduler
```

Scheduler sẽ:
- Chạy **ngay lập tức** lần đầu
- Sau đó chạy mỗi 2 phút (cấu hình qua `SCHEDULER_CRON` trong `.env`)
- Với mỗi bài `approved`: validate → gọi Facebook API → cập nhật status

Để scheduler chạy nền mãi mãi, dùng PM2:

```bash
npm install -g pm2
pm2 start main.js --name fb-agent -- scheduler
pm2 save
pm2 startup
```

---

### 5. Xem Trạng Thái

```bash
node main.js status
# hoặc
npm run status
```

In ra bảng tóm tắt số lượng bài theo từng status và chi tiết từng bài.

---

## Các Trạng Thái (status)

| Status      | Ý Nghĩa |
|-------------|---------|
| *(trống)* hoặc `new` | Chờ agent tạo nội dung |
| `draft`     | AI đã tạo caption, chờ người review và approve |
| `approved`  | Đã approve, scheduler sẽ pick up và schedule lên Facebook |
| `scheduled` | Đã schedule thành công lên Facebook (có `facebook_post_id`) |
| `failed`    | Lỗi (xem cột `error_message` để biết nguyên nhân) |

**Cách fix bài bị `failed`:**
1. Xem cột `error_message`
2. Sửa vấn đề (ví dụ: cập nhật `scheduled_time` cho hợp lệ)
3. Đổi `status` → `"approved"` để scheduler retry

---

## Cách Lấy Facebook Page Access Token

### Bước 1: Tạo Facebook App

1. Truy cập [developers.facebook.com](https://developers.facebook.com)
2. Tạo App mới → chọn loại **"Business"**
3. Vào **Settings > Basic** → lấy `App ID` và `App Secret`

### Bước 2: Lấy User Access Token

1. Truy cập [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Chọn App của bạn
3. Click **"Generate Access Token"**
4. Tick các quyền: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
5. Authorize

### Bước 3: Đổi Sang Page Access Token

Trong Graph API Explorer, chạy:

```
GET /me/accounts
```

Tìm Page của bạn trong kết quả → lấy `access_token` của Page đó.

### Bước 4: Token Dài Hạn (Long-lived)

Token mặc định chỉ sống 1–2 giờ. Để lấy token sống 60 ngày:

```
GET https://graph.facebook.com/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={SHORT_LIVED_TOKEN}
```

Gọi endpoint này → lấy `access_token` mới → đổi Page Access Token lại.

> **Lưu ý:** Token không bao giờ tự gia hạn. Cần lặp lại process này khi token hết hạn (~60 ngày).
> Để có token vĩnh viễn, cần dùng System User trong Business Manager.

---

## Cấu Hình

| Biến môi trường | Mặc định | Mô tả |
|-----------------|----------|-------|
| `OPENAI_API_KEY` | *(bắt buộc)* | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model GPT dùng để tạo caption |
| `FACEBOOK_PAGE_ID` | *(bắt buộc)* | ID của Facebook Page |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | *(bắt buộc)* | Page Access Token |
| `FACEBOOK_GRAPH_VERSION` | `v19.0` | Phiên bản Facebook Graph API |
| `CSV_PATH` | `./posts.csv` | Đường dẫn file CSV |
| `SCHEDULER_CRON` | `*/2 * * * *` | Tần suất chạy scheduler |
| `LOG_LEVEL` | `INFO` | Mức log: DEBUG \| INFO \| WARN \| ERROR |

---

## Log

- Console: in màu theo level (xanh = INFO, vàng = WARN, đỏ = ERROR)
- File: `logs/agent.log` — mỗi dòng là 1 JSON object

```json
{"timestamp":"2025-05-13T10:00:00.000Z","level":"INFO","message":"Post 3 đã schedule thành công.","meta":{"fbPostId":"123456789_987654321"}}
```

---

## Lưu Ý Quan Trọng

1. **Facebook yêu cầu `scheduled_publish_time` phải cách hiện tại ít nhất 10 phút** và không quá 6 tháng.
2. **Page Access Token cần quyền `pages_manage_posts`** để schedule bài.
3. Bài schedule ở chế độ `published: false` — sẽ tự đăng đúng giờ, không cần app chạy vào lúc đó.
4. Scheduler phải chạy để detect bài `approved` và gọi API. Sau khi bài đã `scheduled`, scheduler không cần chạy nữa.
5. File CSV không hỗ trợ concurrent write — không chạy nhiều instance agent cùng lúc.
