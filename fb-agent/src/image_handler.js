/**
 * image_handler.js — Xử lý ảnh cho bài đăng Facebook.
 *
 * Chức năng:
 * 1. Tạo prompt mô tả ảnh infographic để dùng với AI generate
 * 2. Tìm ảnh sản phẩm phù hợp từ thư mục images/
 * 3. Hỗ trợ upload ảnh qua URL hoặc local path
 */

const fs     = require('fs');
const path   = require('path');
const logger = require('./logger');
const { CONTENT_PILLARS } = require('./researcher');

// Thư mục chứa ảnh sản phẩm
const IMAGES_DIR = path.join(__dirname, '..', '..', 'images');

// Template infographic theo content pillar
const INFOGRAPHIC_TEMPLATES = {
  knowledge: {
    style: 'modern educational infographic',
    colors: 'dark navy blue gradient background with red (#EF4444) accent highlights',
    layout: 'clean layout with numbered points, icons, and a table tennis visual element',
    branding: 'BongBanViet logo watermark, website bongbanviet.com at bottom',
  },
  product: {
    style: 'premium product showcase',
    colors: 'clean white background with subtle gray gradients and red accent borders',
    layout: 'product image centered, specs on the sides, price badge, brand logo',
    branding: 'BongBanViet logo, "Chính Hãng 100%" badge',
  },
  news: {
    style: 'sports news banner',
    colors: 'dynamic dark background with energetic red and white text',
    layout: 'breaking news style header, event photo, key details highlighted',
    branding: 'BongBanViet news banner header',
  },
  engagement: {
    style: 'social media poll/quiz card',
    colors: 'vibrant gradient from navy to deep red, white text',
    layout: 'large question text centered, 2-4 option boxes below, emoji icons',
    branding: 'BongBanViet watermark, engagement-focused design',
  },
  promo: {
    style: 'promotional sale banner',
    colors: 'bold red (#EF4444) primary with gold/yellow accents for urgency',
    layout: 'big discount percentage, product combo images, price comparison, CTA button',
    branding: 'BongBanViet logo prominent, Hotline/Zalo info, website URL',
  },
};

/**
 * Tạo prompt để generate ảnh infographic bằng AI.
 *
 * @param {string} topic    - Chủ đề bài viết
 * @param {string} caption  - Caption đã tạo (để trích key points)
 * @param {string} pillar   - Content pillar
 * @returns {string} prompt cho AI image generation
 */
function generateImagePrompt(topic, caption = '', pillar = 'knowledge') {
  const template = INFOGRAPHIC_TEMPLATES[pillar] || INFOGRAPHIC_TEMPLATES.knowledge;

  // Trích 3 điểm chính từ caption (nếu có)
  let keyPoints = '';
  if (caption) {
    const lines = caption.split('\n').filter(l => l.trim().length > 0);
    const bulletPoints = lines
      .filter(l => /^[\d️⃣✅❌🎯💡⚡🛡️•\-\*]/.test(l.trim()) || /^\d+[\.\)]/.test(l.trim()))
      .slice(0, 3)
      .map(l => l.replace(/^[\d️⃣✅❌🎯💡⚡🛡️•\-\*\.\)]+\s*/, '').trim())
      .filter(l => l.length > 5);

    if (bulletPoints.length > 0) {
      keyPoints = `\nKey points to display as text overlays: ${bulletPoints.join('; ')}`;
    }
  }

  const prompt = `Create a professional ${template.style} for table tennis (ping pong) content.

Topic: "${topic}"
${keyPoints}

Design specifications:
- Style: ${template.style}
- Colors: ${template.colors}
- Layout: ${template.layout}
- Branding: ${template.branding}
- Dimensions: 1080x1080 pixels (square format for Facebook)
- Typography: Bold Vietnamese-friendly sans-serif font
- Include table tennis visual elements (racket, ball, table)
- Professional, modern, and eye-catching design
- NO placeholder text - all text should be in Vietnamese related to the topic
- The design should look like it was made by a professional graphic designer`;

  return prompt;
}

/**
 * Tìm ảnh sản phẩm phù hợp từ thư mục images/.
 *
 * @param {string} topic - Chủ đề bài viết
 * @returns {string|null} - Đường dẫn ảnh tìm được, hoặc null
 */
function findMatchingImage(topic) {
  if (!fs.existsSync(IMAGES_DIR)) {
    logger.debug(`Thư mục ảnh không tồn tại: ${IMAGES_DIR}`);
    return null;
  }

  const topicLower = topic.toLowerCase();

  // Keywords để match
  const brandKeywords = [
    'butterfly', 'dhs', 'stiga', 'yasaka', 'victas', 'xiom',
    'tibhar', 'donic', 'andro', 'nittaku', 'joola',
  ];
  const productKeywords = [
    'viscaria', 'timo boll', 'zhang jike', 'innerforce', 'clipper',
    'hurricane', 'tenergy', 'dignics', 'rakza', 'vega',
  ];

  // Tìm trong thư mục images (đệ quy 1 level)
  const allFiles = [];
  try {
    const entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
        allFiles.push(path.join(IMAGES_DIR, entry.name));
      } else if (entry.isDirectory()) {
        // Đệ quy 1 level
        const subDir = path.join(IMAGES_DIR, entry.name);
        const subEntries = fs.readdirSync(subDir);
        for (const sub of subEntries) {
          if (/\.(jpg|jpeg|png|webp)$/i.test(sub)) {
            allFiles.push(path.join(subDir, sub));
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`Lỗi đọc thư mục ảnh: ${err.message}`);
    return null;
  }

  if (allFiles.length === 0) return null;

  // Scoring: ảnh nào match nhiều keyword nhất
  let bestMatch = null;
  let bestScore = 0;

  for (const filePath of allFiles) {
    const fileName = path.basename(filePath).toLowerCase();
    let score = 0;

    for (const keyword of [...brandKeywords, ...productKeywords]) {
      if (topicLower.includes(keyword) && fileName.includes(keyword)) {
        score += 2;
      }
    }

    // Partial match: từng từ trong topic
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);
    for (const word of topicWords) {
      if (fileName.includes(word)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = filePath;
    }
  }

  if (bestMatch) {
    logger.info(`Tìm thấy ảnh phù hợp: ${path.basename(bestMatch)} (score: ${bestScore})`);
  }

  return bestMatch;
}

/**
 * Xử lý ảnh cho một bài viết: tìm ảnh có sẵn hoặc tạo prompt AI.
 *
 * @param {object} post - Post object từ CSV
 * @returns {{image_path: string, image_prompt: string}}
 */
function processImage(post) {
  const { topic, caption, content_pillar } = post;
  const pillar = content_pillar || 'knowledge';

  // Bước 1: Thử tìm ảnh có sẵn
  const existingImage = findMatchingImage(topic);
  if (existingImage) {
    return {
      image_path: existingImage,
      image_prompt: '',
    };
  }

  // Bước 2: Tạo prompt để AI generate ảnh
  const prompt = generateImagePrompt(topic, caption, pillar);
  return {
    image_path: '',
    image_prompt: prompt,
  };
}

module.exports = {
  generateImagePrompt,
  findMatchingImage,
  processImage,
  INFOGRAPHIC_TEMPLATES,
};
