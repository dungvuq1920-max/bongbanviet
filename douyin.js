'use strict';
const crypto = require('crypto');

// ── Constants ─────────────────────────────────────────────────────────────────
const CHAR_SET = 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=';
const UA_KEY = Buffer.from([0x00, 0x01, 0x0c]);
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const BASE_URL = 'https://www.douyin.com';

const WATERMARK_HINTS = ['tplv-dy-water', 'dy-water', 'owner_watermark', 'watermark_image', 'watermark=1', 'playwm'];
const ALLOWED_IMAGE_DOMAINS = ['douyinpic.com', 'douyinstatic.com', 'douyin.com', 'pstatp.com', 'byteimg.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'bytedance.com', 'tiktokv.com'];

const DEFAULT_QUERY = {
  device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web',
  update_version_code: '170400', pc_client_type: '1', pc_libra_divert: 'Windows',
  version_code: '290100', version_name: '29.1.0', cookie_enabled: 'true',
  screen_width: '1536', screen_height: '864', browser_language: 'zh-CN',
  browser_platform: 'Win32', browser_name: 'Chrome', browser_version: '139.0.0.0',
  browser_online: 'true', engine_name: 'Blink', engine_version: '139.0.0.0',
  os_name: 'Windows', os_version: '10', cpu_core_num: '16', device_memory: '8',
  platform: 'PC', downlink: '10', effective_type: '4g', round_trip_time: '200',
  support_h265: '1', support_dash: '1', uifid: '',
};

// ── XBogus ────────────────────────────────────────────────────────────────────
// Port of douyin-downloader/utils/xbogus.py — original algorithm from Evil0ctal

function hexToByteArray(hex) {
  const r = [];
  for (let i = 0; i < hex.length; i += 2) r.push(parseInt(hex.slice(i, i + 2), 16));
  return r;
}

function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  let i = 0; j = 0;
  const out = [];
  for (const b of data) {
    i = (i + 1) % 256; j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    out.push(b ^ s[(s[i] + s[j]) % 256]);
  }
  return Buffer.from(out);
}

function md5Hex(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

// md5(md5(empty_string_hash_bytes)) — constant, precompute once
const EMPTY_MD5 = hexToByteArray(md5Hex(Buffer.from('d41d8cd98f00b204e9800998ecf8427e', 'hex')));

// Double-md5 of a URL string (treating chars as latin1 bytes)
function md5Encrypt(url) {
  const hex1 = md5Hex(Buffer.from(url, 'latin1'));
  const hex2 = md5Hex(Buffer.from(hex1, 'hex'));
  return hexToByteArray(hex2);
}

// md5 of rc4(ua_key, ua_bytes) base64'd
function uaMd5(ua) {
  const enc = rc4(UA_KEY, Buffer.from(ua, 'latin1'));
  const b64 = enc.toString('base64');
  return hexToByteArray(md5Hex(Buffer.from(b64, 'latin1')));
}

function calc3(a, b, c) {
  const x = ((a & 255) << 16) | ((b & 255) << 8) | (c & 255);
  return CHAR_SET[(x & 16515072) >> 18] + CHAR_SET[(x & 258048) >> 12]
       + CHAR_SET[(x & 4032) >> 6]      + CHAR_SET[x & 63];
}

function buildXBogus(url, ua = DEFAULT_UA) {
  const urlMd5 = md5Encrypt(url);
  const uaArr  = uaMd5(ua);
  const timer  = Math.floor(Date.now() / 1000);
  const ct     = 536919696;

  // 18-element array (index 1 is 0.00390625 → int 0 in original JS)
  const arr = [
    64, 0, 1, 12,
    urlMd5[14], urlMd5[15],
    EMPTY_MD5[14], EMPTY_MD5[15],
    uaArr[14], uaArr[15],
    (timer >> 24) & 255, (timer >> 16) & 255, (timer >> 8) & 255, timer & 255,
    (ct >> 24) & 255, (ct >> 16) & 255, (ct >> 8) & 255, ct & 255,
  ];

  let xor = arr[0];
  for (let k = 1; k < arr.length; k++) xor ^= arr[k];
  arr.push(xor); // now 19 bytes

  // RC4(0xFF, arr_bytes) then prepend [0x02, 0xFF]
  const encrypted = rc4(Buffer.from([0xff]), Buffer.from(arr));
  const final = Buffer.concat([Buffer.from([2, 255]), encrypted]); // 21 bytes

  let xb = '';
  for (let k = 0; k < final.length; k += 3) xb += calc3(final[k], final[k + 1], final[k + 2]);
  // xb = 28-char XBogus token

  return `${url}&X-Bogus=${xb}`;
}

// ── Cookie & token helpers ────────────────────────────────────────────────────
function loadCookies() {
  const raw = (process.env.DOUYIN_COOKIES || '').trim();
  if (raw) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  // Fallback: read cookies saved via QR login (stored in SQLite settings table)
  try {
    const dbMod = require('./db');
    const row = dbMod.prepare("SELECT value FROM settings WHERE key = 'douyin_cookies'").get();
    if (row && row.value) return JSON.parse(row.value);
  } catch { /* db not available or not initialized */ }
  return {};
}

function genMsToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 182 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') + '==';
}

