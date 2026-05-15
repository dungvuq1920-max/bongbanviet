/**
 * researcher.js — Nghiên cứu & đề xuất topic bài viết Facebook.
 *
 * Chức năng:
 * 1. Đọc kho kiến thức nội bộ (chia_se_kien_thuc.txt) → đề xuất topic xoay vòng
 * 2. Gọi GPT phân tích → đề xuất chủ đề mới theo content pillar
 * 3. Ghi topic mới vào posts.csv
 */

const fs     = require('fs');
const path   = require('path');
const OpenAI = require('openai');
const logger = require('./logger');
const { readPosts, writePosts } = require('./data_store');

// Đường dẫn kho kiến thức
const KNOWLEDGE_PATH = path.join(__dirname, '..', '..', 'chia_se_kien_thuc.txt');

// Content Pillars — phân loại nội dung
const CONTENT_PILLARS = {
  knowledge:  { label: 'Kiến thức kỹ thuật',    ratio: 0.40, voice: 'chuyên gia ân cần' },
  product:    { label: 'Sản phẩm & Review',      ratio: 0.25, voice: 'chuyên nghiệp và đáng tin cậy' },
  news:       { label: 'Tin tức & Sự kiện',      ratio: 0.15, voice: 'hào hứng và cập nhật' },
  engagement: { label: 'Tương tác & Giải trí',   ratio: 0.10, voice: 'thân thiện và vui vẻ' },
  promo:      { label: 'Khuyến mãi & CTA',       ratio: 0.10, voice: 'gần gũi và thực tế' },
};

// Lịch đăng bài mặc định (giờ VN — UTC+7)
const WEEKLY_SCHEDULE = [
  { day: 1, hour: '08:00:00', pillar: 'knowledge' },   // Thứ 2
  { day: 2, hour: '11:00:00', pillar: 'product' },      // Thứ 3
  { day: 3, hour: '19:00:00', pillar: 'engagement' },   // Thứ 4
  { day: 4, hour: '08:00:00', pillar: 'knowledge' },    // Thứ 5
  { day: 5, hour: '11:00:00', pillar: 'news' },         // Thứ 6
  { day: 6, hour: '09:00:00', pillar: 'promo' },        // Thứ 7
  { day: 0, hour: '20:00:00', pillar: 'knowledge' },    // Chủ nhật
];

// Lazy-init OpenAI client
let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY chưa được set trong .env');
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/**
 * Đọc kho kiến thức nội bộ và tách thành danh sách bài viết.
 * Mỗi bài phân tách bởi "---"
 */
function loadKnowledgeBase() {
  if (!fs.existsSync(KNOWLEDGE_PATH)) {
    logger.warn(`Không tìm thấy kho kiến thức tại: ${KNOWLEDGE_PATH}`);
    return [];
  }

  const raw = fs.readFileSync(KNOWLEDGE_PATH, 'utf-8');
  const articles = raw
    .split(/\n---\s*\n/)
    .map(block => block.trim())
    .filter(block => block.length > 50);

  logger.info(`Đã tải ${articles.length} bài từ kho kiến thức.`);
  return articles;
}

/**
 * Trích xuất tiêu đề từ một bài viết trong kho kiến thức.
 * Format: "1. 🏓 TIÊU ĐỀ BÀI VIẾT"
 */
function extractTitle(article) {
  const firstLine = article.split('\n')[0] || '';
  // Xóa số thứ tự và emoji ở đầu
  return firstLine.replace(/^\d+\.\s*/, '').replace(/^[🏓🎯🧐🔥⚡🛡️💡✨⚖️🧠🎯]+\s*/, '').trim();
}

/**
 * Lấy danh sách topic đã có trong CSV để tránh trùng lặp.
 */
async function getExistingTopics() {
  const posts = await readPosts();
  return posts.map(p => (p.topic || '').toLowerCase().trim());
}

/**
 * Dùng GPT để đề xuất topic mới dựa trên kho kiến thức và trending.
 *
 * @param {number} count - Số topic cần đề xuất
 * @param {string[]} existingTopics - Các topic đã có (tránh trùng)
 * @param {string} pillar - Content pillar cần focus (optional)
 * @returns {Promise<Array<{topic: string, pillar: string, brand_voice: string}>>}
 */
