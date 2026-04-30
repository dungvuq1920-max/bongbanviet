# BongBanViet.com — Claude Project Guide

## Thông tin thương hiệu

| | |
|-|-|
| Website | bongbanviet.com |
| Tên | BÓNG BÀN VIỆT |
| Slogan | Tư Vấn Chuẩn - Hàng Chính Hãng |
| Địa chỉ | 286 Nguyễn Xiển, Thanh Liệt, Hà Nội |
| Hotline / Zalo | 096.1269.386 |
| Facebook | facebook.com/bongbanviet.official |
| Instagram | instagram.com/bongbanviet |
| TikTok | tiktok.com/@bongbanviet |

**Mục đích:** Showcase dụng cụ bóng bàn — không có giỏ hàng hay thanh toán. Khách xem rồi liên hệ Zalo/điện thoại.

---

## Tech Stack thực tế

| Layer | Công nghệ |
|-------|-----------|
| Runtime | Node.js ≥ 20 |
| Web server | Express 4 |
| Database | SQLite qua `better-sqlite3` |
| Frontend | Vanilla HTML + CSS + JS (không dùng framework) |
| Upload | Multer (ảnh sản phẩm + banner) |
| Excel import | ExcelJS |
| Deploy | Railway (nixpacks, `node server.js`) |
| Port | `process.env.PORT \|\| 3000` |

> **Không phải Next.js.** Đây là Express server phục vụ static HTML files. Dữ liệu load qua `fetch()` từ REST API.

---

## Cấu trúc thư mục

```
/
├── server.js               # Express app + tất cả API routes
├── db.js                   # SQLite init, migrations, seed
├── db-seed.json            # Dữ liệu seed ban đầu (categories, brands, products...)
├── db/
│   └── bongbanviet.db      # SQLite file (tạo tự động khi chạy)
│
├── index.html              # Trang chủ — SPA-style, tất cả danh mục trên 1 trang
├── san-pham.html           # Chi tiết sản phẩm (dùng ?id=slug)
├── cot-vot.html            # Danh mục riêng: Cốt Vợt (có filter brand, search)
├── mat-vot.html            # Danh mục riêng: Mặt Vợt
├── bong.html               # Danh mục riêng: Bóng
├── ban.html                # Danh mục riêng: Bàn
├── do-thi-dau.html         # Danh mục riêng: Đồ Thi Đấu
├── combo-vot.html          # Combo Vợt Khuyên Dùng
├── do-cu.html              # Đồ Đã Qua Sử Dụng
├── kien-thuc.html          # Chia Sẻ Kiến Thức — trang riêng đầy đủ (dùng cho footer)
├── lien-he.html            # Liên Hệ
├── huong-dan-mua-hang.html # Hướng Dẫn Mua Hàng
├── chinh-sach-doi-tra.html # Chính Sách Đổi Trả
├── admin.html              # Admin panel tại /admin.html (quản lý data)
│
├── js/
│   ├── nav-mega.js         # Mega-menu dùng chung mọi trang
│   ├── products.js         # loadProdGrid() — load product grid cho trang danh mục riêng
│   └── banners.js          # Load ảnh banner từ /api/settings lên hero
│
├── logo_bongbanviet.png    # Logo vuông, nội dung tròn — PHẢI dùng border-radius:50%
├── images/
│   ├── products/           # Ảnh sản phẩm (jpg/png/webp)
│   ├── brand/              # Logo hãng (butterfly-logo.png, tibhar-logo-white.png, yinhe-logo.jpg)
│   └── banners/            # Banner hero mỗi danh mục (banner-{slug}.jpg)
│
├── railway.toml            # Deploy config: nixpacks, startCommand = "node server.js"
├── package.json
└── .claude/settings.json   # Stop hook: auto git commit + push mỗi khi session kết thúc
```

---

## index.html — Kiến Trúc Trang Chủ

`index.html` hoạt động như một SPA: tất cả danh mục hiển thị trên cùng một trang. Người dùng dùng filter bar để lọc hoặc bấm "Xem Tất Cả" để focus vào một danh mục.

