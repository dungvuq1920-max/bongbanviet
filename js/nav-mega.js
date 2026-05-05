/* ── nav-mega.js: shared mega-menu for all sub-pages ── */
(function () {
  'use strict';

  /* ─── active link detection ─── */
  var _p  = window.location.pathname;
  var _f  = _p.split('/').pop() || 'index.html';
  var _a  = {
    cot:   _f === 'cot-vot.html'           || _p.indexOf('/cot-vot/')  > -1,
    mat:   _f === 'mat-vot.html'           || _p.indexOf('/mat-vot/')  > -1,
    bong:  _f === 'bong.html',
    ban:   _f === 'ban.html',
    thi:   _f === 'do-thi-dau.html'        || _p.indexOf('/do-thi-dau/') > -1,
    combo: _f === 'combo-vot.html',
    cu:    _f === 'do-cu.html',
    kien:  _f === 'kien-thuc.html'         || _p.indexOf('/kien-thuc/') > -1,
    huong: _f === 'huong-dan-mua-hang.html',
    lienhe:_f === 'lien-he.html',
  };
  function ac(key) { return _a[key] ? ' class="active"' : ''; }

  /* ─── inject mega CSS (once) ─── */
  if (!document.getElementById('_mega_css')) {
    var _s = document.createElement('style');
    _s.id  = '_mega_css';
    _s.textContent =
      '.nav-links li{position:relative}' +
      '.nav-links .mega-item>a{display:flex;align-items:center;gap:3px}' +
      '.nav-links .mega-item>a::after{content:"▾";font-size:8px;opacity:.45;transition:transform .2s}' +
      '.nav-links .mega-item:hover>a::after{transform:rotate(180deg);opacity:.7}' +
      '.mega-panel{position:absolute;top:calc(100% + 1px);left:0;background:var(--white);border:1px solid var(--line);border-top:2px solid var(--red);box-shadow:0 20px 50px rgba(0,0,0,.1);padding:22px 24px;opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .2s,transform .2s,visibility .2s;z-index:300;pointer-events:none}' +
      '.mega-item:hover .mega-panel,.mega-item:focus-within .mega-panel{opacity:1;visibility:visible;transform:translateY(0);pointer-events:all}' +
      '.mega-brands{min-width:560px}.mega-brands.wide{min-width:680px}' +
      '.mega-gear{left:50%;transform:translateX(-50%) translateY(8px);min-width:340px}' +
      '.mega-item:hover .mega-gear,.mega-item:focus-within .mega-gear{transform:translateX(-50%) translateY(0)}' +
      '.mega-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--line)}' +
      '.mega-head-label{font-size:9px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--mid)}' +
      '.mega-head-all{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--red);transition:color .15s}' +
      '.mega-head-all:hover{color:var(--dark)}' +
      '.mega-brands-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}' +
      '.mega-brand-card{display:flex;flex-direction:column;padding:13px 11px;gap:3px;border:1px solid var(--line);transition:all .15s;text-decoration:none}' +
      '.mega-brand-card:hover{border-color:var(--dark);background:var(--dark)}' +
      '.mega-brand-name{font-family:"Playfair Display",serif;font-size:15px;font-weight:700;color:var(--dark);line-height:1.1;transition:color .15s}' +
      '.mega-brand-card:hover .mega-brand-name{color:#fff}' +
      '.mega-brand-desc{font-size:9.5px;color:var(--mid);line-height:1.35;transition:color .15s}' +
      '.mega-brand-card:hover .mega-brand-desc{color:rgba(255,255,255,.45)}' +
      '.mega-brand-arr{display:block;font-size:9px;font-weight:600;letter-spacing:.06em;color:var(--red);margin-top:5px;transition:transform .15s,color .15s}' +
      '.mega-brand-card:hover .mega-brand-arr{transform:translateX(3px);color:var(--coral)}' +
      '.mega-brand-card:hover img{filter:brightness(0) invert(1)!important;opacity:.75!important;mix-blend-mode:normal!important;}' +
      '.mega-gear-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
      '.mega-gear-card{display:flex;flex-direction:column;padding:18px 15px;gap:5px;border:1px solid var(--line);transition:all .15s;text-decoration:none}' +
      '.mega-gear-card:hover{border-color:var(--dark);background:var(--dark)}' +
      '.mega-gear-name{font-family:"Playfair Display",serif;font-size:17px;font-weight:700;color:var(--dark);line-height:1.15;transition:color .15s}' +
      '.mega-gear-card:hover .mega-gear-name{color:#fff}' +
      '.mega-gear-desc{font-size:10.5px;color:var(--mid);line-height:1.45;transition:color .15s}' +
      '.mega-gear-card:hover .mega-gear-desc{color:rgba(255,255,255,.5)}' +
      '.mega-gear-arr{display:block;font-size:9px;font-weight:600;letter-spacing:.06em;color:var(--red);margin-top:4px;transition:transform .15s,color .15s}' +
      '.mega-gear-card:hover .mega-gear-arr{transform:translateX(3px);color:var(--coral)}' +
      '.m-group{border-bottom:1px solid var(--line)}' +
      '.m-group-toggle{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dark);background:none;border:none;width:100%;cursor:pointer;font-family:"Inter",sans-serif;-webkit-tap-highlight-color:transparent;transition:background .15s}' +
      '.m-group-toggle:hover{background:var(--bg)}' +
      '.m-group-arrow{font-size:9px;opacity:.45;transition:transform .2s}' +
      '.m-group.open .m-group-arrow{transform:rotate(180deg);opacity:.7}' +
      '.m-group-links{display:none;padding:4px 0 8px;background:var(--bg);border-top:1px solid var(--line)}' +
      '.m-group.open .m-group-links{display:block}' +
      '.m-group-links a{display:flex;align-items:center;gap:8px;padding:10px 24px 10px 36px;font-size:12px;font-weight:500;color:var(--mid);transition:color .15s}' +
      '.m-group-links a::before{content:"—";font-size:8px;opacity:.4}' +
      '.m-group-links a:hover{color:var(--red)}' +
      '.m-group-view-all{color:var(--red)!important;font-weight:700!important;font-size:11px!important;letter-spacing:.06em;text-transform:uppercase;border-top:1px solid var(--line);margin-top:4px}' +
      '.m-group-view-all::before{display:none!important}' +
      '@media(max-width:960px){.mega-panel{display:none!important}}' +
      '.nav.scrolled{box-shadow:0 8px 32px rgba(0,0,0,.1)}' +
      '.nav-links a{display:block}' +
      '.nav-links .mega-item>a{display:flex!important}' +
      '.nav-links a::after{content:\'\';position:absolute;bottom:-6px;left:0;width:0;height:2px;background:var(--red);transition:width .28s}' +
      '.nav-links a.nav-cta::after{display:none!important}' +
      '.nav-links a:hover::after,.nav-links a.active::after{width:100%}';
    document.head.appendChild(_s);
  }

  /* ─── nav links HTML ─── */
  function navLinksHTML() {
    return (
      '<li class="mega-item">' +
        '<a href="/cot-vot.html"' + ac('cot') + '>Cốt Vợt</a>' +
        '<div class="mega-panel mega-brands wide">' +
          '<div class="mega-head"><span class="mega-head-label">Cốt Vợt theo thương hiệu</span><a href="/cot-vot.html" class="mega-head-all">Xem tất cả →</a></div>' +
          '<div class="mega-brands-grid" style="grid-template-columns:repeat(6,1fr)">' +
            brandCard('/cot-vot.html?brand=butterfly', 'Butterfly', 'Cao cấp, Nhật Bản') +
            brandCard('/cot-vot.html?brand=tibhar',    'Tibhar',    'Chuyên nghiệp, Đức') +
            brandCard('/cot-vot.html?brand=unrex',     'Unrex',     'Đa dạng kiểu chơi') +
            brandCard('/cot-vot.html?brand=yinhe',     'Yinhe',     'Giá tốt, hiệu quả') +
            brandCard('/cot-vot.html?brand=avx',       'AVX',       'Cốt carbon & gỗ') +
            brandCard('/cot-vot.html?brand=khac',      'Khác',      'Thương hiệu khác') +
          '</div>' +
        '</div>' +
      '</li>' +
      '<li class="mega-item">' +
        '<a href="/mat-vot.html"' + ac('mat') + '>Mặt Vợt</a>' +
        '<div class="mega-panel mega-brands wide">' +
          '<div class="mega-head"><span class="mega-head-label">Mặt Vợt theo thương hiệu</span><a href="/mat-vot.html" class="mega-head-all">Xem tất cả →</a></div>' +
          '<div class="mega-brands-grid" style="grid-template-columns:repeat(4,1fr)">' +
            brandCard('/mat-vot.html?brand=butterfly', 'Butterfly', 'Cao cấp, Nhật Bản') +
            brandCard('/mat-vot.html?brand=tibhar',    'Tibhar',    'Chuyên nghiệp, Đức') +
            brandCard('/mat-vot.html?brand=unrex',     'Unrex',     'Đa dạng kiểu chơi') +
            brandCard('/mat-vot.html?brand=yinhe',     'Yinhe',     'Giá tốt, hiệu quả') +
            brandCard('/mat-vot.html?brand=dhs',       'DHS',       'Tacky kiểu Trung Quốc') +
            brandCard('/mat-vot.html?brand=dawei',     'Dawei',     'Gai dài, gai trung') +
            brandCard('/mat-vot.html?brand=palio',     'Palio',     'Châu Âu, giá tốt') +
            brandCard('/mat-vot.html?brand=khac',      'Khác',      'Thương hiệu khác') +
          '</div>' +
        '</div>' +
      '</li>' +
      '<li><a href="/bong.html"'        + ac('bong')  + '>Bóng</a></li>' +
      '<li><a href="/ban.html"'         + ac('ban')   + '>Bàn</a></li>' +
      '<li class="mega-item">' +
        '<a href="/do-thi-dau.html"' + ac('thi') + '>Đồ Thi Đấu</a>' +
        '<div class="mega-panel mega-gear">' +
          '<div class="mega-head"><span class="mega-head-label">Đồ Thi Đấu</span><a href="/do-thi-dau.html" class="mega-head-all">Xem tất cả →</a></div>' +
          '<div class="mega-gear-grid">' +
            gearCard('/do-thi-dau.html#giay',       'Giày',                 'Giày chuyên dụng bóng bàn') +
            gearCard('/do-thi-dau.html#trang-phuc', 'Trang Phục &amp; Phụ Kiện', 'Áo, quần, băng tay, vớ…') +
          '</div>' +
        '</div>' +
      '</li>' +
      '<li><a href="/combo-vot.html"'   + ac('combo') + '>Combo</a></li>' +
      '<li><a href="/do-cu.html"'       + ac('cu')    + '>Đồ Cũ</a></li>' +
      '<li><a href="/kien-thuc.html"'   + ac('kien')  + '>Kiến Thức</a></li>' +
      '<li><a href="/huong-dan-mua-hang.html"' + ac('huong') + '>Hướng Dẫn</a></li>' +
      '<li><a href="/lien-he.html" class="nav-cta">Liên Hệ</a></li>'
    );
  }

  var _brandLogos = {
    'butterfly': '/images/brand/butterfly-logo.png',
    'tibhar':    '/images/brand/tibhar-logo-white.png',
    'yinhe':     '/images/brand/yinhe-logo.jpg',
  };

  function brandCard(href, name, desc) {
    var slug = href.split('brand=')[1] || '';
    var logoUrl = _brandLogos[slug] || '';
    var logoHtml = logoUrl
      ? '<img src="' + logoUrl + '" alt="' + name + '" style="height:18px;width:auto;max-width:80px;object-fit:contain;mix-blend-mode:multiply;opacity:.55;margin-bottom:4px;display:block;">'
      : '';
    return '<a href="' + href + '" class="mega-brand-card">' +
      logoHtml +
      '<span class="mega-brand-name">' + name + '</span>' +
      '<span class="mega-brand-desc">' + desc + '</span>' +
      '<span class="mega-brand-arr">Xem →</span>' +
    '</a>';
  }

  function gearCard(href, name, desc) {
    return '<a href="' + href + '" class="mega-gear-card">' +
      '<span class="mega-gear-name">' + name + '</span>' +
      '<span class="mega-gear-desc">' + desc + '</span>' +
      '<span class="mega-gear-arr">Xem →</span>' +
    '</a>';
  }

  /* ─── mobile nav HTML ─── */
  function mobileNavInner() {
    return (
      '<div class="mobile-nav-overlay" id="navOverlay"></div>' +
      '<div class="mobile-nav-panel">' +
        '<div class="mobile-nav-header">' +
          '<img src="/logo_bongbanviet.png" alt="Bóng Bàn Việt" style="height:44px;width:auto;">' +
          '<button class="mobile-nav-close" id="navClose">✕</button>' +
        '</div>' +
        '<div class="mobile-nav-links">' +
          mGroup('mg-cot', 'Cốt Vợt',
            '<a href="/cot-vot.html?brand=butterfly">Butterfly</a>' +
            '<a href="/cot-vot.html?brand=tibhar">Tibhar</a>' +
            '<a href="/cot-vot.html?brand=unrex">Unrex</a>' +
            '<a href="/cot-vot.html?brand=yinhe">Yinhe</a>' +
            '<a href="/cot-vot.html?brand=avx">AVX (Avalox)</a>' +
            '<a href="/cot-vot.html?brand=khac">Các Thương Hiệu Khác</a>' +
            '<a href="/cot-vot.html" class="m-group-view-all">Xem Tất Cả Cốt Vợt →</a>'
          ) +
          mGroup('mg-mat', 'Mặt Vợt',
            '<a href="/mat-vot.html?brand=butterfly">Butterfly</a>' +
            '<a href="/mat-vot.html?brand=tibhar">Tibhar</a>' +
            '<a href="/mat-vot.html?brand=unrex">Unrex</a>' +
            '<a href="/mat-vot.html?brand=yinhe">Yinhe</a>' +
            '<a href="/mat-vot.html?brand=dhs">DHS</a>' +
            '<a href="/mat-vot.html?brand=dawei">Dawei</a>' +
            '<a href="/mat-vot.html?brand=palio">Palio</a>' +
            '<a href="/mat-vot.html?brand=khac">Các Thương Hiệu Khác</a>' +
            '<a href="/mat-vot.html" class="m-group-view-all">Xem Tất Cả Mặt Vợt →</a>'
          ) +
          '<a href="/bong.html">Bóng</a>' +
          '<a href="/ban.html">Bàn</a>' +
          mGroup('mg-thi', 'Đồ Thi Đấu',
            '<a href="/do-thi-dau.html#giay">Giày</a>' +
            '<a href="/do-thi-dau.html#trang-phuc">Trang Phục &amp; Phụ Kiện</a>' +
            '<a href="/do-thi-dau.html" class="m-group-view-all">Xem Tất Cả Đồ Thi Đấu →</a>'
          ) +
          '<a href="/combo-vot.html">Combo Vợt</a>' +
          '<a href="/do-cu.html">Đồ Cũ</a>' +
          '<a href="/kien-thuc.html">Kiến Thức</a>' +
          '<a href="/huong-dan-mua-hang.html">Hướng Dẫn Mua Hàng</a>' +
          '<a href="/chinh-sach-doi-tra.html">Chính Sách Đổi Trả</a>' +
          '<a href="/lien-he.html" class="m-cta">Liên Hệ Tư Vấn</a>' +
        '</div>' +
        '<div class="mobile-nav-footer">' +
          'Hotline / Zalo: <a href="tel:0961269386">096.1269.386</a><br>' +
          '286 Nguyễn Xiển, Thanh Liệt, Hà Nội' +
        '</div>' +
      '</div>'
    );
  }

  function mGroup(id, label, links) {
    return (
      '<div class="m-group" id="' + id + '">' +
        '<button class="m-group-toggle" onclick="toggleMGroup(\'' + id + '\')">' +
          label + ' <span class="m-group-arrow">▾</span>' +
        '</button>' +
        '<div class="m-group-links">' + links + '</div>' +
      '</div>'
    );
  }

  /* ─── init ─── */
  function init() {
    var navEl = document.querySelector('nav.nav');
    if (navEl) {
      navEl.id = 'nav';
      var ul = navEl.querySelector('ul.nav-links');
      if (ul) ul.innerHTML = navLinksHTML();
      // standardise hamburger id
      var ham = navEl.querySelector('.nav-ham');
      if (ham) ham.id = 'ham';
    }

    var mnavEl = document.getElementById('mobileNav');
    if (mnavEl) {
      mnavEl.className = 'mobile-nav';
      mnavEl.innerHTML = mobileNavInner();
    }

    wireNav();
  }

  function wireNav() {
    var nav   = document.getElementById('nav');
    var ham   = document.getElementById('ham');
    var mnav  = document.getElementById('mobileNav');

    if (nav) {
      window.addEventListener('scroll', function () {
        nav.classList.toggle('scrolled', window.scrollY > 10);
      }, { passive: true });
    }

    function openNav()  {
      if (mnav) mnav.classList.add('open');
      if (ham)  ham.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeNav() {
      if (mnav) mnav.classList.remove('open');
      if (ham)  ham.classList.remove('open');
      document.body.style.overflow = '';
    }

    if (ham) {
      ham.addEventListener('click', function () {
        mnav && mnav.classList.contains('open') ? closeNav() : openNav();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });

    // overlay and close button are injected into mobileNav, listen via delegation
    if (mnav) {
      mnav.addEventListener('click', function (e) {
        if (e.target.id === 'navOverlay' || e.target.id === 'navClose' || e.target.closest('#navClose')) {
          closeNav();
        }
      });
    }
  }

  window.toggleMGroup = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
