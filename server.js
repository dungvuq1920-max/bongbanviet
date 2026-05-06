const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('./db');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : __dirname;

app.use(cors());
app.use(express.json());

// ─── Admin Auth ──────────────────────────────────────────────────────────────

const adminTokens = new Set();

function getAdminPassword() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  return row ? row.value : 'admin';
}

function isDefaultPassword() {
  return !db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
}

function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && adminTokens.has(token)) return next();
  res.status(401).json({ error: 'Chưa đăng nhập' });
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === getAdminPassword()) {
    const token = crypto.randomUUID();
    adminTokens.add(token);
    res.json({ token, firstLogin: isDefaultPassword() });
  } else {
    res.status(401).json({ error: 'Sai mật khẩu' });
  }
});

app.get('/api/admin/verify', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token && adminTokens.has(token)) {
    res.json({ ok: true, firstLogin: isDefaultPassword() });
  } else {
    res.status(401).json({ ok: false });
  }
});

app.post('/api/admin/change-password', requireAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự' });
  }
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('admin_password', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(newPassword);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) adminTokens.delete(token);
  res.json({ ok: true });
});

// ─── Lichtap Data API ────────────────────────────────────────────────────────
const LICHTAP_VOLUME_FILE = path.join(DATA_DIR, 'lichtap-data.json');
const LICHTAP_DEFAULT_FILE = path.join(__dirname, 'lichtap-data.json');

app.get('/api/lichtap', (req, res) => {
  const file = fs.existsSync(LICHTAP_VOLUME_FILE) ? LICHTAP_VOLUME_FILE : LICHTAP_DEFAULT_FILE;
  try {
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    res.json({ students: [] });
  }
});

app.post('/api/lichtap', (req, res) => {
  try {
    fs.writeFileSync(LICHTAP_VOLUME_FILE, JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi lưu dữ liệu' });
  }
});

// Serve uploaded images from persistent volume first
app.use('/images/products', express.static(path.join(DATA_DIR, 'images', 'products')));
app.use('/images/banners', express.static(path.join(DATA_DIR, 'images', 'banners')));
// Serve lichtap React app — inject Firebase runtime config from Railway env vars
app.get(['/lichtap', '/lichtap/'], (req, res) => {
  const indexPath = path.join(__dirname, 'lichtap', 'index.html');
  const firebaseCfg = JSON.stringify({
    apiKey:            process.env.VITE_FIREBASE_API_KEY            || '',
    authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN        || '',
    projectId:         process.env.VITE_FIREBASE_PROJECT_ID         || '',
    storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.VITE_FIREBASE_APP_ID             || '',
  });
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace('<head>', `<head><script>window.__FIREBASE_CONFIG__=${firebaseCfg};</script>`);
  res.type('html').send(html);
});
app.use('/lichtap', express.static(path.join(__dirname, 'lichtap')));
app.use(express.static(__dirname, { extensions: ['html'] }));

// ─── DexScreener Proxy ────────────────────────────────────────────────────────
app.get('/api/dex/tokens', async (req, res) => {
  const { addresses } = req.query;
  if (!addresses) return res.status(400).json({ pairs: [], error: 'addresses required' });
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${addresses}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new Error(`DexScreener HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ pairs: [], error: err.message });
  }
});

// ─── Image Upload Setup ──────────────────────────────────────────────────────

const imgDir = path.join(DATA_DIR, 'images', 'products');
fs.mkdirSync(imgDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, imgDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + ext);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  },
});

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file' });
  res.json({ path: '/images/products/' + req.file.filename });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseJSON(val, fallback) {
  try { return JSON.parse(val); } catch { return fallback; }
}

function productRow(row) {
  if (!row) return null;
  return {
    ...row,
    specs: parseJSON(row.specs, {}),
    images: parseJSON(row.images, []),
    variants: parseJSON(row.variants, []),
    featured: !!row.featured,
    in_stock: row.in_stock !== 0,
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── Categories ─────────────────────────────────────────────────────────────

app.get('/api/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.json(rows);
});

// ─── Brands ─────────────────────────────────────────────────────────────────

app.get('/api/brands', (req, res) => {
  const rows = db.prepare('SELECT * FROM brands ORDER BY sort_order').all();
  res.json(rows);
});

// ─── Products ───────────────────────────────────────────────────────────────

app.get('/api/products', (req, res) => {
  const { category, brand, featured, condition, gear_subcategory, q, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (category)         { sql += ' AND category_slug = ?';    params.push(category); }
  if (brand)            { sql += ' AND brand_slug = ?';        params.push(brand); }
  if (featured)         { sql += ' AND featured = 1'; }
  if (condition)        { sql += ' AND condition = ?';         params.push(condition); }
  if (gear_subcategory) { sql += ' AND gear_subcategory = ?';  params.push(gear_subcategory); }
  if (q)                { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  sql += ' ORDER BY sort_order, created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(productRow));
});

app.get('/api/products/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE slug = ? OR id = ?')
    .get(req.params.slug, req.params.slug);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  res.json(productRow(row));
});

app.post('/api/products', requireAuth, (req, res) => {
  const { name, category_slug, brand_slug, gear_subcategory, description,
          specs, images, variants, featured, condition, badge, slug, price, in_stock, sort_order } = req.body;

  if (!name || !category_slug) {
    return res.status(400).json({ error: 'Thiếu tên hoặc danh mục' });
  }

  const id = generateId();
  const finalSlug = uniqueSlug(slug || name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'products');

  db.prepare(`INSERT INTO products
    (id, slug, name, category_slug, brand_slug, gear_subcategory, description,
     specs, images, variants, featured, condition, badge, price, in_stock, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, finalSlug, name, category_slug, brand_slug || null,
      gear_subcategory || null, description || '',
      JSON.stringify(specs || {}), JSON.stringify(images || []),
      JSON.stringify(variants || []),
      featured ? 1 : 0, condition || 'new', badge || null,
      price || '', in_stock !== undefined ? (in_stock ? 1 : 0) : 1,
      sort_order !== undefined ? Number(sort_order) : 0);

  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.status(201).json(productRow(created));
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const { name, category_slug, brand_slug, gear_subcategory, description,
          specs, images, variants, featured, condition, badge, slug, price, in_stock, sort_order } = req.body;

  const existing = db.prepare('SELECT * FROM products WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

  db.prepare(`UPDATE products SET
    name = ?, category_slug = ?, brand_slug = ?, gear_subcategory = ?,
    description = ?, specs = ?, images = ?, variants = ?, featured = ?,
    condition = ?, badge = ?, slug = ?, price = ?, in_stock = ?, sort_order = ?,
    updated_at = datetime('now')
    WHERE id = ?`)
    .run(
      name ?? existing.name,
      category_slug ?? existing.category_slug,
      brand_slug ?? existing.brand_slug,
      gear_subcategory ?? existing.gear_subcategory,
      description ?? existing.description,
      JSON.stringify(specs ?? parseJSON(existing.specs, {})),
      JSON.stringify(images ?? parseJSON(existing.images, [])),
      JSON.stringify(variants ?? parseJSON(existing.variants, [])),
      featured !== undefined ? (featured ? 1 : 0) : existing.featured,
      condition ?? existing.condition,
      badge ?? existing.badge,
      slug ? uniqueSlug(slug, 'products', existing.id) : existing.slug,
      price !== undefined ? price : (existing.price || ''),
      in_stock !== undefined ? (in_stock ? 1 : 0) : existing.in_stock,
      sort_order !== undefined ? Number(sort_order) : (existing.sort_order || 0),
      existing.id
    );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id);
  res.json(productRow(updated));
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ? OR slug = ?').run(req.params.id, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  res.json({ success: true });
});

// ─── Combos ─────────────────────────────────────────────────────────────────

app.get('/api/combos', (req, res) => {
  const { level } = req.query;
  let sql = 'SELECT * FROM combos';
  const params = [];
  if (level) { sql += ' WHERE level = ?'; params.push(level); }
  sql += ' ORDER BY sort_order';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({ ...r, images: parseJSON(r.images, []), in_stock: r.in_stock !== 0 })));
});

