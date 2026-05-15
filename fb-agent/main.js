/**
 * main.js — Entry point của FB Agent.
 *
 * Cách dùng:
 *   node main.js research       → Nghiên cứu & đề xuất topic mới cho 7 ngày
 *   node main.js agent          → Tạo draft cho các bài có status rỗng / "new"
 *   node main.js generate-image → Tạo prompt ảnh cho các bài draft
 *   node main.js scheduler      → Khởi động scheduler (chạy liên tục)
 *   node main.js both           → Chạy agent trước, sau đó khởi động scheduler
 *   node main.js full           → Chạy toàn bộ pipeline: research → agent → image
 *   node main.js verify         → Kiểm tra Facebook Page Access Token
 *   node main.js status         → In trạng thái tất cả các bài trong CSV
 */

require('dotenv').config();

const { getNewPosts, updatePost, readPosts, getPostsByStatus, CSV_PATH } = require('./src/data_store');
const { generateContent }    = require('./src/ai_writer');
const { startScheduler }     = require('./src/scheduler');
const { verifyToken }        = require('./src/facebook_client');
const { processImage }       = require('./src/image_handler');
const logger                 = require('./src/logger');

// Lazy-load researcher (tránh circular dependency nếu có)
function getResearcher() {
  return require('./src/researcher');
}

const MODE = process.argv[2] || 'help';

// Số ngày cần lập kế hoạch (override bằng tham số thứ 3)
const RESEARCH_DAYS = parseInt(process.argv[3]) || 7;

// ─────────────────────────────────────────
// Research: nghiên cứu & đề xuất topic mới
// ─────────────────────────────────────────
async function runResearchMode() {
  logger.info(`═══ Research Mode: Lập kế hoạch cho ${RESEARCH_DAYS} ngày ═══`);
  const { runResearch } = getResearcher();
  const count = await runResearch(RESEARCH_DAYS);
  logger.info(`Đã thêm ${count} topic mới vào ${CSV_PATH}`);
  logger.info(`Tiếp theo: chạy "node main.js agent" để tạo nội dung.`);
}

