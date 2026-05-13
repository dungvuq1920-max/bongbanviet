/**
 * facebook_client.js — Gọi Facebook Graph API để schedule bài đăng.
 * Có retry tự động khi gặp lỗi mạng hoặc lỗi server Facebook.
 */

const axios  = require('axios');
const logger = require('./logger');

const PAGE_ID      = process.env.FACEBOOK_PAGE_ID;
const ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const GRAPH_VER    = process.env.FACEBOOK_GRAPH_VERSION || 'v19.0';
const BASE_URL     = `https://graph.facebook.com/${GRAPH_VER}`;

// Retry config
const MAX_RETRIES   = 3;
const RETRY_BASE_MS = 2000; // backoff nhân đôi mỗi lần retry

// Các Facebook error code nên retry (rate limit, server error)
const RETRYABLE_FB_CODES = new Set([1, 2, 4, 17, 341]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate các biến môi trường cần thiết.
 */
function validateConfig() {
  if (!PAGE_ID)      throw new Error('FACEBOOK_PAGE_ID chưa được set trong .env');
  if (!ACCESS_TOKEN) throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN chưa được set trong .env');
}

/**
 * Schedule một bài đăng lên Facebook Page.
 *
 * @param {string} message         - Nội dung bài (caption + hashtags)
 * @param {number} scheduledUnixTs - Unix timestamp (giây) thời điểm đăng
 * @param {number} [attempt=0]     - Số lần retry hiện tại (nội bộ)
 * @returns {Promise<{success: boolean, postId?: string, error?: string}>}
 */
async function schedulePost(message, scheduledUnixTs, attempt = 0) {
  validateConfig();

  const url = `${BASE_URL}/${PAGE_ID}/feed`;
  const payload = {
    message,
    published:              false,
    scheduled_publish_time: scheduledUnixTs,
    access_token:           ACCESS_TOKEN,
  };

  logger.info(`Facebook API: schedule post`, {
    pageId:        PAGE_ID,
    scheduledAt:   new Date(scheduledUnixTs * 1000).toISOString(),
    attempt:       attempt + 1,
    messageLength: message.length,
  });

  try {
    const res = await axios.post(url, payload, { timeout: 15000 });
    const postId = res.data?.id;
    logger.info(`Facebook API: thành công`, { postId });
    return { success: true, postId };

  } catch (err) {
    const status  = err.response?.status;
    const fbError = err.response?.data?.error;
    const fbCode  = fbError?.code;
    const fbMsg   = fbError?.message || err.message;

    logger.error(`Facebook API: lỗi`, {
      httpStatus: status,
      fbCode,
      fbMsg,
      attempt: attempt + 1,
    });

    // Kiểm tra có nên retry không
    const isNetworkErr = !err.response && err.code; // ECONNRESET, ETIMEDOUT...
    const isServerErr  = status >= 500;
    const isRateLimit  = RETRYABLE_FB_CODES.has(fbCode);

    if (attempt < MAX_RETRIES && (isNetworkErr || isServerErr || isRateLimit)) {
      const delayMs = RETRY_BASE_MS * Math.pow(2, attempt); // exponential backoff
      logger.warn(`Facebook API: retry sau ${delayMs}ms (lần ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delayMs);
      return schedulePost(message, scheduledUnixTs, attempt + 1);
    }

    // Không retry — trả về lỗi chi tiết
    const errorDetail = fbError
      ? `[FB #${fbCode}] ${fbMsg}`
      : `[HTTP ${status}] ${fbMsg}`;

    return { success: false, error: errorDetail };
  }
}

/**
 * Kiểm tra Page Access Token còn hợp lệ không.
 * Tiện dụng khi debug hoặc healthcheck.
 */
async function verifyToken() {
  validateConfig();
  try {
    const res = await axios.get(`${BASE_URL}/me`, {
      params: { access_token: ACCESS_TOKEN, fields: 'id,name' },
      timeout: 10000,
    });
    logger.info('Token hợp lệ', { page: res.data });
    return { valid: true, page: res.data };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    logger.error('Token không hợp lệ hoặc hết hạn', { error: msg });
    return { valid: false, error: msg };
  }
}

module.exports = { schedulePost, verifyToken };
