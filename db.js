const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'bongbanviet.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    image TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS brands (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    logo TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_slug TEXT NOT NULL,
    brand_slug TEXT,
    gear_subcategory TEXT,
    description TEXT,
    specs TEXT DEFAULT '{}',
    images TEXT DEFAULT '[]',
    featured INTEGER DEFAULT 0,
    condition TEXT DEFAULT 'new',
    badge TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_slug) REFERENCES categories(slug)
  );

  CREATE TABLE IF NOT EXISTS combos (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    blade TEXT,
    rubber_fh TEXT,
    rubber_bh TEXT,
    description TEXT,
    images TEXT DEFAULT '[]',
    badge TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT,
    cover_image TEXT,
    category TEXT DEFAULT 'kien-thuc',
    tags TEXT DEFAULT '[]',
    published_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed categories nếu chưa có
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (catCount.c === 0) {
  const insertCat = db.prepare(
    'INSERT OR IGNORE INTO categories (slug, label, description, image, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const cats = [
    ['cot-vot', 'Cốt Vợt', 'Cốt vợt chính hãng Butterfly, Tibhar, Unrex, Yinhe', '/images/cat-cot-vot.jpg', 1],
    ['mat-vot', 'Mặt Vợt', 'Mặt vợt thi đấu và luyện tập chính hãng', '/images/cat-mat-vot.jpg', 2],
    ['bong', 'Bóng', 'Bóng thi đấu và luyện tập tiêu chuẩn ITTF', '/images/cat-bong.jpg', 3],
    ['ban', 'Bàn', 'Bàn bóng bàn trong nhà, ngoài trời, gấp gọn', '/images/cat-ban.jpg', 4],
    ['do-thi-dau', 'Đồ Thi Đấu', 'Giày, áo, quần và phụ kiện thi đấu', '/images/cat-do-thi-dau.jpg', 5],
    ['combo-vot', 'Combo Vợt', 'Bộ combo cốt + mặt vợt khuyên dùng theo trình độ', '/images/cat-combo.jpg', 6],
    ['do-cu', 'Đồ Cũ', 'Dụng cụ đã qua sử dụng còn tốt, giá tốt', '/images/cat-do-cu.jpg', 7],
    ['kien-thuc', 'Kiến Thức', 'Bài viết, hướng dẫn và review sản phẩm', '/images/cat-kien-thuc.jpg', 8],
  ];
  cats.forEach(c => insertCat.run(...c));
}

// Seed brands
const brandCount = db.prepare('SELECT COUNT(*) as c FROM brands').get();
if (brandCount.c === 0) {
  const insertBrand = db.prepare(
    'INSERT OR IGNORE INTO brands (slug, label, sort_order) VALUES (?, ?, ?)'
  );
  [
    ['butterfly', 'BUTTERFLY', 1],
    ['tibhar', 'TIBHAR', 2],
    ['unrex', 'UNREX', 3],
    ['yinhe', 'YINHE', 4],
    ['khac', 'Các Hãng Khác', 5],
  ].forEach(b => insertBrand.run(...b));
}

// Seed sản phẩm mẫu
const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
if (prodCount.c === 0) {
  const ins = db.prepare(`INSERT OR IGNORE INTO products
    (id, slug, name, category_slug, brand_slug, description, specs, images, featured, condition, badge)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const sampleProducts = [
    // Cốt vợt
    ['p001', 'viscaria-alc', 'Viscaria ALC', 'cot-vot', 'butterfly',
      'Cốt vợt huyền thoại, tốc độ cao, cảm giác bóng tuyệt vời.',
      JSON.stringify({ 'Lớp': '5+2 ALC', 'Tốc độ': 'OFF+', 'Control': '8.0', 'Trọng lượng': '86g' }),
      JSON.stringify(['/images/products/viscaria.jpg']), 1, 'new', 'Best Seller'],

    ['p002', 'timo-boll-alc', 'Timo Boll ALC', 'cot-vot', 'butterfly',
      'Vợt chuyên nghiệp dành cho tay ngang, cân bằng tốt.',
      JSON.stringify({ 'Lớp': '5+2 ALC', 'Tốc độ': 'OFF', 'Control': '8.5' }),
      JSON.stringify(['/images/products/timo-boll-alc.jpg']), 0, 'new', null],

    ['p003', 'samsonov-force-pro', 'Samsonov Force Pro', 'cot-vot', 'tibhar',
      'Cốt carbon mạnh mẽ, phù hợp lối chơi tấn công.',
      JSON.stringify({ 'Lớp': '5+2 Carbon', 'Tốc độ': 'OFF+', 'Control': '7.8' }),
      JSON.stringify(['/images/products/samsonov.jpg']), 0, 'new', null],

    ['p004', 'iv-s', 'IV-S', 'cot-vot', 'unrex',
      'Cốt vợt đa năng, cảm giác bóng tốt cho các cấp độ.',
      JSON.stringify({ 'Lớp': '7 lớp gỗ', 'Tốc độ': 'ALL+', 'Control': '9.2' }),
      JSON.stringify(['/images/products/iv-s.jpg']), 1, 'new', 'Khuyên Dùng'],

    ['p005', 'galaxy-yinhe-v14', 'Galaxy V-14 Pro', 'cot-vot', 'yinhe',
      'Cốt carbon giá tốt, hiệu năng vượt trội.',
      JSON.stringify({ 'Lớp': '5+2 Carbon', 'Tốc độ': 'OFF', 'Control': '8.0' }),
      JSON.stringify(['/images/products/v14.jpg']), 0, 'new', null],

    // Mặt vợt
    ['p006', 'tenergy-05', 'Tenergy 05', 'mat-vot', 'butterfly',
      'Mặt vợt số 1 thế giới, vòng xoáy cực cao.',
      JSON.stringify({ 'Độ nảy': '13.0', 'Vòng xoáy': '10.5', 'Độ cứng': '36°', 'Độ dày': '2.1mm' }),
      JSON.stringify(['/images/products/tenergy05.jpg']), 1, 'new', 'Top Pick'],

    ['p007', 'evolution-mx-p', 'Evolution MX-P', 'mat-vot', 'tibhar',
      'Mặt vợt thi đấu, nảy cao, xoáy tốt.',
      JSON.stringify({ 'Độ nảy': '12.8', 'Vòng xoáy': '10.2', 'Độ cứng': '42°' }),
      JSON.stringify(['/images/products/mx-p.jpg']), 1, 'new', null],

    // Bóng
    ['p008', 'butterfly-r40-plus', 'Butterfly R40+', 'bong', null,
      'Bóng thi đấu tiêu chuẩn ITTF 40mm+, nhựa ABS cao cấp.',
      JSON.stringify({ 'Chuẩn': 'ITTF', 'Chất liệu': 'ABS', 'Số sao': '3 sao', 'Màu': 'Trắng/Cam' }),
      JSON.stringify(['/images/products/r40plus.jpg']), 1, 'new', 'Giải Chính Thức'],

    // Bàn
    ['p009', 'joola-inside-15', 'JOOLA Inside 15', 'ban', null,
      'Bàn trong nhà tiêu chuẩn ITTF, mặt bàn 15mm.',
      JSON.stringify({ 'Mặt bàn': '15mm', 'Khung': 'Thép 30mm', 'Tiêu chuẩn': 'ITTF', 'Gấp': 'Được' }),
      JSON.stringify(['/images/products/joola-inside.jpg']), 1, 'new', null],

    // Đồ cũ
    ['p010', 'cu-viscaria-95', 'Viscaria ALC (Đã Qua Dùng)', 'do-cu', 'butterfly',
      'Cốt Viscaria ALC cũ, tình trạng 95%, chưa thay mặt.',
      JSON.stringify({ 'Tình trạng': '95%', 'Lớp': '5+2 ALC', 'Tốc độ': 'OFF+' }),
      JSON.stringify(['/images/products/viscaria-used.jpg']), 0, 'used', '95%'],
  ];

  sampleProducts.forEach(p => ins.run(...p));
}

// Seed bài viết mẫu
const artCount = db.prepare('SELECT COUNT(*) as c FROM articles').get();
if (artCount.c === 0) {
  const ins = db.prepare(`INSERT OR IGNORE INTO articles
    (id, slug, title, excerpt, content, cover_image, category, tags, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  ins.run(
    'a001', 'huong-dan-chon-cot-vot-cho-nguoi-moi',
    'Hướng Dẫn Chọn Cốt Vợt Cho Người Mới Bắt Đầu',
    'Bạn mới tập bóng bàn và không biết nên chọn cốt vợt nào? Bài viết này sẽ giúp bạn.',
    '<p>Khi mới bắt đầu tập bóng bàn, việc chọn cốt vợt phù hợp rất quan trọng...</p>',
    '/images/articles/chon-cot-vot.jpg', 'kien-thuc',
    JSON.stringify(['cốt vợt', 'người mới', 'hướng dẫn']),
    '2024-01-15'
  );

  ins.run(
    'a002', 'tenergy-05-co-con-xung-dang-khong',
    'Tenergy 05 — Có Còn Xứng Đáng Không?',
    'Sau nhiều năm trên thị trường, Tenergy 05 của Butterfly liệu có còn là lựa chọn tốt nhất?',
    '<p>Tenergy 05 ra mắt năm 2008 và nhanh chóng trở thành mặt vợt được ưa chuộng nhất...</p>',
    '/images/articles/tenergy-review.jpg', 'kien-thuc',
    JSON.stringify(['mặt vợt', 'butterfly', 'review']),
    '2024-02-20'
  );
}

// Migrations: add columns if not yet present
[
  "ALTER TABLE products ADD COLUMN price TEXT DEFAULT ''",
  "ALTER TABLE products ADD COLUMN in_stock INTEGER DEFAULT 1",
  "ALTER TABLE products ADD COLUMN variants TEXT DEFAULT '[]'",
  "ALTER TABLE combos ADD COLUMN price TEXT DEFAULT ''",
  "ALTER TABLE combos ADD COLUMN in_stock INTEGER DEFAULT 1",
].forEach(sql => { try { db.exec(sql); } catch {} });

module.exports = db;