### Cấu trúc section sản phẩm

Mỗi danh mục là một `<div class="cat-block" id="block-{slug}">` với:
- `.flow-section-head` — tiêu đề + nút "Xem Tất Cả"
- `.prod-grid` / `.kt-qa-list` — grid sản phẩm hoặc accordion bài viết

```
block-cot-vot    → gridCotVot
block-mat-vot    → gridMatVot
block-bong       → gridBong
block-ban        → gridBan
block-do-thi-dau → gridDoThiDau
block-combo-vot  → gridComboVot
block-do-cu      → gridDoCu
block-kien-thuc  → gridKienThuc  (accordion, không phải prod-grid)
```

### Biến trạng thái và SECTIONS

```javascript
var SECTIONS = [
  { cat:'cot-vot',    gridId:'gridCotVot',   isCombo:false },
  { cat:'mat-vot',    gridId:'gridMatVot',    isCombo:false },
  { cat:'bong',       gridId:'gridBong',      isCombo:false },
  { cat:'ban',        gridId:'gridBan',       isCombo:false },
  { cat:'do-thi-dau', gridId:'gridDoThiDau',  isCombo:false },
  { cat:'combo-vot',  gridId:'gridComboVot',  isCombo:true  },
  { cat:'do-cu',      gridId:'gridDoCu',      isCombo:false }
];
// block-kien-thuc KHÔNG có trong SECTIONS — xử lý riêng trong applyFilters()

var activeCat   = 'all';   // slug danh mục đang lọc
var activeBrand = 'all';
var activePr    = 'all';
var activeSort  = 'default';
var activeNameQ = '';
```

### Filter bar (`#catSearchBar`)

Sticky bar phía trên sections, gồm:
- `#fltrCat` — dropdown danh mục
- `#fltrBrand` — dropdown thương hiệu (ẩn khi activeCat không có brand)
- `#fltrPrice` — dropdown giá tiền
- `#fltrSort` — dropdown sắp xếp
- `#fltrNameInput` — search tên sản phẩm
- `#catSubPills` — row brand pills (hiện khi đang ở 1 danh mục cụ thể)

### `applyFilters()` — logic hiển thị

- `activeCat === 'all'`: hiển thị tất cả sections, mỗi section chỉ hiện 5 sản phẩm đầu
- `activeCat === 'slug'`: ẩn tất cả section khác, hiện tất cả sản phẩm của slug đó
- `block-kien-thuc` được ẩn khi `activeCat !== 'all'` và `activeCat !== 'kien-thuc'`

### Nút "Xem Tất Cả" (`data-see-all`)

Tất cả nút "Xem Tất Cả" dùng thuộc tính `data-see-all="slug"`:
```html
<button class="feat-see-all" data-see-all="cot-vot">Xem Tất Cả ›</button>
<button class="feat-see-all" id="btnKienThucAll" data-see-all="kien-thuc">Xem Tất Cả ›</button>
```
Handler chung: set `activeCat = slug` → `applyFilters()` → scroll đến `#block-{slug}`.
Riêng `kien-thuc`: handler còn gọi thêm `expandArtGrid()` để hiện tất cả bài viết.

Tiêu đề section tự thay đổi:
- `activeCat === 'all'`: "Cốt Vợt **Tiêu Biểu**"
- `activeCat === 'cot-vot'`: "**Tất Cả** Cốt Vợt"

---

## Kiến Thức — Q&A Accordion

Section `#block-kien-thuc` dùng accordion thay vì product grid.

### HTML pattern
```html
<div class="kt-qa-list" id="gridKienThuc">
  <div class="kt-qa-item" id="ktqa-0">
    <div class="kt-qa-header" onclick="toggleKtItem(0)">
      <span class="kt-qa-toggle">+</span>
      <span class="kt-qa-hd-title">Tiêu đề bài viết</span>
    </div>
    <div class="kt-qa-body"><!-- HTML content --></div>
  </div>
</div>
```