function cookieStr(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── Core fetch ────────────────────────────────────────────────────────────────
async function douyinFetch(path, extraParams = {}, retries = 3) {
  const cookies = loadCookies();
  const msToken = (cookies.msToken || '').trim() || genMsToken();
  const verifyFp = cookies['s_v_web_id'] || cookies['ttwid'] || '';

  const params = { ...DEFAULT_QUERY, ...extraParams, msToken };
  if (verifyFp) { params.verifyFp = verifyFp; params.s_v_web_id = verifyFp; }
  const qs = new URLSearchParams(params).toString();
  const signed = buildXBogus(`${BASE_URL}${path}?${qs}`, DEFAULT_UA);

  const headers = {
    'User-Agent': DEFAULT_UA,
    'Referer': `${BASE_URL}/?recommend=1`,
    'Origin': BASE_URL,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Ch-Ua': '"Google Chrome";v="139", "Chromium";v="139", "Not/A)Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Cookie': cookieStr({ ...cookies, msToken }),
  };

  const delays = [1000, 2000, 5000];
  let lastErr;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(signed, { headers, signal: AbortSignal.timeout(30000) });
      if (resp.ok) {
        const text = await resp.text();
        if (!text) {
          // Empty 200 = anti-bot signal, retry
          lastErr = new Error('Empty response (anti-bot)');
          if (attempt < retries - 1) await new Promise(r => setTimeout(r, delays[attempt]));
          continue;
        }
        try { const d = JSON.parse(text); return typeof d === 'object' ? d : {}; }
        catch { return {}; }
      }
      if (resp.status < 500 && resp.status !== 429) return {};
      lastErr = new Error(`HTTP ${resp.status}`);
    } catch (e) { lastErr = e; }
    if (attempt < retries - 1) await new Promise(r => setTimeout(r, delays[attempt]));
  }
  throw lastErr || new Error('Request failed');
}

// ── URL helpers ───────────────────────────────────────────────────────────────
function isShortUrl(url) {
  return /v\.douyin\.com|vm\.tiktok\.com|vt\.tiktok\.com/.test(url);
}

async function resolveShortUrl(url) {
  try {
    const resp = await fetch(url.trim(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': DEFAULT_UA },
    });
    if (resp.status >= 400) return null;
    return resp.url;
  } catch { return null; }
}

function parseUrl(url) {
  const videoM = url.match(/\/video\/(\d+)/);
  if (videoM) return { type: 'video', aweme_id: videoM[1] };

  const noteM = url.match(/\/(?:note|gallery|slides)\/(\d+)/);
  if (noteM) return { type: 'gallery', aweme_id: noteM[1] };

  const userM = url.match(/\/user\/([A-Za-z0-9_\-]+)/);
  if (userM) return { type: 'user', sec_uid: userM[1] };

  const modalM = url.match(/modal_id=(\d+)/);
  if (modalM) return { type: 'video', aweme_id: modalM[1] };

  return null;
}

async function resolveUrl(rawUrl) {
  let url = rawUrl.trim();
  if (isShortUrl(url)) {
    const resolved = await resolveShortUrl(url);
    if (!resolved) throw new Error('Failed to resolve short URL');
    url = resolved;
  }
  return { url, parsed: parseUrl(url) };
}

// ── Aweme data helpers ────────────────────────────────────────────────────────
function getCoverUrl(aweme) {
  const video = aweme.video || {};
  for (const key of ['origin_cover', 'cover']) {
    const urls = (video[key] || {}).url_list || [];
    if (urls.length) return urls[0];
  }
  const imgs = aweme.images || aweme.image_list || (aweme.image_post_info || {}).images;
  if (Array.isArray(imgs) && imgs[0]) {
    for (const key of ['thumbnail', 'display_image']) {
      const urls = (imgs[0][key] || {}).url_list || [];
      if (urls.length) return urls[0];
    }
  }
  return null;
}

function collectImageUrls(aweme) {
  const imgs = aweme.images || aweme.image_list || (aweme.image_post_info || {}).images;
  if (!Array.isArray(imgs)) return [];
  return imgs.map(img => {
    const candidates = (img.display_image || {}).url_list || [];
    const noWebp = candidates.filter(u => !u.toLowerCase().includes('.webp'));
    return noWebp[0] || candidates[0] || null;
  }).filter(Boolean);
}

function isWatermarked(url) {
  const low = url.toLowerCase();
  return WATERMARK_HINTS.some(h => low.includes(h));
}

