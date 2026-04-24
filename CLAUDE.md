# BongBanViet.com — Claude Project Guide

## Project Overview

**Website:** bongbanviet.com  
**Tên thương hiệu:** BÓNG BÀN VIỆT  
**Slogan:** Tư Vấn Chuẩn - Hàng Chính Hãng  
**Mục đích:** Showcase/giới thiệu dụng cụ bóng bàn — cốt vợt, mặt vợt, bóng, bàn, đồ thi đấu, combo, đồ cũ, kiến thức  
**Loại:** Static showcase (không có giỏ hàng hay thanh toán)  
**Ngôn ngữ:** Tiếng Việt  

### Thông tin liên hệ

| | |
|-|-|
| Địa chỉ | 286 Nguyễn Xiển, Thanh Liệt, Hà Nội |
| Hotline / Zalo | 096.1269.386 |
| Facebook | facebook.com/bongbanviet.official |
| Instagram | instagram.com/bongbanviet |
| TikTok | tiktok.com/@bongbanviet |

---

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS v3 |
| Language | TypeScript |
| Fonts | Inter (body) + Playfair Display (headings) via Google Fonts |
| Images | `next/image` |
| Linting | ESLint + Prettier |

---

## Design System

### Triết lý thiết kế
Tối giản, hiện đại, chuyên nghiệp. Lấy cảm hứng từ phong cách editorial — bold typography, generous whitespace, ảnh sản phẩm làm trung tâm. Tham khảo: Fable & Mane website style.

### Màu sắc

```
Primary (Đỏ bóng bàn):   #D62B2B
Accent (Coral):            #E8503A
Background (Off-white):    #FAFAF8
Surface (White):           #FFFFFF
Dark (Text chính):         #1A1A1A
Muted (Text phụ):          #6B6B6B
Border:                    #E5E5E3
```

Tailwind config (`tailwind.config.ts`):
```ts
colors: {
  primary: '#D62B2B',
  accent: '#E8503A',
  background: '#FAFAF8',
  dark: '#1A1A1A',
  muted: '#6B6B6B',
  border: '#E5E5E3',
}
```

### Typography

- **Display / Hero headline:** Playfair Display, bold, 64–96px
- **Section title:** Playfair Display hoặc Inter, bold, 36–48px
- **Body text:** Inter, regular, 16px, line-height 1.6
- **Caption / Label:** Inter, medium, 12–14px, uppercase + letter-spacing
- **CTA button:** Inter, semibold, 14px

### Spacing & Layout

- Max content width: `1280px`
- Section padding: `py-20` (80px vertical)
- Grid gap: `gap-6` hoặc `gap-8`
- Border radius: `rounded-none` cho block lớn, `rounded-sm` cho badge/tag

### Phong cách component

- Không bo góc lớn — góc vuông hoặc rất nhỏ
- Hover effects: scale nhẹ (`scale-[1.02]`) hoặc overlay mờ
- Button: solid fill hoặc outline, không gradient
- Không dùng shadow lớn — flat design

---

## Cấu trúc trang

| Route | Tên trang | Nội dung |
|-------|-----------|----------|
| `/` | Trang chủ | Hero + Sản phẩm nổi bật + Danh mục + About snippet + CTA liên hệ |
| `/cot-vot` | Cốt Vợt | Grid theo brand, filter brand |
| `/cot-vot/[brand]` | Cốt Vợt theo hãng | butterfly / tibhar / unrex / yinhe / khac |
| `/mat-vot` | Mặt Vợt | Grid theo brand, filter brand |
| `/mat-vot/[brand]` | Mặt Vợt theo hãng | butterfly / tibhar / unrex / yinhe / khac |
| `/bong` | Bóng | Các loại bóng thi đấu và luyện tập |
| `/ban` | Bàn | Bàn trong nhà, ngoài trời, gấp gọn |
| `/do-thi-dau` | Đồ Thi Đấu | Grid theo danh mục con |
| `/do-thi-dau/giay` | Giày | Giày bóng bàn |
| `/do-thi-dau/trang-phuc-phu-kien` | Trang Phục & Phụ Kiện | Áo, quần, băng tay, vớ... |
| `/combo-vot` | Combo Vợt Khuyên Dùng | Bộ combo cốt + mặt vợt đã lắp sẵn, tư vấn theo level |
| `/do-cu` | Đồ Đã Qua Sử Dụng | Sản phẩm second-hand còn tốt |
| `/kien-thuc` | Chia Sẻ Kiến Thức | Bài viết, hướng dẫn, review sản phẩm |
| `/kien-thuc/[slug]` | Bài viết chi tiết | Nội dung bài viết |
| `/lien-he` | Liên Hệ | Địa chỉ, hotline, Zalo, social links, bản đồ |