### CSS states
- Đóng: `.kt-qa-toggle` → `+`, border xám
- Mở: `.kt-qa-item.open` → toggle đỏ `−`, title đỏ, body `display:block`

### JS functions (IIFE scope, một số export ra window)
| Hàm | Mô tả |
|-----|-------|
| `loadArtGrid()` | Fetch `/api/articles?limit=200`, render 8 bài đầu (`PREVIEW=8`) |
| `expandArtGrid()` | Render tất cả `artItems`, ẩn `btnKienThucAll` |
| `toggleKtItem(idx)` | Single-open accordion: đóng item đang mở, mở item được click |
| `renderQAItem(item, i)` | Render một `.kt-qa-item` từ article object |

`artItems` được cache trong memory — `expandArtGrid()` không fetch lại.

### Art Drawer (`#artDrawer`)
Còn trong HTML nhưng hiện **không được dùng** (hàm `openArtDrawer`/`closeArtDrawer` chưa implement). Có thể dùng lại sau nếu cần slide-in panel đọc bài đầy đủ.

---

## Logo

`logo_bongbanviet.png` là file PNG **vuông** với logo hình tròn nền trắng và góc đen. Phải luôn dùng `border-radius: 50%` trên mọi `<img>` hiển thị logo này để clip bỏ góc đen:

```css
/* Desktop nav */
.nav-logo-img { border-radius: 50%; }

/* Inline (mobile nav header, footer) */
<img src="logo_bongbanviet.png" style="border-radius:50%;">
```

---

## Navigation — index.html vs trang riêng

| Link | Đến đâu | Ghi chú |
|------|---------|---------|
| Nav desktop/mobile | `#block-{slug}` (scroll) | Reset về overview (`activeCat='all'`) rồi scroll |
| Nút "Xem Tất Cả" trong section | `#block-{slug}` (filter + scroll) | Chuyển sang chế độ filter 1 danh mục |
| Footer links | `cot-vot.html`, `kien-thuc.html`... | Trang riêng đầy đủ |
| Mega menu brands | `#block-cot-vot` / `#block-mat-vot` | Scroll về section, không filter brand |

Nav click `#block-*` gọi `applyFilters()` ở trạng thái `'all'` — hiển thị overview toàn bộ.

---

## Floating Popups (Quick-view sản phẩm)

Khi hover product card trên index.html, hiện dual popups:
- `#popupSpecs` — tên sản phẩm + giá + thông số kỹ thuật
- `#popupDesc` — mô tả ngắn + nút "Xem Chi Tiết ↗"
- SVG arrow line nối card với popup (`#fp-svg`, `#fp-lh`, `#fp-lv`)

---

## Database Schema (SQLite)

### Bảng `products`
```
id, slug, name, category_slug, brand_slug, gear_subcategory,
description, specs (JSON obj), images (JSON arr), featured (0/1),
condition ('new'|'used'), badge, sort_order, price (text),
in_stock (0/1), variants (JSON arr), created_at, updated_at
```

**variants** — mảng object `{name, price, color, color_code, image}`. Khi có variants, giá hiển thị theo variant được chọn, định dạng bằng `fmtPrice()` (dấu chấm ngăn cách hàng nghìn, kiểu Việt Nam).

### Bảng `combos`
```
id, slug, name, level, blade, rubber_fh, rubber_bh,
description, images (JSON arr), badge, sort_order, price, in_stock
```

### Bảng `articles`
```
id, slug, title, excerpt, content, cover_image,
category, tags (JSON arr), published_at, created_at
```

### Bảng `categories`
```
slug, label, description, image, sort_order
```

### Bảng `brands`
```
slug, label, logo, sort_order
```

### Bảng `settings`
```
key, value, updated_at
```
Dùng để lưu URL ảnh banner: key = `banner_{category_slug}`.

---