async function suggestTopics(count = 7, existingTopics = [], pillar = null) {
  const knowledgeBase = loadKnowledgeBase();

  // Lấy 10 bài ngẫu nhiên từ kho kiến thức làm context
  const sampleArticles = knowledgeBase
    .sort(() => Math.random() - 0.5)
    .slice(0, 10)
    .map(a => extractTitle(a))
    .filter(t => t.length > 0);

  const pillarsDesc = Object.entries(CONTENT_PILLARS)
    .map(([key, val]) => `- ${key}: ${val.label} (${Math.round(val.ratio * 100)}%)`)
    .join('\n');

  const pillarFilter = pillar
    ? `\nTập trung vào content pillar: "${pillar}" (${CONTENT_PILLARS[pillar]?.label || pillar})`
    : '';

  const systemPrompt = `Bạn là chuyên gia content marketing cho cửa hàng bóng bàn BÓNG BÀN VIỆT.
Thông tin:
- Website: bongbanviet.com
- Đối tượng: Người chơi bóng bàn phong trào VN, từ mới bắt đầu đến nâng cao
- Giọng điệu: Chuyên gia nhưng gần gũi, thực chiến

Content Pillars:
${pillarsDesc}

Luôn trả về JSON hợp lệ.`;

  const userPrompt = `Hãy đề xuất ${count} chủ đề bài viết Facebook mới, ĐA DẠNG về content pillar.
${pillarFilter}

Các bài đã có trong kho kiến thức (THAM KHẢO, KHÔNG LẶP LẠI):
${sampleArticles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Các topic đã tồn tại (TRÁNH TRÙNG):
${existingTopics.slice(-20).map((t, i) => `- ${t}`).join('\n')}

Yêu cầu cho mỗi topic:
1. topic: Tiêu đề hấp dẫn, cụ thể, dưới 80 ký tự
2. pillar: Một trong [knowledge, product, news, engagement, promo]
3. brand_voice: Giọng văn phù hợp

Trả về JSON:
{
  "topics": [
    {"topic": "...", "pillar": "...", "brand_voice": "..."},
    ...
  ]
}`;

  const response = await getClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.85,
    max_tokens: 1500,
  });

  const raw = response.choices[0].message.content;
  logger.debug('GPT research response', { raw });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`GPT trả về JSON không hợp lệ: ${raw}`);
  }

  if (!parsed.topics || !Array.isArray(parsed.topics)) {
    throw new Error('GPT không trả về mảng "topics"');
  }

  return parsed.topics;
}

/**
 * Tính scheduled_time cho các bài tiếp theo dựa trên lịch hàng tuần.
 *
 * @param {number} count - Số slot cần tạo
 * @param {Date} startFrom - Bắt đầu tính từ ngày nào (mặc định: ngày mai)
 * @returns {Array<{dateStr: string, pillar: string}>}
 */
function generateScheduleSlots(count, startFrom = null) {
  const slots = [];
  const start = startFrom ? new Date(startFrom) : new Date();

  // Bắt đầu từ ngày mai
  if (!startFrom) {
    start.setDate(start.getDate() + 1);
  }
  start.setHours(0, 0, 0, 0);

  let current = new Date(start);

  while (slots.length < count) {
    const dayOfWeek = current.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7
    const schedule = WEEKLY_SCHEDULE.find(s => s.day === dayOfWeek);

    if (schedule) {
      const [hh, mm, ss] = schedule.hour.split(':');
      const slotDate = new Date(current);
      slotDate.setHours(parseInt(hh), parseInt(mm), parseInt(ss), 0);

      // Format: YYYY-MM-DD HH:mm:ss
      const dateStr = [
        slotDate.getFullYear(),
        String(slotDate.getMonth() + 1).padStart(2, '0'),
        String(slotDate.getDate()).padStart(2, '0'),
      ].join('-') + ' ' + [
        String(slotDate.getHours()).padStart(2, '0'),
        String(slotDate.getMinutes()).padStart(2, '0'),
        String(slotDate.getSeconds()).padStart(2, '0'),
      ].join(':');

      slots.push({ dateStr, pillar: schedule.pillar });
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

/**
 * Nghiên cứu và thêm topic mới vào CSV.
 *
 * @param {number} days - Số ngày cần lập kế hoạch (mặc định: 7 = 1 tuần)
 * @returns {Promise<number>} - Số topic đã thêm
 */
async function runResearch(days = 7) {
  logger.info(`═══ Researcher: Bắt đầu nghiên cứu cho ${days} ngày ═══`);

  const existingTopics = await getExistingTopics();
  const scheduleSlots = generateScheduleSlots(days);

  logger.info(`Cần tạo ${scheduleSlots.length} chủ đề mới.`);

  // Gọi GPT đề xuất topic
  const suggested = await suggestTopics(scheduleSlots.length, existingTopics);

  // Đọc posts hiện tại để tính ID tiếp theo
  const posts = await readPosts();
  let nextId = posts.length > 0
    ? Math.max(...posts.map(p => parseInt(p.id) || 0)) + 1
    : 1;

  const newPosts = [];

  for (let i = 0; i < Math.min(suggested.length, scheduleSlots.length); i++) {
    const topic = suggested[i];
    const slot = scheduleSlots[i];

    newPosts.push({
      id:               String(nextId++),
      topic:            topic.topic,
      brand_voice:      topic.brand_voice || CONTENT_PILLARS[topic.pillar]?.voice || 'thân thiện',
      scheduled_time:   slot.dateStr,
      status:           'new',
      caption:          '',
      hashtags:         '',
      facebook_post_id: '',
      error_message:    '',
      content_pillar:   topic.pillar || slot.pillar,
      image_path:       '',
      image_prompt:     '',
    });
  }

  // Append vào CSV
  const allPosts = [...posts, ...newPosts];
  writePosts(allPosts);

  logger.info(`═══ Researcher: Đã thêm ${newPosts.length} topic mới vào CSV ═══`);

  // In tóm tắt
  for (const p of newPosts) {
    const pillarLabel = CONTENT_PILLARS[p.content_pillar]?.label || p.content_pillar;
    logger.info(`  [${p.id}] ${p.scheduled_time} | ${pillarLabel} | ${p.topic}`);
  }

  return newPosts.length;
}

module.exports = {
  runResearch,
  suggestTopics,
  generateScheduleSlots,
  loadKnowledgeBase,
  CONTENT_PILLARS,
  WEEKLY_SCHEDULE,
};