app.post('/api/combos', requireAuth, (req, res) => {
  const { name, level, blade, rubber_fh, rubber_bh, description, images, badge, slug, price, in_stock, sort_order } = req.body;
  if (!name || !level) return res.status(400).json({ error: 'Thiếu tên hoặc level' });

  const id = generateId();
  const finalSlug = uniqueSlug(slug || name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'combos');

  db.prepare(`INSERT INTO combos (id, slug, name, level, blade, rubber_fh, rubber_bh, description, images, badge, price, in_stock, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, finalSlug, name, level, blade || '', rubber_fh || '', rubber_bh || '',
      description || '', JSON.stringify(images || []), badge || null,
      price || '', in_stock !== undefined ? (in_stock ? 1 : 0) : 1,
      sort_order !== undefined ? Number(sort_order) : 0);

  res.status(201).json({ id, slug: finalSlug, name, level });
});

app.put('/api/combos/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM combos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy combo' });

  const { name, level, blade, rubber_fh, rubber_bh, description, images, badge, price, in_stock, sort_order } = req.body;
  db.prepare(`UPDATE combos SET name=?, level=?, blade=?, rubber_fh=?, rubber_bh=?,
    description=?, images=?, badge=?, price=?, in_stock=?, sort_order=? WHERE id=?`)
    .run(name ?? existing.name, level ?? existing.level,
      blade ?? existing.blade, rubber_fh ?? existing.rubber_fh,
      rubber_bh ?? existing.rubber_bh, description ?? existing.description,
      JSON.stringify(images ?? parseJSON(existing.images, [])),
      badge ?? existing.badge,
      price !== undefined ? price : (existing.price || ''),
      in_stock !== undefined ? (in_stock ? 1 : 0) : existing.in_stock,
      sort_order !== undefined ? Number(sort_order) : (existing.sort_order || 0),
      existing.id);

  res.json({ success: true });
});

app.delete('/api/combos/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM combos WHERE id = ? OR slug = ?').run(req.params.id, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy combo' });
  res.json({ success: true });
});

// ─── Articles ────────────────────────────────────────────────────────────────

app.get('/api/articles', (req, res) => {
  const { q, limit = 50, offset = 0 } = req.query;
  let sql = 'SELECT * FROM articles';
  const params = [];
  if (q) { sql += ' WHERE title LIKE ? OR excerpt LIKE ?'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({ ...r, tags: parseJSON(r.tags, []) })));
});

app.get('/api/articles/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE slug = ? OR id = ?')
    .get(req.params.slug, req.params.slug);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
  res.json({ ...row, tags: parseJSON(row.tags, []) });
});

app.post('/api/articles', requireAuth, (req, res) => {
  const { title, excerpt, content, cover_image, category, tags, slug, published_at } = req.body;
  if (!title) return res.status(400).json({ error: 'Thiếu tiêu đề' });

  const id = generateId();
  const finalSlug = uniqueSlug(slug || title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'articles');

  db.prepare(`INSERT INTO articles (id, slug, title, excerpt, content, cover_image, category, tags, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, finalSlug, title, excerpt || '', content || '',
      cover_image || '', category || 'kien-thuc',
      JSON.stringify(tags || []), published_at || new Date().toISOString().split('T')[0]);

  res.status(201).json({ id, slug: finalSlug, title });
});

app.put('/api/articles/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM articles WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy bài viết' });

  const { title, excerpt, content, cover_image, category, tags, published_at } = req.body;
  db.prepare(`UPDATE articles SET title=?, excerpt=?, content=?, cover_image=?,
    category=?, tags=?, published_at=? WHERE id=?`)
    .run(title ?? existing.title, excerpt ?? existing.excerpt,
      content ?? existing.content, cover_image ?? existing.cover_image,
      category ?? existing.category,
      JSON.stringify(tags ?? parseJSON(existing.tags, [])),
      published_at ?? existing.published_at, existing.id);

  res.json({ success: true });
});

