const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : __dirname;

app.use(cors());
app.use(express.json());
// Serve uploaded images from persistent volume first
app.use('/images/products', express.static(path.join(DATA_DIR, 'images', 'products')));
app.use('/images/banners', express.static(path.join(DATA_DIR, 'images', 'banners')));
// Serve lichtap React app (must be before the global static middleware)
app.get('/lichtap', (req, res) => res.sendFile(path.join(__dirname, 'lichtap', 'index.html')));
app.use('/lichtap', express.static(path.join(__dirname, 'lichtap')));
app.use(express.static(__dirname, { extensions: ['html'] }));

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

app.post('/api/upload', upload.single('image'), (req, res) => {
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

app.post('/api/products', (req, res) => {
  const { name, category_slug, brand_slug, gear_subcategory, description,
          specs, images, variants, featured, condition, badge, slug, price, in_stock } = req.body;

  if (!name || !category_slug) {
    return res.status(400).json({ error: 'Thiếu tên hoặc danh mục' });
  }

  const id = generateId();
  const finalSlug = slug || name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  db.prepare(`INSERT INTO products
    (id, slug, name, category_slug, brand_slug, gear_subcategory, description,
     specs, images, variants, featured, condition, badge, price, in_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, finalSlug, name, category_slug, brand_slug || null,
      gear_subcategory || null, description || '',
      JSON.stringify(specs || {}), JSON.stringify(images || []),
      JSON.stringify(variants || []),
      featured ? 1 : 0, condition || 'new', badge || null,
      price || '', in_stock !== undefined ? (in_stock ? 1 : 0) : 1);

  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.status(201).json(productRow(created));
});

app.put('/api/products/:id', (req, res) => {
  const { name, category_slug, brand_slug, gear_subcategory, description,
          specs, images, variants, featured, condition, badge, slug, price, in_stock } = req.body;

  const existing = db.prepare('SELECT * FROM products WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

  db.prepare(`UPDATE products SET
    name = ?, category_slug = ?, brand_slug = ?, gear_subcategory = ?,
    description = ?, specs = ?, images = ?, variants = ?, featured = ?,
    condition = ?, badge = ?, slug = ?, price = ?, in_stock = ?,
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
      slug ?? existing.slug,
      price !== undefined ? price : (existing.price || ''),
      in_stock !== undefined ? (in_stock ? 1 : 0) : existing.in_stock,
      existing.id
    );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id);
  res.json(productRow(updated));
});

app.delete('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM products WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
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

app.post('/api/combos', (req, res) => {
  const { name, level, blade, rubber_fh, rubber_bh, description, images, badge, slug, price, in_stock } = req.body;
  if (!name || !level) return res.status(400).json({ error: 'Thiếu tên hoặc level' });

  const id = generateId();
  const finalSlug = slug || name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  db.prepare(`INSERT INTO combos (id, slug, name, level, blade, rubber_fh, rubber_bh, description, images, badge, price, in_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, finalSlug, name, level, blade || '', rubber_fh || '', rubber_bh || '',
      description || '', JSON.stringify(images || []), badge || null,
      price || '', in_stock !== undefined ? (in_stock ? 1 : 0) : 1);

  res.status(201).json({ id, slug: finalSlug, name, level });
});

app.put('/api/combos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM combos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy combo' });

  const { name, level, blade, rubber_fh, rubber_bh, description, images, badge, price, in_stock } = req.body;
  db.prepare(`UPDATE combos SET name=?, level=?, blade=?, rubber_fh=?, rubber_bh=?,
    description=?, images=?, badge=?, price=?, in_stock=? WHERE id=?`)
    .run(name ?? existing.name, level ?? existing.level,
      blade ?? existing.blade, rubber_fh ?? existing.rubber_fh,
      rubber_bh ?? existing.rubber_bh, description ?? existing.description,
      JSON.stringify(images ?? parseJSON(existing.images, [])),
      badge ?? existing.badge,
      price !== undefined ? price : (existing.price || ''),
      in_stock !== undefined ? (in_stock ? 1 : 0) : existing.in_stock,
      existing.id);

  res.json({ success: true });
});

app.delete('/api/combos/:id', (req, res) => {
  db.prepare('DELETE FROM combos WHERE id = ?').run(req.params.id);
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

app.post('/api/articles', (req, res) => {
  const { title, excerpt, content, cover_image, category, tags, slug, published_at } = req.body;
  if (!title) return res.status(400).json({ error: 'Thiếu tiêu đề' });

  const id = generateId();
  const finalSlug = slug || title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  db.prepare(`INSERT INTO articles (id, slug, title, excerpt, content, cover_image, category, tags, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, finalSlug, title, excerpt || '', content || '',
      cover_image || '', category || 'kien-thuc',
      JSON.stringify(tags || []), published_at || new Date().toISOString().split('T')[0]);

  res.status(201).json({ id, slug: finalSlug, title });
});

app.put('/api/articles/:id', (req, res) => {
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

app.delete('/api/articles/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM articles WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
  db.prepare('DELETE FROM articles WHERE id = ?').run(row.id);
  res.json({ success: true });
});

// ─── Stats ───────────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  res.json({
    products: db.prepare('SELECT COUNT(*) as c FROM products').get().c,
    categories: db.prepare('SELECT COUNT(*) as c FROM categories').get().c,
    combos: db.prepare('SELECT COUNT(*) as c FROM combos').get().c,
    articles: db.prepare('SELECT COUNT(*) as c FROM articles').get().c,
    featured: db.prepare('SELECT COUNT(*) as c FROM products WHERE featured=1').get().c,
    used: db.prepare("SELECT COUNT(*) as c FROM products WHERE condition='used'").get().c,
  });
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

app.put('/api/settings/:key', (req, res) => {
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

app.post('/api/settings/:key/upload', bannerUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file' });
  const imgPath = '/images/banners/' + req.file.filename;
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(req.params.key, imgPath);
  res.json({ key: req.params.key, value: imgPath });
});

app.delete('/api/settings/:key', (req, res) => {
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

function uniqueSlug(base, table) {
  let slug = base, n = 0;
  while (db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(slug)) {
    slug = base + '-' + (++n);
  }
  return slug;
}

app.post('/api/import-excel', xlsxUpload.single('file'), async (req, res) => {
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
    console.log(`   Import page:  http://localhost:${PORT}/import.html`);
    console.log(`   Website:      http://localhost:${PORT}/index.html\n`);
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