## API Routes (server.js)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/products` | Danh sách sản phẩm (query: `category`, `brand`, `featured`, `limit`, `q`) |
| GET | `/api/products/:slug` | Chi tiết 1 sản phẩm |
| POST | `/api/products` | Thêm sản phẩm mới |
| PUT | `/api/products/:id` | Cập nhật sản phẩm |
| DELETE | `/api/products/:id` | Xóa sản phẩm |
| GET | `/api/combos` | Danh sách combo |
| POST | `/api/combos` | Thêm combo |
| PUT | `/api/combos/:id` | Cập nhật combo |
| DELETE | `/api/combos/:id` | Xóa combo |
| GET | `/api/articles` | Danh sách bài viết |
| GET | `/api/articles/:slug` | Chi tiết bài viết |
| POST | `/api/articles` | Thêm bài viết |
| PUT | `/api/articles/:id` | Cập nhật bài viết |
| DELETE | `/api/articles/:id` | Xóa bài viết |
| GET | `/api/categories` | Danh sách categories |
| GET | `/api/brands` | Danh sách brands |
| GET | `/api/settings` | Tất cả settings (banner URLs...) |
| GET | `/api/settings/:key` | 1 setting theo key |
| PUT | `/api/settings/:key` | Cập nhật setting |
| DELETE | `/api/settings/:key` | Xóa setting |
| POST | `/api/settings/:key/upload` | Upload ảnh banner cho key |
| POST | `/api/upload` | Upload ảnh sản phẩm → trả về URL |
| GET | `/api/download-template` | Tải file Excel template import |
| POST | `/api/import-excel` | Import sản phẩm từ file Excel |
| GET | `/api/stats` | Thống kê (số lượng sản phẩm, combo, bài viết) |
| GET | `/lichtap` | Redirect tới lichtap/index.html |
| GET | `/api/lichtap` | Đọc dữ liệu lịch tập |
| POST | `/api/lichtap` | Ghi dữ liệu lịch tập |

---

## Danh mục sản phẩm

### Categories (slug → label)
| Slug | Label | Ghi chú |
|------|-------|---------|
| `cot-vot` | Cốt Vợt | Có filter brand |
| `mat-vot` | Mặt Vợt | Có filter brand |
| `bong` | Bóng | — |
| `ban` | Bàn | — |
| `do-thi-dau` | Đồ Thi Đấu | Có subcategory: `giay`, `trang-phuc-phu-kien` |
| `combo-vot` | Combo Vợt | Lưu trong bảng `combos` riêng |
| `do-cu` | Đồ Cũ | `condition = 'used'` |
| `kien-thuc` | Kiến Thức | Lưu trong bảng `articles` riêng, accordion UI |

### Brands (áp dụng cho cot-vot và mat-vot)
| Slug | Label |
|------|-------|
| `butterfly` | BUTTERFLY |
| `tibhar` | TIBHAR |
| `unrex` | UNREX |
| `yinhe` | YINHE |
| `khac` | Các Hãng Khác |

---

## Shared JavaScript

### `js/nav-mega.js`
Mega-menu dùng chung. Include vào mỗi trang HTML. Tự detect trang hiện tại để highlight active link. Menu có dropdown brand cho Cốt Vợt và Mặt Vợt.

### `js/products.js`
Export hàm `loadProdGrid(params, options)`. Dùng cho các **trang danh mục riêng** (cot-vot.html, mat-vot.html...) để load và render product grid từ API. **Không dùng cho index.html** (index.html có logic riêng).

### `js/banners.js`
Auto-apply banner từ `/api/settings` lên hero section. Dùng bằng:
```html
<script src="/js/banners.js" data-banner-key="banner_cot_vot"></script>
```
Hoặc gọi: `applyBanner('banner_cot_vot', '#hero-el')`

---

## Design System

### Triết lý
Tối giản, hiện đại, editorial — ảnh sản phẩm làm trung tâm. Bold typography, generous whitespace. Tham khảo style Fable & Mane.