app.delete('/api/articles/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM articles WHERE id = ? OR slug = ?').run(req.params.id, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
  res.json({ success: true });
});

// ─── Stats ───────────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  res.json({
    products: db.prepare('SELECT COUNT(*) as c FROM products').get().c,
    products_in_stock: db.prepare('SELECT COUNT(*) as c FROM products WHERE in_stock=1').get().c,
    categories: db.prepare('SELECT COUNT(*) as c FROM categories').get().c,
    combos: db.prepare('SELECT COUNT(*) as c FROM combos').get().c,
    articles: db.prepare('SELECT COUNT(*) as c FROM articles').get().c,
    featured: db.prepare('SELECT COUNT(*) as c FROM products WHERE featured=1').get().c,
    used: db.prepare("SELECT COUNT(*) as c FROM products WHERE condition='used'").get().c,
  });
});

// ─── Price List (bang_gia_dai_ly.xlsx) ──────────────────────────────────────

const PRICE_LIST_FILE = path.join(__dirname, 'bang_gia_dai_ly.xlsx');

function cellNum(cell) {
  const v = cell.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.result === 'number') return v.result;
  return 0;
}

app.get('/api/price-list', async (req, res) => {
  try {
    if (!fs.existsSync(PRICE_LIST_FILE)) {
      return res.status(404).json({ error: 'File bang_gia_dai_ly.xlsx không tìm thấy' });
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(PRICE_LIST_FILE);
    const ws = wb.worksheets[0];
    const rows = [];
    let lastBrand = '';

    ws.eachRow((row, rowNum) => {
      if (rowNum < 27) return;
      const brandCell = String(row.getCell(2).value || '').trim();
      const name = String(row.getCell(3).value || '').trim();
      if (!name) return;
      if (brandCell) lastBrand = brandCell;
      const retail = cellNum(row.getCell(4));
      const dealer = cellNum(row.getCell(5));
      const promo = String(row.getCell(6).value || '').trim();
      const update = String(row.getCell(1).value || '').trim();
      const isHeader = retail === 0 && dealer === 0;
      rows.push({ rowNum, update, brand: lastBrand, name, retail, dealer, promo, isHeader });
    });

    res.json({ rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/price-list/:rowNum', requireAuth, async (req, res) => {
  try {
    if (!fs.existsSync(PRICE_LIST_FILE)) {
      return res.status(404).json({ error: 'File không tồn tại' });
    }
    const rowNum = parseInt(req.params.rowNum);
    if (isNaN(rowNum) || rowNum < 27) return res.status(400).json({ error: 'rowNum không hợp lệ' });
    const { retail, dealer } = req.body;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(PRICE_LIST_FILE);
    const ws = wb.worksheets[0];
    const row = ws.getRow(rowNum);
    if (retail !== undefined && retail !== null) row.getCell(4).value = Number(retail);
    if (dealer !== undefined && dealer !== null) row.getCell(5).value = Number(dealer);
    row.commit();
    await wb.xlsx.writeFile(PRICE_LIST_FILE);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Settings (Banner / Homepage images) ────────────────────────────────────

app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  res.json(out);
});

app.get('/api/settings/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(req.params.key);
  res.json({ key: req.params.key, value: row ? row.value : null });
});

app.put('/api/settings/:key', requireAuth, (req, res) => {
  const { value } = req.body;
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(req.params.key, value ?? '');
  res.json({ key: req.params.key, value });
});

const bannerUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(DATA_DIR, 'images', 'banners');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const key = (req.params.key || 'banner').replace(/[^a-z0-9_-]/gi, '-');
      cb(null, key + ext);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  },
});

app.post('/api/settings/:key/upload', requireAuth, bannerUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file' });
  const imgPath = '/images/banners/' + req.file.filename;
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(req.params.key, imgPath);
  res.json({ key: req.params.key, value: imgPath });
});

app.delete('/api/settings/:key', requireAuth, (req, res) => {
  db.prepare('DELETE FROM settings WHERE key = ?').run(req.params.key);
  res.json({ success: true });
});

// ─── Template Download ───────────────────────────────────────────────────────

