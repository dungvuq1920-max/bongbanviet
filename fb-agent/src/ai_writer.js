/**
 * ai_writer.js — Dùng OpenAI GPT để tạo caption Facebook, hashtags, và CTA.
 */

const OpenAI = require('openai');
const logger = require('./logger');

// Lazy-init client để tránh lỗi khi chưa set OPENAI_API_KEY
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
 * Tạo nội dung bài Facebook từ topic và brand_voice.
 *
 * @param {string} topic       - Chủ đề bài viết
 * @param {string} brandVoice  - Giọng văn thương hiệu (optional)
 * @returns {Promise<{caption: string, hashtags: string}>}
 */
async function generateContent(topic, brandVoice = '') {
  logger.info(`AI Writer: bắt đầu tạo nội dung cho chủ đề: "${topic}"`);

  const brandCtx = brandVoice ? `Giọng văn thương hiệu: ${brandVoice}.` : '';

  const systemPrompt = `Bạn là chuyên gia marketing cho cửa hàng bóng bàn BÓNG BÀN VIỆT.
Thông tin thương hiệu:
- Website: bongbanviet.com
- Địa chỉ: 286 Nguyễn Xiển, Thanh Liệt, Hà Nội
- Hotline/Zalo: 096.1269.386
- Slogan: "Tư Vấn Chuẩn - Hàng Chính Hãng"
- Facebook: facebook.com/bongbanviet.official
${brandCtx}

Nhiệm vụ: Viết bài đăng Facebook chất lượng cao, tự nhiên, không cứng nhắc.
Luôn trả về JSON hợp lệ theo format được yêu cầu.`;

  const userPrompt = `Viết bài đăng Facebook cho chủ đề: "${topic}"

Yêu cầu:
1. caption: Nội dung bài đăng đầy đủ (100–200 từ, tiếng Việt)
   - Mở đầu cuốn hút, đặt câu hỏi hoặc nêu vấn đề của người chơi
   - Nội dung thực chất, có giá trị thông tin
   - CTA tự nhiên ở cuối: nhắn Zalo 096.1269.386 hoặc truy cập bongbanviet.com
   - Dùng tối đa 3 emoji phù hợp, không spam
2. hashtags: 6–8 hashtag tiếng Việt và tiếng Anh
   - Ví dụ: #BóngBànViệt #TableTennis #CốtVợt #MặtVợt #HàNội

Trả về JSON format:
{
  "caption": "...",
  "hashtags": "#tag1 #tag2 ..."
}`;

  const response = await getClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.75,
    max_tokens: 800,
  });

  const raw = response.choices[0].message.content;
  logger.debug('OpenAI raw response', { raw });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`OpenAI trả về JSON không hợp lệ: ${raw}`);
  }

  if (!parsed.caption) {
    throw new Error('OpenAI không trả về trường "caption"');
  }

  logger.info(`AI Writer: tạo nội dung thành công cho "${topic}"`);
  return {
    caption:  (parsed.caption  || '').trim(),
    hashtags: (parsed.hashtags || '').trim(),
  };
}

module.exports = { generateContent };
