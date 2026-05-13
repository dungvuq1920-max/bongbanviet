/**
 * main.js — Entry point của FB Agent.
 *
 * Cách dùng:
 *   node main.js agent      → Tạo draft cho các bài có status rỗng / "new"
 *   node main.js scheduler  → Khởi động scheduler (chạy liên tục)
 *   node main.js both       → Chạy agent trước, sau đó khởi động scheduler
 *   node main.js verify     → Kiểm tra Facebook Page Access Token
 *   node main.js status     → In trạng thái tất cả các bài trong CSV
 */

require('dotenv').config();

const { getNewPosts, updatePost, readPosts, CSV_PATH } = require('./src/data_store');
const { generateContent } = require('./src/ai_writer');
const { startScheduler }  = require('./src/scheduler');
const { verifyToken }     = require('./src/facebook_client');
const logger              = require('./src/logger');

const MODE = process.argv[2] || 'help';

// ─────────────────────────────────────────
// Agent: đọc bài mới → gọi AI → lưu draft
// ─────────────────────────────────────────
async function runAgent() {
  logger.info('═══ FB Agent: Bắt đầu tạo nội dung ═══');

  const newPosts = await getNewPosts();

  if (newPosts.length === 0) {
    logger.info(
      'Không có bài nào cần xử lý.\n' +
      `Thêm dòng mới vào ${CSV_PATH} với status rỗng hoặc "new".`
    );
    return;
  }

  logger.info(`Tìm thấy ${newPosts.length} bài cần tạo nội dung.`);

  let successCount = 0;
  let failCount    = 0;

  for (const post of newPosts) {
    const { id, topic, brand_voice } = post;

    if (!topic || topic.trim() === '') {
      logger.warn(`Post ${id}: trường "topic" bị rỗng — bỏ qua.`);
      failCount++;
      continue;
    }

    try {
      logger.info(`Đang xử lý post ${id}: "${topic}"`);

      const content = await generateContent(topic.trim(), (brand_voice || '').trim());

      await updatePost(id, {
        status:        'draft',
        caption:       content.caption,
        hashtags:      content.hashtags,
        error_message: '',
      });

      logger.info(`Post ${id}: đã lưu draft thành công.`);
      successCount++;

    } catch (err) {
      logger.error(`Post ${id}: lỗi khi tạo nội dung`, { error: err.message });
      await updatePost(id, {
        status:        'failed',
        error_message: `AI generation failed: ${err.message}`,
      }).catch(() => {}); // bỏ qua lỗi khi ghi fallback
      failCount++;
    }
  }

  logger.info(`═══ FB Agent: Hoàn thành — ${successCount} thành công, ${failCount} thất bại ═══`);
  logger.info(`Tiếp theo: mở ${CSV_PATH}, kiểm tra bài draft và đổi status thành "approved".`);
}

// ─────────────────────────────────────────
// Status: in bảng tóm tắt trạng thái
// ─────────────────────────────────────────
async function printStatus() {
  const posts = await readPosts();
  if (posts.length === 0) {
    console.log('CSV chưa có dữ liệu.');
    return;
  }

  const counts = {};
  for (const p of posts) {
    const s = p.status?.trim() || '(trống)';
    counts[s] = (counts[s] || 0) + 1;
  }

  console.log('\n─── Tổng quan CSV ───');
  console.log(`Tổng số bài: ${posts.length}`);
  for (const [status, count] of Object.entries(counts)) {
    console.log(`  ${status.padEnd(14)} : ${count}`);
  }

  console.log('\n─── Chi tiết ───');
  for (const p of posts) {
    const status = (p.status || '(trống)').padEnd(12);
    const topic  = (p.topic || '').substring(0, 40).padEnd(42);
    const time   = p.scheduled_time || '';
    const fbId   = p.facebook_post_id ? `FB:${p.facebook_post_id}` : '';
    const err    = p.error_message ? `⚠ ${p.error_message.substring(0, 40)}` : '';
    console.log(`  [${p.id}] ${status} | ${topic} | ${time} ${fbId} ${err}`);
  }
  console.log('');
}

// ─────────────────────────────────────────
// Main router
// ─────────────────────────────────────────
async function main() {
  switch (MODE) {
    case 'agent':
      await runAgent();
      break;

    case 'scheduler':
      startScheduler();
      break;

    case 'both':
      await runAgent();
      startScheduler();
      break;

    case 'verify':
      logger.info('Đang kiểm tra Facebook Page Access Token...');
      await verifyToken();
      break;

    case 'status':
      await printStatus();
      break;

    default:
      console.log(`
FB Agent — Tự động tạo và schedule bài Facebook

Cách dùng:
  node main.js agent      Tạo draft (gọi AI) cho các bài status rỗng/"new"
  node main.js scheduler  Chạy scheduler (daemon) — check & schedule bài approved
  node main.js both       Chạy agent rồi khởi động scheduler
  node main.js verify     Kiểm tra Facebook Page Access Token
  node main.js status     Xem trạng thái tất cả bài trong CSV

Workflow:
  1. Thêm topic vào posts.csv (status rỗng hoặc "new")
  2. node main.js agent          → tạo caption, lưu draft
  3. Mở posts.csv, đổi status → "approved"
  4. node main.js scheduler      → tự động schedule lên Facebook
`);
  }
}

main().catch(err => {
  logger.error('Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