app.get('/api/download-template', (req, res) => {
  const file = path.join(__dirname, 'template-import-san-pham.xlsx');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Template chưa được tạo' });
  res.download(file, 'template-import-san-pham.xlsx');
});

// ─── Import Excel ─────────────────────────────────────────────────────────────

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const CAT_MAP = {
  'cốt vợt': 'cot-vot', 'mat vot': 'mat-vot', 'mặt vợt': 'mat-vot',
  'bóng': 'bong', 'bong': 'bong',
  'bàn': 'ban', 'ban': 'ban',
  'đồ thi đấu - giày': 'do-thi-dau',
  'đồ thi đấu - trang phục & pk': 'do-thi-dau',
  'combo vợt': 'combo-vot', 'combo vot': 'combo-vot',
  'đồ cũ': 'do-cu', 'do cu': 'do-cu',
};
const GEAR_SUB_MAP = {
  'đồ thi đấu - giày': 'giay',
  'đồ thi đấu - trang phục & pk': 'trang-phuc-phu-kien',
};
const BRAND_MAP = {
  'butterfly': 'butterfly', 'tibhar': 'tibhar',
  'unrex': 'unrex', 'yinhe': 'yinhe',
  'các hãng khác': 'khac', 'cac hang khac': 'khac',
};

function parseSpecs(text) {
  const specs = {};
  (text || '').split('\n').forEach(line => {
    const i = line.indexOf(':');
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k) specs[k] = v;
    }
  });
  return specs;
}

function uniqueSlug(base, table, excludeId = null) {
  let slug = base, n = 0;
  while (true) {
    const existing = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(slug);
    if (!existing || existing.id === excludeId) break;
    slug = base + '-' + (++n);
  }
  return slug;
}

