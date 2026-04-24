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

// Seed từ db-seed.json nếu có (dữ liệu thực), hoặc fallback sample data
const SEED_FILE = path.join(__dirname, 'db-seed.json');
if (fs.existsSync(SEED_FILE)) {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (catCount.c === 0 && seed.categories?.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO categories (slug,label,description,image,sort_order) VALUES (?,?,?,?,?)');
    seed.categories.forEach(r => ins.run(r.slug, r.label, r.description, r.image, r.sort_order));
  }

  const brandCount = db.prepare('SELECT COUNT(*) as c FROM brands').get();
  if (brandCount.c === 0 && seed.brands?.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO brands (slug,label,logo,sort_order) VALUES (?,?,?,?)');
    seed.brands.forEach(r => ins.run(r.slug, r.label, r.logo, r.sort_order));
  }

  const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (prodCount.c === 0 && seed.products?.length) {
    const ins = db.prepare(`INSERT OR IGNORE INTO products
      (id,slug,name,category_slug,brand_slug,gear_subcategory,description,specs,images,
       featured,condition,badge,sort_order,price,in_stock,variants,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    seed.products.forEach(r => ins.run(
      r.id, r.slug, r.name, r.category_slug, r.brand_slug, r.gear_subcategory,
      r.description, r.specs, r.images, r.featured, r.condition, r.badge, r.sort_order,
      r.price, r.in_stock, r.variants, r.created_at, r.updated_at
    ));
  }

  const comboCount = db.prepare('SELECT COUNT(*) as c FROM combos').get();
  if (comboCount.c === 0 && seed.combos?.length) {
    const ins = db.prepare(`INSERT OR IGNORE INTO combos
      (id,slug,name,level,blade,rubber_fh,rubber_bh,description,images,badge,sort_order,price,in_stock)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    seed.combos.forEach(r => ins.run(
      r.id, r.slug, r.name, r.level, r.blade, r.rubber_fh, r.rubber_bh,
      r.description, r.images, r.badge, r.sort_order, r.price, r.in_stock
    ));
  }

  const artCount = db.prepare('SELECT COUNT(*) as c FROM articles').get();
  if (artCount.c === 0 && seed.articles?.length) {
    const ins = db.prepare(`INSERT OR IGNORE INTO articles
      (id,slug,title,excerpt,content,cover_image,category,tags,published_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    seed.articles.forEach(r => ins.run(
      r.id, r.slug, r.title, r.excerpt, r.content, r.cover_image,
      r.category, r.tags, r.published_at, r.created_at
    ));
  }

  if (seed.settings?.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)');
    seed.settings.forEach(r => ins.run(r.key, r.value, r.updated_at));
  }
} else {
  // Fallback: seed categories và brands cơ bản
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (catCount.c === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO categories (slug,label,description,image,sort_order) VALUES (?,?,?,?,?)');
    [
      ['cot-vot','Cốt Vợt','Cốt vợt chính hãng Butterfly, Tibhar, Unrex, Yinhe','/images/cat-cot-vot.jpg',1],
      ['mat-vot','Mặt Vợt','Mặt vợt thi đấu và luyện tập chính hãng','/images/cat-mat-vot.jpg',2],
      ['bong','Bóng','Bóng thi đấu và luyện tập tiêu chuẩn ITTF','/images/cat-bong.jpg',3],
      ['ban','Bàn','Bàn bóng bàn trong nhà, ngoài trời, gấp gọn','/images/cat-ban.jpg',4],
      ['do-thi-dau','Đồ Thi Đấu','Giày, áo, quần và phụ kiện thi đấu','/images/cat-do-thi-dau.jpg',5],
      ['combo-vot','Combo Vợt','Bộ combo cốt + mặt vợt khuyên dùng theo trình độ','/images/cat-combo.jpg',6],
      ['do-cu','Đồ Cũ','Dụng cụ đã qua sử dụng còn tốt, giá tốt','/images/cat-do-cu.jpg',7],
      ['kien-thuc','Kiến Thức','Bài viết, hướng dẫn và review sản phẩm','/images/cat-kien-thuc.jpg',8],
    ].forEach(c => ins.run(...c));
  }

  const brandCount = db.prepare('SELECT COUNT(*) as c FROM brands').get();
  if (brandCount.c === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO brands (slug,label,sort_order) VALUES (?,?,?)');
    [['butterfly','BUTTERFLY',1],['tibhar','TIBHAR',2],['unrex','UNREX',3],['yinhe','YINHE',4],['khac','Các Hãng Khác',5]]
      .forEach(b => ins.run(...b));
  }
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
