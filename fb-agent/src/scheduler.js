/**
 * scheduler.js — Chạy định kỳ, kiểm tra bài "approved" và schedule lên Facebook.
 * Dùng node-cron. Không tự động đăng nếu chưa approved.
 */

const cron             = require('node-cron');
const { getApprovedPosts, updatePost } = require('./data_store');
const { schedulePost } = require('./facebook_client');
const logger           = require('./logger');

// Mặc định chạy mỗi 2 phút. Override bằng SCHEDULER_CRON trong .env
const CRON_EXPR = process.env.SCHEDULER_CRON || '*/2 * * * *';

// Facebook yêu cầu scheduled_publish_time cách hiện tại tối thiểu 10 phút
const FB_MIN_FUTURE_MS = 11 * 60 * 1000; // 11 phút để có buffer

/**
 * Xử lý một post được approve: validate → gọi FB API → cập nhật status.
 */
async function processPost(post) {
  const { id, topic, caption, hashtags, scheduled_time } = post;

  logger.info(`Scheduler: xử lý post ${id} — "${topic || '(không có topic)'}"`);

  // Caption là bắt buộc
  if (!caption || caption.trim() === '') {
    logger.warn(`Post ${id}: không có caption, bỏ qua.`);
    await updatePost(id, {
      status:        'failed',
      error_message: 'Không có caption. Hãy chạy agent để tạo nội dung trước.',
    });
    return;
  }

  // Validate scheduled_time
  if (!scheduled_time || scheduled_time.trim() === '') {
    logger.error(`Post ${id}: scheduled_time bị rỗng.`);
    await updatePost(id, {
      status:        'failed',
      error_message: 'scheduled_time không được để trống.',
    });
    return;
  }

  const scheduledDate = new Date(scheduled_time.trim());
  if (isNaN(scheduledDate.getTime())) {
    logger.error(`Post ${id}: scheduled_time không hợp lệ — "${scheduled_time}"`);
    await updatePost(id, {
      status:        'failed',
      error_message: `scheduled_time không đúng định dạng: "${scheduled_time}". Dùng ISO 8601 hoặc YYYY-MM-DD HH:mm:ss`,
    });
    return;
  }

  // Kiểm tra thời gian phải cách hiện tại ít nhất 10 phút
  const nowMs = Date.now();
  if (scheduledDate.getTime() < nowMs + FB_MIN_FUTURE_MS) {
    const diff = Math.round((scheduledDate.getTime() - nowMs) / 60000);
    logger.error(`Post ${id}: scheduled_time quá gần (${diff} phút nữa). Facebook yêu cầu tối thiểu 10 phút.`);
    await updatePost(id, {
      status:        'failed',
      error_message: `scheduled_time phải cách hiện tại ≥10 phút. Hiện còn ${diff} phút. Hãy cập nhật scheduled_time và chuyển status về "approved".`,
    });
    return;
  }

  // Ghép message = caption + hashtags
  const message = [caption.trim(), hashtags?.trim()]
    .filter(Boolean)
    .join('\n\n');

  const unixTs = Math.floor(scheduledDate.getTime() / 1000);

  const result = await schedulePost(message, unixTs);

  if (result.success) {
    await updatePost(id, {
      status:           'scheduled',
      facebook_post_id: result.postId,
      error_message:    '',
    });
    logger.info(`Post ${id} đã schedule thành công lên Facebook.`, { fbPostId: result.postId });
  } else {
    await updatePost(id, {
      status:        'failed',
      error_message: result.error,
    });
    logger.error(`Post ${id} thất bại khi schedule lên Facebook.`, { error: result.error });
  }
}

/**
 * Hàm chạy một lần: đọc toàn bộ bài approved → xử lý từng bài.
 */
async function processPendingPosts() {
  logger.info('Scheduler: bắt đầu kiểm tra bài approved...');

  let approved;
  try {
    approved = await getApprovedPosts();
  } catch (err) {
    logger.error('Scheduler: không đọc được CSV', { error: err.message });
    return;
  }

  if (approved.length === 0) {
    logger.info('Scheduler: không có bài nào chờ schedule.');
    return;
  }

  logger.info(`Scheduler: tìm thấy ${approved.length} bài approved.`);

  // Xử lý tuần tự để tránh race condition khi ghi CSV
  for (const post of approved) {
    try {
      await processPost(post);
    } catch (err) {
      logger.error(`Scheduler: lỗi không mong đợi khi xử lý post ${post.id}`, {
        error: err.message,
        stack: err.stack,
      });
      // Cập nhật failed để không bị lặp vô tận
      try {
        await updatePost(post.id, {
          status:        'failed',
          error_message: `Lỗi không mong đợi: ${err.message}`,
        });
      } catch (_) { /* bỏ qua lỗi khi ghi fallback */ }
    }
  }

  logger.info('Scheduler: hoàn thành vòng kiểm tra.');
}

/**
 * Khởi động scheduler chạy theo cron.
 * Gọi processPendingPosts() ngay khi start, sau đó chạy theo lịch.
 */
function startScheduler() {
  if (!cron.validate(CRON_EXPR)) {
    throw new Error(`SCHEDULER_CRON không hợp lệ: "${CRON_EXPR}"`);
  }

  logger.info(`Scheduler: khởi động với cron expression "${CRON_EXPR}"`);

  // Chạy ngay lần đầu
  processPendingPosts().catch(err =>
    logger.error('Scheduler: lỗi lần chạy đầu tiên', { error: err.message })
  );

  // Lên lịch cron
  cron.schedule(CRON_EXPR, () => {
    processPendingPosts().catch(err =>
      logger.error('Scheduler: lỗi trong cron job', { error: err.message })
    );
  });

  logger.info('Scheduler: đang chạy. Nhấn Ctrl+C để dừng.');
}

module.exports = { startScheduler, processPendingPosts };
