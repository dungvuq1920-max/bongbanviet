// Chạy: node scripts/export-seed.js
// Xuất toàn bộ dữ liệu local DB ra db-seed.json để deploy lên Railway

const db = require('../db');
const fs = require('fs');
const path = require('path');

const seed = {
  categories: db.prepare('SELECT * FROM categories ORDER BY sort_order').all(),
  brands: db.prepare('SELECT * FROM brands ORDER BY sort_order').all(),
  products: db.prepare('SELECT * FROM products ORDER BY sort_order, created_at').all(),
  combos: db.prepare('SELECT * FROM combos ORDER BY sort_order').all(),
  articles: db.prepare('SELECT * FROM articles ORDER BY published_at DESC').all(),
  settings: db.prepare("SELECT * FROM settings WHERE key != 'lichtap_data'").all(),
};

const out = path.join(__dirname, '..', 'db-seed.json');
fs.writeFileSync(out, JSON.stringify(seed, null, 2), 'utf8');

console.log('✅ Exported db-seed.json:');
console.log(`   categories : ${seed.categories.length}`);
console.log(`   brands     : ${seed.brands.length}`);
console.log(`   products   : ${seed.products.length}`);
console.log(`   combos     : ${seed.combos.length}`);
console.log(`   articles   : ${seed.articles.length}`);
console.log(`   settings   : ${seed.settings.length}`);