function pickBestPlayAddr(video) {
  const bitRates = video.bit_rate;
  if (!Array.isArray(bitRates) || !bitRates.length) return null;
  let best = null, bestScore = -1;
  for (const entry of bitRates) {
    const pa = entry.play_addr;
    if (!pa) continue;
    const br = parseInt(entry.bit_rate || 0) || 0;
    const width = parseInt(pa.width || entry.width || 0) || 0;
    const score = br * 10000 + width;
    if (score > bestScore) { bestScore = score; best = pa; }
  }
  return best;
}

function extractVideoUrl(aweme) {
  const video = aweme.video || {};
  const playAddr = pickBestPlayAddr(video) || video.play_addr || {};
  const candidates = (playAddr.url_list || []).filter(Boolean);
  candidates.sort((a, b) => (a.includes('watermark=0') ? 0 : 1) - (b.includes('watermark=0') ? 0 : 1));

  let fallback = null, watermarked = null;

  for (const u of candidates) {
    let hostname;
    try { hostname = new URL(u).hostname; } catch { continue; }
    const isDouyin = hostname.endsWith('douyin.com');
    const wmk = isWatermarked(u);

    if (isDouyin) {
      const signed = u.includes('X-Bogus=') ? u : buildXBogus(u, DEFAULT_UA);
      if (wmk) { watermarked = watermarked || signed; continue; }
      return signed;
    }
    if (wmk) watermarked = watermarked || u;
    else fallback = fallback || u;
  }

  if (fallback) return fallback;

  const uri = playAddr.uri || video.vid || (video.download_addr || {}).uri;
  if (uri) {
    const qs = new URLSearchParams({
      video_id: uri, ratio: '1080p', line: '0',
      is_play_url: '1', watermark: '0', source: 'PackSourceEnum_PUBLISH',
    }).toString();
    return buildXBogus(`${BASE_URL}/aweme/v1/play/?${qs}`, DEFAULT_UA);
  }

  return watermarked;
}

// ── iesdouyin.com legacy API (less geo-restricted) ───────────────────────────
async function fetchIesdouyin(awemeId) {
  const cookies = loadCookies();
  const url = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${awemeId}&reflow_source=reflow_page`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_UA,
      'Referer': 'https://www.iesdouyin.com/',
      'Accept': 'application/json, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Cookie': cookieStr(cookies),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) return null;
  const text = await resp.text();
  if (!text) return null;
  const data = JSON.parse(text);
  const items = (data || {}).item_list || [];
  return items[0] || null;
}

// ── Public API methods ────────────────────────────────────────────────────────
async function getVideoDetail(awemeId) {
  // Primary: main web API (may be geo-blocked from non-CN servers; 1 retry to fail fast)
  for (const aid of ['6383', '1128']) {
    try {
      const data = await douyinFetch('/aweme/v1/web/aweme/detail/', { aweme_id: awemeId, aid }, 1);
      const detail = (data || {}).aweme_detail;
      if (detail) return detail;
      const filterInfo = (data || {}).filter_detail;
      if (filterInfo && filterInfo.filter_reason) continue;
    } catch {}
  }
  // Fallback 1: feed endpoint
  try {
    const data = await douyinFetch('/aweme/v1/web/feed/', { aweme_id: awemeId, count: '1' });
    const list = (data || {}).aweme_list || [];
    if (list.length) return list[0];
  } catch {}
  // Fallback 2: iesdouyin.com legacy API (different domain, often not geo-blocked)
  try {
    const item = await fetchIesdouyin(awemeId);
    if (item) return item;
  } catch {}
  return null;
}

async function getUserInfo(secUid) {
  const data = await douyinFetch('/aweme/v1/web/user/profile/other/', { sec_user_id: secUid });
  return (data || {}).user || null;
}

async function getUserPosts(secUid, cursor = 0, count = 20) {
  const data = await douyinFetch('/aweme/v1/web/aweme/post/', {
    sec_user_id: secUid, max_cursor: cursor, count,
    locate_query: 'false', show_live_replay_strategy: '1',
    need_time_list: '1', time_list_query: '0',
    whale_cut_token: '', cut_version: '1', publish_video_strategy_type: '2',
  });
  const raw = data || {};
  const items = raw.aweme_list || raw.items || [];
  let hasMore = false;
  try { hasMore = Boolean(parseInt(raw.has_more || 0)); } catch { /* */ }
  const nextCursor = parseInt(raw.max_cursor || raw.cursor || 0) || 0;
  return { items, has_more: hasMore, next_cursor: nextCursor };
}

function isAllowedImageUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ALLOWED_IMAGE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch { return false; }
}

module.exports = {
  resolveUrl, isShortUrl, parseUrl,
  getVideoDetail, getUserInfo, getUserPosts,
  getCoverUrl, collectImageUrls, extractVideoUrl,
  buildXBogus, isAllowedImageUrl,
  DEFAULT_UA, BASE_URL,
};