// ─────────────────────────────────────────
// Agent: đọc bài mới → gọi AI → lưu draft
// ─────────────────────────────────────────
async function runAgent() {
  logger.info('═══ FB Agent: Bắt đầu tạo nội dung ═══');

  const newPosts = await getNewPosts();

  if (newPosts.length === 0) {
    logger.info(
      'Không có bài nào cần xử lý.\n' +
      `Thêm dòng mới vào ${CSV_PATH} với status rỗng hoặc "new".\n` +
      `Hoặc chạy "node main.js research" để tự động tạo topic.`
    );
    return;
  }

  logger.info(`Tìm thấy ${newPosts.length} bài cần tạo nội dung.`);

  let successCount = 0;
  let failCount    = 0;

  for (const post of newPosts) {
    const { id, topic, brand_voice, content_pillar } = post;

    if (!topic || topic.trim() === '') {
      logger.warn(`Post ${id}: trường "topic" bị rỗng — bỏ qua.`);
      failCount++;
      continue;
    }

    try {
      logger.info(`Đang xử lý post ${id}: "${topic}" [${content_pillar || 'knowledge'}]`);

      const content = await generateContent(
        topic.trim(),
        (brand_voice || '').trim(),
        (content_pillar || 'knowledge').trim()
      );

      await updatePost(id, {
        status:        'draft',
        caption:       content.caption,
        hashtags:      content.hashtags,
        image_prompt:  content.image_prompt,
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
// Generate Image: xử lý ảnh cho bài draft
// ─────────────────────────────────────────
async function runGenerateImage() {
  logger.info('═══ Image Handler: Bắt đầu xử lý ảnh ═══');

  const drafts = await getPostsByStatus('draft');

  if (drafts.length === 0) {
    logger.info('Không có bài draft nào cần xử lý ảnh.');
    return;
  }

  // Chỉ xử lý bài chưa có ảnh
  const needImage = drafts.filter(p => !p.image_path || p.image_path.trim() === '');

  if (needImage.length === 0) {
    logger.info('Tất cả bài draft đã có ảnh.');
    return;
  }

  logger.info(`Tìm thấy ${needImage.length} bài cần xử lý ảnh.`);

  let matched = 0;
  let prompted = 0;

  for (const post of needImage) {
    const result = processImage(post);

    const updates = {};
    if (result.image_path) {
      updates.image_path = result.image_path;
      matched++;
      logger.info(`Post ${post.id}: tìm thấy ảnh có sẵn — ${result.image_path}`);
    }
    if (result.image_prompt && !post.image_prompt) {
      updates.image_prompt = result.image_prompt;
      prompted++;
      logger.info(`Post ${post.id}: đã tạo image prompt.`);
    }

    if (Object.keys(updates).length > 0) {
      await updatePost(post.id, updates);
    }
  }

  logger.info(`═══ Image Handler: ${matched} ảnh tìm thấy, ${prompted} prompt đã tạo ═══`);

  if (prompted > 0) {
    logger.info(
      'Các bài có image_prompt nhưng chưa có ảnh:\n' +
      '  → Dùng prompt trong CSV để tạo ảnh bằng AI tool (DALL-E, Midjourney...)\n' +
      '  → Sau đó điền đường dẫn ảnh vào cột image_path trong CSV.'
    );
  }
}

// ─────────────────────────────────────────
// Full Pipeline: research → agent → image
// ─────────────────────────────────────────
async function runFullPipeline() {
  logger.info('═══ Full Pipeline: Bắt đầu ═══');

  // Bước 1: Research
  await runResearchMode();

  // Bước 2: Agent tạo content
  await runAgent();

  // Bước 3: Xử lý ảnh
  await runGenerateImage();

  logger.info('═══ Full Pipeline: Hoàn thành ═══');
  logger.info(
    'Tiếp theo:\n' +
    `  1. Mở ${CSV_PATH}\n` +
    '  2. Review caption + ảnh\n' +
    '  3. Đổi status → "approved"\n' +
    '  4. Chạy "node main.js scheduler" để lên lịch đăng Facebook'
  );
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
  const pillarCounts = {};
  for (const p of posts) {
    const s = p.status?.trim() || '(trống)';
    counts[s] = (counts[s] || 0) + 1;

    const pillar = p.content_pillar?.trim() || '(không rõ)';
    pillarCounts[pillar] = (pillarCounts[pillar] || 0) + 1;
  }

  console.log('\n─── Tổng quan CSV ───');
  console.log(`Tổng số bài: ${posts.length}`);
  console.log('\nTheo trạng thái:');
  for (const [status, count] of Object.entries(counts)) {
    console.log(`  ${status.padEnd(14)} : ${count}`);
  }
  console.log('\nTheo content pillar:');
  for (const [pillar, count] of Object.entries(pillarCounts)) {
    console.log(`  ${pillar.padEnd(14)} : ${count}`);
  }

  console.log('\n─── Chi tiết ───');
  for (const p of posts) {
    const status = (p.status || '(trống)').padEnd(12);
    const pillar = (p.content_pillar || '').padEnd(12);
    const topic  = (p.topic || '').substring(0, 40).padEnd(42);
    const time   = p.scheduled_time || '';
    const hasImg = p.image_path ? '🖼️' : (p.image_prompt ? '📝' : '  ');
    const fbId   = p.facebook_post_id ? `FB:${p.facebook_post_id}` : '';
    const err    = p.error_message ? `⚠ ${p.error_message.substring(0, 30)}` : '';
    console.log(`  [${p.id}] ${status} | ${pillar} | ${hasImg} | ${topic} | ${time} ${fbId} ${err}`);
  }
  console.log('');
  console.log('Chú thích: 🖼️ = có ảnh, 📝 = có prompt ảnh (chưa tạo ảnh)');
  console.log('');
}

// ─────────────────────────────────────────
// Main router
// ─────────────────────────────────────────
async function main() {
  switch (MODE) {
    case 'research':
      await runResearchMode();
      break;

    case 'agent':
      await runAgent();
      break;

    case 'generate-image':
      await runGenerateImage();
      break;

    case 'full':
      await runFullPipeline();
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
FB Agent — Tự động tạo và schedule bài Facebook (v2.0)

Cách dùng:
  node main.js research [N]    Nghiên cứu & đề xuất N topic mới (mặc định: 7)
  node main.js agent           Tạo draft (gọi AI) cho bài status rỗng/"new"
  node main.js generate-image  Xử lý ảnh cho bài draft (tìm hoặc tạo prompt)
  node main.js full [N]        Chạy toàn bộ: research → agent → generate-image
  node main.js scheduler       Chạy scheduler (daemon) — schedule bài approved
  node main.js both            Chạy agent rồi khởi động scheduler
  node main.js verify          Kiểm tra Facebook Page Access Token
  node main.js status          Xem trạng thái tất cả bài trong CSV

Workflow đầy đủ:
  1. node main.js research         → Nghiên cứu topic, thêm vào CSV
  2. node main.js agent            → AI tạo caption + hashtag + image prompt
  3. node main.js generate-image   → Tìm/tạo ảnh cho bài viết
  4. Mở posts.csv, review & đổi status → "approved"
  5. node main.js scheduler        → Tự động schedule lên Facebook

Hoặc chạy tất cả:
  node main.js full                → Bước 1-2-3 tự động
`);
  }
}

main().catch(err => {
  logger.error('Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