---

## Cấu trúc thư mục

```
/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout (font, metadata)
│   │   ├── page.tsx                # Homepage
│   │   ├── cot-vot/
│   │   │   ├── page.tsx            # Tất cả cốt vợt
│   │   │   └── [brand]/
│   │   │       └── page.tsx        # butterfly | tibhar | unrex | yinhe | khac
│   │   ├── mat-vot/
│   │   │   ├── page.tsx
│   │   │   └── [brand]/
│   │   │       └── page.tsx
│   │   ├── bong/
│   │   │   └── page.tsx
│   │   ├── ban/
│   │   │   └── page.tsx
│   │   ├── do-thi-dau/
│   │   │   ├── page.tsx
│   │   │   ├── giay/
│   │   │   │   └── page.tsx
│   │   │   └── trang-phuc-phu-kien/
│   │   │       └── page.tsx
│   │   ├── combo-vot/
│   │   │   └── page.tsx
│   │   ├── do-cu/
│   │   │   └── page.tsx
│   │   ├── kien-thuc/
│   │   │   ├── page.tsx            # Danh sách bài viết
│   │   │   └── [slug]/
│   │   │       └── page.tsx        # Chi tiết bài viết
│   │   └── lien-he/
│   │       └── page.tsx
│   │
│   ├── components/
│   │   ├── ui/                     # Atomic components
│   │   │   ├── Button.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── SectionTitle.tsx
│   │   ├── layout/                 # Structural components
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Navigation.tsx
│   │   └── sections/               # Page sections
│   │       ├── Hero.tsx
│   │       ├── FeaturedProducts.tsx
│   │       ├── CategoryGrid.tsx
│   │       ├── ProductGrid.tsx
│   │       ├── ProductCard.tsx
│   │       └── AboutSnippet.tsx
│   │
│   ├── data/
│   │   ├── products.ts             # Product data
│   │   └── categories.ts           # Category data
│   │
│   ├── lib/
│   │   └── utils.ts
│   │
│   └── types/
│       └── index.ts                # TypeScript types
│
├── public/
│   └── images/
│       ├── products/
│       └── brand/
│
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

---

## Data Types

```ts
// src/types/index.ts

export type MainCategory =
  | 'cot-vot'       // Cốt Vợt
  | 'mat-vot'       // Mặt Vợt
  | 'bong'          // Bóng
  | 'ban'           // Bàn
  | 'do-thi-dau'    // Đồ Thi Đấu
  | 'combo-vot'     // Combo Vợt Khuyên Dùng
  | 'do-cu'         // Đồ Đã Qua Sử Dụng
  | 'kien-thuc';    // Chia Sẻ Kiến Thức

// Brand subcategories — áp dụng cho Cốt Vợt và Mặt Vợt
export type Brand =
  | 'butterfly'
  | 'tibhar'
  | 'unrex'
  | 'yinhe'
  | 'khac';         // Các Sản Phẩm Khác

// Subcategories cho Đồ Thi Đấu
export type GearSubcategory =
  | 'giay'                    // Giày
  | 'trang-phuc-phu-kien';    // Trang Phục và Phụ Kiện

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: MainCategory;
  brand?: Brand;                      // Chỉ dùng cho cot-vot và mat-vot
  gearSubcategory?: GearSubcategory;  // Chỉ dùng cho do-thi-dau
  description: string;
  specs?: Record<string, string>;
  images: string[];
  featured?: boolean;
  condition?: 'new' | 'used';         // used chỉ dùng cho do-cu
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  publishedAt: string;
  tags?: string[];
}

export interface CategoryMeta {
  slug: MainCategory;
  label: string;
  description: string;
  image: string;
}