### Màu sắc (CSS variables)
```css
--red:    #D62B2B   /* primary — đỏ bóng bàn */
--navy:   #1E2B3C   /* giá, CTA buttons */
--dark:   #1A1A1A   /* text chính */
--mid:    #6B6B6B   /* text phụ, label */
--bg:     #FAFAF8   /* background off-white */
--white:  #FFFFFF
--line:   #E5E5E3   /* border, divider */
--blue:   #2563EB   /* score/rating */
```

### Typography
- **Hero / Display:** bold, lớn, serif hoặc Inter ExtraBold
- **Section title:** uppercase, letter-spacing rộng
- **Body:** Inter 15–16px, line-height 1.7
- **Label / badge:** uppercase, font-size 11px, letter-spacing .14em

### Quy tắc UI
- Góc vuông hoặc rất nhỏ (`border-radius` ≤ 4px) cho block lớn
- Không dùng shadow lớn — flat design
- Hover: `scale(1.02)` nhẹ hoặc overlay mờ
- Button: solid fill hoặc outline, không gradient
- Giá hiển thị định dạng `toLocaleString('vi-VN')` → 66.000, 1.200.000

---

## Trang Chi Tiết Sản Phẩm (`san-pham.html`)

URL: `/san-pham.html?id={slug}`

Cấu trúc:
- Gallery ảnh (main + thumbnails)
- Tên sản phẩm
- **Giá** (label "Giá" + pill navy) — định dạng `fmtPrice()`, "Liên hệ để biết giá" nếu không có giá
- Badge tình trạng (Hàng Mới / Đã Qua Sử Dụng)
- **Lựa Chọn** (variants) — nút hiển thị tên variant, click cập nhật giá phía trên (không hiện giá trong nút)
- Thông Số Kỹ Thuật (bảng specs)
- CTA: Tư Vấn Ngay Qua Zalo (link Zalo kèm tên sản phẩm)
- Section chi tiết mô tả + lời khuyên chuyên gia
- Sản phẩm liên quan

---

## Admin Panel (`admin.html`)

URL: `/admin.html`

Tabs:
- **Sản phẩm** — CRUD từng danh mục, upload ảnh, quản lý variants
- **Combo Vợt** — CRUD combo (blade + rubber)
- **Kiến Thức** — CRUD bài viết
- **Banner** — Upload ảnh banner hero cho từng danh mục (lưu vào `settings`)
- **Import Excel** — Tải template, import hàng loạt sản phẩm

---

## Deploy & Automation

### Railway
- File `railway.toml`: builder = nixpacks, startCommand = `node server.js`
- Push lên GitHub → Railway tự deploy
- Database SQLite lưu vào `DATA_DIR` (Railway volume) để persist qua deploy
- Nếu Railway stuck QUEUED: tạo empty commit để retrigger (`git commit --allow-empty -m "retrigger"`)

### Auto push GitHub
`.claude/settings.json` có Stop hook: mỗi khi session Claude kết thúc, tự động:
1. `git add -A`
2. Nếu có thay đổi: `git commit -m "Auto-save: {timestamp}"` + `git push origin main`

### Server tự-heal EADDRINUSE
`server.js` bắt sự kiện `EADDRINUSE` → dùng `netstat + taskkill` kill process cũ → retry sau 500ms. Không cần tắt tay khi restart.

---

## Development Commands

```bash
npm start       # Chạy server tại localhost:3000
npm run dev     # Như trên
```

Sau khi chạy:
- Website: http://localhost:3000/index.html
- Admin: http://localhost:3000/admin.html

---

## SEO & Metadata

- Mỗi trang có `<title>` và `<meta description>` riêng
- Title format: `{Tên trang} | BÓNG BÀN VIỆT`
- Description tiếng Việt ~150 ký tự, có slogan "Tư Vấn Chuẩn - Hàng Chính Hãng"
- Canonical: `https://bongbanviet.com`

---

## Tone & Voice

- Chuyên nghiệp nhưng gần gũi, tập trung vào đam mê bóng bàn
- Ngắn gọn, súc tích — không dài dòng
- Dùng "chúng tôi" (không phải "mình" hay "tôi")
- Toàn bộ nội dung **tiếng Việt**
