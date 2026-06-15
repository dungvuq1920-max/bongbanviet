/**
 * ai_writer.js — Dùng OpenAI GPT để tạo caption Facebook, hashtags, CTA và image prompt.
 *
 * Nâng cấp:
 * - Hỗ trợ content pillars (kiến thức, sản phẩm, tin tức, tương tác, khuyến mãi)
 * - Tạo image_prompt mô tả ảnh phù hợp
 * - Cấu trúc bài viết chuẩn BongBanViet
 * - Hashtag strategy: brand + topic + reach
 */

const OpenAI = require('openai');
const logger = require('./logger');

const LOGO_IMAGE_SOURCE = 'logo_bongbanviet.png';
const LOGO_PROMPT_SUFFIX = `Use the BongBanViet logo image from ${LOGO_IMAGE_SOURCE} in the final design. Place it clearly but tastefully in a corner or footer; keep it readable and do not redraw, replace, distort, or invent the logo.`;

function withLogoPrompt(prompt) {
  const value = String(prompt || '').trim();
  if (!value) return '';
  return /logo_bongbanviet\.png/i.test(value) ? value : `${value}\n\nBrand asset: ${LOGO_PROMPT_SUFFIX}`;
}

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

// Prompt templates theo content pillar
const PILLAR_PROMPTS = {
  knowledge: `Viết bài chia sẻ KIẾN THỨC kỹ thuật bóng bàn.
Cấu trúc:
- Hook: Câu hỏi gây tò mò hoặc nêu vấn đề thực tế anh em phong trào hay gặp
- Body: 2-3 điểm chính, sử dụng emoji số (1️⃣ 2️⃣ 3️⃣), giải thích dễ hiểu
- Tip: "💡 LỜI KHUYÊN:" — một insight thực chiến
- CTA: Câu hỏi mở "👉 Anh em ..." để tạo tương tác
- Footer: thông tin thương hiệu`,

  product: `Viết bài REVIEW/GIỚI THIỆU sản phẩm bóng bàn.
Cấu trúc:
- Hook: Giới thiệu sản phẩm theo cách hấp dẫn, nêu điểm nổi bật
- Body: Thông số kỹ thuật, ưu điểm, phù hợp với ai
- So sánh: Nếu có, so sánh với sản phẩm cùng phân khúc
- Tip: "💡 LỜI KHUYÊN:" — gợi ý chọn sản phẩm phù hợp
- CTA: Liên hệ tư vấn hoặc xem thêm trên web`,

  news: `Viết bài TIN TỨC/SỰ KIỆN bóng bàn.
Cấu trúc:
- Hook: Headline ngắn gọn, hấp dẫn
- Body: Tóm tắt sự kiện/giải đấu, nhân vật nổi bật
- Insight: Phân tích hoặc bình luận chuyên môn
- CTA: Theo dõi page để cập nhật`,

  engagement: `Viết bài TƯƠNG TÁC (poll, quiz, hỏi đáp).
Cấu trúc:
- Hook: Câu hỏi thú vị hoặc tình huống gây tranh luận
- Options: 2-4 lựa chọn rõ ràng
- Context: Giải thích ngắn gọn từng lựa chọn
- CTA: "Comment số 1/2/3 hoặc chia sẻ ý kiến"`,

  promo: `Viết bài KHUYẾN MÃI/COMBO bóng bàn.
Cấu trúc:
- Hook: Thông báo ưu đãi hấp dẫn, tạo urgency
- Body: Chi tiết combo/sản phẩm, giá gốc vs giá ưu đãi
- Điều kiện: Thời gian, số lượng giới hạn
- CTA: Liên hệ ngay Zalo/Hotline hoặc đặt hàng trên web`,
};

/**
 * Tạo nội dung bài Facebook từ topic, brand_voice và content_pillar.
 *
 * @param {string} topic        - Chủ đề bài viết
 * @param {string} brandVoice   - Giọng văn thương hiệu (optional)
 * @param {string} contentPillar - Loại content: knowledge|product|news|engagement|promo
 * @returns {Promise<{caption: string, hashtags: string, image_prompt: string}>}
 */
async function generateContent(topic, brandVoice = '', contentPillar = 'knowledge') {
  logger.info(`AI Writer: tạo nội dung [${contentPillar}] cho: "${topic}"`);

  const brandCtx = brandVoice ? `Giọng văn thương hiệu: ${brandVoice}.` : '';
  const pillarGuide = PILLAR_PROMPTS[contentPillar] || PILLAR_PROMPTS.knowledge;

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

${pillarGuide}

Yêu cầu chi tiết:
1. caption: Nội dung bài đăng đầy đủ (120–250 từ, tiếng Việt)
   - Theo đúng cấu trúc ở trên
   - Dùng tối đa 3-4 emoji phù hợp, không spam
   - Footer luôn có:
     Bóng Bàn Việt - Đồng Hành Cùng Mọi Tay Vợt
     📌 Website: bongbanviet.com
     📞 Hotline/Zalo: 096.1269.386

2. hashtags: 6-8 hashtag (MIX tiếng Việt + tiếng Anh)
   - Luôn có: #BóngBànViệt hoặc #BongBanViet
   - 2-3 tag theo chủ đề (VD: #KỹThuậtBóngBàn #GiậtPhải)
   - 2-3 tag reach rộng (VD: #TableTennis #HàNội #ChínhHãng)

3. image_prompt: Mô tả ngắn (tiếng Anh, 1-2 câu) cho ảnh infographic phù hợp bài viết.
   - Phong cách: Modern, professional, table tennis themed
   - Phù hợp đăng Facebook (vuông hoặc ngang)
   - Bắt buộc dùng logo file "${LOGO_IMAGE_SOURCE}" trong ảnh cuối; logo rõ nhưng tinh tế, không vẽ lại hoặc làm méo

Trả về JSON format:
{
  "caption": "...",
  "hashtags": "#tag1 #tag2 ...",
  "image_prompt": "..."
}`;

  const response = await getClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.75,
    max_tokens: 1200,
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
    caption:      (parsed.caption      || '').trim(),
    hashtags:     (parsed.hashtags     || '').trim(),
    image_prompt: withLogoPrompt(parsed.image_prompt || ''),
  };
}

module.exports = { generateContent };
