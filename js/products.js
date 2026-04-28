/* ─── BongBanViet — Dynamic Product Loader ────────────────────────────────
   Dùng chung cho tất cả trang danh mục.
   Gọi: loadProdGrid(params, options) sau khi DOM ready.
────────────────────────────────────────────────────────────────────────── */

const BBV_BRANDS = {
  butterfly: 'Butterfly', tibhar: 'Tibhar',
  unrex: 'Unrex', yinhe: 'Yinhe', khac: 'Các Hãng Khác',
};
const BBV_CATS = {
  'cot-vot': 'Cốt Vợt', 'mat-vot': 'Mặt Vợt', 'bong': 'Bóng',
  'ban': 'Bàn', 'do-thi-dau': 'Đồ Thi Đấu', 'combo-vot': 'Combo Vợt',
  'do-cu': 'Đồ Cũ', 'kien-thuc': 'Kiến Thức',
};
const BG_CLASSES = ['pb-1','pb-2','pb-3','pb-4','pb-5','pb-6','pb-7','pb-8'];

function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _abbr(name) {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return _esc(name);
  const mid = Math.ceil(words.length / 2);
  return _esc(words.slice(0, mid).join(' ')) + '<br>' + _esc(words.slice(mid).join(' '));
}

function _shortDesc(p) {
  if (p.specs && typeof p.specs === 'object') {
    const entries = Object.entries(p.specs);
    if (entries.length >= 2) {
      return _esc(entries.slice(0,2).map(([k,v])=> k+': '+v).join(' · '));
    }
    if (entries.length === 1) return _esc(entries[0][0]+': '+entries[0][1]);
  }
  const desc = (p.description||'').replace(/<[^>]+>/g,'').trim();
  return _esc(desc.slice(0, 72) + (desc.length > 72 ? '…' : ''));
}

function _fmtPrice(raw) {
  if (!raw) return '';
  var str = String(raw).trim();
  var m = str.match(/^(từ\s+)?(\d[\d.]*)(đ)?$/i);
  if (m) {
    var num = parseInt(m[2].replace(/\./g, ''), 10);
    if (!isNaN(num)) return (m[1] || '') + num.toLocaleString('vi-VN') + (m[3] || '');
  }
  return str;
}

/* Render một thẻ sản phẩm */
function renderProdCard(p, idx, opts) {
  opts = opts || {};
  const bg       = BG_CLASSES[idx % BG_CLASSES.length];
  const brand    = BBV_BRANDS[p.brand_slug] || '';
  const catLabel = BBV_CATS[p.category_slug] || '';
  const href     = 'san-pham.html?id=' + _esc(p.slug);

  const imgHtml = (p.images && p.images.length)
    ? `<img src="${_esc(p.images[0])}" alt="${_esc(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div class="prod-wm">${_abbr(p.name)}</div>`;

  const rawPrice = String(p.price || '');
  const numericPrice = rawPrice.replace(/[^\d]/g, '');
  const variants = Array.isArray(p.variants) ? p.variants.filter(v => v && (v.name || v.price)) : [];
  let priceText = '';
  if (rawPrice) {
    priceText = rawPrice;
  } else if (variants.length) {
    const fp = (variants.find(v => v.price) || {}).price || '';
    if (fp) priceText = 'từ ' + fp;
  }

  /* Sub-category tag (left) + badge pill (right) */
  const subTagHtml = p.gear_subcategory
    ? `<span class="prod-sub-tag">${_esc(p.gear_subcategory.toUpperCase())}</span>`
    : `<span></span>`;
  const badgeTagHtml = p.badge
    ? `<span class="prod-badge-tag">${_esc(p.badge)}</span>`
    : `<span></span>`;
  const brandFootHtml = (brand && p.brand_slug && p.brand_slug !== 'khac')
    ? `<span class="prod-origin">${_esc(brand.toUpperCase())}</span>`
    : (catLabel ? `<span class="prod-origin">${_esc(catLabel.toUpperCase())}</span>` : `<span class="prod-origin">Chính hãng</span>`);

  return `<a href="${href}" class="prod-card" data-brand="${_esc(p.brand_slug||'')}" data-cat="${_esc(p.category_slug)}" data-name="${_esc(p.name.toLowerCase())}" data-price="${numericPrice}">
  <div class="prod-img ${bg}">
    <div class="prod-img-inner">${imgHtml}</div>
  </div>
  <div class="prod-card-body">
    <div class="prod-card-tags">${subTagHtml}${badgeTagHtml}</div>
    <h3 class="prod-name">${_esc(p.name)}</h3>
    <div class="prod-card-footer">
      ${brandFootHtml}
      <span class="prod-price-inline">${_esc(_fmtPrice(priceText))}</span>
    </div>
  </div>
</a>`;
}

