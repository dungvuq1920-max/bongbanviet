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
const SHOPEE_AI_CONFIG_FILE = path.join(DATA_DIR, 'shopee-ai-config.json');

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

function readShopeeAiConfig() {
  try {
    if (!fs.existsSync(SHOPEE_AI_CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(SHOPEE_AI_CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeShopeeAiConfig(next) {
  fs.mkdirSync(path.dirname(SHOPEE_AI_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(SHOPEE_AI_CONFIG_FILE, JSON.stringify(next, null, 2));
}

function keyTail(value) {
  if (!value) return '';
  return String(value).slice(-4);
}

function getAiKey(provider) {
  const cfg = readShopeeAiConfig();
  if (provider === 'openai') return process.env.OPENAI_API_KEY || cfg.openaiApiKey || '';
  if (provider === 'gemini') return process.env.GEMINI_API_KEY || cfg.geminiApiKey || '';
  if (provider === 'claude') return process.env.ANTHROPIC_API_KEY || cfg.claudeApiKey || '';
  return '';
}

function shopeeProviderLabel(provider) {
  if (provider === 'openai') return 'ChatGPT / OpenAI';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'claude') return 'Claude';
  return 'AI';
}

function shopeeCopyProviderPlan(requestedProvider = 'auto') {
  const plan = [];
  const pushIfReady = (provider) => {
    if (getAiKey(provider) && !plan.includes(provider)) plan.push(provider);
  };

  if (requestedProvider === 'auto') {
    pushIfReady('openai');
    pushIfReady('gemini');
    return plan;
  }

  pushIfReady(requestedProvider);

  if (requestedProvider === 'openai') {
    pushIfReady('gemini');
  }

  return plan;
}

async function callShopeeTextProvider(provider, prompt) {
  if (provider === 'gemini') {
    const geminiKey = getAiKey('gemini');
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `Gemini HTTP ${r.status}`);
    return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
  }

  if (provider === 'claude') {
    const claudeKey = getAiKey('claude');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
        max_tokens: 2200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `Claude HTTP ${r.status}`);
    return data.content?.map(p => p.text || '').join('\n') || '';
  }

  const openaiKey = getAiKey('openai');
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.4-mini',
      input: prompt,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `OpenAI HTTP ${r.status}`);
  return data.output_text || data.output?.flatMap(o => o.content || []).map(c => c.text || '').join('\n') || '';
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
// Serve vandon order management page
app.get(['/vandon', '/vandon/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'vandon', 'index.html'));
});
app.use('/vandon', express.static(path.join(__dirname, 'vandon')));
app.use(express.static(__dirname, { extensions: ['html'] }));

// ─── Douyin Downloader (native Node.js, no Python dependency) ────────────────
const dy = require('./douyin');
const { Readable: _StreamReadable } = require('stream');

app.get('/api/douyin/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/douyin/resolve', async (req, res) => {
  try {
    const url = (req.body.url || '').trim();
    if (!url) return res.status(400).json({ detail: 'url is required' });

    const { parsed } = await dy.resolveUrl(url);
    if (!parsed || !['video', 'gallery'].includes(parsed.type))
      return res.status(400).json({ detail: 'Unsupported URL format' });

    const awemeId = parsed.aweme_id;
    if (!awemeId) return res.status(400).json({ detail: 'Could not extract video ID from URL' });

    const aweme = await dy.getVideoDetail(awemeId);
    if (!aweme) return res.status(404).json({ detail: 'Video not found or unavailable' });

    const isGallery = !!(aweme.image_post_info || aweme.images || aweme.image_list);
    const durMs = (aweme.video || {}).duration;
    res.json({
      aweme_id: String(awemeId),
      title: (aweme.desc || '').trim() || 'Untitled',
      author: (aweme.author || {}).nickname || 'Unknown',
      cover_url: dy.getCoverUrl(aweme),
      media_type: isGallery ? 'gallery' : 'video',
      duration: durMs ? Math.floor(parseInt(durMs) / 1000) : null,
      image_urls: isGallery ? dy.collectImageUrls(aweme) : [],
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get('/api/douyin/image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ detail: 'url required' });
  if (!dy.isAllowedImageUrl(url)) return res.status(400).json({ detail: 'URL not from allowed CDN' });
  try {
    const r = await fetch(url, {
      headers: { 'Referer': 'https://www.douyin.com/', 'User-Agent': dy.DEFAULT_UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(r.status).end();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    _StreamReadable.fromWeb(r.body).pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).end();
  }
});

app.get('/api/douyin/stream/:aweme_id', async (req, res) => {
  const { aweme_id } = req.params;
  try {
    const aweme = await dy.getVideoDetail(aweme_id);
    if (!aweme) return res.status(404).json({ detail: 'Video not found' });

    const videoUrl = dy.extractVideoUrl(aweme);
    if (!videoUrl) return res.status(404).json({ detail: 'No downloadable video URL found' });

    const desc = ((aweme.desc || aweme_id) + '').trim().slice(0, 80);
    const safeName = desc.replace(/[\\/:*?"<>|#\r\n]/g, '_');

    const r = await fetch(videoUrl, {
      headers: { 'Referer': `${dy.BASE_URL}/`, 'User-Agent': dy.DEFAULT_UA },
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) return res.status(r.status).json({ detail: 'stream failed' });

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName + '.mp4')}`);
    res.setHeader('Content-Type', 'video/mp4');
    const cl = r.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    _StreamReadable.fromWeb(r.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ detail: err.message });
  }
});

app.post('/api/douyin/resolve-batch', async (req, res) => {
  try {
    const urls = (req.body.urls || []).map(u => (u || '').trim()).filter(Boolean).slice(0, 50);
    if (!urls.length) return res.status(400).json({ detail: 'urls required' });

    // Semaphore: max 5 concurrent
    let running = 0;
    const queue = [];
    async function withSem(fn) {
      if (running < 5) { running++; try { return await fn(); } finally { running--; queue.shift()?.(); } }
      await new Promise(r => queue.push(r));
      return withSem(fn);
    }

    const results = await Promise.all(urls.map(rawUrl => withSem(async () => {
      try {
        const { parsed } = await dy.resolveUrl(rawUrl);
        if (!parsed || !['video', 'gallery'].includes(parsed.type))
          return { url: rawUrl, error: 'Unsupported URL format' };
        const awemeId = parsed.aweme_id;
        if (!awemeId) return { url: rawUrl, error: 'Could not extract video ID' };

        const aweme = await dy.getVideoDetail(awemeId);
        if (!aweme) return { url: rawUrl, error: 'Video not found' };

        const isGallery = !!(aweme.image_post_info || aweme.images || aweme.image_list);
        const durMs = (aweme.video || {}).duration;
        return {
          url: rawUrl,
          video: {
            aweme_id: String(awemeId),
            title: (aweme.desc || '').trim() || 'Untitled',
            author: (aweme.author || {}).nickname || 'Unknown',
            cover_url: dy.getCoverUrl(aweme),
            media_type: isGallery ? 'gallery' : 'video',
            duration: durMs ? Math.floor(parseInt(durMs) / 1000) : null,
            image_urls: isGallery ? dy.collectImageUrls(aweme) : [],
          },
        };
      } catch (err) { return { url: rawUrl, error: err.message }; }
    })));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.post('/api/douyin/user-posts', async (req, res) => {
  try {
    const url = (req.body.url || '').trim();
    const cursor = parseInt(req.body.cursor || 0) || 0;
    const count = parseInt(req.body.count || 20) || 20;
    if (!url) return res.status(400).json({ detail: 'url is required' });

    const { parsed } = await dy.resolveUrl(url);
    if (!parsed || parsed.type !== 'user')
      return res.status(400).json({ detail: 'URL must be a Douyin user profile URL' });
    const secUid = parsed.sec_uid;
    if (!secUid) return res.status(400).json({ detail: 'Could not extract user ID from URL' });

    const [userInfo, page] = await Promise.all([
      dy.getUserInfo(secUid),
      dy.getUserPosts(secUid, cursor, count),
    ]);

    const videos = (page.items || []).filter(a => a && a.aweme_id).map(aweme => {
      const isGallery = !!(aweme.image_post_info || aweme.images || aweme.image_list);
      const durMs = (aweme.video || {}).duration;
      return {
        aweme_id: String(aweme.aweme_id),
        title: (aweme.desc || '').trim() || 'Untitled',
        author: (aweme.author || {}).nickname || 'Unknown',
        cover_url: dy.getCoverUrl(aweme),
        media_type: isGallery ? 'gallery' : 'video',
        duration: durMs ? Math.floor(parseInt(durMs) / 1000) : null,
      };
    });

    let avatarUrl = null;
    if (userInfo) {
      for (const key of ['avatar_medium', 'avatar_thumb', 'avatar_larger']) {
        const urls = (userInfo[key] || {}).url_list || [];
        if (urls.length) { avatarUrl = urls[0]; break; }
      }
    }

    res.json({
      user: { sec_uid: secUid, nickname: (userInfo || {}).nickname || secUid, avatar_url: avatarUrl },
      videos,
      has_more: page.has_more,
      next_cursor: page.next_cursor,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// ─── Douyin QR Login ─────────────────────────────────────────────────────────
const DY_SSO = 'https://sso.douyin.com';
const DY_SVC = encodeURIComponent('https://www.douyin.com');

async function dyFollowRedirectForCookies(startUrl) {
  const all = {};
  let url = startUrl;
  for (let i = 0; i < 8; i++) {
    let r;
    try {
      r = await fetch(url, {
        headers: { 'User-Agent': dy.DEFAULT_UA, 'Referer': 'https://www.douyin.com/' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
    } catch { break; }
    const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const h of setCookies) {
      const m = h.match(/^([^=]+)=([^;]*)/);
      if (m) all[m[1].trim()] = m[2].trim();
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) break;
      url = loc.startsWith('http') ? loc : new URL(loc, url).href;
    } else break;
  }
  return all;
}

app.get('/api/douyin-login/qr', async (_req, res) => {
  try {
    const r = await fetch(
      `${DY_SSO}/get_qrcode/?service=${DY_SVC}&need_logo=false&redirect_url=${encodeURIComponent('https://www.douyin.com/')}&next=%2F&aid=6383&language=zh`,
      {
        headers: {
          'User-Agent': dy.DEFAULT_UA,
          'Referer': 'https://www.douyin.com/',
          'Accept': 'application/json, */*',
        },
        signal: AbortSignal.timeout(12000),
      }
    );
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      const text = await r.text();
      console.error('[douyin-qr] SSO non-JSON response HTTP', r.status, text.slice(0, 300));
      return res.status(502).json({ error: `Douyin SSO trả về HTML (HTTP ${r.status}). Có thể API đã thay đổi hoặc bị chặn theo địa lý.` });
    }
    const d = await r.json();
    if (d.error_code !== 0) return res.status(400).json({ error: d.description || 'QR generation failed' });
    const qr = d.data || {};
    res.json({ token: qr.token, qr_url: qr.qrcode_index_url || qr.qrcode || qr.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/douyin-login/poll', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    const r = await fetch(
      `${DY_SSO}/check_qrconnect/?token=${encodeURIComponent(token)}&service=${DY_SVC}&need_logo=false&aid=6383`,
      {
        headers: { 'User-Agent': dy.DEFAULT_UA, 'Referer': 'https://www.douyin.com/' },
        signal: AbortSignal.timeout(12000),
      }
    );
    const d = await r.json();
    const status = (d.data || {}).status;
    const label = ['waiting', 'scanned', 'confirmed', 'expired'][status - 1] || 'unknown';

    if (status === 3) {
      const redirectUrl = (d.data || {}).redirect_url;
      if (redirectUrl) {
        const cookies = await dyFollowRedirectForCookies(redirectUrl);
        if (cookies.sessionid) {
          db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('douyin_cookies', ?, datetime('now'))").run(JSON.stringify(cookies));
          return res.json({ status: 'confirmed', saved: true });
        }
      }
      return res.json({ status: 'confirmed', saved: false });
    }
    res.json({ status: label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/douyin-login/status', (_req, res) => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'douyin_cookies'").get();
    if (!row) return res.json({ logged_in: false });
    const c = JSON.parse(row.value || '{}');
    res.json({ logged_in: !!c.sessionid });
  } catch {
    res.json({ logged_in: false });
  }
});

app.delete('/api/douyin-login', (_req, res) => {
  db.prepare("DELETE FROM settings WHERE key = 'douyin_cookies'").run();
  res.json({ ok: true });
});

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

db.exec(`
  CREATE TABLE IF NOT EXISTS shopee_product_knowledge (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT,
    slug TEXT,
    name TEXT NOT NULL,
    category_slug TEXT,
    brand_slug TEXT,
    description TEXT,
    specs TEXT DEFAULT '{}',
    variants TEXT DEFAULT '[]',
    images TEXT DEFAULT '[]',
    search_text TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

function specsText(specs) {
  const obj = typeof specs === 'string' ? parseJSON(specs, {}) : (specs || {});
  return Object.entries(obj).map(([k, v]) => `${String(k).replace(/^-+\s*/, '')}: ${v}`).join('\n');
}

function productKnowledgeSearchText(item) {
  return normalizeText([item.name, item.category_slug, item.brand_slug, item.description, specsText(item.specs), item.variants].join(' '));
}

function rebuildShopeeKnowledgeDb() {
  const rows = db.prepare(`SELECT id, slug, name, category_slug, brand_slug, description, specs, variants, images FROM products`).all();
  const combos = db.prepare(`SELECT id, slug, name, level, blade, rubber_fh, rubber_bh, description, images FROM combos`).all();
  const insert = db.prepare(`
    INSERT INTO shopee_product_knowledge
      (id, source_type, source_id, slug, name, category_slug, brand_slug, description, specs, variants, images, search_text, updated_at)
    VALUES (@id, @source_type, @source_id, @slug, @name, @category_slug, @brand_slug, @description, @specs, @variants, @images, @search_text, datetime('now'))
  `);
  db.prepare('DELETE FROM shopee_product_knowledge').run();
  const tx = db.transaction(() => {
    for (const r of rows) {
      insert.run({
        id: `product:${r.id}`,
        source_type: 'product',
        source_id: r.id,
        slug: r.slug,
        name: r.name,
        category_slug: r.category_slug,
        brand_slug: r.brand_slug || '',
        description: r.description || '',
        specs: r.specs || '{}',
        variants: r.variants || '[]',
        images: r.images || '[]',
        search_text: productKnowledgeSearchText(r),
      });
    }
    for (const c of combos) {
      const comboSpecs = {
        'Cốt': c.blade || '',
        'Mặt FH': c.rubber_fh || '',
        'Mặt BH': c.rubber_bh || '',
        'Trình độ': c.level || '',
      };
      insert.run({
        id: `combo:${c.id}`,
        source_type: 'combo',
        source_id: c.id,
        slug: c.slug,
        name: c.name,
        category_slug: 'combo-vot',
        brand_slug: '',
        description: c.description || '',
        specs: JSON.stringify(comboSpecs),
        variants: '[]',
        images: c.images || '[]',
        search_text: productKnowledgeSearchText({ ...c, category_slug: 'combo-vot', specs: comboSpecs, variants: '' }),
      });
    }
  });
  tx();
  return rows.length + combos.length;
}

function ensureShopeeKnowledgeDb() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM shopee_product_knowledge').get();
  if (!row || row.c === 0) return rebuildShopeeKnowledgeDb();
  return row.c;
}

function inferKnowledgeFields(row) {
  const specs = parseJSON(row.specs, {});
  const specTxt = specsText(specs);
  const findSpec = (...keys) => {
    const entry = Object.entries(specs).find(([k]) => keys.some(key => normalizeText(k).includes(normalizeText(key))));
    return entry ? String(entry[1] || '') : '';
  };
  const features = [specTxt, row.description || ''].filter(Boolean).join('\n\n').slice(0, 2200);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    score: row.score || 0,
    description: row.description || '',
    shortDesc: String(row.description || '').split(/\n\s*\n/)[0]?.replace(/^[-•]\s*/, '').slice(0, 500) || '',
    specs,
    specsText: specTxt,
    features,
    material: findSpec('chất liệu', 'loại', 'công nghệ'),
    size: findSpec('kích thước', 'độ dày', 'độ cứng', 'size'),
    color: findSpec('màu', 'color'),
    customer: row.category_slug === 'combo-vot' ? 'Người chơi cần combo vợt cấu hình sẵn' : 'Người chơi bóng bàn, CLB bóng bàn',
    mainKeyword: row.name,
    subKeyword: [row.brand_slug, row.category_slug, findSpec('ITTF', 'công nghệ', 'loại')].filter(Boolean).join(', '),
    images: parseJSON(row.images, []),
  };
}

function matchShopeeKnowledge(productName) {
  ensureShopeeKnowledgeDb();
  const q = normalizeText(productName);
  const tokens = q.split(/\s+/).filter(t => t.length > 1);
  if (!tokens.length) return null;
  const rows = db.prepare('SELECT * FROM shopee_product_knowledge').all();
  let best = null;
  for (const row of rows) {
    const name = normalizeText(row.name);
    const search = row.search_text || normalizeText([row.name, row.description, row.specs].join(' '));
    let score = 0;
    if (name === q) score += 100;
    if (name.includes(q) || q.includes(name)) score += 45;
    for (const t of tokens) {
      if (name.includes(t)) score += 8;
      else if (search.includes(t)) score += 3;
    }
    score = score / Math.max(25, tokens.length * 8 + 45);
    if (!best || score > best.score) best = { ...row, score: Math.min(score, 1) };
  }
  if (!best || best.score < 0.18) return null;
  return inferKnowledgeFields(best);
}

function buildShopeePrompt(data) {
  const productName = data.productName || '';
  const features = data.features || data.facts || '';
  const customer = data.customer || '';
  const mainKeyword = data.mainKeyword || productName;
  const subKeyword = data.subKeyword || '';
  const shortDesc = data.shortDesc || '';
  const material = data.material || '';
  const size = data.size || data.pack || '';
  const color = data.color || '';
  return `Tạo nội dung Shopee bằng JSON hợp lệ, không markdown, không giải thích thêm.

Trả về đúng cấu trúc:
{
  "title": "một tiêu đề sản phẩm duy nhất",
  "description": "mô tả sản phẩm hoàn chỉnh"
}

PHẦN TIÊU ĐỀ:
Bạn là chuyên gia SEO Shopee và tối ưu chuyển đổi bán hàng TMĐT.

Hãy tạo tiêu đề sản phẩm chuyên nghiệp cho sản phẩm dưới đây theo chuẩn SEO Shopee Việt Nam.

Yêu cầu:
- Độ dài 20-120 ký tự, ưu tiên 80-115 ký tự nếu thông tin đủ rõ
- Keyword chính đặt đầu câu, đi kèm thương hiệu/mẫu mã/quy cách nếu có
- Tự nhiên, dễ đọc, không spam keyword
- Không được chỉ trả về tên sản phẩm + “chính hãng”
- Bắt buộc khai thác mô tả/thông số kỹ thuật để thêm ít nhất 2 yếu tố bán hàng cụ thể
- Ưu tiên yếu tố kỹ thuật như: chất liệu, cấu tạo, lối chơi, độ kiểm soát, tốc độ, đối tượng sử dụng, quy cách
- Không viết IN HOA toàn bộ
- Không dùng emoji, HTML, ký tự lạ, tên shop, số điện thoại, Zalo/Facebook/website, tên sàn khác
- Không dùng từ khuyến mãi hoặc phóng đại như: “số 1”, “tốt nhất”, “rẻ nhất”, “hot”, “bán chạy nhất”, “giảm giá”, “freeship”, “cam kết khỏi”, “100% hiệu quả”, “vĩnh viễn”, “chính hãng tuyệt đối”
- Không chứa thông tin vi phạm chính sách Shopee
- Tiêu đề phải khớp với mô tả, ảnh và thông số được cung cấp; không tự bịa chứng nhận/thông số
- Tập trung tăng CTR và tỷ lệ tìm kiếm
- Ưu tiên cấu trúc:
  [Thương hiệu/Tên sản phẩm] + [Thông số/quy cách] + [Đặc điểm nổi bật] + [Đối tượng]

Thông tin sản phẩm:
${productName}

Mô tả kỹ thuật từ website:
${shortDesc}

Đặc điểm nổi bật:
${features}

Tệp khách hàng:
${customer}

Keyword chính:
${mainKeyword}

Keyword phụ:
${subKeyword}

PHẦN MÔ TẢ:
Bạn là copywriter chuyên viết mô tả sản phẩm Shopee chuẩn SEO và tối ưu chuyển đổi.

Hãy viết mô tả sản phẩm chuyên nghiệp cho sản phẩm dưới đây.

Yêu cầu:
- Viết tự nhiên, thuyết phục
- Chuẩn SEO Shopee
- Không spam keyword
- Không dùng từ ngữ vi phạm chính sách Shopee
- Không hứa hẹn quá mức
- Không dùng các từ tuyệt đối như:
  “100%”, “cam kết”, “đảm bảo khỏi”, “tốt nhất thị trường”, “hiệu quả ngay”, “trị dứt điểm”, “rẻ nhất”
- Không đưa số điện thoại, Zalo, Facebook, website, địa chỉ shop, hoặc nội dung kéo khách giao dịch ngoài Shopee
- Không nhắc sàn thương mại điện tử khác, không dùng từ khóa thương hiệu không liên quan
- Thông tin trong mô tả phải nhất quán với tiêu đề; chỉ viết thông số đã được cung cấp, thông tin thiếu thì ghi trung tính
- Độ dài phù hợp đăng Shopee: tối thiểu 100 ký tự, tối đa 3000 ký tự
- Có thể thêm 5-10 hashtag liên quan ở cuối, không quá 18 hashtag và không dùng hashtag gây nhiễu
- Có icon nhẹ để dễ đọc
- Format rõ ràng

Cấu trúc:
1. Hook mở đầu thu hút
2. Lợi ích nổi bật
3. Đặc điểm chi tiết
4. Hướng dẫn sử dụng
5. Thông tin sản phẩm
6. Chính sách hỗ trợ khách hàng trong sàn Shopee
7. CTA mềm thúc đẩy mua hàng
8. Hashtag liên quan nếu phù hợp

Thông tin sản phẩm:
${productName}

Mô tả ngắn:
${shortDesc}

Đặc điểm:
${features}

Chất liệu:
${material}

Kích thước:
${size}

Màu sắc:
${color}

Đối tượng:
${customer}

Keyword chính:
${mainKeyword}

Keyword phụ:
${subKeyword}

Yêu cầu SEO:
- Chèn keyword tự nhiên
- Có đoạn ngắn dễ đọc trên mobile
- Tối ưu tìm kiếm Shopee và Google

Chỉ trả về JSON hợp lệ.`;
}

const SHOPEE_TITLE_MAX = 120;
const SHOPEE_DESCRIPTION_MAX = 3000;
const SHOPEE_RISKY_PHRASES = [
  'số 1',
  'tốt nhất',
  'tốt nhất thị trường',
  'rẻ nhất',
  'hot',
  'hot nhất',
  'bán chạy',
  'bán chạy nhất',
  'giảm giá',
  'sale sốc',
  'freeship',
  'miễn phí vận chuyển',
  'cam kết khỏi',
  '100% hiệu quả',
  'hiệu quả ngay',
  'đảm bảo khỏi',
  'trị dứt điểm',
  'vĩnh viễn',
  'chính hãng tuyệt đối',
];

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanShopeeTitle(title) {
  let result = String(title || '')
    .replace(/["“”]/g, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/<[^>]*>/g, '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .replace(/\b(?:zalo|facebook|fb\.com|instagram|tiktok|hotline|số điện thoại|website)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (const phrase of SHOPEE_RISKY_PHRASES) {
    result = result.replace(new RegExp(escapeRegExp(phrase), 'gi'), '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function sanitizeShopeeDescription(description) {
  let result = String(description || '')
    .replace(/<[^>]*>/g, '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .split(/\r?\n/)
    .filter(line => !/\b(zalo|facebook|fb\.com|instagram|tiktok|hotline|số điện thoại|website|địa chỉ shop)\b/i.test(line))
    .join('\n')
    .replace(/\b\d{3,4}[ .-]?\d{3,4}[ .-]?\d{3,4}\b/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  for (const phrase of SHOPEE_RISKY_PHRASES) {
    result = result.replace(new RegExp(escapeRegExp(phrase), 'gi'), '');
  }
  if (result.length > SHOPEE_DESCRIPTION_MAX) {
    const cut = result.slice(0, SHOPEE_DESCRIPTION_MAX);
    result = cut.slice(0, Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '), 2600)).trim();
  }
  return result.replace(/[ \t]{2,}/g, ' ').trim();
}

function inferTitlePhrases(data) {
  const text = normalizeText([data.productName, data.shortDesc, data.features, data.facts, data.material, data.size, data.customer].join(' '));
  const phrases = [];
  const add = (cond, phrase) => { if (cond && !phrases.includes(phrase)) phrases.push(phrase); };
  add(/carbon|alc|arylate/.test(text), 'Carbon kiểm soát tốt');
  add(/gỗ|go |wood/.test(text), 'Gỗ ổn định');
  add(/abs|40\+/.test(text), 'ABS 40+ ổn định');
  add(/tập luyện|tap luyen/.test(text), 'tập luyện hằng ngày');
  add(/thi đấu|thi dau/.test(text), 'thi đấu phong trào');
  add(/ittf/.test(text), 'chuẩn ITTF');
  add(/gai dài|gai dai/.test(text), 'gai dài phòng thủ');
  add(/gai ngắn|gai ngan/.test(text), 'gai ngắn tấn công');
  add(/anti|chống xoáy|chong xoay/.test(text), 'chống xoáy');
  add(/xoáy|xoay|spin/.test(text), 'tạo xoáy tốt');
  add(/kiểm soát|kiem soat|control/.test(text), 'kiểm soát dễ');
  add(/tốc độ|toc do|speed|off/.test(text), 'tốc độ ổn định');
  add(/clb|phong trào|phong trao/.test(text), 'cho CLB');
  add(/người mới|nguoi moi|beginner/.test(text), 'cho người mới');
  return phrases;
}

function buildSeoTitleFallback(data) {
  const productName = cleanShopeeTitle(data.productName || data.mainKeyword || 'Sản phẩm bóng bàn');
  const keyword = cleanShopeeTitle(data.mainKeyword || productName);
  const productNorm = normalizeText(productName);
  const keywordNorm = normalizeText(keyword);
  const keywordTokens = keywordNorm.split(/\s+/).filter(t => t.length > 1);
  const coveredTokens = keywordTokens.filter(t => productNorm.includes(t)).length;
  const keywordAlreadyCovered = keywordTokens.length && coveredTokens / keywordTokens.length >= 0.75;
  const base = keywordAlreadyCovered || productNorm.startsWith(keywordNorm) ? productName : `${keyword} ${productName}`;
  const phrases = inferTitlePhrases(data);
  const customer = data.customer ? cleanShopeeTitle(data.customer).replace(/^người chơi\s*/i, 'cho ') : '';
  const pieces = [base, ...phrases.slice(0, 3), customer].filter(Boolean);
  let title = '';
  for (const piece of pieces) {
    const next = title ? `${title} ${piece}` : piece;
    if (next.length <= SHOPEE_TITLE_MAX) title = next;
  }
  return cleanShopeeTitle(title || base).slice(0, SHOPEE_TITLE_MAX).trim();
}

function normalizeShopeeTitle(aiTitle, data) {
  let title = cleanShopeeTitle(aiTitle);
  const productName = cleanShopeeTitle(data.productName || '');
  const tooShort = title.length < Math.min(55, productName.length + 18);
  const genericOnly = /chính hãng$/i.test(title) && title.length <= productName.length + 18;
  const missingProduct = productName && !normalizeText(title).includes(normalizeText(productName).split(/\s+/)[0]);
  if (!title || tooShort || genericOnly || missingProduct) title = buildSeoTitleFallback(data);
  if (title.length > SHOPEE_TITLE_MAX) {
    const words = title.split(/\s+/);
    title = '';
    for (const word of words) {
      const next = title ? `${title} ${word}` : word;
      if (next.length > SHOPEE_TITLE_MAX) break;
      title = next;
    }
  }
  return cleanShopeeTitle(title);
}

function fallbackShopeeContent({ productName, pack, facts }) {
  const name = productName || 'Sản phẩm bóng bàn';
  const specLines = String(facts || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const specs = specLines.length ? specLines.map(s => `• ${s}`).join('\n') : `• Tên sản phẩm: ${name}\n${pack ? `• Quy cách: ${pack}` : '• Quy cách: Theo thông tin shop'}`;
  const title = buildSeoTitleFallback({ productName: name, mainKeyword: name, facts, size: pack, pack });
  const description = `🏓 ${name.toUpperCase()} – CHUẨN CHO TẬP LUYỆN VÀ THI ĐẤU

Độ ổn định cao • Cảm giác sử dụng chắc chắn • Phù hợp người chơi bóng bàn

${name} phù hợp cho người chơi bóng bàn đang cần sản phẩm dễ chọn, đúng mô tả và có độ ổn định tốt trong tập luyện hằng ngày.

━━━━━━━━━━━━━━━

✅ THÔNG TIN SẢN PHẨM

${specs}

━━━━━━━━━━━━━━━

✅ ĐIỂM NỔI BẬT

• Thiết kế phù hợp cho nhu cầu bóng bàn
• Dễ sử dụng cho tập luyện và chơi phong trào
• Chất lượng ổn định trong tầm giá
• Phù hợp cá nhân, CLB và người chơi nâng cấp dụng cụ

━━━━━━━━━━━━━━━

✅ PHÙ HỢP CHO

• Người chơi bóng bàn phong trào
• CLB bóng bàn
• Người tập luyện nâng cao
• Người cần sản phẩm rõ thông tin, dễ chọn mua

━━━━━━━━━━━━━━━

📦 SẢN PHẨM BAO GỒM

• ${pack || name}

━━━━━━━━━━━━━━━

🛡 HỖ TRỢ TỪ BÓNG BÀN VIỆT

• Đóng gói cẩn thận
• Hỗ trợ tư vấn chọn sản phẩm phù hợp
• Nội dung đăng bán không chứa link hoặc thông tin giao dịch ngoài Shopee`;
  const imagePrompts = [
    `Ảnh thumbnail Shopee 1:1 cho ${name}, nền sáng sạch, sản phẩm lớn ở trung tâm, ánh sáng studio, badge "Chính hãng", text ngắn dễ đọc mobile.`,
    `Ảnh lợi ích Shopee 1:1 cho ${name}, bố cục chuyên nghiệp, 3 điểm nổi bật dạng callout, màu sắc thể thao, không rối mắt.`,
    `Ảnh thông số Shopee 1:1 cho ${name}, có bảng thông tin sản phẩm gọn gàng, nền sạch, cảm giác chính hãng và đáng tin cậy.`
  ];
  return { title, description: sanitizeShopeeDescription(description), imagePrompts };
}

function parseAiJson(text, fallback) {
  try {
    const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(match ? match[0] : cleaned);
    return {
      title: obj.title || fallback.title,
      description: obj.description || fallback.description,
      imagePrompts: Array.isArray(obj.imagePrompts) ? obj.imagePrompts.slice(0, 3) : fallback.imagePrompts,
    };
  } catch {
    return fallback;
  }
}

function parseAiJsonWithTitleData(text, fallback, titleData) {
  const parsed = parseAiJson(text, fallback);
  return {
    ...parsed,
    title: normalizeShopeeTitle(parsed.title, titleData),
    description: sanitizeShopeeDescription(parsed.description || fallback.description),
  };
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function shopeeSearchLinks(productName) {
  const q = encodeURIComponent(productName || '');
  return [
    { label: 'Google Images', url: `https://www.google.com/search?tbm=isch&q=${q}` },
    { label: 'Shopee search', url: `https://shopee.vn/search?keyword=${q}` },
    { label: 'Bóng Bàn Việt', url: `https://www.google.com/search?tbm=isch&q=${q}%20site%3Abongbanviet.com` },
  ];
}

function localProductImages(productName, limit = 8) {
  const q = normalizeText(productName);
  const tokens = q.split(/\s+/).filter(t => t.length > 1);
  if (!tokens.length) return [];
  const rows = db.prepare(`SELECT name, images FROM products WHERE images IS NOT NULL AND images != '[]' LIMIT 1000`).all();
  const scored = [];
  for (const row of rows) {
    const name = normalizeText(row.name);
    const score = tokens.reduce((n, t) => n + (name.includes(t) ? 2 : 0), 0);
    if (!score) continue;
    const images = parseJSON(row.images, []);
    for (const url of images.filter(Boolean)) {
      scored.push({ url, thumbnail: url, title: row.name, source: 'catalog', score });
    }
  }
  try {
    const productDir = path.join(DATA_DIR, 'images', 'products');
    if (fs.existsSync(productDir)) {
      for (const file of fs.readdirSync(productDir)) {
        const name = normalizeText(file);
        const score = tokens.reduce((n, t) => n + (name.includes(t) ? 1 : 0), 0);
        if (score) scored.push({ url: '/images/products/' + file, thumbnail: '/images/products/' + file, title: file, source: 'files', score });
      }
    }
  } catch {}
  const seen = new Set();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter(img => !seen.has(img.url) && seen.add(img.url))
    .slice(0, limit);
}

async function webProductImages(productName, limit = 10) {
  const q = `${productName} chính hãng sản phẩm`;
  try {
    if (process.env.SERPAPI_KEY) {
      const r = await fetch(`https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(q)}&api_key=${process.env.SERPAPI_KEY}`, { signal: AbortSignal.timeout(12000) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `SerpAPI HTTP ${r.status}`);
      return (data.images_results || []).slice(0, limit).map(x => ({
        url: x.original || x.thumbnail,
        thumbnail: x.thumbnail || x.original,
        title: x.title || 'Ảnh sản phẩm',
        source: x.source || 'Google Images',
      })).filter(x => x.url);
    }
    if (process.env.BING_IMAGE_SEARCH_KEY) {
      const r = await fetch(`https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(q)}&count=${limit}&safeSearch=Moderate`, {
        headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_IMAGE_SEARCH_KEY },
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || `Bing HTTP ${r.status}`);
      return (data.value || []).map(x => ({
        url: x.contentUrl,
        thumbnail: x.thumbnailUrl || x.contentUrl,
        title: x.name || 'Ảnh sản phẩm',
        source: x.hostPageDomainFriendlyName || x.hostPageDisplayUrl || 'Bing Images',
      })).filter(x => x.url);
    }
    if (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX) {
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?searchType=image&num=${Math.min(limit, 10)}&key=${process.env.GOOGLE_CSE_API_KEY}&cx=${process.env.GOOGLE_CSE_CX}&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(12000) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || `Google CSE HTTP ${r.status}`);
      return (data.items || []).map(x => ({
        url: x.link,
        thumbnail: x.image?.thumbnailLink || x.link,
        title: x.title || 'Ảnh sản phẩm',
        source: x.displayLink || 'Google CSE',
      })).filter(x => x.url);
    }
  } catch (e) {
    console.error('[Shopee image search]', e.message);
  }
  return [];
}

async function imageSourceToBlob(url) {
  if (!url) return null;
  if (url.startsWith('/images/products/')) {
    const filePath = path.join(imgDir, path.basename(url));
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return new Blob([fs.readFileSync(filePath)], { type });
  }
  if (!/^https?:\/\//i.test(url)) return null;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const type = r.headers.get('content-type') || 'image/jpeg';
  if (!/^image\//i.test(type)) return null;
  return new Blob([Buffer.from(await r.arrayBuffer())], { type });
}

async function imageSourceToPart(url) {
  const blob = await imageSourceToBlob(url);
  if (!blob) return null;
  const buffer = Buffer.from(await blob.arrayBuffer());
  return {
    inline_data: {
      mime_type: blob.type || 'image/jpeg',
      data: buffer.toString('base64'),
    },
  };
}

function uploadedFileToGeminiPart(file) {
  if (!file || !fs.existsSync(file.path)) return null;
  return {
    inline_data: {
      mime_type: file.mimetype || 'image/jpeg',
      data: fs.readFileSync(file.path).toString('base64'),
    },
  };
}

async function generateOpenAiShopeeImage({ prompt, sourceFile, sourceUrl, openaiKey, index }) {
  const sourceBlob = sourceFile ? null : await imageSourceToBlob(sourceUrl);
  let r;
  if (sourceFile || sourceBlob) {
    const fd = new FormData();
    fd.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5');
    fd.append('prompt', prompt);
    fd.append('size', '1024x1024');
    fd.append('image',
      sourceBlob || new Blob([fs.readFileSync(sourceFile.path)], { type: sourceFile.mimetype || 'image/png' }),
      sourceFile?.originalname || `source-${index + 1}.png`
    );
    r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: fd,
      signal: AbortSignal.timeout(90000),
    });
  } else {
    r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5',
        prompt,
        size: '1024x1024',
      }),
      signal: AbortSignal.timeout(90000),
    });
  }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `OpenAI Images HTTP ${r.status}`);
  return data.data?.[0]?.b64_json || '';
}

async function generateGeminiShopeeImage({ prompt, sourceFile, sourceUrl, geminiKey }) {
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
  const parts = [{ text: prompt }];
  const uploadedPart = uploadedFileToGeminiPart(sourceFile);
  const urlPart = uploadedPart ? null : await imageSourceToPart(sourceUrl);
  if (uploadedPart || urlPart) parts.push(uploadedPart || urlPart);

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `Gemini Image HTTP ${r.status}`);
  const outParts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = outParts.find(p => p.inlineData?.data || p.inline_data?.data);
  return imagePart?.inlineData?.data || imagePart?.inline_data?.data || '';
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

// ─── Orders ──────────────────────────────────────────────────────────────────

app.get('/api/orders', requireAuth, (req, res) => {
  const { status, q, limit = 500 } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (q) {
    sql += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR id LIKE ?)';
    const p = `%${q}%`; params.push(p, p, p);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Number(limit));
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })));
});

app.get('/api/orders/:id', requireAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  res.json({ ...r, items: JSON.parse(r.items || '[]') });
});

app.post('/api/orders', requireAuth, (req, res) => {
  const o = req.body;
  const id = (o.id || '').trim() || `BBV-${Date.now()}`;
  try {
    db.prepare(`INSERT INTO orders (id,customer_name,customer_phone,customer_address,customer_province,customer_district,customer_ward,carrier,tracking_code,status,items,notes,total_amount,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
      .run(id, o.customer_name||'', o.customer_phone||'', o.customer_address||'', o.customer_province||'', o.customer_district||'', o.customer_ward||'', o.carrier||'', o.tracking_code||'', o.status||'pending', JSON.stringify(o.items||[]), o.notes||'', Number(o.total_amount)||0);
    res.json({ id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/orders/:id', requireAuth, (req, res) => {
  const o = req.body;
  const info = db.prepare(`UPDATE orders SET customer_name=?,customer_phone=?,customer_address=?,customer_province=?,customer_district=?,customer_ward=?,carrier=?,tracking_code=?,status=?,items=?,notes=?,total_amount=?,updated_at=datetime('now') WHERE id=?`)
    .run(o.customer_name||'', o.customer_phone||'', o.customer_address||'', o.customer_province||'', o.customer_district||'', o.customer_ward||'', o.carrier||'', o.tracking_code||'', o.status||'pending', JSON.stringify(o.items||[]), o.notes||'', Number(o.total_amount)||0, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  res.json({ ok: true });
});

app.delete('/api/orders/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  res.json({ ok: true });
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

// ─── Product Catalog (merged SQLite + price-list for autocomplete) ───────────

let _catalogCache = null;
let _catalogCacheTime = 0;
const CATALOG_TTL = 30_000;

app.get('/api/product-catalog', async (req, res) => {
  try {
    const now = Date.now();
    if (_catalogCache && now - _catalogCacheTime < CATALOG_TTL) {
      return res.json(_catalogCache);
    }

    // 1. Products from SQLite (retail price, normalize to number)
    const webProducts = db.prepare(
      'SELECT name, price, variants, brand_slug, slug FROM products ORDER BY sort_order, name'
    ).all().map(p => {
      let price = 0;
      if (p.variants) {
        const v = JSON.parse(p.variants || '[]');
        if (v.length > 0) {
          const pr = Number(String(v[0].price || '').replace(/\D/g, ''));
          if (pr) price = pr;
        }
      }
      if (!price) price = Number(String(p.price || '').replace(/\D/g, '')) || 0;
      return { name: p.name, price, brand: p.brand_slug || '', sku: p.slug || '', source: 'web' };
    });

    // 2. Products from price-list Excel (retail column)
    const plProducts = [];
    if (fs.existsSync(PRICE_LIST_FILE)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(PRICE_LIST_FILE);
      const ws = wb.worksheets[0];
      let lastBrand = '';
      ws.eachRow((row, rowNum) => {
        if (rowNum < 27) return;
        const brandCell = String(row.getCell(2).value || '').trim();
        const name = String(row.getCell(3).value || '').trim();
        if (!name) return;
        if (brandCell) lastBrand = brandCell;
        const retail = cellNum(row.getCell(4));
        const dealer = cellNum(row.getCell(5));
        if (retail === 0 && dealer === 0) return; // skip header rows
        plProducts.push({ name, price: retail, brand: lastBrand, sku: '', source: 'price-list' });
      });
    }

    // 3. Deduplicate: SQLite products take priority
    const webNames = new Set(webProducts.map(p => p.name.toLowerCase().trim()));
    const uniquePL = plProducts.filter(p => !webNames.has(p.name.toLowerCase().trim()));

    _catalogCache = [...webProducts, ...uniquePL];
    _catalogCacheTime = now;
    res.json(_catalogCache);
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
app.post('/api/shopee/find-images', requireAuth, async (req, res) => {
  const { productName } = req.body || {};
  if (!productName) return res.status(400).json({ error: 'Thiếu tên sản phẩm' });

  const local = localProductImages(productName, 8);
  const web = await webProductImages(productName, 10);
  const seen = new Set();
  const images = [...local, ...web]
    .filter(img => img.url && !seen.has(img.url) && seen.add(img.url))
    .slice(0, 18);

  res.json({
    images,
    searchLinks: shopeeSearchLinks(productName),
    hasSearchApi: !!(process.env.SERPAPI_KEY || process.env.BING_IMAGE_SEARCH_KEY || (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX)),
  });
});

app.post('/api/shopee/rebuild-knowledge', requireAuth, (req, res) => {
  const count = rebuildShopeeKnowledgeDb();
  res.json({ ok: true, count });
});

app.post('/api/shopee/match-knowledge', requireAuth, (req, res) => {
  const { productName } = req.body || {};
  if (!productName) return res.status(400).json({ error: 'Thiếu tên sản phẩm' });
  res.json({ match: matchShopeeKnowledge(productName) });
});

app.get('/api/shopee/ai-config', requireAuth, (req, res) => {
  const cfg = readShopeeAiConfig();
  res.json({
    openai: { configured: !!(process.env.OPENAI_API_KEY || cfg.openaiApiKey), source: process.env.OPENAI_API_KEY ? 'env' : (cfg.openaiApiKey ? 'admin' : ''), tail: keyTail(process.env.OPENAI_API_KEY || cfg.openaiApiKey) },
    gemini: { configured: !!(process.env.GEMINI_API_KEY || cfg.geminiApiKey), source: process.env.GEMINI_API_KEY ? 'env' : (cfg.geminiApiKey ? 'admin' : ''), tail: keyTail(process.env.GEMINI_API_KEY || cfg.geminiApiKey) },
    claude: { configured: !!(process.env.ANTHROPIC_API_KEY || cfg.claudeApiKey), source: process.env.ANTHROPIC_API_KEY ? 'env' : (cfg.claudeApiKey ? 'admin' : ''), tail: keyTail(process.env.ANTHROPIC_API_KEY || cfg.claudeApiKey) },
  });
});

app.put('/api/shopee/ai-config', requireAuth, (req, res) => {
  const cfg = readShopeeAiConfig();
  const next = { ...cfg };
  const map = {
    openaiApiKey: 'openaiApiKey',
    geminiApiKey: 'geminiApiKey',
    claudeApiKey: 'claudeApiKey',
  };
  for (const [bodyKey, cfgKey] of Object.entries(map)) {
    if (!(bodyKey in (req.body || {}))) continue;
    const value = String(req.body[bodyKey] || '').trim();
    if (value) next[cfgKey] = value;
  }
  next.updatedAt = new Date().toISOString();
  writeShopeeAiConfig(next);
  res.json({ ok: true });
});

app.delete('/api/shopee/ai-config/:provider', requireAuth, (req, res) => {
  const cfg = readShopeeAiConfig();
  const map = { openai: 'openaiApiKey', gemini: 'geminiApiKey', claude: 'claudeApiKey' };
  const key = map[req.params.provider];
  if (!key) return res.status(400).json({ error: 'Provider không hợp lệ' });
  delete cfg[key];
  cfg.updatedAt = new Date().toISOString();
  writeShopeeAiConfig(cfg);
  res.json({ ok: true });
});

app.post('/api/shopee/generate-copy', requireAuth, async (req, res) => {
  const { productName, pack, facts, provider = 'openai' } = req.body || {};
  if (!productName) return res.status(400).json({ error: 'Thiếu tên sản phẩm' });

  const match = matchShopeeKnowledge(productName);
  const enriched = {
    ...(req.body || {}),
    shortDesc: req.body.shortDesc || match?.shortDesc || match?.description || '',
    features: req.body.features || match?.features || '',
    material: req.body.material || match?.material || '',
    size: req.body.size || match?.size || pack || '',
    color: req.body.color || match?.color || '',
    customer: req.body.customer || match?.customer || '',
    mainKeyword: req.body.mainKeyword || match?.mainKeyword || productName,
    subKeyword: req.body.subKeyword || match?.subKeyword || '',
    facts: req.body.facts || match?.specsText || facts || '',
  };
  const prompt = buildShopeePrompt(enriched);
  const fallbackRaw = fallbackShopeeContent({ productName, pack, facts: enriched.facts });
  const fallback = {
    ...fallbackRaw,
    title: normalizeShopeeTitle(fallbackRaw.title, enriched),
    description: sanitizeShopeeDescription(fallbackRaw.description),
  };

  try {
    const plan = shopeeCopyProviderPlan(provider);
    if (!plan.length) {
      return res.json({
        ...fallback,
        prompt,
        usedFallback: true,
        providerError: 'Chưa có API key OpenAI/Gemini phù hợp. Hệ thống đã tạo nội dung mẫu để chỉnh thủ công.',
      });
    }

    const errors = [];
    for (const aiProvider of plan) {
      try {
        const raw = await callShopeeTextProvider(aiProvider, prompt);
        return res.json({
          ...parseAiJsonWithTitleData(raw, fallback, enriched),
          usedFallback: false,
          provider: aiProvider,
          providerLabel: shopeeProviderLabel(aiProvider),
          triedProviders: plan,
        });
      } catch (providerError) {
        errors.push(`${shopeeProviderLabel(aiProvider)}: ${providerError.message}`);
      }
    }

    res.json({
      ...fallback,
      prompt,
      usedFallback: true,
      providerError: errors.join(' | '),
      triedProviders: plan,
    });
  } catch (e) {
    res.json({ ...fallback, prompt, usedFallback: true, providerError: e.message });
  }
});

app.post('/api/shopee/generate-images', requireAuth, upload.array('images', 3), async (req, res) => {
  let provider = req.body?.provider || 'openai';
  let prompts = [];
  if (Array.isArray(req.body?.prompts)) prompts = req.body.prompts;
  else {
    try { prompts = JSON.parse(req.body?.prompts || '[]'); } catch { prompts = []; }
  }
  let sourceUrls = [];
  try { sourceUrls = JSON.parse(req.body?.sourceUrls || '[]'); } catch { sourceUrls = []; }
  prompts = prompts.slice(0, 3).filter(Boolean);
  if (!prompts.length) return res.status(400).json({ error: 'Thiếu prompt ảnh' });
  if (provider === 'claude') {
    return res.json({ images: [], usedFallback: true, providerError: 'Claude API hiện không hỗ trợ tạo ảnh trong tích hợp này. Hãy chọn ChatGPT/OpenAI hoặc Gemini.' });
  }
  const openaiKey = getAiKey('openai');
  const geminiKey = getAiKey('gemini');
  if (provider === 'auto') provider = openaiKey ? 'openai' : (geminiKey ? 'gemini' : 'openai');
  if (provider === 'openai' && !openaiKey) return res.json({ images: [], usedFallback: true, providerError: 'Chưa có OpenAI API key. Hãy nhập key OpenAI hoặc chọn Gemini.' });
  if (provider === 'gemini' && !geminiKey) return res.json({ images: [], usedFallback: true, providerError: 'Chưa có Gemini API key. Hãy nhập key Gemini hoặc chọn ChatGPT/OpenAI.' });

  const saved = [];
  try {
  for (let i = 0; i < prompts.length; i++) {
    const source = req.files?.[i] || req.files?.[0] || null;
    if (provider === 'gemini') {
      const b64Gemini = await generateGeminiShopeeImage({
        prompt: prompts[i],
        sourceFile: source,
        sourceUrl: sourceUrls[i] || sourceUrls[0] || '',
        geminiKey,
      });
      if (!b64Gemini) continue;
      const filename = `${Date.now().toString(36)}-shopee-gemini-${i + 1}.png`;
      fs.writeFileSync(path.join(imgDir, filename), Buffer.from(b64Gemini, 'base64'));
      saved.push('/images/products/' + filename);
      continue;
    }
    const sourceBlob = source ? null : await imageSourceToBlob(sourceUrls[i] || sourceUrls[0]);
    let r;
    if (source || sourceBlob) {
      const fd = new FormData();
      fd.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1');
      fd.append('prompt', prompts[i]);
      fd.append('size', '1024x1024');
      fd.append('image',
        sourceBlob || new Blob([fs.readFileSync(source.path)], { type: source.mimetype || 'image/png' }),
        source?.originalname || `source-${i + 1}.png`
      );
      r = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: fd,
        signal: AbortSignal.timeout(90000),
      });
    } else {
      r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
          prompt: prompts[i],
          size: '1024x1024',
        }),
        signal: AbortSignal.timeout(90000),
      });
    }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `OpenAI Images HTTP ${r.status}`);
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) continue;
    const filename = `${Date.now().toString(36)}-shopee-${i + 1}.png`;
    fs.writeFileSync(path.join(imgDir, filename), Buffer.from(b64, 'base64'));
    saved.push('/images/products/' + filename);
  }

  } catch (e) {
    return res.json({ images: saved, usedFallback: saved.length === 0, providerError: e.message });
  }

  res.json({
    images: saved,
    usedFallback: saved.length === 0,
    providerError: saved.length ? '' : `${provider === 'gemini' ? 'Gemini' : 'OpenAI'} không trả về ảnh. Kiểm tra model, quota, vùng hỗ trợ hoặc API key.`,
  });
});

function startTracker() {
  if (!BOT_TOKEN) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN chưa set — coin tracker & bot disabled');
    return;
  }
  setInterval(trackerTick, 10000);
  tgPoll();
  console.log(`🤖 Telegram bot started | 🔄 Tracker polling every 10s`);
}

// ─── Tạo Ảnh Website / FB / IG ──────────────────────────────────────────────
function buildWebsiteImagePrompt(productName) {
  const headline = productName
    ? `If adding product text, use only this short clean headline: "${productName}", placed with generous spacing and not overlapping the product.`
    : 'If adding product text, use only one short clean headline based on the product name, placed with generous spacing and not overlapping the product.';
  return `Use the uploaded product image as the exact reference. Create one professional square product image, 800 x 800 px, suitable for BongBanViet.com, Facebook, and Instagram.

Keep the product 100% accurate: exact shape, proportions, colors, material texture, printed text, labels, packaging, and logos from the input image. Do not redesign, replace, simplify, or invent any part of the product.

Visual style: premium table tennis equipment retail photography, consistent with BongBanViet.com. Use a clean warm off-white background #FAFAF8, refined black #1A1A1A contrast, and subtle red #D62B2B / coral #E8503A accents. The image should feel professional, trustworthy, official, sporty, modern, and high-end.

Composition: square 1:1, product centered and dominant, occupying about 70–85% of the frame, fully visible, not cropped. Use realistic studio lighting, sharp focus, natural reflections, and a soft realistic shadow. Add only very subtle background details such as minimal grid lines, light motion accents, or table-tennis-inspired shapes, keeping the layout clean and uncluttered.

Branding: add a small tasteful brand mark "BÓNG BÀN VIỆT" with the slogan "Tư Vấn Chuẩn · Hàng Chính Hãng" in a clean modern sans-serif style similar to Lexend. Place it subtly in a corner or footer area, using black/red brand colors, without covering the product. Do not make it look like a sale banner.

Text rules: no price, no phone number, no Zalo, no QR code, no external link, no large promotional text. ${headline}

Output: photorealistic premium e-commerce and social media product image, crisp detail, balanced margins, clean composition, 800 x 800 px.
Do not change the product, do not alter logos or printed text, no fake branding, no extra products, no people, no clutter, no discount badge, no loud sale graphics, no watermark, no QR code, no phone number, no Zalo, no website URL, no distorted perspective, no blur, no overexposure, no cartoon style, no AI artifacts, no text covering the product.`;
}

app.post('/api/generate-website-image', requireAuth, upload.single('image'), async (req, res) => {
  const productName = (req.body?.productName || '').trim();
  // API key: prefer key sent from frontend (stored in browser localStorage), fallback to server stored key
  const apiKey = (req.body?.apiKey || '').trim() || getAiKey('openai');

  if (!apiKey) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.json({ success: false, error: 'Chưa có OpenAI API key. Nhập key trong ô "OpenAI API Key" và bấm Lưu key.' });
  }

  const prompt = buildWebsiteImagePrompt(productName);
  const source = req.file;

  try {
    let r;
    if (source) {
      const fd = new FormData();
      fd.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1');
      fd.append('prompt', prompt);
      fd.append('size', '1024x1024');
      fd.append('image',
        new Blob([fs.readFileSync(source.path)], { type: source.mimetype || 'image/png' }),
        source.originalname || 'product.png'
      );
      r = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
        signal: AbortSignal.timeout(120000),
      });
    } else {
      r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024' }),
        signal: AbortSignal.timeout(120000),
      });
    }

    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `OpenAI HTTP ${r.status}`);

    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI không trả về ảnh. Kiểm tra model, quota hoặc API key.');

    const safeSlug = productName ? productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) + '-' : '';
    const filename = `${Date.now().toString(36)}-website-${safeSlug}img.png`;
    fs.writeFileSync(path.join(imgDir, filename), Buffer.from(b64, 'base64'));

    if (source?.path && fs.existsSync(source.path)) fs.unlinkSync(source.path);

    res.json({ success: true, url: '/images/products/' + filename });
  } catch (e) {
    if (source?.path && fs.existsSync(source.path)) {
      try { fs.unlinkSync(source.path); } catch {}
    }
    res.json({ success: false, error: e.message });
  }
});

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
