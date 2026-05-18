const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('./db');
const crypto = require('crypto');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : __dirname;
const SHOPEE_AI_CONFIG_FILE = path.join(DATA_DIR, 'shopee-ai-config.json');
const FACEBOOK_CONFIG_FILE = path.join(DATA_DIR, 'facebook-config.json');
const FACEBOOK_LOCAL_IMPORT_FILE = path.resolve(
  process.env.FACEBOOK_IMPORT_JSON_FILE ||
  path.join(os.homedir(), 'Desktop', 'facebook-posts.json')
);

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

function readFacebookRuntimeConfig() {
  try {
    if (!fs.existsSync(FACEBOOK_CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(FACEBOOK_CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeFacebookRuntimeConfig(next) {
  fs.mkdirSync(path.dirname(FACEBOOK_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(FACEBOOK_CONFIG_FILE, JSON.stringify(next, null, 2));
}

function facebookProviderLabel(provider) {
  if (provider === 'openai') return 'ChatGPT / OpenAI';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'claude') return 'Claude';
  return 'AI';
}

function getFacebookAiKey(provider) {
  const cfg = readFacebookRuntimeConfig();
  if (provider === 'openai') return process.env.FACEBOOK_OPENAI_API_KEY || process.env.OPENAI_API_KEY || cfg.openaiApiKey || '';
  if (provider === 'gemini') return process.env.FACEBOOK_GEMINI_API_KEY || process.env.GEMINI_API_KEY || cfg.geminiApiKey || '';
  if (provider === 'claude') return process.env.FACEBOOK_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || cfg.claudeApiKey || '';
  return '';
}

function facebookProviderPlan(requestedProvider = 'auto') {
  const plan = [];
  const pushIfReady = (provider) => {
    if (getFacebookAiKey(provider) && !plan.includes(provider)) plan.push(provider);
  };

  if (requestedProvider === 'auto') {
    pushIfReady('openai');
    pushIfReady('gemini');
    pushIfReady('claude');
    return plan;
  }

  pushIfReady(requestedProvider);
  if (requestedProvider === 'openai') pushIfReady('gemini');
  return plan;
}

async function callFacebookTextProvider(provider, prompt) {
  if (provider === 'gemini') {
    const geminiKey = getFacebookAiKey('gemini');
    const model = process.env.FACEBOOK_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
    const claudeKey = getFacebookAiKey('claude');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.FACEBOOK_CLAUDE_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
        max_tokens: 2200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `Claude HTTP ${r.status}`);
    return data.content?.map(p => p.text || '').join('\n') || '';
  }

  const openaiKey = getFacebookAiKey('openai');
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: process.env.FACEBOOK_OPENAI_TEXT_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.4-mini',
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
app.use('/images/facebook', express.static(path.join(DATA_DIR, 'images', 'facebook')));
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

// ─── FFmpeg WASM Proxy (fixes cross-origin Worker restriction) ──────────────
// Serves ffmpeg scripts from same origin so browser allows Worker creation
const FFMPEG_MAP = {
  'ffmpeg.js':        'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js',
  'util.js':          'https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js',
  'ffmpeg-core.js':   'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
  'ffmpeg-core.wasm': 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
};
app.get('/ffmpeg-proxy/:file', async (req, res) => {
  const file = req.params.file;
  const upstream = FFMPEG_MAP[file]
    || (/^\d+\.ffmpeg\.js$/.test(file) ? `https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/${file}` : null);
  if (!upstream) return res.status(404).end();
  try {
    const r = await fetch(upstream, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return res.status(r.status).end();
    res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ─── Audio Proxy (fixes CORS for external music URLs) ────────────────────
app.get('/api/proxy-audio', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid URL' });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return res.status(r.status).end();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ─── TikTok Integration ───────────────────────────────────────────────────
app.get('/api/tiktok/status', (req, res) => {
  const cfg = readShopeeAiConfig();
  const configured = !!(process.env.TIKTOK_CLIENT_KEY);
  if (!cfg.tiktokAccessToken) return res.json({ connected: false, configured });
  res.json({ connected: true, username: cfg.tiktokUsername || '', avatar: cfg.tiktokAvatar || '', configured });
});

app.get('/api/tiktok/auth-url', (req, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  if (!clientKey) return res.status(400).json({ error: 'TIKTOK_CLIENT_KEY chưa được cấu hình' });
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/tiktok/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=video.publish%2Cuser.info.basic&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  res.json({ url });
});

app.get('/api/tiktok/callback', async (req, res) => {
  const { code, error: ttErr } = req.query;
  const close = (ok, data) => res.send(`<script>window.opener&&window.opener.postMessage(${JSON.stringify({ type: 'tiktok-auth', success: ok, ...data })},'*');window.close();</script>`);
  if (ttErr || !code) return close(false, { error: ttErr || 'cancelled' });
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/tiktok/callback`;
  try {
    const tokenR = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri })
    });
    const td = await tokenR.json();
    if (!td.access_token) throw new Error(td.error_description || 'Token exchange failed');
    const userR = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
      headers: { Authorization: `Bearer ${td.access_token}` }
    });
    const user = ((await userR.json()).data || {}).user || {};
    const cfg = readShopeeAiConfig();
    Object.assign(cfg, { tiktokAccessToken: td.access_token, tiktokRefreshToken: td.refresh_token || '', tiktokOpenId: user.open_id || '', tiktokUsername: user.display_name || '', tiktokAvatar: user.avatar_url || '' });
    writeShopeeAiConfig(cfg);
    close(true, { username: user.display_name || 'TikTok User' });
  } catch (e) {
    close(false, { error: e.message });
  }
});

app.delete('/api/tiktok/disconnect', (req, res) => {
  const cfg = readShopeeAiConfig();
  ['tiktokAccessToken','tiktokRefreshToken','tiktokOpenId','tiktokUsername','tiktokAvatar'].forEach(k => delete cfg[k]);
  writeShopeeAiConfig(cfg);
  res.json({ ok: true });
});

// TikTok video upload — client POSTs processed blob, server uploads to TikTok API
try { fs.mkdirSync(path.join(DATA_DIR, 'temp'), { recursive: true }); } catch {}
const ttMulter = multer({ dest: path.join(DATA_DIR, 'temp'), limits: { fileSize: 500 * 1024 * 1024 } });
app.post('/api/tiktok/upload', ttMulter.single('video'), async (req, res) => {
  const cfg = readShopeeAiConfig();
  if (!cfg.tiktokAccessToken) return res.status(401).json({ error: 'Chưa kết nối TikTok' });
  if (!req.file) return res.status(400).json({ error: 'Không có file video' });
  const filePath = req.file.path;
  const title = (req.body.title || 'Bóng bàn').slice(0, 2200);
  const validPrivacy = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'];
  const privacy = validPrivacy.includes(req.body.privacy) ? req.body.privacy : 'SELF_ONLY';
  const token = cfg.tiktokAccessToken;
  try {
    const fileSize = fs.statSync(filePath).size;
    const initR = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: { title, privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000 },
        source_info: { source: 'FILE_UPLOAD', video_size: fileSize, chunk_size: fileSize, total_chunk_count: 1 }
      })
    });
    const initData = await initR.json();
    if (initData.error?.code !== 'ok') throw new Error(initData.error?.message || 'TikTok init failed');
    const uploadR = await fetch(initData.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(fileSize), 'Content-Range': `bytes 0-${fileSize-1}/${fileSize}` },
      body: fs.readFileSync(filePath)
    });
    fs.unlinkSync(filePath);
    if (!uploadR.ok) throw new Error('TikTok upload failed: ' + uploadR.status);
    res.json({ ok: true });
  } catch (e) {
    try { fs.unlinkSync(filePath); } catch {}
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(__dirname, { extensions: ['html'] }));

// ─── Douyin Downloader (native Node.js, no Python dependency) ────────────────
const dy = require('./douyin');
const { Readable: _StreamReadable } = require('stream');

app.get('/api/douyin/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/douyin/debug', async (req, res) => {
  const url = (req.body.url || '').trim();
  if (!url) return res.status(400).json({ error: 'url required' });
  const out = {};
  let longUrl = url;
  try {
    const r = await dy.resolveUrl(url);
    out.resolved_url = r.url;
    out.parsed = r.parsed;
    if (r.parsed && r.parsed.aweme_id) longUrl = `https://www.douyin.com/video/${r.parsed.aweme_id}`;
  } catch (e) { out.resolve_error = e.message; }

  // Test TikWM with original URL
  try {
    const body = new URLSearchParams({ url, hd: '1' });
    const r = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { 'User-Agent': dy.DEFAULT_UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://www.tikwm.com/' },
      body: body.toString(),
      signal: AbortSignal.timeout(20000),
    });
    out.tikwm_short_status = r.status;
    out.tikwm_short_data = await r.json().catch(() => null);
  } catch (e) { out.tikwm_short_error = e.message; }

  // Test TikWM with long URL (clean www.douyin.com/video/{id})
  if (longUrl !== url) {
    try {
      const body = new URLSearchParams({ url: longUrl, hd: '1' });
      const r = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: { 'User-Agent': dy.DEFAULT_UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://www.tikwm.com/' },
        body: body.toString(),
        signal: AbortSignal.timeout(20000),
      });
      out.tikwm_long_status = r.status;
      out.tikwm_long_data = await r.json().catch(() => null);
    } catch (e) { out.tikwm_long_error = e.message; }
  }

  // Test douyin.wtf with long URL (8s timeout)
  try {
    const r = await fetch(`https://api.douyin.wtf/api/hybrid/video_data?url=${encodeURIComponent(longUrl)}&minimal=false`, {
      headers: { 'User-Agent': dy.DEFAULT_UA, 'Accept': 'application/json', 'Referer': 'https://douyin.wtf/' },
      signal: AbortSignal.timeout(8000),
    });
    out.douyinwtf_status = r.status;
    out.douyinwtf_data = await r.json().catch(() => null);
  } catch (e) { out.douyinwtf_error = e.message; }

  // Test Cobalt.tools with long URL
  try {
    const r = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: { 'User-Agent': dy.DEFAULT_UA, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: longUrl, videoQuality: '1080', filenameStyle: 'pretty' }),
      signal: AbortSignal.timeout(20000),
    });
    out.cobalt_status = r.status;
    out.cobalt_data = await r.json().catch(() => null);
  } catch (e) { out.cobalt_error = e.message; }

  res.json(out);
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

    const aweme = await dy.getVideoDetail(awemeId, url);
    if (!aweme) return res.status(404).json({ detail: 'Video not found or unavailable' });

    const isGallery = !!(aweme.image_post_info || aweme.images || aweme.image_list);
    const durMs = (aweme.video || {}).duration;
    const videoUrl = isGallery ? null : dy.extractVideoUrl(aweme);
    const descStr = ((aweme.desc || '') + '').trim().slice(0, 80) || String(awemeId);
    res.json({
      aweme_id: String(awemeId),
      title: (aweme.desc || '').trim() || 'Untitled',
      author: (aweme.author || {}).nickname || 'Unknown',
      cover_url: dy.getCoverUrl(aweme),
      media_type: isGallery ? 'gallery' : 'video',
      duration: durMs ? Math.floor(parseInt(durMs) / 1000) : null,
      image_urls: isGallery ? dy.collectImageUrls(aweme) : [],
      play_url: videoUrl || null,
      filename: descStr.replace(/[\\/:*?"<>|#\r\n]/g, '_') + '.mp4',
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

// Shared helper: resolve a video ID via TikWM (tries TikTok + Douyin URLs in parallel)
async function _resolveTikwmById(aweme_id) {
  const _tryOne = async (candidateUrl) => {
    const r = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'User-Agent': dy.DEFAULT_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.tikwm.com/',
        'Accept': 'application/json, */*',
      },
      body: new URLSearchParams({ url: candidateUrl, hd: '1' }).toString(),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error('tikwm_http_' + r.status);
    const d = await r.json().catch(() => null);
    if (d?.code === 0 && d?.data && (d.data.play || d.data.hdplay || d.data.wmplay)) return d;
    throw new Error('tikwm_code_' + (d?.code ?? 'null'));
  };
  return Promise.any([
    _tryOne(`https://www.tiktok.com/video/${encodeURIComponent(aweme_id)}`),
    _tryOne(`https://www.douyin.com/video/${encodeURIComponent(aweme_id)}`),
  ]);
}

app.get('/api/douyin/stream/:aweme_id', async (req, res) => {
  const { aweme_id } = req.params;
  try {
    let tikwmData;
    try {
      tikwmData = await _resolveTikwmById(aweme_id);
    } catch {
      return res.status(404).json({ error: 'Video not found or unavailable' });
    }

    const d = tikwmData.data;
    const videoUrl = d.play || d.hdplay || d.wmplay;
    if (!videoUrl) return res.status(404).json({ error: 'No playable URL from TikWM' });

    const safeName = (d.title || aweme_id).replace(/[\\/:*?"<>|#\r\n]/g, '_');

    // Separate connection timeout from body stream — abort only if CDN doesn't start responding
    const ctrl = new AbortController();
    const connectTimer = setTimeout(() => ctrl.abort(new Error('CDN connection timeout')), 30000);
    let r;
    try {
      r = await fetch(videoUrl, {
        headers: { 'User-Agent': dy.DEFAULT_UA, 'Referer': 'https://www.tiktok.com/' },
        redirect: 'follow',
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(connectTimer);
    }
    if (!r.ok) return res.status(r.status).json({ error: 'CDN returned ' + r.status });

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName + '.mp4')}`);
    res.setHeader('Content-Type', 'video/mp4');
    const cl = r.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    _StreamReadable.fromWeb(r.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: err.message });
  }
});

// Stream any pre-resolved video URL — avoids re-fetching video details
// ?inline=1 → serve without Content-Disposition + Range support (for <video> playback)
app.get('/api/douyin/stream-url', async (req, res) => {
  const { url: videoUrl, filename = 'video.mp4', inline } = req.query;
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl))
    return res.status(400).json({ detail: 'Invalid or missing url' });
  try {
    const isInline = !!inline;
    const fetchHeaders = { 'User-Agent': dy.DEFAULT_UA, 'Referer': 'https://www.tiktok.com/' };
    const rangeHeader = req.headers['range'];
    if (isInline && rangeHeader) fetchHeaders['Range'] = rangeHeader;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('CDN timeout')), 30000);
    let r;
    try {
      r = await fetch(videoUrl, { headers: fetchHeaders, redirect: 'follow', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok && r.status !== 206) return res.status(r.status).json({ detail: 'Video stream failed: ' + r.status });
    res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    if (!isInline) {
      const safeName = String(filename).replace(/[\\/:*?"<>|#\r\n]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    }
    if (r.status === 206) {
      res.status(206);
      const cr = r.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
    }
    const cl = r.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    _StreamReadable.fromWeb(r.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ detail: err.message });
  }
});

// Preview endpoint — no Content-Disposition, supports Range requests so <video> can play + seek
app.get('/api/douyin/preview/:aweme_id', async (req, res) => {
  const { aweme_id } = req.params;
  try {
    let tikwmData;
    try {
      tikwmData = await _resolveTikwmById(aweme_id);
    } catch {
      return res.status(404).json({ error: 'Video not found or unavailable' });
    }

    const d = tikwmData.data;
    const videoUrl = d.play || d.hdplay || d.wmplay;
    if (!videoUrl) return res.status(404).json({ error: 'No playable URL' });

    const fetchHeaders = {
      'User-Agent': dy.DEFAULT_UA,
      'Referer': 'https://www.tiktok.com/',
    };
    const rangeHeader = req.headers['range'];
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('CDN timeout')), 30000);
    let r;
    try {
      r = await fetch(videoUrl, { headers: fetchHeaders, redirect: 'follow', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!r.ok && r.status !== 206) return res.status(r.status).json({ error: 'CDN ' + r.status });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    if (r.status === 206) {
      res.status(206);
      const cr = r.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
    }
    const cl = r.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    _StreamReadable.fromWeb(r.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: err.message });
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

        const aweme = await dy.getVideoDetail(awemeId, rawUrl);
        if (!aweme) return { url: rawUrl, error: 'Video not found' };

        const isGallery = !!(aweme.image_post_info || aweme.images || aweme.image_list);
        const durMs = (aweme.video || {}).duration;
        const videoUrl = isGallery ? null : dy.extractVideoUrl(aweme);
        const descStr = ((aweme.desc || '') + '').trim().slice(0, 80) || String(awemeId);
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
            play_url: videoUrl || null,
            filename: descStr.replace(/[\\/:*?"<>|#\r\n]/g, '_') + '.mp4',
          },
        };
      } catch (err) { return { url: rawUrl, error: err.message }; }
    })));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Search Douyin/TikTok via TikWM + translate query to Chinese
app.post('/api/douyin/search', async (req, res) => {
  const { query, cursor = 0 } = req.body;
  if (!query || !String(query).trim()) return res.status(400).json({ detail: 'query required' });
  let searchTerm = String(query).trim();
  // Translate to Chinese using free Google Translate API
  try {
    const tUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(searchTerm)}`;
    const tResp = await fetch(tUrl, { headers: { 'User-Agent': dy.DEFAULT_UA }, signal: AbortSignal.timeout(5000) });
    const tData = await tResp.json();
    const tr = (tData[0] || []).map(t => t[0]).join('');
    if (tr && tr !== searchTerm) searchTerm = tr;
  } catch (e) { console.error('[Search] translate error:', e.message); }
  try {
    const sr = await fetch(
      `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(searchTerm)}&count=20&cursor=${Number(cursor) || 0}&hd=1`,
      { headers: { 'User-Agent': dy.DEFAULT_UA, 'Referer': 'https://www.tikwm.com/' }, signal: AbortSignal.timeout(15000) }
    );
    const sd = await sr.json().catch(() => null);
    if (!sd || sd.code !== 0 || !sd.data) {
      console.error('[Search] TikWM failed:', JSON.stringify(sd)?.slice(0, 200));
      return res.status(502).json({ detail: 'Search failed — try again later', query_original: String(query).trim(), query_translated: searchTerm });
    }
    const videos = (sd.data.videos || []).map(v => ({
      aweme_id: String(v.id || ''),
      title: v.title || 'Untitled',
      author: (v.author || {}).nickname || '',
      cover_url: v.cover || '',
      duration: v.duration || 0,
      play_url: v.play || v.wmplay || '',
      media_type: 'video',
    }));
    res.json({ query_original: String(query).trim(), query_translated: searchTerm, videos, has_more: !!(sd.data.hasMore), cursor: Number(sd.data.cursor) || 0 });
  } catch (err) { res.status(500).json({ detail: err.message }); }
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
      const videoUrl = isGallery ? null : dy.extractVideoUrl(aweme);
      const descStr = ((aweme.desc || '') + '').trim().slice(0, 80) || String(aweme.aweme_id);
      return {
        aweme_id: String(aweme.aweme_id),
        title: (aweme.desc || '').trim() || 'Untitled',
        author: (aweme.author || {}).nickname || 'Unknown',
        cover_url: dy.getCoverUrl(aweme),
        media_type: isGallery ? 'gallery' : 'video',
        duration: durMs ? Math.floor(parseInt(durMs) / 1000) : null,
        play_url: videoUrl || null,
        filename: descStr.replace(/[\\/:*?"<>|#\r\n]/g, '_') + '.mp4',
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

app.post('/api/douyin-login/cookies', (req, res) => {
  try {
    const raw = (req.body.cookies || '').trim();
    if (!raw) return res.status(400).json({ error: 'cookies required' });
    const parsed = {};
    // Support JSON array format from EditThisCookie / Cookie-Editor extensions
    if (raw.trimStart().startsWith('[') || raw.trimStart().startsWith('{')) {
      try {
        const arr = JSON.parse(raw);
        const items = Array.isArray(arr) ? arr : [arr];
        items.forEach(item => {
          const k = (item.name || item.key || '').trim();
          const v = String(item.value ?? '').trim();
          if (k) parsed[k] = v;
        });
      } catch {
        // fall through to semicolon parsing
      }
    }
    if (!parsed.sessionid) {
      raw.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx > 0) {
          const k = part.slice(0, idx).trim();
          const v = part.slice(idx + 1).trim();
          if (k) parsed[k] = v;
        }
      });
    }
    if (!parsed.sessionid) return res.status(400).json({ error: 'Cookie thiếu sessionid — hãy kiểm tra lại đã copy đúng chưa' });
    db.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES('douyin_cookies', ?, datetime('now'))").run(JSON.stringify(parsed));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ─── Facebook Content Workflow ───────────────────────────────────────────────

const FACEBOOK_SITE_URL = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://bongbanviet.com').replace(/\/+$/, '');
const FACEBOOK_IMAGE_DIR = path.join(DATA_DIR, 'images', 'facebook');
fs.mkdirSync(FACEBOOK_IMAGE_DIR, { recursive: true });
const FACEBOOK_RETRYABLE_CODES = new Set([1, 2, 4, 17, 341]);

function normalizeFacebookGraphVersion(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'v24.0';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function getFacebookPageRuntime() {
  const fileCfg = readFacebookRuntimeConfig();
  return {
    pageId: process.env.FACEBOOK_PAGE_ID || fileCfg.pageId || '',
    pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || fileCfg.pageAccessToken || '',
    graphVersion: normalizeFacebookGraphVersion(process.env.FACEBOOK_GRAPH_VERSION || fileCfg.graphVersion || 'v24.0'),
    pageIdSource: process.env.FACEBOOK_PAGE_ID ? 'env' : (fileCfg.pageId ? 'file' : ''),
    pageTokenSource: process.env.FACEBOOK_PAGE_ACCESS_TOKEN ? 'env' : (fileCfg.pageAccessToken ? 'file' : ''),
  };
}

function facebookRuntimeSummary() {
  const page = getFacebookPageRuntime();
  return {
    pageIdConfigured: !!page.pageId,
    pageTokenConfigured: !!page.pageAccessToken,
    pageId: page.pageId || '',
    pageIdSource: page.pageIdSource,
    pageTokenSource: page.pageTokenSource,
    pageTokenTail: keyTail(page.pageAccessToken),
    graphVersion: page.graphVersion,
    aiProviders: facebookProviderPlan('auto'),
    aiKeys: {
      openai: { configured: !!getFacebookAiKey('openai'), tail: keyTail(getFacebookAiKey('openai')) },
      gemini: { configured: !!getFacebookAiKey('gemini'), tail: keyTail(getFacebookAiKey('gemini')) },
      claude: { configured: !!getFacebookAiKey('claude'), tail: keyTail(getFacebookAiKey('claude')) },
    },
  };
}

function requireFacebookPageRuntime() {
  const cfg = getFacebookPageRuntime();
  if (!cfg.pageId) throw new Error('Thiếu Facebook Page ID.');
  if (!cfg.pageAccessToken) throw new Error('Thiếu Facebook Page Access Token.');
  return cfg;
}

function facebookGraphUrl(cfg, endpoint) {
  return `https://graph.facebook.com/${cfg.graphVersion}/${endpoint.replace(/^\/+/, '')}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function facebookGraphRequest(work, attempt = 0) {
  try {
    return await work();
  } catch (err) {
    const status = err.response?.status;
    const fbError = err.response?.data?.error;
    const fbCode = fbError?.code;
    const fbMsg = fbError?.message || err.message;
    const retry = attempt < 3 && ((!err.response && err.code) || status >= 500 || FACEBOOK_RETRYABLE_CODES.has(fbCode));
    if (retry) {
      await sleep(2000 * Math.pow(2, attempt));
      return facebookGraphRequest(work, attempt + 1);
    }
    throw new Error(fbError ? `[FB #${fbCode}] ${fbMsg}` : `[HTTP ${status || 'network'}] ${fbMsg}`);
  }
}

const FACEBOOK_PILLARS = {
  knowledge:  { label: 'Kiến thức kỹ thuật',    voice: 'chuyên gia ân cần, thực chiến' },
  product:    { label: 'Sản phẩm & review',     voice: 'chuyên nghiệp, đáng tin cậy' },
  combo:      { label: 'Combo & tư vấn chọn đồ', voice: 'gần gũi, tư vấn đúng trình độ' },
  news:       { label: 'Tin tức & cộng đồng',   voice: 'cập nhật, khách quan' },
  engagement: { label: 'Tương tác cộng đồng',   voice: 'thân thiện, gợi mở bình luận' },
  trust:      { label: 'Niềm tin & chính hãng', voice: 'minh bạch, chắc chắn, không phóng đại' },
  promo:      { label: 'Bán hàng mềm',          voice: 'rõ lợi ích, không thúc ép quá đà' },
};

const FACEBOOK_DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const FACEBOOK_GROWTH_SCHEDULE = {
  1: [
    { time: '07:30:00', pillar: 'knowledge', bucket: 'Knowledge', label: 'Tip kỹ thuật đầu tuần', intent: 'Nhận diện đầu ngày, giúp page có giá trị ngay từ bài đầu.' },
    { time: '10:30:00', pillar: 'knowledge', bucket: 'Website', label: 'Kiến thức kéo web', intent: 'Dẫn về bongbanviet.com bằng bài chuyên sâu hoặc checklist.' },
    { time: '12:15:00', pillar: 'product', bucket: 'Product', label: 'Product discovery', intent: 'Giới thiệu sản phẩm theo nhu cầu, không bán gắt.' },
    { time: '15:30:00', pillar: 'engagement', bucket: 'Community', label: 'Poll/câu hỏi cộng đồng', intent: 'Kéo comment để tạo tín hiệu tương tác.' },
    { time: '21:15:00', pillar: 'engagement', bucket: 'Community', label: 'Hỏi đáp setup', intent: 'Gom câu hỏi cho inbox/Zalo và chủ đề ngày sau.' },
  ],
  2: [
    { time: '07:30:00', pillar: 'knowledge', bucket: 'Knowledge', label: 'Drill/footwork', intent: 'Tăng follow bằng nội dung dễ lưu và dễ share.' },
    { time: '10:30:00', pillar: 'combo', bucket: 'Combo', label: 'Combo theo trình độ', intent: 'Tư vấn setup theo level/ngân sách.' },
    { time: '12:15:00', pillar: 'product', bucket: 'Product', label: 'Review mềm', intent: 'Đưa sản phẩm vào khung người dùng đang lướt mua sắm.' },
    { time: '15:30:00', pillar: 'engagement', bucket: 'Community', label: 'So sánh A/B', intent: 'Tạo bình luận giữa 2 lựa chọn thiết bị/kỹ thuật.' },
    { time: '18:30:00', pillar: 'combo', bucket: 'Sales-soft', label: 'Setup sau giờ làm', intent: 'Đẩy cân nhắc mua khi người chơi rảnh xem đồ.' },
    { time: '21:15:00', pillar: 'engagement', bucket: 'Community', label: 'Hỏi đáp tối', intent: 'Chốt ngày bằng câu hỏi dễ trả lời.' },
  ],
  3: [
    { time: '07:30:00', pillar: 'knowledge', bucket: 'Knowledge', label: 'Lỗi kỹ thuật thường gặp', intent: 'Bài hữu ích để tăng share/save.' },
    { time: '10:30:00', pillar: 'knowledge', bucket: 'Website', label: 'Nguồn uy tín + web', intent: 'Xây authority bằng nguồn ITTF/WTT/hãng/forum.' },
    { time: '12:15:00', pillar: 'product', bucket: 'Product', label: 'Sản phẩm nổi bật', intent: 'Tận dụng khung retail tốt để quảng bá hàng.' },
    { time: '15:30:00', pillar: 'engagement', bucket: 'Community', label: 'Mini quiz', intent: 'Kéo phản hồi nhanh, tăng tín hiệu tương tác.' },
    { time: '18:30:00', pillar: 'combo', bucket: 'Combo', label: 'Case tư vấn setup', intent: 'Chuyển từ quan tâm sang inbox/Zalo.' },
    { time: '21:15:00', pillar: 'product', bucket: 'Product', label: 'So sánh review', intent: 'Bài cân nhắc mua, không trùng với slot trưa.' },
  ],
  4: [
    { time: '07:30:00', pillar: 'knowledge', bucket: 'Knowledge', label: 'Giao bóng/trả giao', intent: 'Giữ nhịp nhận diện bằng tip thực chiến.' },
    { time: '10:30:00', pillar: 'product', bucket: 'Product', label: 'Product discovery', intent: 'Quảng bá sản phẩm trong khung mua sắm buổi sáng.' },
    { time: '12:15:00', pillar: 'combo', bucket: 'Combo', label: 'Combo bán mềm', intent: 'Gợi ý setup theo nhu cầu cụ thể.' },
    { time: '15:30:00', pillar: 'engagement', bucket: 'Community', label: 'Câu hỏi cộng đồng', intent: 'Tăng comment trước giờ cao điểm tối.' },
    { time: '18:30:00', pillar: 'promo', bucket: 'Promo', label: 'Ưu đãi nhẹ', intent: 'Chỉ dùng khi có sản phẩm/ưu đãi rõ, tránh spam.' },
    { time: '21:15:00', pillar: 'knowledge', bucket: 'Website', label: 'Recap kiến thức', intent: 'Dẫn về bài website hoặc checklist cuối ngày.' },
  ],
  5: [
    { time: '07:30:00', pillar: 'knowledge', bucket: 'Knowledge', label: 'Checklist cuối tuần', intent: 'Chuẩn bị cho người chơi đi đánh cuối tuần.' },
    { time: '10:30:00', pillar: 'trust', bucket: 'Trust', label: 'Chính hãng & quy trình tư vấn', intent: 'Xây niềm tin bằng dữ liệu sản phẩm, quy trình tư vấn và cam kết rõ ràng.' },
    { time: '12:15:00', pillar: 'promo', bucket: 'Promo', label: 'Ưu đãi cuối tuần', intent: 'CTA rõ nhưng không chiếm quá nhiều lịch.' },
    { time: '15:30:00', pillar: 'engagement', bucket: 'Community', label: 'Poll cuối tuần', intent: 'Kéo bình luận nhẹ trước cuối tuần.' },
    { time: '21:15:00', pillar: 'combo', bucket: 'Combo', label: 'Setup đi đánh cuối tuần', intent: 'Gợi ý combo thực dụng cho người chơi phong trào.' },
  ],
  6: [
    { time: '08:30:00', pillar: 'knowledge', bucket: 'Knowledge', label: 'Tip thực chiến cuối tuần', intent: 'Nội dung dễ xem trước khi đi chơi/đi đánh.' },
    { time: '11:00:00', pillar: 'trust', bucket: 'Trust', label: 'Ảnh kho/sản phẩm', intent: 'Tạo trust bằng hình ảnh thật và thông tin gọn.' },
    { time: '16:00:00', pillar: 'engagement', bucket: 'Community', label: 'Poll trận đấu', intent: 'Tận dụng thời gian cộng đồng rảnh thảo luận.' },
    { time: '20:30:00', pillar: 'engagement', bucket: 'Community', label: 'Recap cộng đồng', intent: 'Hỏi trải nghiệm trong ngày, gom insight cho tuần sau.' },
  ],
  0: [
    { time: '08:30:00', pillar: 'knowledge', bucket: 'Knowledge', label: 'FAQ người mới', intent: 'Nội dung nhẹ, dễ follow cho người mới.' },
    { time: '11:00:00', pillar: 'knowledge', bucket: 'Website', label: 'Bài tổng hợp website', intent: 'Kéo traffic bằng bài dài hoặc danh sách tư vấn.' },
    { time: '16:00:00', pillar: 'engagement', bucket: 'Community', label: 'Bình chọn chủ đề', intent: 'Lấy topic cho tuần tới.' },
    { time: '20:30:00', pillar: 'engagement', bucket: 'Community', label: 'Lịch tuần tới', intent: 'Tạo kỳ vọng, nhắc follow page.' },
  ],
};

const FACEBOOK_CONTENT_MIX = [
  { bucket: 'Knowledge', percent: 35, note: 'Kỹ thuật, luật, drill, lỗi thường gặp.' },
  { bucket: 'Community', percent: 20, note: 'Poll, hỏi đáp, tình huống trận đấu.' },
  { bucket: 'Product', percent: 20, note: 'Review mềm, so sánh, phù hợp trình độ nào.' },
  { bucket: 'Website', percent: 10, note: 'Bài kéo traffic về bongbanviet.com.' },
  { bucket: 'Trust', percent: 10, note: 'Chính hãng, feedback, ảnh kho, quy trình tư vấn.' },
  { bucket: 'Promo', percent: 5, note: 'Ưu đãi và CTA mạnh, dùng tiết chế.' },
];

const FACEBOOK_SOURCE_LIBRARY = [
  {
    name: 'ITTF Documents / Statutes',
    type: 'official',
    url: 'https://documents.ittf.sport/document?field_document_category_target_id=1245&field_document_type_target_id=All&field_place_value=&items_per_page=50&order=name_1&sort=desc',
    useFor: ['luật thi đấu', 'quy định kỹ thuật', 'thiết bị hợp lệ'],
  },
  {
    name: 'ITTF Equipment',
    type: 'official',
    url: 'https://equipment.ittf.com/',
    useFor: ['mặt vợt hợp lệ', 'bóng', 'bàn', 'lưới', 'sàn thi đấu'],
  },
  {
    name: 'World Table Tennis',
    type: 'official',
    url: 'https://www.worldtabletennis.com/',
    useFor: ['tin WTT', 'lịch giải', 'ranking', 'VĐV quốc tế'],
  },
  {
    name: 'ITTF Education',
    type: 'official',
    url: 'https://www.ittfeducation.com/',
    useFor: ['coaching', 'kỹ thuật', 'tập luyện'],
  },
  {
    name: 'Butterfly Global',
    type: 'brand',
    url: 'https://www.butterfly-global.com/en/products/',
    useFor: ['thông số Butterfly', 'mặt vợt', 'cốt vợt'],
  },
  {
    name: 'TIBHAR Official',
    type: 'brand',
    url: 'https://tibhar.info/en/',
    useFor: ['thông số Tibhar', 'mặt vợt', 'cốt vợt'],
  },
  {
    name: 'DHS Official',
    type: 'brand',
    url: 'https://dhs-tt.com/',
    useFor: ['thông số DHS', 'mặt vợt', 'cốt vợt', 'bóng'],
  },
  {
    name: 'Yinhe USA',
    type: 'brand',
    url: 'https://yinheusa.com/shop/',
    useFor: ['thông số Yinhe/Galaxy', 'review sản phẩm'],
  },
  {
    name: 'Báo Nhân Dân - Bóng bàn quốc gia',
    type: 'vietnam',
    url: 'https://nhandan.vn/chu-de/giai-bong-ban-quoc-gia-bao-nhan-dan-latest-704471.html',
    useFor: ['giải vô địch quốc gia', 'VĐV Việt Nam'],
  },
  {
    name: 'SGGP Thể thao',
    type: 'vietnam',
    url: 'https://thethao.sggp.org.vn/',
    useFor: ['bóng bàn Việt Nam', 'lịch giải', 'đội tuyển'],
  },
  {
    name: 'TableTennisDaily Forum',
    type: 'forum',
    url: 'https://www.tabletennisdaily.com/forum/',
    useFor: ['review thực tế', 'câu hỏi cộng đồng', 'thiết bị'],
  },
  {
    name: 'MyTableTennis.NET Forum',
    type: 'forum',
    url: 'https://mytabletennis.net/forum/forum.asp',
    useFor: ['kinh nghiệm thiết bị', 'setup người chơi phong trào'],
  },
  {
    name: 'OOAK Table Tennis Forum',
    type: 'forum',
    url: 'https://ooakforum.com/',
    useFor: ['gai dài', 'anti-spin', 'defender', 'lối chơi đặc thù'],
  },
  {
    name: 'Reddit r/tabletennis',
    type: 'forum',
    url: 'https://www.reddit.com/r/tabletennis/',
    useFor: ['câu hỏi người mới', 'poll', 'insight cộng đồng'],
  },
  {
    name: 'PingSkills Forum',
    type: 'forum',
    url: 'https://www.pingskills.com/table-tennis-forum/topic/equipment',
    useFor: ['hỏi đáp kỹ thuật', 'tư vấn thiết bị cơ bản'],
  },
  {
    name: 'EmRatThich Forum',
    type: 'forum',
    url: 'https://emratthich.com/',
    useFor: ['coaching', 'DHS/H3', 'thiết bị Trung Quốc'],
  },
];

const FACEBOOK_BRAND_SOURCES = {
  butterfly: 'https://www.butterfly-global.com/en/products/',
  tibhar: 'https://tibhar.info/en/',
  dhs: 'https://dhs-tt.com/',
  yinhe: 'https://yinheusa.com/shop/',
};

const FACEBOOK_KNOWLEDGE_TOPICS = [
  '3 lỗi khiến cú giật phải thiếu lực',
  'Cách trả giao bóng xoáy xuống an toàn hơn cho người mới',
  'Vì sao người mới nên ưu tiên kiểm soát trước tốc độ',
  'Footwork cơ bản để không bị chôn chân khi vào trận',
  'Giao bóng ngắn: 3 điểm cần nhớ để không bị bắt bài',
  'Cách đọc xoáy từ mặt vợt đối thủ trong 1 giây đầu',
  'Khi nào nên đánh ngắn, khi nào nên vung dài?',
  'Tại sao tập hay nhưng vào trận lại cứng tay?',
  '3 cách giảm lỗi rúc lưới khi giật trái',
  'Checklist trước khi đổi mặt vợt mới',
];

const FACEBOOK_ENGAGEMENT_TOPICS = [
  'Anh em đang khó nhất ở khâu nào: giao bóng, trả giao bóng hay footwork?',
  'Nếu chỉ được chọn 1: kiểm soát tốt hơn hay tốc độ cao hơn?',
  'Bạn đang chơi 1 càng hay 2 càng? Comment lối chơi của mình',
  'Mặt vợt bám dính kiểu Trung Quốc hay tensor châu Âu dễ chơi hơn?',
  'Người mới nên đầu tư vào cốt vợt hay mặt vợt trước?',
  'Một lỗi kỹ thuật anh em muốn sửa nhất trong tuần này là gì?',
];

function fbSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setFbSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(key, String(value ?? ''));
}

function facebookScheduleTemplate() {
  return [1, 2, 3, 4, 5, 6, 0].map(day => ({
    day,
    label: FACEBOOK_DAY_LABELS[day],
    recommendedCount: FACEBOOK_GROWTH_SCHEDULE[day].length,
    slots: FACEBOOK_GROWTH_SCHEDULE[day],
  }));
}

function getFacebookConfig() {
  const runtime = facebookRuntimeSummary();
  return {
    siteUrl: FACEBOOK_SITE_URL,
    autoSchedulerEnabled: fbSetting('facebook_auto_scheduler_enabled', '0') === '1',
    dailyPostCount: Math.max(3, Math.min(6, Number(fbSetting('facebook_daily_post_count', '5')) || 5)),
    defaultDays: Math.max(1, Math.min(30, Number(fbSetting('facebook_default_days', '7')) || 7)),
    autoApproveGenerated: fbSetting('facebook_auto_approve_generated', '0') === '1',
    pageIdConfigured: runtime.pageIdConfigured,
    pageTokenConfigured: runtime.pageTokenConfigured,
    pageId: runtime.pageId,
    pageIdSource: runtime.pageIdSource,
    pageTokenSource: runtime.pageTokenSource,
    pageTokenTail: runtime.pageTokenTail,
    graphVersion: runtime.graphVersion,
    aiProviders: runtime.aiProviders,
    aiKeys: runtime.aiKeys,
    scheduleMode: 'growth',
    scheduleTemplate: facebookScheduleTemplate(),
    contentMix: FACEBOOK_CONTENT_MIX,
  };
}

function fbFullUrl(urlPath) {
  if (!urlPath) return FACEBOOK_SITE_URL;
  if (/^https?:\/\//i.test(urlPath)) return urlPath;
  return FACEBOOK_SITE_URL + '/' + String(urlPath).replace(/^\/+/, '');
}

function fbPublicPathToFile(publicPath) {
  if (!publicPath || /^https?:\/\//i.test(publicPath)) return publicPath;
  const rel = String(publicPath).replace(/^\/+/, '').replace(/[\\/]+/g, path.sep);
  const candidates = [
    path.join(DATA_DIR, rel),
    path.join(__dirname, rel),
  ];
  return candidates.find(p => fs.existsSync(p)) || publicPath;
}

function fbNormalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function fbCanonicalLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, FACEBOOK_SITE_URL);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const pathName = (url.pathname || '/').replace(/\/+$/, '') || '/';
    const pathKey = pathName.toLowerCase();
    const productId = url.searchParams.get('id');
    if (productId) return `${pathKey}?id=${fbNormalizeText(productId)}`;
    if (url.hash && url.hash.length > 1) return `${pathKey}#${fbNormalizeText(url.hash.slice(1))}`;
    if (host.endsWith('bongbanviet.com') && !['/', '/index.html', '/kien-thuc.html'].includes(pathKey)) {
      return pathKey;
    }
  } catch {}
  return '';
}

function fbDedupeKey(post) {
  const pillar = fbNormalizeText(post?.pillar || 'general') || 'general';
  const topic = fbNormalizeText(post?.topic || '');
  const link = fbCanonicalLink(post?.website_link || '');
  if (link && !['engagement', 'news'].includes(pillar)) return `${pillar}:link:${link}`;
  if (topic) return `${pillar}:topic:${topic}`;
  const raw = [pillar, post?.website_link || '', post?.caption || ''].join('|');
  return `${pillar}:hash:${crypto.createHash('sha1').update(raw).digest('hex')}`;
}

function fbPostIsUsed(row) {
  const status = String(row?.status || '').toLowerCase();
  return ['scheduled', 'posted', 'published'].includes(status) || !!row?.facebook_post_id || !!row?.posted_at;
}

function facebookDedupeConflict(dedupeKey, postId = '') {
  if (!dedupeKey) return null;
  const history = db.prepare(`SELECT post_id, topic, source_status, posted_at
    FROM facebook_post_history WHERE dedupe_key=?`).get(dedupeKey);
  if (history && history.post_id !== postId) return history;
  const row = db.prepare(`SELECT id as post_id, topic, status as source_status, posted_at
    FROM facebook_posts
    WHERE dedupe_key=? AND id<>? AND (status IN ('scheduled','posted','published') OR facebook_post_id<>'' OR posted_at<>'')
    LIMIT 1`).get(dedupeKey, postId);
  return row || null;
}

function markFacebookPostHistory(post, options = {}) {
  const dedupeKey = options.dedupeKey || post?.dedupe_key || fbDedupeKey(post);
  if (!dedupeKey) return '';
  const postedAt = options.postedAt || post?.posted_at || new Date().toISOString();
  const sourceStatus = options.sourceStatus || post?.status || 'posted';
  const facebookPostId = options.facebookPostId || post?.facebook_post_id || '';
  db.prepare(`INSERT INTO facebook_post_history
    (dedupe_key, post_id, topic, pillar, website_link, facebook_post_id, source_status, posted_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(dedupe_key) DO UPDATE SET
      post_id=excluded.post_id,
      topic=excluded.topic,
      pillar=excluded.pillar,
      website_link=excluded.website_link,
      facebook_post_id=CASE
        WHEN excluded.facebook_post_id <> '' THEN excluded.facebook_post_id
        ELSE facebook_post_history.facebook_post_id
      END,
      source_status=excluded.source_status,
      posted_at=excluded.posted_at,
      updated_at=datetime('now')`)
    .run(
      dedupeKey,
      post?.id || '',
      post?.topic || '',
      post?.pillar || '',
      post?.website_link || '',
      facebookPostId,
      sourceStatus,
      postedAt
    );
  return dedupeKey;
}

function facebookUsedDedupeKeys() {
  const keys = new Set(
    db.prepare(`SELECT dedupe_key FROM facebook_post_history WHERE dedupe_key <> ''`).all()
      .map(r => r.dedupe_key)
  );
  for (const row of db.prepare(`SELECT id, topic, pillar, website_link, caption, dedupe_key FROM facebook_posts`).all()) {
    const key = row.dedupe_key || fbDedupeKey(row);
    if (key) keys.add(key);
  }
  return keys;
}

function syncFacebookDedupeHistory() {
  const rows = db.prepare(`SELECT id, topic, pillar, status, website_link, caption, dedupe_key,
    facebook_post_id, scheduled_time, posted_at FROM facebook_posts`).all();
  const updateKey = db.prepare(`UPDATE facebook_posts SET dedupe_key=?, updated_at=datetime('now') WHERE id=?`);
  const markUsed = db.prepare(`UPDATE facebook_posts SET dedupe_key=?, posted_at=?, updated_at=datetime('now') WHERE id=?`);
  const tx = db.transaction(() => {
    for (const row of rows) {
      const dedupeKey = row.dedupe_key || fbDedupeKey(row);
      if (!dedupeKey) continue;
      if (!row.dedupe_key) updateKey.run(dedupeKey, row.id);
      if (fbPostIsUsed(row)) {
        const postedAt = row.posted_at || row.scheduled_time || new Date().toISOString();
        if (!row.posted_at || row.dedupe_key !== dedupeKey) markUsed.run(dedupeKey, postedAt, row.id);
        markFacebookPostHistory({ ...row, dedupe_key: dedupeKey, posted_at: postedAt }, {
          dedupeKey,
          facebookPostId: row.facebook_post_id || '',
          sourceStatus: row.status || 'posted',
          postedAt,
        });
      }
    }
  });
  tx();
}

function facebookPostRow(row) {
  if (!row) return null;
  return {
    ...row,
    source_urls: parseJSON(row.source_urls, []),
    metrics: parseJSON(row.metrics, {}),
    dedupe_key: row.dedupe_key || fbDedupeKey(row),
    is_used: fbPostIsUsed(row),
  };
}

function statusCountRows() {
  return db.prepare('SELECT status, COUNT(*) as count FROM facebook_posts GROUP BY status').all();
}

function fbScheduleSlots(days, postsPerDay, startDate) {
  const slots = [];
  const count = Math.max(3, Math.min(6, Number(postsPerDay) || 5));
  const dayCount = Math.max(1, Math.min(30, Number(days) || 7));
  const start = startDate
    ? new Date(`${String(startDate).slice(0, 10)}T00:00:00+07:00`)
    : new Date();

  for (let d = 0; d < dayCount; d++) {
    const date = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
    const yyyyMmDd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    const dayOfWeek = new Date(`${yyyyMmDd}T12:00:00+07:00`).getUTCDay();
    const daySchedule = FACEBOOK_GROWTH_SCHEDULE[dayOfWeek] || FACEBOOK_GROWTH_SCHEDULE[1];
    const selectedSlots = daySchedule.slice(0, Math.min(count, daySchedule.length));
    for (const t of selectedSlots) {
      slots.push({
        scheduled_time: `${yyyyMmDd} ${t.time}`,
        pillar: t.pillar,
        bucket: t.bucket,
        label: t.label,
        intent: t.intent,
        weekday: FACEBOOK_DAY_LABELS[dayOfWeek],
      });
    }
  }
  return slots;
}

function fbCompactText(value, max = 220) {
  const text = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '').trim() + '...';
}

function fbCategoryLabel(slug) {
  return {
    'cot-vot': 'cốt vợt',
    'mat-vot': 'mặt vợt',
    'combo-vot': 'combo vợt',
    bong: 'bóng',
    ban: 'bàn',
    'do-thi-dau': 'đồ thi đấu',
  }[slug] || slug || 'sản phẩm';
}

function fbProductFacts(product) {
  if (!product) return '';
  const specs = parseJSON(product.specs, {});
  const details = [
    `Tên: ${product.name}`,
    `Nhóm: ${fbCategoryLabel(product.category_slug)}`,
    product.brand_slug ? `Thương hiệu: ${String(product.brand_slug).toUpperCase()}` : '',
    product.price ? `Giá niêm yết: ${product.price}` : '',
    product.condition ? `Tình trạng: ${product.condition}` : '',
    specs.speed ? `Tốc độ: ${specs.speed}` : '',
    specs.control ? `Kiểm soát: ${specs.control}` : '',
    specs.spin ? `Độ xoáy: ${specs.spin}` : '',
    product.description ? `Mô tả ngắn: ${fbCompactText(product.description, 260)}` : '',
  ].filter(Boolean);
  return `Dữ liệu sản phẩm BongBanViet. ${details.join('. ')}.`;
}

function fbArticleFacts(article) {
  if (!article) return '';
  return `Bài kiến thức BongBanViet: ${article.title}. ${fbCompactText(article.excerpt || article.content || '', 320)}`;
}

function fbComboFallback(index, products) {
  const blades = products.filter(p => p.category_slug === 'cot-vot');
  const rubbers = products.filter(p => p.category_slug === 'mat-vot');
  const blade = blades.length ? blades[index % blades.length] : null;
  const fh = rubbers.length ? rubbers[(index + 1) % rubbers.length] : null;
  const bh = rubbers.length ? rubbers[(index + 2) % rubbers.length] : null;
  if (!blade || !fh) return null;
  const names = [blade.name, fh.name, bh?.name].filter(Boolean).join(' + ');
  return {
    topic: `Gợi ý setup vợt ${names} cho người chơi phong trào`,
    product: blade,
    website_link: fbFullUrl(`/san-pham.html?id=${blade.slug}`),
    image_path: parseJSON(blade.images, [])[0] || '',
    fact_summary: [
      'Combo gợi ý tự động từ dữ liệu sản phẩm còn hàng của BongBanViet.',
      `Cốt: ${blade.name}.`,
      `FH: ${fh.name}.`,
      bh ? `BH: ${bh.name}.` : '',
      'Cần tư vấn lại theo trình độ, lối đánh và ngân sách trước khi chốt setup.',
    ].filter(Boolean).join(' '),
  };
}

function fbSourceBundle(pillar, product = null) {
  const urls = [];
  const add = (name, url, type = 'official') => urls.push({ name, url, type });
  if (pillar === 'knowledge') {
    add('ITTF Education', 'https://www.ittfeducation.com/');
    add('PingSkills Forum', 'https://www.pingskills.com/table-tennis-forum/topic/equipment', 'forum');
    add('BongBanViet Knowledge', fbFullUrl('/kien-thuc.html'), 'internal');
  } else if (pillar === 'product' || pillar === 'combo' || pillar === 'promo') {
    add('BongBanViet Product Data', product?.slug ? fbFullUrl(`/san-pham.html?id=${product.slug}`) : fbFullUrl('/'));
    if (product?.brand_slug && FACEBOOK_BRAND_SOURCES[product.brand_slug]) {
      add(`${product.brand_slug.toUpperCase()} Official`, FACEBOOK_BRAND_SOURCES[product.brand_slug], 'brand');
    }
    add('ITTF Equipment', 'https://equipment.ittf.com/');
  } else if (pillar === 'trust') {
    add('BongBanViet Product Data', product?.slug ? fbFullUrl(`/san-pham.html?id=${product.slug}`) : fbFullUrl('/san-pham.html'), 'internal');
    add('BongBanViet Return Policy', fbFullUrl('/chinh-sach-doi-tra.html'), 'internal');
    add('BongBanViet Contact', fbFullUrl('/lien-he.html'), 'internal');
  } else if (pillar === 'news') {
    add('World Table Tennis', 'https://www.worldtabletennis.com/');
    add('Báo Nhân Dân - Bóng bàn quốc gia', 'https://nhandan.vn/chu-de/giai-bong-ban-quoc-gia-bao-nhan-dan-latest-704471.html', 'vietnam');
    add('SGGP Thể thao', 'https://thethao.sggp.org.vn/', 'vietnam');
  } else {
    add('Reddit r/tabletennis', 'https://www.reddit.com/r/tabletennis/', 'forum');
    add('TableTennisDaily Forum', 'https://www.tabletennisdaily.com/forum/', 'forum');
    add('BongBanViet Facebook', 'https://facebook.com/bongbanviet.official', 'internal');
  }
  return urls;
}

function fbTopicForSlot(slot, index, products, combos, articles) {
  const pillar = slot.pillar;
  const product = products.length ? products[index % products.length] : null;
  const combo = combos.length ? combos[index % combos.length] : null;
  const article = articles.length ? articles[index % articles.length] : null;

  if (pillar === 'product' && product) {
    return {
      topic: `Review nhanh ${product.name}: phù hợp với ai?`,
      product,
      website_link: fbFullUrl(`/san-pham.html?id=${product.slug}`),
      image_path: parseJSON(product.images, [])[0] || '',
      fact_summary: fbProductFacts(product),
    };
  }

  if (pillar === 'combo') {
    if (combo) {
      return {
        topic: `Gợi ý combo vợt ${combo.name} cho người chơi phong trào`,
        product: combo,
        website_link: fbFullUrl(`/san-pham.html?id=${combo.slug}`),
        image_path: parseJSON(combo.images, [])[0] || '',
        fact_summary: `Combo nội bộ BongBanViet: ${combo.name}. Cốt: ${combo.blade || 'chưa ghi'}, FH: ${combo.rubber_fh || 'chưa ghi'}, BH: ${combo.rubber_bh || 'chưa ghi'}.`,
      };
    }
    const fallbackCombo = fbComboFallback(index, products);
    if (fallbackCombo) return fallbackCombo;
  }

  if (pillar === 'trust') {
    return {
      topic: product
        ? `BongBanViet tư vấn và kiểm tra sản phẩm ${product.name} như thế nào?`
        : 'Quy trình tư vấn trước khi chốt vợt tại BongBanViet',
      product,
      website_link: product?.slug ? fbFullUrl(`/san-pham.html?id=${product.slug}`) : fbFullUrl('/lien-he.html'),
      image_path: product ? (parseJSON(product.images, [])[0] || '') : '',
      fact_summary: product
        ? `${fbProductFacts(product)} Nội dung trust cần nhấn mạnh tư vấn đúng trình độ, hàng chính hãng, thông tin minh bạch, không hứa quá mức.`
        : 'Nội dung trust cần nhấn mạnh quy trình tư vấn, hàng chính hãng, thông tin minh bạch và hỗ trợ sau mua.',
    };
  }

  if (pillar === 'knowledge') {
    const topic = article?.title
      ? `Từ bài viết BongBanViet: ${article.title}`
      : FACEBOOK_KNOWLEDGE_TOPICS[index % FACEBOOK_KNOWLEDGE_TOPICS.length];
    return {
      topic,
      website_link: article?.slug ? fbFullUrl(`/kien-thuc.html#${article.slug}`) : fbFullUrl('/kien-thuc.html'),
      fact_summary: article ? fbArticleFacts(article) : 'Bài kiến thức cần bám nguyên tắc kỹ thuật, tránh khẳng định tuyệt đối nếu chỉ là kinh nghiệm thực chiến.',
    };
  }

  if (pillar === 'news') {
    return {
      topic: 'Theo dõi WTT/ITTF tuần này: xem gì để học chiến thuật?',
      website_link: fbFullUrl('/kien-thuc.html'),
      fact_summary: 'Chỉ dùng tin mới khi đã kiểm tra ngày đăng và nguồn WTT/ITTF hoặc báo chính thống.',
    };
  }

  return {
    topic: FACEBOOK_ENGAGEMENT_TOPICS[index % FACEBOOK_ENGAGEMENT_TOPICS.length],
    website_link: fbFullUrl('/'),
    fact_summary: 'Bài tương tác dùng insight cộng đồng từ forum, không coi bình luận forum là nguồn chốt sự thật.',
  };
}

function fallbackFacebookContent(post) {
  const pillar = FACEBOOK_PILLARS[post.pillar] || FACEBOOK_PILLARS.knowledge;
  const topic = post.topic || 'Bóng bàn phong trào';
  const baseTags = '#BongBanViet #BóngBànViệt #BóngBàn #TableTennis #PingPong #HàNội';
  const tagsByPillar = {
    knowledge: '#KyThuatBongBan #Topspin #GiaoBong #Footwork',
    product: '#CotVot #MatVot #VotBongBan #ChinhHang',
    combo: '#ComboVot #TuVanBongBan #VotBongBan #NguoiMoiChoi',
    news: '#WTT #ITTF #BongBanTheGioi #BongBanVietNam',
    engagement: '#HoiDapBongBan #CongDongBongBan #DamMeBongBan',
    trust: '#HangChinhHang #TuVanBongBan #BongBanViet',
    promo: '#UuDaiBongBan #ComboVot #HangChinhHang',
  };
  const caption = `${topic}\n\nĐây là chủ đề BongBanViet chọn để anh em dễ hiểu hơn về ${pillar.label.toLowerCase()}.\n\n1. Ưu tiên đúng trình độ trước khi chạy theo thông số.\n2. Kiểm tra nguồn thông tin và trải nghiệm thực tế trước khi quyết định.\n3. Nếu chọn thiết bị, hãy cân bằng giữa kiểm soát, độ xoáy và ngân sách.\n\n💡 Lời khuyên: chọn đúng thường giúp tiến bộ nhanh hơn chọn quá mạnh.\n\nAnh em đang gặp vấn đề gì ở chủ đề này? Comment để BongBanViet tư vấn tiếp.\n\nBóng Bàn Việt - Tư Vấn Chuẩn, Hàng Chính Hãng\nWebsite: bongbanviet.com\nHotline/Zalo: 096.1269.386`;
  return {
    caption,
    hashtags: `${baseTags} ${tagsByPillar[post.pillar] || ''}`.trim(),
    cta: 'Comment hoặc inbox/Zalo 096.1269.386 để được tư vấn.',
    image_prompt: `Professional square Vietnamese infographic for BongBanViet about "${topic}", table tennis themed, red black white palette, 3 concise points, logo/website footer.`,
  };
}

function buildFacebookPrompt(post) {
  const sources = (post.source_urls || []).map((s, i) => `${i + 1}. ${s.name || 'Nguồn'} (${s.type || 'source'}): ${s.url}`).join('\n');
  const pillar = FACEBOOK_PILLARS[post.pillar] || FACEBOOK_PILLARS.knowledge;
  return `Bạn là content strategist cho Bóng Bàn Việt.

Thương hiệu:
- Website: bongbanviet.com
- Định vị: Tư Vấn Chuẩn, Hàng Chính Hãng
- Hotline/Zalo: 096.1269.386
- Đối tượng: người chơi bóng bàn phong trào Việt Nam, từ mới chơi đến nâng cao.

Topic: ${post.topic}
Pillar: ${post.pillar} - ${pillar.label}
Giọng văn: ${post.brand_voice || pillar.voice}
Fact summary nội bộ: ${post.fact_summary || 'Không có'}
Link điều hướng: ${post.website_link || FACEBOOK_SITE_URL}
Slot/nhóm lịch đăng: ${post.source_notes || 'Theo lịch tăng trưởng BongBanViet'}

Nguồn tham khảo:
${sources || '- Nguồn nội bộ BongBanViet'}

Nguyên tắc:
- Không bịa số liệu, ranking, kết quả giải, thông số sản phẩm.
- Forum chỉ dùng như insight cộng đồng, không dùng làm nguồn chốt sự thật.
- Với sản phẩm, chỉ nói "phù hợp" theo hướng tư vấn, tránh claim tuyệt đối như tốt nhất thị trường.
- Bài phải tự nhiên, dễ đọc trên Facebook, 120-230 từ.
- Footer luôn có:
Bóng Bàn Việt - Tư Vấn Chuẩn, Hàng Chính Hãng
Website: bongbanviet.com
Hotline/Zalo: 096.1269.386

Trả về JSON hợp lệ:
{
  "caption": "...",
  "hashtags": "#BongBanViet ...",
  "cta": "...",
  "image_prompt": "English prompt for a 1080x1080 Facebook infographic"
}`;
}

function parseFacebookAiJson(raw, fallback) {
  try {
    const text = String(raw || '').trim();
    const jsonText = text.startsWith('{') ? text : (text.match(/\{[\s\S]*\}/) || [text])[0];
    const parsed = JSON.parse(jsonText);
    return {
      caption: String(parsed.caption || fallback.caption || '').trim(),
      hashtags: String(parsed.hashtags || fallback.hashtags || '').trim(),
      cta: String(parsed.cta || fallback.cta || '').trim(),
      image_prompt: String(parsed.image_prompt || fallback.image_prompt || '').trim(),
    };
  } catch {
    return fallback;
  }
}

async function generateFacebookContent(post, provider = 'auto') {
  const fallback = fallbackFacebookContent(post);
  const plan = facebookProviderPlan(provider);
  if (!plan.length) return { ...fallback, usedFallback: true, providerError: 'Chưa có API key AI.' };

  const prompt = buildFacebookPrompt(post);
  const errors = [];
  for (const aiProvider of plan) {
    try {
      const raw = await callFacebookTextProvider(aiProvider, prompt);
      return {
        ...parseFacebookAiJson(raw, fallback),
        usedFallback: false,
        provider: aiProvider,
        providerLabel: facebookProviderLabel(aiProvider),
      };
    } catch (e) {
      errors.push(`${facebookProviderLabel(aiProvider)}: ${e.message}`);
    }
  }
  return { ...fallback, usedFallback: true, providerError: errors.join(' | ') };
}

function extractJsonFromAiText(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(text);

  const firstObject = text.indexOf('{');
  const lastObject = text.lastIndexOf('}');
  if (firstObject !== -1 && lastObject > firstObject) candidates.push(text.slice(firstObject, lastObject + 1));

  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray !== -1 && lastArray > firstArray) candidates.push(text.slice(firstArray, lastArray + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

function normalizeFacebookPillar(value) {
  const raw = normalizeText(value || '');
  if (['knowledge', 'kien thuc', 'ky thuat', 'tip'].includes(raw)) return 'knowledge';
  if (['product', 'san pham', 'review'].includes(raw)) return 'product';
  if (['combo', 'setup'].includes(raw)) return 'combo';
  if (['news', 'tin tuc'].includes(raw)) return 'news';
  if (['engagement', 'community', 'tuong tac', 'hoi dap', 'poll'].includes(raw)) return 'engagement';
  if (['trust', 'chinh hang', 'niem tin'].includes(raw)) return 'trust';
  if (['promo', 'uu dai', 'khuyen mai'].includes(raw)) return 'promo';
  return FACEBOOK_PILLARS[value] ? value : 'knowledge';
}

function parseDirectFacebookPromptOutput(raw) {
  const parsed = extractJsonFromAiText(raw);
  if (!parsed) {
    return {
      type: 'text',
      text: String(raw || '').trim(),
      posts: [],
    };
  }

  const sourcePosts = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.posts)
      ? parsed.posts
      : Array.isArray(parsed.items)
        ? parsed.items
        : Array.isArray(parsed.data)
          ? parsed.data
          : (parsed.caption || parsed.topic || parsed.title)
            ? [parsed]
            : [];

  return {
    type: 'json',
    data: parsed,
    posts: sourcePosts
      .filter(item => item && typeof item === 'object')
      .map((item, index) => ({
        topic: String(item.topic || item.title || item.name || `Prompt trực tiếp ${index + 1}`).trim(),
        pillar: normalizeFacebookPillar(item.pillar || item.bucket || item.category || 'knowledge'),
        status: String(item.status || 'draft').trim().toLowerCase(),
        brand_voice: String(item.brand_voice || '').trim(),
        source_type: String(item.source_type || 'direct-prompt').trim(),
        source_urls: Array.isArray(item.source_urls) ? item.source_urls : [],
        source_notes: String(item.source_notes || item.notes || 'Tạo trực tiếp từ prompt trên dashboard /facebook').trim(),
        fact_summary: String(item.fact_summary || item.summary || item.description || '').trim(),
        caption: String(item.caption || item.post || item.content || '').trim(),
        hashtags: Array.isArray(item.hashtags) ? item.hashtags.join(' ') : String(item.hashtags || '').trim(),
        cta: String(item.cta || '').trim(),
        website_link: String(item.website_link || item.product_url || item.url || '').trim(),
        image_path: String(item.image_path || item.image_url || '').trim(),
        image_prompt: String(item.image_prompt || item.visual_prompt || '').trim(),
        scheduled_time: String(item.scheduled_time || item.schedule_time || item.time || '').replace('T', ' ').trim(),
      }))
      .filter(item => item.topic || item.caption),
  };
}

function insertFacebookPostFromPrompt(item, runId, options = {}) {
  const topic = item.topic || item.caption.slice(0, 90) || `Prompt trực tiếp ${runId}`;
  const pillar = normalizeFacebookPillar(item.pillar);
  const allowedStatuses = new Set(['idea', 'draft', 'approved', 'scheduled', 'posted', 'failed']);
  const requestedStatus = allowedStatuses.has(item.status) ? item.status : 'draft';
  const status = options.autoApprove ? 'approved' : requestedStatus;
  const dedupeKey = fbDedupeKey({
    topic,
    pillar,
    website_link: item.website_link || '',
    caption: item.caption || item.fact_summary || '',
  });

  if (!options.allowDuplicate && facebookUsedDedupeKeys().has(dedupeKey)) {
    return { skipped: true, reason: 'duplicate', topic, dedupe_key: dedupeKey };
  }

  const id = generateId();
  db.prepare(`INSERT INTO facebook_posts
    (id, topic, pillar, status, brand_voice, source_type, source_urls, source_notes, fact_summary,
     caption, hashtags, cta, website_link, image_path, image_prompt, image_source, dedupe_key, scheduled_time, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      topic,
      pillar,
      status,
      item.brand_voice || FACEBOOK_PILLARS[pillar]?.voice || '',
      item.source_type || 'direct-prompt',
      JSON.stringify(item.source_urls || []),
      [item.source_notes, `Prompt run: ${runId}`].filter(Boolean).join(' | '),
      item.fact_summary || '',
      item.caption || '',
      item.hashtags || '',
      item.cta || '',
      item.website_link || FACEBOOK_SITE_URL,
      item.image_path || '',
      item.image_prompt || '',
      item.image_path ? 'Direct prompt image URL/path' : '',
      dedupeKey,
      item.scheduled_time || '',
      ''
    );

  return { id, topic, status, dedupe_key: dedupeKey };
}

function facebookPromptRunRow(row) {
  if (!row) return null;
  return {
    ...row,
    parsed_output: parseJSON(row.parsed_output, {}),
    created_posts: parseJSON(row.created_posts, []),
  };
}

async function runDirectFacebookPrompt({ prompt, provider = 'auto', saveAsPosts = true, autoApprove = false, allowDuplicate = false }) {
  const plan = facebookProviderPlan(provider);
  if (!plan.length) throw new Error('Chưa có API key AI cho Facebook. Hãy lưu OpenAI/Gemini/Claude key trong phần kết nối.');

  const started = Date.now();
  const errors = [];
  for (const aiProvider of plan) {
    const runId = generateId();
    try {
      const raw = await callFacebookTextProvider(aiProvider, prompt);
      const parsed = parseDirectFacebookPromptOutput(raw);
      const createdPosts = [];

      if (saveAsPosts && parsed.posts.length) {
        for (const item of parsed.posts) {
          createdPosts.push(insertFacebookPostFromPrompt(item, runId, { autoApprove, allowDuplicate }));
        }
      }

      db.prepare(`INSERT INTO facebook_prompt_runs
        (id, provider, prompt, raw_output, parsed_output, status, error_message, created_posts, duration_ms)
        VALUES (?, ?, ?, ?, ?, 'success', '', ?, ?)`)
        .run(
          runId,
          aiProvider,
          prompt,
          raw,
          JSON.stringify(parsed),
          JSON.stringify(createdPosts),
          Date.now() - started
        );

      return facebookPromptRunRow(db.prepare('SELECT * FROM facebook_prompt_runs WHERE id=?').get(runId));
    } catch (e) {
      errors.push(`${facebookProviderLabel(aiProvider)}: ${e.message}`);
    }
  }

  const runId = generateId();
  db.prepare(`INSERT INTO facebook_prompt_runs
    (id, provider, prompt, raw_output, parsed_output, status, error_message, created_posts, duration_ms)
    VALUES (?, ?, ?, '', '{}', 'failed', ?, '[]', ?)`)
    .run(runId, provider, prompt, errors.join(' | '), Date.now() - started);
  throw new Error(errors.join(' | '));
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(value, maxChars, maxLines) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function facebookKeyPoints(post) {
  const raw = [post.fact_summary, post.caption].filter(Boolean).join('\n');
  const lines = raw
    .split(/\n+/)
    .map(s => s.replace(/^[\s\d.:\-•]+/, '').trim())
    .filter(s => s.length > 18 && !/Bóng Bàn Việt|Website:|Hotline/i.test(s));
  const picked = lines.slice(0, 3);
  while (picked.length < 3) {
    picked.push([
      'Chọn đúng theo trình độ và mục tiêu chơi',
      'Ưu tiên kiểm soát trước khi tăng tốc độ',
      'Inbox BongBanViet để được tư vấn setup phù hợp',
    ][picked.length]);
  }
  return picked;
}

async function generateFacebookInfographic(post) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    throw new Error('Chưa cài sharp để tạo infographic PNG.');
  }

  const pillar = FACEBOOK_PILLARS[post.pillar] || FACEBOOK_PILLARS.knowledge;
  const titleLines = wrapText(post.topic, 26, 3);
  const points = facebookKeyPoints(post).map(p => wrapText(p, 38, 2));
  const titleSvg = titleLines.map((line, i) =>
    `<text x="80" y="${180 + i * 62}" font-size="54" font-weight="800" fill="#111827">${escapeXml(line)}</text>`
  ).join('');
  const pointSvg = points.map((lines, i) => {
    const y = 440 + i * 128;
    const body = lines.map((line, j) =>
      `<text x="178" y="${y + 8 + j * 36}" font-size="31" font-weight="700" fill="#1F2937">${escapeXml(line)}</text>`
    ).join('');
    return `<circle cx="112" cy="${y - 2}" r="30" fill="#D62B2B"/>
      <text x="112" y="${y + 10}" text-anchor="middle" font-size="32" font-weight="800" fill="#fff">${i + 1}</text>
      ${body}`;
  }).join('');

  const svg = `<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1080" fill="#FAFAF8"/>
    <rect x="0" y="0" width="1080" height="18" fill="#D62B2B"/>
    <circle cx="950" cy="150" r="84" fill="#FEE2E2"/>
    <circle cx="958" cy="150" r="34" fill="#fff" stroke="#D62B2B" stroke-width="9"/>
    <path d="M875 238 C940 180 1010 218 1028 286" fill="none" stroke="#111827" stroke-width="18" stroke-linecap="round"/>
    <text x="80" y="88" font-size="26" font-weight="800" fill="#D62B2B" letter-spacing="4">BONG BAN VIET</text>
    <text x="80" y="124" font-size="24" font-weight="700" fill="#6B7280">${escapeXml(pillar.label.toUpperCase())}</text>
    ${titleSvg}
    <rect x="80" y="365" width="920" height="3" fill="#111827" opacity="0.12"/>
    ${pointSvg}
    <rect x="80" y="908" width="920" height="88" rx="8" fill="#111827"/>
    <text x="112" y="955" font-size="30" font-weight="800" fill="#fff">Tư Vấn Chuẩn - Hàng Chính Hãng</text>
    <text x="112" y="982" font-size="22" font-weight="600" fill="#D1D5DB">bongbanviet.com | Zalo 096.1269.386</text>
  </svg>`;

  const filename = `${post.id}-${Date.now().toString(36)}.png`;
  const outputPath = path.join(FACEBOOK_IMAGE_DIR, filename);
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return '/images/facebook/' + filename;
}

async function verifyFacebookPageToken() {
  const cfg = requireFacebookPageRuntime();
  const res = await facebookGraphRequest(() => axios.get(facebookGraphUrl(cfg, 'me'), {
    params: { access_token: cfg.pageAccessToken, fields: 'id,name' },
    timeout: 10000,
  }));
  return {
    valid: true,
    page: res.data,
    graphVersion: cfg.graphVersion,
    pageIdSource: cfg.pageIdSource,
    pageTokenSource: cfg.pageTokenSource,
  };
}

async function scheduleFacebookTextPost(message, scheduledUnixTs) {
  const cfg = requireFacebookPageRuntime();
  const res = await facebookGraphRequest(() => axios.post(facebookGraphUrl(cfg, `${cfg.pageId}/feed`), {
    message,
    published: false,
    scheduled_publish_time: scheduledUnixTs,
    access_token: cfg.pageAccessToken,
  }, { timeout: 15000 }));
  return { success: true, postId: res.data?.id || '' };
}

async function scheduleFacebookPhotoPost(message, scheduledUnixTs, imagePath) {
  const cfg = requireFacebookPageRuntime();
  const url = facebookGraphUrl(cfg, `${cfg.pageId}/photos`);
  if (/^https?:\/\//i.test(imagePath)) {
    const res = await facebookGraphRequest(() => axios.post(url, {
      url: imagePath,
      message,
      published: false,
      scheduled_publish_time: scheduledUnixTs,
      access_token: cfg.pageAccessToken,
    }, { timeout: 30000 }));
    return { success: true, postId: res.data?.post_id || res.data?.id || '' };
  }

  if (!fs.existsSync(imagePath)) {
    return { success: false, error: `File ảnh không tồn tại: ${imagePath}` };
  }
  const form = new FormData();
  form.append('source', fs.createReadStream(imagePath));
  form.append('message', message);
  form.append('published', 'false');
  form.append('scheduled_publish_time', String(scheduledUnixTs));
  form.append('access_token', cfg.pageAccessToken);
  const res = await facebookGraphRequest(() => axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: 60000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  }));
  return { success: true, postId: res.data?.post_id || res.data?.id || '' };
}

function parseFacebookScheduledTime(value) {
  if (!value) return NaN;
  const raw = String(value).trim().replace('T', ' ');
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (match) {
    return Math.floor(new Date(`${match[1]}T${match[2]}:${match[3] || '00'}+07:00`).getTime() / 1000);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? NaN : Math.floor(d.getTime() / 1000);
}

async function scheduleFacebookPost(row) {
  const post = facebookPostRow(row);
  if (!post.caption || !post.scheduled_time) {
    throw new Error('Bài cần có caption và scheduled_time trước khi schedule.');
  }
  const unixTs = parseFacebookScheduledTime(post.scheduled_time);
  if (!Number.isFinite(unixTs)) throw new Error(`scheduled_time không hợp lệ: ${post.scheduled_time}`);
  if (unixTs * 1000 < Date.now() + 11 * 60 * 1000) {
    throw new Error('scheduled_time phải cách hiện tại ít nhất 11 phút.');
  }
  const dedupeKey = post.dedupe_key || fbDedupeKey(post);
  const conflict = facebookDedupeConflict(dedupeKey, post.id);
  if (conflict) {
    throw new Error(`Bài trùng với nội dung đã đánh dấu đăng: ${conflict.topic || conflict.post_id || dedupeKey}`);
  }

  const message = [post.caption.trim(), post.hashtags?.trim()].filter(Boolean).join('\n\n');
  const imagePath = post.image_path ? fbPublicPathToFile(post.image_path) : '';
  const result = imagePath
    ? await scheduleFacebookPhotoPost(message, unixTs, imagePath)
    : await scheduleFacebookTextPost(message, unixTs);

  if (!result.success) throw new Error(result.error || 'Facebook API không trả về thành công.');
  const postedAt = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE facebook_posts SET
      status='scheduled', facebook_post_id=?, dedupe_key=?, posted_at=?, error_message='', updated_at=datetime('now')
      WHERE id=?`)
      .run(result.postId || '', dedupeKey, postedAt, post.id);
    markFacebookPostHistory({ ...post, dedupe_key: dedupeKey, posted_at: postedAt }, {
      dedupeKey,
      facebookPostId: result.postId || '',
      sourceStatus: 'scheduled',
      postedAt,
    });
  });
  tx();
  return result;
}

let facebookAutoSchedulerStarted = false;
function startFacebookAutoScheduler() {
  if (facebookAutoSchedulerStarted) return;
  facebookAutoSchedulerStarted = true;
  const tick = async () => {
    if (fbSetting('facebook_auto_scheduler_enabled', '0') !== '1') return;
    const rows = db.prepare(`SELECT * FROM facebook_posts
      WHERE status='approved' AND scheduled_time <> ''
      ORDER BY scheduled_time ASC LIMIT 20`).all();
    for (const row of rows) {
      try {
        await scheduleFacebookPost(row);
      } catch (e) {
        db.prepare(`UPDATE facebook_posts SET status='failed', error_message=?, updated_at=datetime('now') WHERE id=?`)
          .run(e.message, row.id);
      }
    }
  };
  setInterval(() => tick().catch(e => console.error('[Facebook Scheduler]', e.message)), 120000);
  setTimeout(() => tick().catch(e => console.error('[Facebook Scheduler]', e.message)), 5000);
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

// ─── Facebook Dashboard API ─────────────────────────────────────────────────

app.get('/api/facebook/sources', requireAuth, (req, res) => {
  res.json(FACEBOOK_SOURCE_LIBRARY);
});

app.get('/api/facebook/config', requireAuth, (req, res) => {
  res.json(getFacebookConfig());
});

app.put('/api/facebook/config', requireAuth, (req, res) => {
  const {
    autoSchedulerEnabled,
    dailyPostCount,
    defaultDays,
    autoApproveGenerated,
    pageId,
    pageAccessToken,
    graphVersion,
    openaiApiKey,
    geminiApiKey,
    claudeApiKey,
  } = req.body || {};
  if (autoSchedulerEnabled !== undefined) setFbSetting('facebook_auto_scheduler_enabled', autoSchedulerEnabled ? '1' : '0');
  if (dailyPostCount !== undefined) setFbSetting('facebook_daily_post_count', Math.max(3, Math.min(6, Number(dailyPostCount) || 5)));
  if (defaultDays !== undefined) setFbSetting('facebook_default_days', Math.max(1, Math.min(30, Number(defaultDays) || 7)));
  if (autoApproveGenerated !== undefined) setFbSetting('facebook_auto_approve_generated', autoApproveGenerated ? '1' : '0');
  const fileCfg = readFacebookRuntimeConfig();
  let shouldWriteConfig = false;
  const setRuntimeValue = (key, value, { secret = false } = {}) => {
    if (value === undefined) return;
    const next = String(value || '').trim();
    if (secret && !next) return;
    fileCfg[key] = next;
    shouldWriteConfig = true;
  };
  setRuntimeValue('pageId', pageId);
  setRuntimeValue('pageAccessToken', pageAccessToken, { secret: true });
  setRuntimeValue('graphVersion', graphVersion);
  setRuntimeValue('openaiApiKey', openaiApiKey, { secret: true });
  setRuntimeValue('geminiApiKey', geminiApiKey, { secret: true });
  setRuntimeValue('claudeApiKey', claudeApiKey, { secret: true });
  if (shouldWriteConfig) writeFacebookRuntimeConfig(fileCfg);
  res.json(getFacebookConfig());
});

app.get('/api/facebook/stats', requireAuth, (req, res) => {
  const counts = {};
  for (const row of statusCountRows()) counts[row.status || 'unknown'] = row.count;
  res.json({
    total: db.prepare('SELECT COUNT(*) as c FROM facebook_posts').get().c,
    today: db.prepare(`SELECT COUNT(*) as c FROM facebook_posts WHERE substr(scheduled_time, 1, 10) = date('now', '+7 hours')`).get().c,
    scheduled: counts.scheduled || 0,
    approved: counts.approved || 0,
    draft: counts.draft || 0,
    idea: counts.idea || 0,
    failed: counts.failed || 0,
    counts,
  });
});

app.get('/api/facebook/posts', requireAuth, (req, res) => {
  const { status = 'all', pillar = 'all', q = '', limit = 300 } = req.query;
  let sql = 'SELECT * FROM facebook_posts WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (pillar && pillar !== 'all') { sql += ' AND pillar = ?'; params.push(pillar); }
  if (q) {
    sql += ' AND (topic LIKE ? OR caption LIKE ? OR hashtags LIKE ?)';
    const term = `%${q}%`;
    params.push(term, term, term);
  }
  sql += ' ORDER BY scheduled_time ASC, created_at DESC LIMIT ?';
  params.push(Math.max(1, Math.min(1000, Number(limit) || 300)));
  res.json(db.prepare(sql).all(...params).map(facebookPostRow));
});

app.post('/api/facebook/posts', requireAuth, (req, res) => {
  const body = req.body || {};
  if (!body.topic) return res.status(400).json({ error: 'Thiếu topic' });
  const id = generateId();
  const dedupeKey = fbDedupeKey({
    topic: body.topic,
    pillar: body.pillar || 'knowledge',
    website_link: body.website_link || '',
    caption: body.caption || '',
  });
  if (!body.allowDuplicate && facebookUsedDedupeKeys().has(dedupeKey)) {
    return res.status(409).json({ error: 'Topic/link này đã tồn tại hoặc đã từng đăng, không nên tạo trùng.' });
  }
  db.prepare(`INSERT INTO facebook_posts
    (id, topic, pillar, status, brand_voice, source_type, source_urls, source_notes, fact_summary,
     caption, hashtags, cta, website_link, image_path, image_prompt, image_source, dedupe_key, scheduled_time, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      body.topic,
      body.pillar || 'knowledge',
      body.status || 'idea',
      body.brand_voice || '',
      body.source_type || '',
      JSON.stringify(body.source_urls || []),
      body.source_notes || '',
      body.fact_summary || '',
      body.caption || '',
      body.hashtags || '',
      body.cta || '',
      body.website_link || '',
      body.image_path || '',
      body.image_prompt || '',
      body.image_source || '',
      dedupeKey,
      String(body.scheduled_time || '').replace('T', ' '),
      body.error_message || ''
    );
  res.status(201).json(facebookPostRow(db.prepare('SELECT * FROM facebook_posts WHERE id=?').get(id)));
});

app.put('/api/facebook/posts/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM facebook_posts WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy bài' });
  const body = req.body || {};
  const nextPost = {
    ...existing,
    topic: body.topic ?? existing.topic,
    pillar: body.pillar ?? existing.pillar,
    website_link: body.website_link ?? existing.website_link,
    caption: body.caption ?? existing.caption,
  };
  const dedupeKey = fbDedupeKey(nextPost);
  db.prepare(`UPDATE facebook_posts SET
    topic=?, pillar=?, status=?, brand_voice=?, source_type=?, source_urls=?, source_notes=?, fact_summary=?,
    caption=?, hashtags=?, cta=?, website_link=?, image_path=?, image_prompt=?, image_source=?,
    dedupe_key=?, scheduled_time=?, facebook_post_id=?, posted_at=?, error_message=?, metrics=?, updated_at=datetime('now')
    WHERE id=?`)
    .run(
      body.topic ?? existing.topic,
      body.pillar ?? existing.pillar,
      body.status ?? existing.status,
      body.brand_voice ?? existing.brand_voice,
      body.source_type ?? existing.source_type,
      JSON.stringify(body.source_urls ?? parseJSON(existing.source_urls, [])),
      body.source_notes ?? existing.source_notes,
      body.fact_summary ?? existing.fact_summary,
      body.caption ?? existing.caption,
      body.hashtags ?? existing.hashtags,
      body.cta ?? existing.cta,
      body.website_link ?? existing.website_link,
      body.image_path ?? existing.image_path,
      body.image_prompt ?? existing.image_prompt,
      body.image_source ?? existing.image_source,
      dedupeKey,
      String(body.scheduled_time ?? existing.scheduled_time).replace('T', ' '),
      body.facebook_post_id ?? existing.facebook_post_id,
      body.posted_at ?? existing.posted_at,
      body.error_message ?? existing.error_message,
      JSON.stringify(body.metrics ?? parseJSON(existing.metrics, {})),
      existing.id
    );
  const updated = db.prepare('SELECT * FROM facebook_posts WHERE id=?').get(existing.id);
  if (fbPostIsUsed(updated)) {
    markFacebookPostHistory(updated, {
      dedupeKey,
      facebookPostId: updated.facebook_post_id || '',
      sourceStatus: updated.status || 'posted',
      postedAt: updated.posted_at || new Date().toISOString(),
    });
  }
  res.json(facebookPostRow(updated));
});

app.delete('/api/facebook/posts/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM facebook_posts WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Không tìm thấy bài' });
  res.json({ ok: true });
});

app.post('/api/facebook/collect', requireAuth, (req, res) => {
  const cfg = getFacebookConfig();
  const days = Math.max(1, Math.min(30, Number(req.body?.days) || cfg.defaultDays));
  const postsPerDay = Math.max(3, Math.min(6, Number(req.body?.postsPerDay) || cfg.dailyPostCount));
  const startDate = req.body?.startDate || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const replaceFutureIdeas = !!req.body?.replaceFutureIdeas;

  if (replaceFutureIdeas) {
    db.prepare(`DELETE FROM facebook_posts
      WHERE status IN ('idea','draft') AND scheduled_time >= ?`).run(`${startDate} 00:00:00`);
  }

  const products = db.prepare(`SELECT * FROM products WHERE in_stock=1 ORDER BY featured DESC, sort_order ASC, updated_at DESC LIMIT 120`).all();
  const combos = db.prepare(`SELECT * FROM combos WHERE in_stock=1 ORDER BY sort_order ASC LIMIT 40`).all();
  const articles = db.prepare(`SELECT * FROM articles ORDER BY published_at DESC LIMIT 40`).all();
  const slots = fbScheduleSlots(days, postsPerDay, startDate);
  const existingTimes = new Set(db.prepare('SELECT scheduled_time FROM facebook_posts').all().map(r => r.scheduled_time));
  const usedDedupeKeys = facebookUsedDedupeKeys();
  const insert = db.prepare(`INSERT INTO facebook_posts
    (id, topic, pillar, status, brand_voice, source_type, source_urls, source_notes, fact_summary,
     website_link, image_path, image_source, dedupe_key, scheduled_time)
    VALUES (?, ?, ?, 'idea', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let created = 0;
  let skippedTimes = 0;
  let skippedDuplicates = 0;
  let skippedNoAlternative = 0;
  const tx = db.transaction(() => {
    slots.forEach((slot, index) => {
      if (existingTimes.has(slot.scheduled_time)) {
        skippedTimes++;
        return;
      }

      let selected = null;
      for (let attempt = 0; attempt < 80; attempt++) {
        const idea = fbTopicForSlot(slot, index + attempt * slots.length, products, combos, articles);
        const sourceUrls = fbSourceBundle(slot.pillar, idea.product);
        const dedupeKey = fbDedupeKey({
          topic: idea.topic,
          pillar: slot.pillar,
          website_link: idea.website_link || fbFullUrl('/'),
          caption: idea.fact_summary || '',
        });
        if (usedDedupeKeys.has(dedupeKey)) {
          skippedDuplicates++;
          continue;
        }
        selected = { idea, sourceUrls, dedupeKey };
        break;
      }

      if (!selected) {
        skippedNoAlternative++;
        return;
      }

      const { idea, sourceUrls, dedupeKey } = selected;
      const slotNote = [
        `Slot ${slot.weekday || ''} ${String(slot.scheduled_time).slice(11, 16)}`,
        slot.label,
        `Nhóm: ${slot.bucket || slot.pillar}`,
        slot.intent,
      ].filter(Boolean).join(' | ');
      insert.run(
        generateId(),
        idea.topic,
        slot.pillar,
        FACEBOOK_PILLARS[slot.pillar]?.voice || '',
        sourceUrls[0]?.type || '',
        JSON.stringify(sourceUrls),
        slotNote,
        idea.fact_summary || '',
        idea.website_link || fbFullUrl('/'),
        idea.image_path || '',
        idea.image_path ? 'Ảnh sản phẩm BongBanViet' : '',
        dedupeKey,
        slot.scheduled_time
      );
      created++;
      existingTimes.add(slot.scheduled_time);
      usedDedupeKeys.add(dedupeKey);
    });
  });
  tx();

  res.json({ ok: true, created, days, postsPerDay, startDate, skippedTimes, skippedDuplicates, skippedNoAlternative });
});

app.post('/api/facebook/generate', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
  const provider = req.body?.provider || 'auto';
  const autoApprove = req.body?.autoApprove !== undefined
    ? !!req.body.autoApprove
    : getFacebookConfig().autoApproveGenerated;
  const count = Math.max(1, Math.min(30, Number(req.body?.count) || 12));
  const rows = ids.length
    ? db.prepare(`SELECT * FROM facebook_posts WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare(`SELECT * FROM facebook_posts WHERE status IN ('idea','new','failed') ORDER BY scheduled_time ASC LIMIT ?`).all(count);

  const results = [];
  for (const rawRow of rows) {
    const post = facebookPostRow(rawRow);
    try {
      const generated = await generateFacebookContent(post, provider);
      db.prepare(`UPDATE facebook_posts SET
        caption=?, hashtags=?, cta=?, image_prompt=?, status=?, error_message=?, updated_at=datetime('now')
        WHERE id=?`)
        .run(
          generated.caption,
          generated.hashtags,
          generated.cta,
          generated.image_prompt,
          autoApprove ? 'approved' : 'draft',
          generated.usedFallback && generated.providerError ? generated.providerError : '',
          post.id
        );
      results.push({ id: post.id, ok: true, usedFallback: !!generated.usedFallback, provider: generated.provider || '' });
    } catch (e) {
      db.prepare(`UPDATE facebook_posts SET status='failed', error_message=?, updated_at=datetime('now') WHERE id=?`).run(e.message, post.id);
      results.push({ id: post.id, ok: false, error: e.message });
    }
  }
  res.json({ ok: true, processed: results.length, results });
});

app.get('/api/facebook/prompt-runs', requireAuth, (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query?.limit) || 10));
  const rows = db.prepare(`SELECT * FROM facebook_prompt_runs ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit);
  res.json(rows.map(facebookPromptRunRow));
});

app.post('/api/facebook/prompt/run', requireAuth, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (prompt.length < 10) return res.status(400).json({ error: 'Prompt quá ngắn. Hãy nhập ít nhất 10 ký tự.' });
  if (prompt.length > 60000) return res.status(400).json({ error: 'Prompt quá dài. Giới hạn 60.000 ký tự.' });

  try {
    const run = await runDirectFacebookPrompt({
      prompt,
      provider: req.body?.provider || 'auto',
      saveAsPosts: req.body?.saveAsPosts !== false,
      autoApprove: !!req.body?.autoApprove,
      allowDuplicate: !!req.body?.allowDuplicate,
    });
    res.json({ ok: true, run });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/facebook/images', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
  const force = !!req.body?.force;
  const count = Math.max(1, Math.min(30, Number(req.body?.count) || 12));
  const rows = ids.length
    ? db.prepare(`SELECT * FROM facebook_posts WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare(`SELECT * FROM facebook_posts WHERE status IN ('draft','approved') ORDER BY scheduled_time ASC LIMIT ?`).all(count);
  const results = [];
  for (const rawRow of rows) {
    const post = facebookPostRow(rawRow);
    if (post.image_path && !force) {
      results.push({ id: post.id, ok: true, skipped: true, image_path: post.image_path });
      continue;
    }
    try {
      const imagePath = await generateFacebookInfographic(post);
      db.prepare(`UPDATE facebook_posts SET image_path=?, image_source='Generated BongBanViet infographic', updated_at=datetime('now') WHERE id=?`)
        .run(imagePath, post.id);
      results.push({ id: post.id, ok: true, image_path: imagePath });
    } catch (e) {
      db.prepare(`UPDATE facebook_posts SET error_message=?, updated_at=datetime('now') WHERE id=?`).run(e.message, post.id);
      results.push({ id: post.id, ok: false, error: e.message });
    }
  }
  res.json({ ok: true, processed: results.length, results });
});

app.post('/api/facebook/approve', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Chưa chọn bài' });
  const info = db.prepare(`UPDATE facebook_posts SET status='approved', error_message='', updated_at=datetime('now')
    WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  res.json({ ok: true, changed: info.changes });
});

app.post('/api/facebook/schedule', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
  const rows = ids.length
    ? db.prepare(`SELECT * FROM facebook_posts WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare(`SELECT * FROM facebook_posts WHERE status='approved' ORDER BY scheduled_time ASC LIMIT 30`).all();
  const results = [];
  for (const row of rows) {
    try {
      if (row.status !== 'approved' && !req.body?.force) throw new Error('Chỉ schedule bài đã approved.');
      const result = await scheduleFacebookPost(row);
      results.push({ id: row.id, ok: true, facebook_post_id: result.postId || '' });
    } catch (e) {
      db.prepare(`UPDATE facebook_posts SET status='failed', error_message=?, updated_at=datetime('now') WHERE id=?`).run(e.message, row.id);
      results.push({ id: row.id, ok: false, error: e.message });
    }
  }
  res.json({ ok: true, processed: results.length, results });
});

app.post('/api/facebook/posts/:id/mark-posted', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM facebook_posts WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy bài' });
  const dedupeKey = existing.dedupe_key || fbDedupeKey(existing);
  const conflict = facebookDedupeConflict(dedupeKey, existing.id);
  if (conflict && !req.body?.force) {
    return res.status(409).json({ error: `Bài trùng với nội dung đã đánh dấu đăng: ${conflict.topic || conflict.post_id || dedupeKey}` });
  }
  const postedAt = String(req.body?.posted_at || '').replace('T', ' ') || new Date().toISOString();
  const facebookPostId = req.body?.facebook_post_id ?? existing.facebook_post_id ?? '';
  const tx = db.transaction(() => {
    db.prepare(`UPDATE facebook_posts SET
      status='posted', dedupe_key=?, facebook_post_id=?, posted_at=?, error_message='', updated_at=datetime('now')
      WHERE id=?`)
      .run(dedupeKey, facebookPostId, postedAt, existing.id);
    markFacebookPostHistory({ ...existing, status: 'posted', dedupe_key: dedupeKey, facebook_post_id: facebookPostId, posted_at: postedAt }, {
      dedupeKey,
      facebookPostId,
      sourceStatus: 'posted',
      postedAt,
    });
  });
  tx();
  res.json(facebookPostRow(db.prepare('SELECT * FROM facebook_posts WHERE id=?').get(existing.id)));
});

app.post('/api/facebook/verify-token', requireAuth, async (req, res) => {
  try {
    res.json(await verifyFacebookPageToken());
  } catch (e) {
    res.status(400).json({ valid: false, error: e.message });
  }
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

// ─── Prompts Library ─────────────────────────────────────────────────────────

app.get('/api/prompts', (req, res) => {
  const { q, tag } = req.query;
  let rows = db.prepare('SELECT * FROM prompts ORDER BY use_count DESC, updated_at DESC').all();
  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(r => r.title.toLowerCase().includes(ql) || r.content.toLowerCase().includes(ql));
  }
  if (tag && tag !== 'all') {
    rows = rows.filter(r => {
      try { return JSON.parse(r.tags || '[]').includes(tag); } catch { return false; }
    });
  }
  res.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })));
});

app.post('/api/prompts', (req, res) => {
  const { title, content, tags = [] } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'Thiếu title hoặc content' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  db.prepare('INSERT INTO prompts (id,title,content,tags) VALUES (?,?,?,?)').run(
    id, title.trim(), content.trim(), JSON.stringify(Array.isArray(tags) ? tags : [])
  );
  res.json({ ok: true, id });
});

app.put('/api/prompts/:id', (req, res) => {
  const { title, content, tags } = req.body || {};
  const set = [];
  const vals = [];
  if (title !== undefined) { set.push('title=?'); vals.push(title.trim()); }
  if (content !== undefined) { set.push('content=?'); vals.push(content.trim()); }
  if (tags !== undefined) { set.push('tags=?'); vals.push(JSON.stringify(Array.isArray(tags) ? tags : [])); }
  if (!set.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });
  set.push("updated_at=datetime('now')");
  vals.push(req.params.id);
  db.prepare(`UPDATE prompts SET ${set.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

app.delete('/api/prompts/:id', (req, res) => {
  db.prepare('DELETE FROM prompts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/prompts/:id/use', (req, res) => {
  db.prepare('UPDATE prompts SET use_count=use_count+1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Facebook Posts ───────────────────────────────────────────────────────────

app.get('/api/fb-posts', (req, res) => {
  const { status, pillar, q } = req.query;
  let rows = db.prepare('SELECT * FROM fb_posts ORDER BY created_at DESC').all();
  if (status && status !== 'all') rows = rows.filter(r => r.status === status);
  if (pillar && pillar !== 'all') rows = rows.filter(r => r.pillar === pillar);
  if (q) { const ql = q.toLowerCase(); rows = rows.filter(r => (r.topic+r.caption+r.hashtags).toLowerCase().includes(ql)); }
  res.json(rows.map(r => ({ ...r, source_urls: JSON.parse(r.source_urls || '[]') })));
});

function cleanFbSourceId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function getFbSourceId(post) {
  const explicit = cleanFbSourceId(post.source_id);
  if (explicit) return explicit;
  const slot = String(post.scheduled_time || '').trim();
  if (!slot) return '';
  const key = slot.replace(/[^0-9]/g, '').slice(0, 12);
  return key ? `bbv-facebook-${key}` : '';
}

function normalizeFbImportPost(post) {
  const p = post && typeof post === 'object' ? post : {};
  const sourceUrls = Array.isArray(p.source_urls)
    ? p.source_urls.filter(Boolean)
    : (typeof p.source_urls === 'string' && p.source_urls.trim() ? [p.source_urls.trim()] : []);
  return {
    source_id: getFbSourceId(p),
    topic: String(p.topic || '').trim(),
    pillar: String(p.pillar || 'knowledge').trim() || 'knowledge',
    status: String(p.status || 'scheduled').trim() || 'scheduled',
    brand_voice: String(p.brand_voice || '').trim(),
    source_type: String(p.source_type || 'direct-prompt').trim() || 'direct-prompt',
    source_urls: JSON.stringify(sourceUrls),
    source_notes: String(p.source_notes || '').trim(),
    fact_summary: String(p.fact_summary || '').trim(),
    caption: String(p.caption || '').trim(),
    hashtags: String(p.hashtags || '').trim(),
    cta: String(p.cta || '').trim(),
    website_link: String(p.website_link || 'https://bongbanviet.com').trim() || 'https://bongbanviet.com',
    image_prompt: String(p.image_prompt || '').trim(),
    scheduled_time: String(p.scheduled_time || '').trim(),
  };
}

function importFacebookPosts(posts) {
  if (!posts.length) throw new Error('No posts');
  const findBySource = db.prepare('SELECT id FROM fb_posts WHERE source_id=? LIMIT 1');
  const insert = db.prepare(`INSERT INTO fb_posts (id,source_id,topic,pillar,status,brand_voice,source_type,source_urls,source_notes,fact_summary,caption,hashtags,cta,website_link,image_prompt,scheduled_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const update = db.prepare(`UPDATE fb_posts SET topic=?,pillar=?,status=?,brand_voice=?,source_type=?,source_urls=?,source_notes=?,fact_summary=?,caption=?,hashtags=?,cta=?,website_link=?,image_prompt=?,scheduled_time=?,updated_at=datetime('now') WHERE source_id=?`);
  const run = db.transaction(() => {
    const ids = [];
    let created = 0;
    let updated = 0;
    for (const raw of posts) {
      const p = normalizeFbImportPost(raw);
      const existing = p.source_id ? findBySource.get(p.source_id) : null;
      if (existing) {
        update.run(p.topic, p.pillar, p.status, p.brand_voice, p.source_type, p.source_urls, p.source_notes, p.fact_summary, p.caption, p.hashtags, p.cta, p.website_link, p.image_prompt, p.scheduled_time, p.source_id);
        ids.push(existing.id);
        updated += 1;
      } else {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
        insert.run(id, p.source_id, p.topic, p.pillar, p.status, p.brand_voice, p.source_type, p.source_urls, p.source_notes, p.fact_summary, p.caption, p.hashtags, p.cta, p.website_link, p.image_prompt, p.scheduled_time);
        ids.push(id);
        created += 1;
      }
    }
    return { ids, created, updated };
  });
  const result = run();
  return { ok: true, count: result.ids.length, created: result.created, updated: result.updated, ids: result.ids };
}

app.post('/api/fb-posts/import', (req, res) => {
  try {
    const body = req.body || {};
    const posts = Array.isArray(body) ? body : (Array.isArray(body.posts) ? body.posts : []);
    if (!posts.length) return res.status(400).json({ error: 'No posts' });
    res.json(importFacebookPosts(posts));
  } catch (e) {
    res.status(400).json({ error: e.message || 'Import failed' });
  }
});

const facebookJsonImportState = {
  enabled: false,
  file: FACEBOOK_LOCAL_IMPORT_FILE,
  revision: 0,
  last_hash: '',
  last_imported_at: '',
  last_error: '',
  last_result: null,
};

function parseFacebookJsonImport(raw) {
  const parsed = JSON.parse(raw);
  const posts = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.posts) ? parsed.posts : null);
  if (!posts || !posts.length) throw new Error('JSON must be an array or an object with posts: []');
  return posts;
}

function hashFacebookImportFile(file) {
  if (!fs.existsSync(file)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function shouldStartFacebookJsonAutoImporter() {
  if (process.env.FACEBOOK_AUTO_IMPORT === '0') return false;
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
    return process.env.FACEBOOK_AUTO_IMPORT === '1';
  }
  return true;
}

function startFacebookJsonAutoImporter() {
  if (!shouldStartFacebookJsonAutoImporter()) return;
  facebookJsonImportState.enabled = true;
  let lastHash = '';
  let timer = null;
  let running = false;

  const sync = (reason) => {
    if (running) {
      clearTimeout(timer);
      timer = setTimeout(() => sync('queued'), 800);
      return;
    }
    running = true;
    try {
      const file = facebookJsonImportState.file;
      const currentHash = hashFacebookImportFile(file);
      if (!currentHash || currentHash === lastHash) return;
      lastHash = currentHash;
      facebookJsonImportState.last_hash = currentHash;
      const raw = fs.readFileSync(file, 'utf8').trim();
      const posts = parseFacebookJsonImport(raw);
      const result = importFacebookPosts(posts);
      facebookJsonImportState.revision += 1;
      facebookJsonImportState.last_imported_at = new Date().toISOString();
      facebookJsonImportState.last_error = '';
      facebookJsonImportState.last_result = { ...result, reason };
      console.log(`[Facebook JSON Auto Import] ${result.count} posts (${result.created} created, ${result.updated} updated) from ${file}`);
    } catch (e) {
      facebookJsonImportState.last_error = e.message || String(e);
      console.error('[Facebook JSON Auto Import]', facebookJsonImportState.last_error);
    } finally {
      running = false;
    }
  };

  const scheduleSync = (reason) => {
    clearTimeout(timer);
    timer = setTimeout(() => sync(reason), 700);
  };

  console.log(`[Facebook JSON Auto Import] Watching ${facebookJsonImportState.file}`);
  fs.watchFile(facebookJsonImportState.file, { interval: Number(process.env.FACEBOOK_IMPORT_POLL_MS || 1200) }, () => scheduleSync('file changed'));
  scheduleSync('startup');
}

app.get('/api/fb-posts/import-state', (req, res) => {
  res.json(facebookJsonImportState);
});

app.post('/api/fb-posts', (req, res) => {
  const p = req.body || {};
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  db.prepare(`INSERT INTO fb_posts (id,source_id,topic,pillar,status,brand_voice,source_type,source_urls,source_notes,fact_summary,caption,hashtags,cta,website_link,image_prompt,scheduled_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, cleanFbSourceId(p.source_id), p.topic||'', p.pillar||'knowledge', p.status||'draft', p.brand_voice||'', p.source_type||'direct-prompt', JSON.stringify(p.source_urls||[]), p.source_notes||'', p.fact_summary||'', p.caption||'', p.hashtags||'', p.cta||'', p.website_link||'https://bongbanviet.com', p.image_prompt||'', p.scheduled_time||'');
  res.json({ ok: true, id });
});

app.put('/api/fb-posts/:id', (req, res) => {
  const p = req.body;
  db.prepare(`UPDATE fb_posts SET topic=?,pillar=?,status=?,brand_voice=?,source_notes=?,fact_summary=?,caption=?,hashtags=?,cta=?,website_link=?,image_prompt=?,scheduled_time=?,updated_at=datetime('now') WHERE id=?`).run(p.topic||'', p.pillar||'knowledge', p.status||'draft', p.brand_voice||'', p.source_notes||'', p.fact_summary||'', p.caption||'', p.hashtags||'', p.cta||'', p.website_link||'https://bongbanviet.com', p.image_prompt||'', p.scheduled_time||'', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/fb-posts/:id', (req, res) => {
  db.prepare('DELETE FROM fb_posts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/generate-fb-posts', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(400).json({ error: 'ANTHROPIC_API_KEY chưa được cấu hình trong Railway env' });

  function nextMonday() {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  const weekStart = req.body.week_start || nextMonday();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const [mon, tue, wed, thu, fri, sat, sun] = dates;

  const SCHEDULE = [
    { date: mon, time: '07:30', pillar: 'knowledge', theme: 'Tip kỹ thuật đầu tuần' },
    { date: mon, time: '10:30', pillar: 'knowledge', theme: 'Kiến thức kéo web, dẫn về bongbanviet.com' },
    { date: mon, time: '12:15', pillar: 'product',   theme: 'Product discovery – giới thiệu sản phẩm phù hợp trình độ' },
    { date: mon, time: '15:30', pillar: 'engagement', theme: 'Poll/câu hỏi cộng đồng đầu tuần' },
    { date: mon, time: '21:15', pillar: 'engagement', theme: 'Hỏi đáp setup tối' },
    { date: tue, time: '07:30', pillar: 'knowledge', theme: 'Drill/footwork – bài tập cụ thể' },
    { date: tue, time: '10:30', pillar: 'combo',     theme: 'Combo vợt theo trình độ (mới/trung/nâng)' },
    { date: tue, time: '12:15', pillar: 'product',   theme: 'Review mặt vợt hoặc cốt vợt nổi bật' },
    { date: tue, time: '15:30', pillar: 'engagement', theme: 'So sánh A/B – anh em chọn gì?' },
    { date: tue, time: '18:30', pillar: 'combo',     theme: 'Setup bóng bàn sau giờ làm, ngân sách hợp lý' },
    { date: tue, time: '21:15', pillar: 'engagement', theme: 'Hỏi đáp tối – giải đáp thắc mắc cộng đồng' },
    { date: wed, time: '07:30', pillar: 'knowledge', theme: 'Lỗi kỹ thuật thường gặp và cách sửa' },
    { date: wed, time: '10:30', pillar: 'knowledge', theme: 'Kiến thức từ nguồn uy tín, link bongbanviet.com' },
    { date: wed, time: '12:15', pillar: 'product',   theme: 'Sản phẩm nổi bật tuần này tại BongBanViet' },
    { date: wed, time: '15:30', pillar: 'engagement', theme: 'Mini quiz bóng bàn vui' },
    { date: wed, time: '18:30', pillar: 'combo',     theme: 'Case tư vấn setup thực tế cho khách' },
    { date: wed, time: '21:15', pillar: 'product',   theme: 'So sánh review 2 sản phẩm cùng phân khúc' },
    { date: thu, time: '07:30', pillar: 'knowledge', theme: 'Kỹ thuật giao bóng/trả giao' },
    { date: thu, time: '10:30', pillar: 'product',   theme: 'Product discovery – phù hợp lối chơi nào?' },
    { date: thu, time: '12:15', pillar: 'combo',     theme: 'Combo bán mềm – gợi ý setup hoàn chỉnh' },
    { date: thu, time: '15:30', pillar: 'engagement', theme: 'Câu hỏi mở cho cộng đồng' },
    { date: thu, time: '18:30', pillar: 'promo',     theme: 'Ưu đãi nhẹ cuối tuần – combo/sản phẩm' },
    { date: thu, time: '21:15', pillar: 'knowledge', theme: 'Recap kiến thức nổi bật trong tuần' },
    { date: fri, time: '07:30', pillar: 'knowledge', theme: 'Checklist chuẩn bị đi đánh cuối tuần' },
    { date: fri, time: '10:30', pillar: 'trust',     theme: 'Hàng chính hãng & quy trình tư vấn tại BongBanViet' },
    { date: fri, time: '12:15', pillar: 'promo',     theme: 'Ưu đãi cuối tuần – CTA inbox/Zalo' },
    { date: fri, time: '15:30', pillar: 'engagement', theme: 'Poll cuối tuần – kế hoạch đi đánh?' },
    { date: fri, time: '21:15', pillar: 'combo',     theme: 'Gợi ý setup đi đánh cuối tuần' },
    { date: sat, time: '08:30', pillar: 'knowledge', theme: 'Tip thực chiến cho buổi đánh cuối tuần' },
    { date: sat, time: '11:00', pillar: 'trust',     theme: 'Ảnh kho/sản phẩm thực tế tại cửa hàng' },
    { date: sat, time: '16:00', pillar: 'engagement', theme: 'Poll trận đấu – ai thắng ai?' },
    { date: sat, time: '20:30', pillar: 'engagement', theme: 'Recap cộng đồng sau ngày đánh' },
    { date: sun, time: '08:30', pillar: 'knowledge', theme: 'FAQ người mới bắt đầu chơi bóng bàn' },
    { date: sun, time: '11:00', pillar: 'knowledge', theme: 'Bài tổng hợp kiến thức – link bongbanviet.com' },
    { date: sun, time: '16:00', pillar: 'engagement', theme: 'Bình chọn chủ đề muốn học tuần tới' },
    { date: sun, time: '20:30', pillar: 'engagement', theme: 'Preview lịch tuần tới – hâm nóng cộng đồng' },
  ];

  const HASHTAGS = {
    knowledge:  '#BongBanViet #KyThuatBongBan #HocBongBan #MeoChuyenSau #TableTennis',
    product:    '#BongBanViet #DungCuBongBan #HangChinhHang #CotVot #MatVot #BongBanHaNoi',
    combo:      '#BongBanViet #ComboVot #TuVanBongBan #SetupBongBan #GoiYSetup',
    engagement: '#BongBanViet #BongBanCongDong #HoiDapBongBan #BinhChon',
    trust:      '#BongBanViet #HangChinhHang #UyTin #BongBanVietCom',
    promo:      '#BongBanViet #UuDai #KhuyenMai #ComboGiaRe #LienHeZalo',
  };

  const scheduleBlock = SCHEDULE.map((s, i) =>
    `${i + 1}. ${s.date}T${s.time}:00 | pillar=${s.pillar} | theme="${s.theme}"`
  ).join('\n');

  const prompt = `Bạn là Facebook Content Writer cho BÓNG BÀN VIỆT — bongbanviet.com, Hà Nội.
Định vị: Tư Vấn Chuẩn – Hàng Chính Hãng | Zalo: 096.1269.386

NHIỆM VỤ: Viết đúng 36 bài theo lịch sau, theo thứ tự từ 1 đến 36.

LỊCH ĐĂNG TUẦN ${mon} – ${sun}:
${scheduleBlock}

QUY TẮC:
- topic: 5–10 từ tiếng Việt, chuẩn SEO Facebook, KHÔNG dùng emoji
- caption: 100–180 từ tiếng Việt, tự nhiên, có emoji phù hợp, kết thúc bằng câu hỏi hoặc CTA nhẹ
- hashtags: dùng đúng theo pillar:
  knowledge → ${HASHTAGS.knowledge}
  product → ${HASHTAGS.product}
  combo → ${HASHTAGS.combo}
  engagement → ${HASHTAGS.engagement}
  trust → ${HASHTAGS.trust}
  promo → ${HASHTAGS.promo}
- image_prompt: tiếng Anh, mô tả ảnh 1080x1080 cho Facebook
- scheduled_time: lấy đúng từ lịch trên (format YYYY-MM-DDTHH:MM:00)
- status: "scheduled" cho tất cả

CHỈ TRẢ VỀ JSON, không viết thêm gì:
{"posts":[{"topic":"...","pillar":"...","status":"scheduled","caption":"...","hashtags":"...","cta":"Inbox hoặc Zalo 096.1269.386 để được tư vấn.","website_link":"https://bongbanviet.com","image_prompt":"...","scheduled_time":"...","source_notes":"..."}]}`;

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-opus-4-7',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 120000
    });

    const text = response.data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI không trả về JSON hợp lệ');

    const parsed = JSON.parse(jsonMatch[0]);
    const genPosts = Array.isArray(parsed) ? parsed : (parsed.posts || []);
    if (!genPosts.length) throw new Error('Không tạo được bài nào');

    const insert = db.prepare(`INSERT INTO fb_posts (id,topic,pillar,status,brand_voice,source_type,source_urls,source_notes,fact_summary,caption,hashtags,cta,website_link,image_prompt,scheduled_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const run = db.transaction(() => genPosts.map(p => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      insert.run(id, p.topic || '', p.pillar || 'knowledge', p.status || 'scheduled', '', 'ai-generated', '[]', p.source_notes || '', p.fact_summary || '', p.caption || '', p.hashtags || '', p.cta || '', p.website_link || 'https://bongbanviet.com', p.image_prompt || '', p.scheduled_time || '');
      return id;
    }));
    const ids = run();
    res.json({ ok: true, count: ids.length, ids });
  } catch (e) {
    console.error('generate-fb-posts error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message || 'Lỗi tạo bài' });
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
    console.log(`   Website:      http://localhost:${PORT}/index.html\n`);
    startTracker();
    syncFacebookDedupeHistory();
    startFacebookAutoScheduler();
    startFacebookJsonAutoImporter();
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
