#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const positional = args.filter((arg) => arg !== '--watch');
const inputFile = path.resolve(
  positional[0] ||
  process.env.FACEBOOK_IMPORT_JSON_FILE ||
  path.join(os.homedir(), 'Desktop', 'facebook-posts.json')
);

const baseUrl = (process.env.FACEBOOK_DASHBOARD_URL || process.env.BBV_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const endpoint = baseUrl.endsWith('/api/fb-posts/import') ? baseUrl : `${baseUrl}/api/fb-posts/import`;
const token = process.env.FACEBOOK_DASHBOARD_TOKEN || process.env.ADMIN_TOKEN || '';

function parsePayload(raw) {
  const parsed = JSON.parse(raw);
  const posts = Array.isArray(parsed) ? parsed : Array.isArray(parsed.posts) ? parsed.posts : null;
  if (!posts || !posts.length) throw new Error('JSON must be an array or an object with posts: []');
  return posts;
}

function cleanSourceId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function sourceIdFromSchedule(post) {
  const explicit = cleanSourceId(post.source_id);
  if (explicit) return explicit;
  const slot = String(post.scheduled_time || '').trim();
  const key = slot.replace(/[^0-9]/g, '').slice(0, 12);
  return key ? `bbv-facebook-${key}` : '';
}

function normalizePosts(posts) {
  return posts.map((post) => ({
    ...post,
    source_id: sourceIdFromSchedule(post),
    status: post.status || 'scheduled',
    website_link: post.website_link || 'https://bongbanviet.com',
    source_type: post.source_type || 'local-json',
  }));
}

function fileHash(file) {
  if (!fs.existsSync(file)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function importFile(file) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const raw = fs.readFileSync(file, 'utf8').trim();
  const posts = normalizePosts(parsePayload(raw));
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ posts }),
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);

  const created = Number(data.created || 0);
  const updated = Number(data.updated || 0);
  console.log(`[facebook] Imported ${data.count || posts.length} posts (${created} created, ${updated} updated) from ${file}`);
  return data;
}

async function runOnce() {
  await importFile(inputFile);
}

function watchFile() {
  let lastHash = fileHash(inputFile);
  let running = false;
  let queued = false;

  async function sync(reason) {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const currentHash = fileHash(inputFile);
      if (!currentHash || currentHash === lastHash) return;
      lastHash = currentHash;
      console.log(`[facebook] Change detected (${reason}). Importing...`);
      await importFile(inputFile);
    } catch (error) {
      console.error(`[facebook] Import failed: ${error.message}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        setTimeout(() => sync('queued'), 500);
      }
    }
  }

  console.log(`[facebook] Watching ${inputFile}`);
  console.log(`[facebook] Target ${endpoint}`);

  fs.watchFile(inputFile, { interval: 1200 }, () => {
    setTimeout(() => sync('file changed'), 250);
  });

  if (fs.existsSync(inputFile)) {
    lastHash = '';
    sync('startup');
  }
}

if (watchMode) {
  watchFile();
} else {
  runOnce().catch((error) => {
    console.error(`[facebook] ${error.message}`);
    process.exit(1);
  });
}
