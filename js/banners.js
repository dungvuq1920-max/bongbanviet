/**
 * banners.js — Load ảnh banner/homepage từ API settings và áp dụng lên trang
 * Include script này ở cuối <body> mỗi trang cần dùng banner.
 *
 * Cách dùng:
 *   <script src="/js/banners.js" data-banner-key="banner_cot_vot"></script>
 *
 * Hoặc gọi thủ công: applyBanner('banner_cot_vot', '#my-hero-el')
 */
(function () {
  const BASE = '';

  async function getSettings() {
    try {
      const r = await fetch(BASE + '/api/settings');
      return await r.json();
    } catch { return {}; }
  }

  function applyPageHeroBanner(imgUrl, heroEl) {
    if (!imgUrl || !heroEl) return;
    heroEl.style.backgroundImage = `url('${imgUrl}')`;
    heroEl.style.backgroundSize = 'cover';
    heroEl.style.backgroundPosition = 'center';
    heroEl.style.backgroundRepeat = 'no-repeat';
    // dim overlay nếu chưa có
    if (!heroEl.querySelector('.banner-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'banner-overlay';
      overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.45);z-index:0;pointer-events:none;';
      heroEl.style.position = 'relative';
      heroEl.insertBefore(overlay, heroEl.firstChild);
      // Đẩy nội dung lên trên overlay
      Array.from(heroEl.children).forEach(c => {
        if (c !== overlay && !c.style.position) c.style.position = 'relative';
        if (c !== overlay) c.style.zIndex = '1';
      });
    }
  }

  // ── Catalog banner pages ──────────────────────────────────────────────────
  const PAGE_BANNER_MAP = {
    'cot-vot.html':    'banner_cot_vot',
    'mat-vot.html':    'banner_mat_vot',
    'bong.html':       'banner_bong',
    'ban.html':        'banner_ban',
    'do-thi-dau.html': 'banner_do_thi_dau',
    'combo-vot.html':  'banner_combo_vot',
    'do-cu.html':      'banner_do_cu',
    'kien-thuc.html':  'banner_kien_thuc',
  };

  async function init() {
    const settings = await getSettings();

    // Detect current page
    const pageName = location.pathname.split('/').pop() || 'index.html';

    // ── Catalog pages: áp banner lên .page-hero ──────────────────────────
    const bannerKey = PAGE_BANNER_MAP[pageName];
    if (bannerKey && settings[bannerKey]) {
      const heroEl = document.querySelector('.page-hero');
      if (heroEl) applyPageHeroBanner(settings[bannerKey], heroEl);
    }

    // ── Homepage: hero right image ────────────────────────────────────────
    if (pageName === 'index.html' || pageName === '') {
      if (settings['home_hero_image']) {
        const heroR = document.querySelector('.hero-r');
        if (heroR) {
          // Thay toàn bộ nội dung bằng ảnh
          const existing = heroR.querySelector('.hero-r-img-uploaded');
          if (!existing) {
            const img = document.createElement('img');
            img.className = 'hero-r-img-uploaded';
            img.src = settings['home_hero_image'];
            img.alt = 'Sản phẩm nổi bật';
            img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;';
            // dim overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,0,0,.3) 0%,rgba(139,0,0,.15) 100%);z-index:2;pointer-events:none;';
            heroR.appendChild(img);
            heroR.appendChild(overlay);
            // Đẩy các element text lên z-index cao hơn
            heroR.querySelectorAll('.hero-r-word,.hero-center,.hero-badge,.hero-stat,.hero-brands').forEach(el => {
              el.style.zIndex = '3';
              el.style.position = 'relative';
            });
          }
        }
      }

      // ── Homepage: editorial / about image ──────────────────────────────
      if (settings['home_about_image']) {
        const editVisual = document.querySelector('.editorial-visual');
        if (editVisual) applyPageHeroBanner(settings['home_about_image'], editVisual);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