export interface BrandMeta {
  slug: Brand;
  label: string;
  logo?: string;
}
```

---

## Danh mục sản phẩm

### Danh mục chính

| Slug | Tên hiển thị | Ghi chú |
|------|-------------|---------|
| `cot-vot` | Cốt Vợt | Có danh mục con theo brand |
| `mat-vot` | Mặt Vợt | Có danh mục con theo brand |
| `bong` | Bóng | Bóng thi đấu, luyện tập |
| `ban` | Bàn | Bàn trong nhà, ngoài trời |
| `do-thi-dau` | Đồ Thi Đấu | Có danh mục con: Giày / Trang Phục & PK |
| `combo-vot` | Combo Vợt Khuyên Dùng | Bộ cốt + mặt vợt theo level |
| `do-cu` | Đồ Đã Qua Sử Dụng | Second-hand còn tốt |
| `kien-thuc` | Chia Sẻ Kiến Thức | Bài viết, review, hướng dẫn |

### Brand (áp dụng cho Cốt Vợt và Mặt Vợt)

| Slug | Tên hiển thị |
|------|-------------|
| `butterfly` | BUTTERFLY |
| `tibhar` | TIBHAR |
| `unrex` | UNREX |
| `yinhe` | YINHE |
| `khac` | Các Sản Phẩm Khác |

### Đồ Thi Đấu — danh mục con

| Slug | Tên hiển thị |
|------|-------------|
| `giay` | Giày |
| `trang-phuc-phu-kien` | Trang Phục và Phụ Kiện |

---

## Key Components

### Hero Section
- Full viewport width, background tối hoặc ảnh action
- Headline lớn (Playfair Display, trắng/đậm)
- Subtext ngắn gọn
- 2 CTA: "Xem sản phẩm" (primary) + "Về chúng tôi" (outline)
- Không dùng carousel — hero tĩnh, mạnh

### ProductCard
- Ảnh 4:3 ratio, object-cover
- Category badge (uppercase, nhỏ)
- Tên sản phẩm (Inter bold)
- Hover: ảnh scale nhẹ
- Không hiển thị giá (showcase only)

### Navigation
- Sticky khi scroll
- Logo trái, links giữa hoặc phải
- Hamburger menu trên mobile
- Transparent khi ở hero, solid khi scroll xuống

### SectionTitle
- Label nhỏ uppercase (màu primary) phía trên
- Headline lớn (Playfair Display)
- Optional: đường kẻ ngang trang trí

---

## Quy tắc code

- Dùng `'` thay vì `"` trong JSX attributes
- Component files: PascalCase (`ProductCard.tsx`)
- Data/util files: camelCase (`products.ts`)
- Tất cả text/nội dung bằng **tiếng Việt**
- Không dùng `any` trong TypeScript
- `next/image` cho mọi ảnh — luôn cung cấp `alt` text tiếng Việt
- Responsive: mobile-first với Tailwind breakpoints (`sm:`, `md:`, `lg:`)

---

## Development Commands

```bash
npm run dev      # Chạy dev server tại localhost:3000
npm run build    # Build production
npm run start    # Chạy production build
npm run lint     # ESLint check
npm run typecheck # TypeScript check (tsc --noEmit)
```

---

## SEO & Metadata

- Mỗi page có `generateMetadata()` riêng
- Title format: `{Tên trang} | BÓNG BÀN VIỆT`
- Description tiếng Việt, ~150 ký tự, nhắc slogan "Tư Vấn Chuẩn - Hàng Chính Hãng"
- OG image cho social sharing
- Canonical URL: `https://bongbanviet.com`

## Footer

Footer luôn hiển thị đầy đủ thông tin liên hệ:
- Logo + slogan "Tư Vấn Chuẩn - Hàng Chính Hãng"
- Địa chỉ: 286 Nguyễn Xiển, Thanh Liệt, Hà Nội
- Hotline/Zalo: 096.1269.386 (có thể click-to-call và click-to-Zalo)
- Social links: Facebook · Instagram · TikTok
- Menu danh mục nhanh

---

## Tone & Voice

- Chuyên nghiệp nhưng gần gũi
- Tập trung vào chất lượng và đam mê bóng bàn
- Ngắn gọn, súc tích — không dài dòng
- Dùng "chúng tôi" (không phải "mình" hay "tôi")