/* Render combo card */
function renderComboCard(c, idx) {
  const bg = BG_CLASSES[idx % BG_CLASSES.length];
  const href = 'san-pham.html?id=' + _esc(c.slug);
  const levelMap = { 'beginner':'Mới Bắt Đầu','intermediate':'Trung Cấp','advanced':'Nâng Cao','pro':'Chuyên Nghiệp' };
  const levelLabel = levelMap[c.level] || _esc(c.level);

  const imgHtml = (c.images && c.images.length)
    ? `<img src="${_esc(c.images[0])}" alt="${_esc(c.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div class="prod-wm">${_abbr(c.name)}</div>`;

  const badgeHtml = c.badge ? `<span class="prod-badge">${_esc(c.badge)}</span>` : '';
  const stockHtml = c.in_stock === false
    ? `<span style="font-size:10px;color:#D62B2B;font-weight:700;letter-spacing:.08em;text-transform:uppercase;display:block;margin-top:5px;">● Hết Hàng</span>`
    : `<span style="font-size:10px;color:#166534;font-weight:700;letter-spacing:.08em;text-transform:uppercase;display:block;margin-top:5px;">● Còn Hàng</span>`;

  return `<a href="${href}" class="prod-card" data-level="${_esc(c.level)}" data-name="${_esc(c.name.toLowerCase())}">
  <div class="prod-img ${bg}">
    <div class="prod-img-inner">${imgHtml}</div>
    ${badgeHtml}
  </div>
  <p class="prod-brand">Combo · ${_esc(levelLabel)}</p>
  <h3 class="prod-name">${_esc(c.name)}</h3>
  ${stockHtml}
</a>`;
}

/*
  loadProdGrid(params, options)
  params: URLSearchParams object hoặc plain object { category:'cot-vot', brand:'tibhar', ... }
  options: {
    gridId: 'prodGrid',          // id của <div class="prod-grid">
    countId: 'prodCount',        // id của element hiển thị số lượng
    showCat: false,              // true = hiển thị "Brand · Category"
    isCombo: false,              // true = dùng combo endpoint
    onDone: (products) => {}     // callback sau khi render xong
  }
*/
async function loadProdGrid(params, options) {
  options = options || {};
  const gridId   = options.gridId   || 'prodGrid';
  const countId  = options.countId  || 'prodCount';
  const showCat  = options.showCat  || false;
  const isCombo  = options.isCombo  || false;

  const grid     = document.getElementById(gridId);
  const countEl  = document.getElementById(countId);
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column:1/-1;padding:48px;text-align:center;color:#6B6B6B;font-size:14px;">Đang tải sản phẩm...</div>';

  try {
    const qs = new URLSearchParams(params);
    qs.set('limit', qs.get('limit') || '200');
    const endpoint = isCombo ? '/api/combos' : '/api/products';
    const res  = await fetch(endpoint + '?' + qs.toString());
    if (!res.ok) throw new Error('Server error ' + res.status);
    const data = await res.json();

    if (!data.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:48px;text-align:center;color:#6B6B6B;font-size:14px;">Chưa có sản phẩm nào.</div>';
      if (countEl) countEl.textContent = '0 sản phẩm';
      return;
    }

    grid.innerHTML = data.map((p, i) =>
      isCombo ? renderComboCard(p, i) : renderProdCard(p, i, { showCat })
    ).join('');

    if (countEl) countEl.textContent = data.length + ' sản phẩm';
    if (options.onDone) options.onDone(data);
  } catch (e) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:48px;text-align:center;color:#D62B2B;font-size:14px;">Không kết nối được server.<br><small style="color:#999">${e.message}</small></div>`;
  }
}
