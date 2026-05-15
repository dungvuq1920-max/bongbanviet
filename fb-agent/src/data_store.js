/**
 * data_store.js — Read/write posts từ CSV file.
 * Atomic: đọc toàn bộ file → sửa trong memory → ghi lại.
 */

const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parser');
const logger = require('./logger');

const CSV_PATH = process.env.CSV_PATH
  ? path.resolve(process.env.CSV_PATH)
  : path.join(__dirname, '..', 'posts.csv');

// Thứ tự cột trong CSV — giữ cố định để không bị lệch cột khi ghi lại
const HEADERS = [
  'id',
  'topic',
  'brand_voice',
  'scheduled_time',
  'status',
  'caption',
  'hashtags',
  'facebook_post_id',
  'error_message',
  'content_pillar',
  'image_path',
  'image_prompt',
];

/**
 * Tạo file CSV với header nếu chưa tồn tại.
 */
function ensureCSV() {
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, HEADERS.join(',') + '\n', 'utf-8');
    logger.info(`Đã tạo file CSV mới tại: ${CSV_PATH}`);
  }
}

/**
 * Escape một giá trị để dùng trong CSV:
 * - Wrap bằng dấu nháy kép nếu có dấu phẩy, nháy kép, hoặc xuống dòng
 * - Escape dấu nháy kép bên trong bằng ""
 */
function escapeCSV(val) {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Đọc toàn bộ posts từ CSV. Trả về Promise<Post[]>.
 */
function readPosts() {
  return new Promise((resolve, reject) => {
    ensureCSV();
    const rows = [];
    fs.createReadStream(CSV_PATH, { encoding: 'utf-8' })
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => {
        logger.debug(`Đã đọc ${rows.length} dòng từ CSV.`);
        resolve(rows);
      })
      .on('error', err => {
        logger.error('Lỗi đọc CSV', { error: err.message });
        reject(err);
      });
  });
}

/**
 * Ghi toàn bộ posts[] vào CSV (overwrite).
 */
function writePosts(posts) {
  ensureCSV();
  const lines = [HEADERS.join(',')];
  for (const post of posts) {
    const row = HEADERS.map(h => escapeCSV(post[h]));
    lines.push(row.join(','));
  }
  fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n', 'utf-8');
  logger.debug(`Đã ghi ${posts.length} dòng vào CSV.`);
}

/**
 * Cập nhật một post theo id. Ném lỗi nếu không tìm thấy.
 */
async function updatePost(id, updates) {
  const posts = await readPosts();
  const idx = posts.findIndex(p => String(p.id) === String(id));
  if (idx === -1) {
    throw new Error(`Không tìm thấy post có id="${id}"`);
  }
  posts[idx] = { ...posts[idx], ...updates };
  writePosts(posts);
  logger.info(`Đã cập nhật post ${id}`, { updates });
  return posts[idx];
}

/**
 * Lấy các post cần generate content (status rỗng hoặc "new").
 */
async function getNewPosts() {
  const posts = await readPosts();
  return posts.filter(p => !p.status || p.status.trim() === '' || p.status.trim() === 'new');
}

/**
 * Lấy các post đã được approve, chờ schedule lên Facebook.
 */
async function getApprovedPosts() {
  const posts = await readPosts();
  return posts.filter(p => p.status && p.status.trim() === 'approved');
}

/**
 * Lấy các post theo status bất kỳ.
 */
async function getPostsByStatus(status) {
  const posts = await readPosts();
  return posts.filter(p => p.status && p.status.trim() === status);
}

/**
 * Thêm một hoặc nhiều post mới vào cuối CSV.
 */
async function addPosts(newPosts) {
  const posts = await readPosts();
  const allPosts = [...posts, ...newPosts];
  writePosts(allPosts);
  logger.info(`Đã thêm ${newPosts.length} bài mới vào CSV.`);
  return allPosts;
}

module.exports = {
  readPosts,
  writePosts,
  updatePost,
  getNewPosts,
  getApprovedPosts,
  getPostsByStatus,
  addPosts,
  CSV_PATH,
};