app.post('/api/import-excel', requireAuth, xlsxUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file' });

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const sheet = workbook.getWorksheet('Sản Phẩm');
    if (!sheet) return res.status(400).json({ error: 'Không tìm thấy sheet "Sản Phẩm" trong file' });

    // ── Trích xuất ảnh embedded, map theo Excel row number ────────────────
    const imageByRow = {};
    for (const img of sheet.getImages()) {
      try {
        const wbImg = workbook.getImage(img.imageId);
        if (!wbImg || !wbImg.buffer) continue;
        const ext = (wbImg.extension || 'jpg').replace('jpeg', 'jpg');
        const fname = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '.' + ext;
        fs.writeFileSync(path.join(imgDir, fname), wbImg.buffer);
        const excelRow = img.range.tl.row + 1; // 0-indexed → 1-indexed
        imageByRow[excelRow] = '/images/products/' + fname;
      } catch (_) {}
    }

    // ── Đọc từng dòng dữ liệu ─────────────────────────────────────────────
    const results = [], errors = [];
    let imported = 0, skipped = 0;

    sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum <= 2) return; // bỏ title + header

      const danhmucRaw = (row.getCell(1).text || '').trim();
      const hangRaw    = (row.getCell(2).text || '').trim();
      const ten        = (row.getCell(3).text || '').trim();
      const anhUrl     = (row.getCell(4).text || '').trim();
      const gia        = (row.getCell(5).text || '').trim();
      const thongso    = (row.getCell(6).text || '').trim();
      const mieuta     = (row.getCell(7).text || '').trim();

      // Bỏ dòng trống, dòng hướng dẫn, dòng marker
      if (!ten || !danhmucRaw) return;

      const danhmucKey = danhmucRaw.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s\-&]/g, '').trim();

      // Lookup category (try with accents first, then normalized)
      let catSlug = CAT_MAP[danhmucRaw.toLowerCase()] || CAT_MAP[danhmucKey];
      if (!catSlug) { skipped++; return; } // không phải dòng dữ liệu hợp lệ

      const brandSlug = BRAND_MAP[hangRaw.toLowerCase()] || null;
      const gearSub   = GEAR_SUB_MAP[danhmucRaw.toLowerCase()] || null;
      const imgPath   = imageByRow[rowNum] || (anhUrl || null);
      const specs     = parseSpecs(thongso);
      const inStock   = gia ? 1 : 0;

      try {
        if (catSlug === 'combo-vot') {
          const blade    = specs['Cốt'] || specs['Cot'] || '';
          const rubberFh = specs['Mặt FH'] || specs['Mat FH'] || '';
          const rubberBh = specs['Mặt BH'] || specs['Mat BH'] || '';

          const existing = db.prepare('SELECT id FROM combos WHERE name = ?').get(ten);
          if (existing) {
            db.prepare(`UPDATE combos SET blade=?, rubber_fh=?, rubber_bh=?,
              description=?, images=?, price=?, in_stock=? WHERE id=?`)
              .run(blade, rubberFh, rubberBh, mieuta,
                JSON.stringify(imgPath ? [imgPath] : []), gia, inStock, existing.id);
            results.push({ name: ten, category: danhmucRaw, status: 'updated' });
          } else {
            const id   = generateId();
            const slug = uniqueSlug(ten.toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'combos');
            db.prepare(`INSERT INTO combos (id, slug, name, level, blade, rubber_fh, rubber_bh, description, images, price, in_stock)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(id, slug, ten, 'beginner', blade, rubberFh, rubberBh, mieuta,
                JSON.stringify(imgPath ? [imgPath] : []), gia, inStock);
            results.push({ name: ten, category: danhmucRaw, status: 'created' });
          }
        } else {
          const existing = db.prepare(
            'SELECT id FROM products WHERE name = ? AND category_slug = ?'
          ).get(ten, catSlug);

          if (existing) {
            db.prepare(`UPDATE products SET brand_slug=?, gear_subcategory=?,
              description=?, specs=?, images=?, price=?, in_stock=?,
              updated_at=datetime('now') WHERE id=?`)
              .run(brandSlug, gearSub, mieuta, JSON.stringify(specs),
                JSON.stringify(imgPath ? [imgPath] : []), gia, inStock, existing.id);
            results.push({ name: ten, category: danhmucRaw, status: 'updated' });
          } else {
            const id   = generateId();
            const slug = uniqueSlug(ten.toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'products');
            db.prepare(`INSERT INTO products
              (id, slug, name, category_slug, brand_slug, gear_subcategory,
               description, specs, images, price, in_stock)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(id, slug, ten, catSlug, brandSlug, gearSub, mieuta,
                JSON.stringify(specs), JSON.stringify(imgPath ? [imgPath] : []), gia, inStock);
            results.push({ name: ten, category: danhmucRaw, status: 'created' });
          }
        }
        imported++;
      } catch (e) {
        errors.push(`Dòng ${rowNum} "${ten}": ${e.message}`);
        skipped++;
      }
    });

    res.json({ imported, skipped, errors, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Telegram Bot + Solana Coin Tracker ─────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID   = (process.env.TELEGRAM_CHAT_ID  || '').toString();
const TG_API    = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Tracker config (stored in settings table) ─────────────────────────────────
function getTrackerCfg() {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'tracker_%'").all();
  const m = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    drop:        parseFloat(m.tracker_drop        || 30),
    maxDrop:     parseFloat(m.tracker_max_drop    || 80),
    lp:          parseFloat(m.tracker_lp          || 70),
    vol1h:       parseFloat(m.tracker_vol1h       || 5000),
    reboundM5:   parseFloat(m.tracker_rebound_m5  || 1),
    cooldownMin: parseFloat(m.tracker_cooldown    || 30),
    paused:      m.tracker_paused === '1',
  };
}

function setTrackerKey(key, value) {
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(key, String(value));
}

// ── Status calculation (mirrors tracking.html getStatus()) ────────────────────
function calcCoinStatus(coin, pair, cfg) {
  const cur = parseFloat(pair.priceUsd || 0);
  if (!cur || !coin.base_price) return 'load';
  const drop   = ((cur - coin.base_price) / coin.base_price) * 100;
  const curLiq = pair.liquidity?.usd || 0;
  const lpRat  = coin.base_liq > 0 ? (curLiq / coin.base_liq) * 100 : 100;
  const v1h    = pair.volume?.h1 || 0;
  if (drop < -cfg.maxDrop) return 'dead';
  if (drop <= -cfg.drop && lpRat >= cfg.lp && v1h >= cfg.vol1h) {
    const m5 = pair.priceChange?.m5 || 0;
    const b5 = pair.txns?.m5?.buys  || 0;
    const s5 = pair.txns?.m5?.sells || 0;
    if (m5 >= cfg.reboundM5 && b5 >= s5) return 'rebound';
    return 'alert';
  }
  if (drop <= -(cfg.drop * 0.65)) return 'watch';
  return 'ok';
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmtUsd(n) {
  if (!n) return '$0';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPrice(p) {
  if (!p) return '$0';
  if (p >= 1)    return `$${p.toFixed(4)}`;
  if (p >= 0.01) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(12).replace(/0+$/, '')}`;
}

// ── Telegram send ──────────────────────────────────────────────────────────────
async function tgSend(text, chatId = CHAT_ID) {
  if (!BOT_TOKEN || !chatId) return;
  try {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) { console.error('[TG] send error:', e.message); }
}

// ── Build alert message ────────────────────────────────────────────────────────
function buildAlertMsg(coin, pair, st) {
  const cur  = parseFloat(pair.priceUsd || 0);
  const drop = ((cur - coin.base_price) / coin.base_price) * 100;
  const m5   = pair.priceChange?.m5 || 0;
  const b5   = pair.txns?.m5?.buys  || 0;
  const s5   = pair.txns?.m5?.sells || 0;
  const header = st === 'rebound'
    ? `🔥 <b>REBOUND</b> — <b>$${coin.symbol}</b>`
    : `🚨 <b>ALERT DIP</b> — <b>$${coin.symbol}</b>`;
  let msg = `${header}\n<code>━━━━━━━━━━━━━━━━</code>\n`;
  msg += `📉 Dip: <b>${drop.toFixed(1)}%</b>\n`;
  msg += `💰 Giá: <code>${fmtPrice(cur)}</code>\n`;
  msg += `💧 LP: ${fmtUsd(pair.liquidity?.usd || 0)}\n`;
  msg += `📊 Vol 1h: ${fmtUsd(pair.volume?.h1 || 0)}\n`;
  if (st === 'rebound') msg += `🕐 5m: <b>+${m5.toFixed(1)}%</b> | Mua ${b5} / Bán ${s5}\n`;
  if (pair.url) msg += `🔗 <a href="${pair.url}">DexScreener</a>`;
  return msg;
}

// ── Best Solana pair picker ────────────────────────────────────────────────────
function pickBestPair(pairs, addr) {
  if (!pairs?.length) return null;
  const a   = addr.toLowerCase();
  const sol = pairs.filter(p =>
    p.chainId === 'solana' &&
    (p.baseToken.address.toLowerCase() === a || p.quoteToken?.address?.toLowerCase() === a)
  );
  if (!sol.length) return null;
  const base = sol.filter(p => p.baseToken.address.toLowerCase() === a);
  const pool = base.length ? base : sol;
  pool.sort((x, y) => (y.liquidity?.usd || 0) - (x.liquidity?.usd || 0));
  return pool[0];
}

// ── DexScreener fetch (server-side) ───────────────────────────────────────────
async function dexFetchAddrs(addresses) {
  const out = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    try {
      const r = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const d = await r.json();
      if (d.pairs) out.push(...d.pairs);
    } catch {}
  }
  return out;
}

// ── In-memory last-alert state (avoid redundant DB writes per tick) ────────────
const lastAlertMap = new Map(); // address → { st, at }

// ── Main tracker tick (runs every 10s) ────────────────────────────────────────
async function trackerTick() {
  try {
    const cfg = getTrackerCfg();
    if (cfg.paused) return;
    const coins = db.prepare('SELECT * FROM tracked_coins WHERE paused = 0').all();
    if (!coins.length) return;

    const pairs = await dexFetchAddrs(coins.map(c => c.address));
    const pairMap = new Map();
    for (const p of pairs) {
      if (p.chainId !== 'solana') continue;
      const a  = p.baseToken.address;
      const ex = pairMap.get(a);
      if (!ex || (p.liquidity?.usd || 0) > (ex.liquidity?.usd || 0)) pairMap.set(a, p);
    }

    const cooldownMs = cfg.cooldownMin * 60 * 1000;
    const now = Date.now();

    for (const coin of coins) {
      const pair = pairMap.get(coin.address);
      if (!pair) continue;
      const st = calcCoinStatus(coin, pair, cfg);

      db.prepare('UPDATE tracked_coins SET last_price=?, last_status=?, pair_address=? WHERE address=?')
        .run(parseFloat(pair.priceUsd || 0), st, pair.pairAddress || null, coin.address);

      if (st !== 'alert' && st !== 'rebound') {
        lastAlertMap.delete(coin.address);
        continue;
      }

      const prev = lastAlertMap.get(coin.address);
      const shouldAlert =
        !prev ||
        (now - prev.at > cooldownMs) ||
        (st === 'rebound' && prev.st === 'alert'); // transition alert→rebound → immediate re-notify

      if (!shouldAlert) continue;

      await tgSend(buildAlertMsg(coin, pair, st));
      lastAlertMap.set(coin.address, { st, at: now });
      db.prepare("UPDATE tracked_coins SET alerted_at=datetime('now'), alert_st=? WHERE address=?")
        .run(st, coin.address);
    }
  } catch (e) {
    console.error('[Tracker] tick error:', e.message);
  }
}

// ── Telegram command handler ───────────────────────────────────────────────────
async function handleTgCmd(msg) {
  const text   = (msg.text || '').trim();
  const chatId = msg.chat.id.toString();
  if (CHAT_ID && chatId !== CHAT_ID) {
    await tgSend('⛔ Không có quyền truy cập.', chatId);
    return;
  }
  const parts = text.split(/\s+/);
  const cmd   = (parts[0] || '').toLowerCase().replace(/@\w+$/, '');

  if (cmd === '/start' || cmd === '/help') {
    await tgSend(
      `<b>🏓 Solana Meme Tracker Bot</b>\n\n` +
      `/add &lt;address&gt; — Thêm coin theo dõi\n` +
      `/rm &lt;address|symbol&gt; — Xóa coin\n` +
      `/list — Danh sách đang theo dõi\n` +
      `/status — Coin đang ALERT/REBOUND\n` +
      `/set drop=30 vol=5000 lp=70 cd=30 — Đặt ngưỡng\n` +
      `/pause — Tạm dừng alert\n` +
      `/resume — Tiếp tục alert\n` +
      `/help — Xem lệnh này`, chatId
    );
    return;
  }

  if (cmd === '/add') {
    const addr = (parts[1] || '').trim();
    if (!addr || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
      await tgSend('❌ Cần nhập Solana contract address (base58, 32-44 ký tự)\nVD: <code>/add DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263</code>', chatId);
      return;
    }
    if (db.prepare('SELECT 1 FROM tracked_coins WHERE address = ?').get(addr)) {
      await tgSend(`⚠️ <code>${addr.slice(0, 8)}...</code> đã có trong danh sách`, chatId);
      return;
    }
    await tgSend('⏳ Đang lấy dữ liệu từ DexScreener...', chatId);
    const pairs = await dexFetchAddrs([addr]);
    const pair  = pickBestPair(pairs, addr);
    if (!pair) {
      await tgSend('❌ Không tìm thấy token này trên Solana (DexScreener)', chatId);
      return;
    }
    db.prepare(`INSERT OR IGNORE INTO tracked_coins
      (address, symbol, name, pair_address, base_price, base_liq, last_price, last_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'watch')`)
      .run(addr, pair.baseToken.symbol, pair.baseToken.name,
           pair.pairAddress, parseFloat(pair.priceUsd || 0),
           pair.liquidity?.usd || 0, parseFloat(pair.priceUsd || 0));
    await tgSend(
      `✅ Đã thêm <b>$${pair.baseToken.symbol}</b> (${pair.baseToken.name})\n` +
      `💰 Giá cơ sở: <code>${fmtPrice(parseFloat(pair.priceUsd || 0))}</code>\n` +
      `💧 LP: ${fmtUsd(pair.liquidity?.usd || 0)}\n\n` +
      `Bot sẽ báo khi coin dip ≥${getTrackerCfg().drop}% từ giá này.`, chatId
    );
    return;
  }

  if (cmd === '/rm') {
    const q = (parts[1] || '').trim();
    if (!q) { await tgSend('❌ Cần nhập address hoặc symbol\nVD: <code>/rm BONK</code>', chatId); return; }
    let row = db.prepare('SELECT * FROM tracked_coins WHERE address = ?').get(q);
    if (!row) row = db.prepare('SELECT * FROM tracked_coins WHERE upper(symbol) = upper(?)').get(q);
    if (!row) { await tgSend(`❌ Không tìm thấy <code>${q}</code> trong danh sách`, chatId); return; }
    db.prepare('DELETE FROM tracked_coins WHERE address = ?').run(row.address);
    lastAlertMap.delete(row.address);
    await tgSend(`🗑 Đã xóa <b>$${row.symbol}</b> (${row.name})`, chatId);
    return;
  }

  if (cmd === '/list') {
    const coins = db.prepare('SELECT * FROM tracked_coins ORDER BY added_at DESC').all();
    if (!coins.length) { await tgSend('📭 Danh sách trống. Dùng /add &lt;address&gt; để thêm', chatId); return; }
    const ICON = { rebound:'🔥', alert:'🚨', watch:'👀', ok:'✅', dead:'☠️', load:'⏳' };
    let msg = `<b>📋 Đang theo dõi ${coins.length} coin</b>\n\n`;
    for (const c of coins) {
      const icon = ICON[c.last_status] || '❓';
      const dropPct = c.base_price > 0 && c.last_price > 0
        ? ` (${(((c.last_price - c.base_price) / c.base_price) * 100).toFixed(1)}%)`
        : '';
      msg += `${icon} <b>$${c.symbol}</b>${dropPct} — ${c.name}\n`;
      msg += `<code>${c.address}</code>\n\n`;
    }
    await tgSend(msg, chatId);
    return;
  }

  if (cmd === '/status') {
    const coins = db.prepare("SELECT * FROM tracked_coins WHERE last_status IN ('alert','rebound')").all();
    if (!coins.length) { await tgSend('✅ Không có coin nào trong trạng thái ALERT/REBOUND', chatId); return; }
    let msg = `<b>🚨 ${coins.length} coin cần chú ý</b>\n\n`;
    for (const c of coins) {
      const icon = c.last_status === 'rebound' ? '🔥' : '🚨';
      const drop = c.base_price > 0 && c.last_price > 0
        ? `${(((c.last_price - c.base_price) / c.base_price) * 100).toFixed(1)}%`
        : '?%';
      msg += `${icon} <b>$${c.symbol}</b> dip ${drop}\n`;
    }
    await tgSend(msg, chatId);
    return;
  }

  if (cmd === '/set') {
    const cfg  = getTrackerCfg();
    const KEYS = { drop:'tracker_drop', vol:'tracker_vol1h', lp:'tracker_lp', cd:'tracker_cooldown', rebound:'tracker_rebound_m5', maxdrop:'tracker_max_drop' };
    const changed = [];
    for (const part of parts.slice(1)) {
      const [k, v] = part.split('=');
      const dbKey  = KEYS[(k || '').toLowerCase()];
      if (!dbKey) continue;
      const n = parseFloat(v);
      if (isNaN(n)) continue;
      setTrackerKey(dbKey, n);
      changed.push(`${k}=${n}`);
    }
    if (!changed.length) {
      await tgSend(
        `⚙️ <b>Cài đặt hiện tại</b>\n` +
        `drop=${cfg.drop}%  maxdrop=${cfg.maxDrop}%\n` +
        `lp=${cfg.lp}%  vol1h=$${cfg.vol1h}\n` +
        `rebound=${cfg.reboundM5}%  cooldown=${cfg.cooldownMin}min\n\n` +
        `<i>/set drop=30 vol=5000 lp=70 cd=30</i>`, chatId
      );
    } else {
      await tgSend(`✅ Đã cập nhật: ${changed.join(', ')}`, chatId);
    }
    return;
  }

  if (cmd === '/pause') {
    setTrackerKey('tracker_paused', '1');
    await tgSend('⏸ Đã tạm dừng tất cả alert', chatId);
    return;
  }

  if (cmd === '/resume') {
    setTrackerKey('tracker_paused', '0');
    await tgSend('▶️ Đã tiếp tục gửi alert', chatId);
    return;
  }

  await tgSend('❓ Không hiểu lệnh. Gõ /help để xem danh sách lệnh.', chatId);
}

// ── Long-polling loop ──────────────────────────────────────────────────────────
async function tgPoll(offset = 0) {
  if (!BOT_TOKEN) return;
  try {
    const r = await fetch(`${TG_API}/getUpdates?timeout=25&offset=${offset}`,
      { signal: AbortSignal.timeout(30000) });
    const data = await r.json();
    if (data.ok) {
      for (const u of data.result) {
        if (u.message?.text) handleTgCmd(u.message).catch(e => console.error('[TG] cmd error:', e.message));
        offset = u.update_id + 1;
      }
    }
  } catch {}
  setTimeout(() => tgPoll(offset), 200);
}

// ── API routes for tracked coins (used by tracking.html or future web UI) ─────
app.get('/api/tracker/coins', (req, res) => {
  res.json(db.prepare('SELECT * FROM tracked_coins ORDER BY last_status, added_at').all());
});

app.post('/api/tracker/coins', async (req, res) => {
  const { address } = req.body || {};
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))
    return res.status(400).json({ error: 'Invalid Solana address' });
  if (db.prepare('SELECT 1 FROM tracked_coins WHERE address = ?').get(address))
    return res.status(409).json({ error: 'Already tracked' });
  const pairs = await dexFetchAddrs([address]);
  const pair  = pickBestPair(pairs, address);
  if (!pair) return res.status(404).json({ error: 'Token not found on Solana' });
  db.prepare(`INSERT OR IGNORE INTO tracked_coins
    (address, symbol, name, pair_address, base_price, base_liq, last_price, last_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'watch')`)
    .run(address, pair.baseToken.symbol, pair.baseToken.name,
         pair.pairAddress, parseFloat(pair.priceUsd || 0),
         pair.liquidity?.usd || 0, parseFloat(pair.priceUsd || 0));
  res.json({ address, symbol: pair.baseToken.symbol, name: pair.baseToken.name });
});

app.delete('/api/tracker/coins/:address', (req, res) => {
  db.prepare('DELETE FROM tracked_coins WHERE address = ?').run(req.params.address);
  lastAlertMap.delete(req.params.address);
  res.json({ success: true });
});

app.get('/api/tracker/config', (req, res) => res.json(getTrackerCfg()));

app.put('/api/tracker/config', (req, res) => {
  const MAP = { drop:'tracker_drop', maxDrop:'tracker_max_drop', lp:'tracker_lp', vol1h:'tracker_vol1h', reboundM5:'tracker_rebound_m5', cooldownMin:'tracker_cooldown', paused:'tracker_paused' };
  for (const [k, v] of Object.entries(req.body || {}))
    if (MAP[k] !== undefined) setTrackerKey(MAP[k], v);
  res.json(getTrackerCfg());
});

// ── Start tracker + bot after server is up ─────────────────────────────────────
function startTracker() {
  if (!BOT_TOKEN) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN chưa set — coin tracker & bot disabled');
    return;
  }
  setInterval(trackerTick, 10000);
  tgPoll();
  console.log(`🤖 Telegram bot started | 🔄 Tracker polling every 10s`);
}

// ─── Global Error Handler cho API ───────────────────────────────────────────
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.error(`[API Error] ${req.path}:`, err.message);
    // Trả về JSON để frontend không bị lỗi parse HTML khi gặp exception (vd: lỗi kích thước ảnh, sai định dạng)
    res.status(400).json({ error: err.message || 'Có lỗi xảy ra trong quá trình xử lý' });
  } else {
    next(err);
  }
});

// ─── Fix NULL IDs from previous migrations ──────────────────────────────────
['products', 'combos', 'articles'].forEach(table => {
  try {
    const rows = db.prepare(`SELECT rowid, slug FROM ${table} WHERE id IS NULL`).all();
    if (rows.length > 0) {
      const stmt = db.prepare(`UPDATE ${table} SET id = ? WHERE rowid = ?`);
      const transaction = db.transaction((rows) => {
        for (const row of rows) stmt.run(generateId(), row.rowid);
      });
      transaction(rows);
      console.log(`[DB Fix] Generated IDs for ${rows.length} rows in ${table}`);
    }
  } catch(e) { console.error('Error fixing null IDs:', e); }
});

// ─── Seed default catalog banner images (INSERT OR IGNORE — never overwrites uploads) ────
const _defBanners = [
  ['banner_cot_vot',    '/images/banners/banner-cot-vot.jpg'],
  ['banner_mat_vot',    '/images/banners/banner-mat-vot.jpg'],
  ['banner_bong',       '/images/banners/banner-bong.jpg'],
  ['banner_ban',        '/images/banners/banner-ban.jpg'],
  ['banner_do_thi_dau', '/images/banners/banner-do-thi-dau.jpg'],
  ['banner_combo_vot',  '/images/banners/banner-combo-vot.jpg'],
];
const _bIns = db.prepare(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`);
_defBanners.forEach(([k, v]) => _bIns.run(k, v));

// ─── Start ───────────────────────────────────────────────────────────────────

const { execSync } = require('child_process');

function killPortAndStart() {
  try {
    const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    const lines = out.split('\n').filter(l => l.includes(`0.0.0.0:${PORT}`) || l.includes(`[::]:${PORT}`));
    const pids = [...new Set(lines.map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
    pids.forEach(pid => {
      try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch {}
    });
    console.log(`♻️  Đã tắt server cũ trên port ${PORT}, đang khởi động lại...`);
  } catch {}
  setTimeout(startServer, 500);
}

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`\n✅ BongBanViet server chạy tại http://localhost:${PORT}`);
    console.log(`   Admin panel:  http://localhost:${PORT}/admin.html`);
    console.log(`   Website:      http://localhost:${PORT}/index.html\n`);
    startTracker();
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Port ${PORT} đang bận — đang tắt server cũ...`);
      killPortAndStart();
    } else {
      throw err;
    }
  });
}

startServer();
