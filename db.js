const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'bongbanviet.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    image TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS brands (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    logo TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_slug TEXT NOT NULL,
    brand_slug TEXT,
    gear_subcategory TEXT,
    description TEXT,
    specs TEXT DEFAULT '{}',
    images TEXT DEFAULT '[]',
    featured INTEGER DEFAULT 0,
    condition TEXT DEFAULT 'new',
    badge TEXT,
    sort_order INTEGER DEFAULT 0,
    price TEXT DEFAULT '',
    in_stock INTEGER DEFAULT 1,
    variants TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_slug) REFERENCES categories(slug)
  );

  CREATE TABLE IF NOT EXISTS combos (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    blade TEXT,
    rubber_fh TEXT,
    rubber_bh TEXT,
    description TEXT,
    images TEXT DEFAULT '[]',
    badge TEXT,
    sort_order INTEGER DEFAULT 0,
    price TEXT DEFAULT '',
    in_stock INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT,
    cover_image TEXT,
    category TEXT DEFAULT 'kien-thuc',
    tags TEXT DEFAULT '[]',
    published_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tracked_coins (
    address TEXT PRIMARY KEY,
    symbol TEXT,
    name TEXT,
    pair_address TEXT,
    base_price REAL DEFAULT 0,
    base_liq REAL DEFAULT 0,
    last_price REAL DEFAULT 0,
    last_status TEXT DEFAULT 'watch',
    alerted_at TEXT,
    alert_st TEXT,
    paused INTEGER DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations: add columns if not yet present (must run BEFORE seed)
[
  "ALTER TABLE products ADD COLUMN price TEXT DEFAULT ''",
  "ALTER TABLE products ADD COLUMN in_stock INTEGER DEFAULT 1",
  "ALTER TABLE products ADD COLUMN variants TEXT DEFAULT '[]'",
  "ALTER TABLE combos ADD COLUMN price TEXT DEFAULT ''",
  "ALTER TABLE combos ADD COLUMN in_stock INTEGER DEFAULT 1",
].forEach(sql => { try { db.exec(sql); } catch {} });

// Migration G1: Group A products (46 SP — Yinhe/DHS/Tibhar/Unrex additions 2026-05)
{
  const insB = db.prepare(`INSERT OR IGNORE INTO brands (slug,label,logo,sort_order) VALUES (?,?,?,?)`);
  insB.run('dhs','DHS','',5);
  try { db.exec("UPDATE brands SET sort_order=6 WHERE slug='khac'"); } catch {}

  const insP = db.prepare(`
    INSERT OR IGNORE INTO products
    (slug,name,category_slug,brand_slug,description,specs,images,
     featured,condition,badge,sort_order,price,in_stock,variants,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`);
  [
    ["anti-ellen","Tibhar Anti Ellen","mat-vot","tibhar","- Tibhar Anti Ellen là mặt vợt anti-spin (chống xoáy) của Tibhar — loại mặt vợt chiến thuật bậc nhất trong phòng thủ.\n\n- Topsheet anti-spin trung hòa xoáy từ đối thủ — bóng loop mạnh, serve xoáy sẽ bị \"vô hiệu hóa\" và trả về ít xoáy hoặc không xoáy. Tạo sự bối rối cực lớn cho đối thủ không quen.\n\n- Phiên bản Off thiên về phản công, Def thiên về phòng thủ thuần túy và kiểm soát.\n\n- Dùng kết hợp với mặt vợt thường ở bên kia — tổ hợp chiến thuật cực hiệu quả trong thi đấu.","{\"- Tốc độ\":\"60\",\"- Kiểm soát\":\"88\",\"- Loại mặt\":\"Anti-spin\",\"- Kiểu chơi\":\"Phòng thủ chiến lược\"}","[]",0,"new","Anti-Spin",0,"750.000 đ",1,"[{\"name\":\"Off\",\"price\":\"750000\"},{\"name\":\"Def\",\"price\":\"750000\"}]"],
    ["crazy-bull","Tibhar Crazy Bull","mat-vot","tibhar","- Tibhar Crazy Bull là phiên bản cơ bản của dòng Crazy Bull tacky — điểm khởi đầu để thử mặt vợt dính của Tibhar.\n\n- Sponge mềm hơn PRO/VIP, dễ tiếp cận hơn cho người mới chuyển sang tacky. Giá thành tốt để trải nghiệm phong cách Trung Quốc với thương hiệu Đức.\n\n- Phù hợp cho người chơi tầm trung muốn thử mặt vợt tacky mà không muốn chi nhiều.","{\"- Tốc độ\":\"80\",\"- Độ xoáy\":\"85\",\"- Công nghệ\":\"Tacky topsheet\",\"- Loại mặt\":\"Gai ngược tacky\",\"- Xuất xứ\":\"Đức\"}","[]",0,"new","Tacky",0,"600.000 đ",1,"[]"],
    ["crazy-bull-pro-vip","Tibhar Crazy Bull PRO/VIP","mat-vot","tibhar","- Tibhar Crazy Bull PRO/VIP là mặt vợt tacky (dính) hiếm có của Tibhar — hãng châu Âu làm rubber theo phong cách Trung Quốc.\n\n- Topsheet dính tạo xoáy mạnh theo kiểu H3/DHS nhưng với chất lượng kiểm soát sản xuất Đức. PRO có sponge cứng hơn cho tốc độ, VIP thiên về kiểm soát hơn.\n\n- Lựa chọn thú vị cho người chơi muốn thử mặt vợt tacky nhưng tin tưởng chất lượng thương hiệu Tibhar.","{\"- Tốc độ\":\"84\",\"- Độ xoáy\":\"88\",\"- Công nghệ\":\"Tacky topsheet\",\"- Loại mặt\":\"Gai ngược tacky\",\"- Xuất xứ\":\"Đức\"}","[]",0,"new","Tacky",0,"795.000 đ",1,"[{\"name\":\"PRO\",\"price\":\"795000\"},{\"name\":\"VIP\",\"price\":\"795000\"}]"],
    ["dhs-h3-hang-cho","DHS H3 Hàng Chợ","mat-vot","dhs","- DHS Hurricane 3 (H3) Hàng Chợ là phiên bản phổ thông của mặt vợt huyền thoại Trung Quốc — loại mặt vợt được sử dụng nhiều nhất trong lịch sử bóng bàn thế giới.\n\n- Topsheet dính (tacky) tạo xoáy mạnh trên serve và loop, sponge mềm ~37–39° dễ tiếp cận cho người mới bắt đầu chơi theo phong cách Trung Quốc. Giá thành rất tốt để trải nghiệm \"gốc\" của H3.\n\n- Phiên bản NEO có xử lý primer vô cơ (inorganic), tương thích tiêu chuẩn ITTF và phản ứng tốt hơn khi người dùng tự bơm booster sau.\n\n- Lưu ý: Hàng chợ là loại thương mại thông thường — đây là điểm khởi đầu tốt trước khi nâng lên tuyển tỉnh hay quốc gia.","{\"- Tốc độ\":\"80\",\"- Độ xoáy\":\"88\",\"- Kiểm soát\":\"82\",\"- Loại mặt\":\"Gai ngược tacky (dính)\",\"- Độ cứng\":\"~37–39° (DHS)\",\"- Công nghệ NEO\":\"Xử lý primer vô cơ, phù hợp ITTF\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","DHS H3",0,"460.000 đ",1,"[{\"name\":\"Thường\",\"price\":\"460000\"},{\"name\":\"NEO\",\"price\":\"530000\"}]"],
    ["dhs-h3-quoc-gia","DHS H3 Quốc Gia","mat-vot","dhs","- DHS H3 Quốc Gia (National) là đỉnh cao của dòng H3 — mặt vợt chính thức của Đội tuyển Quốc gia Trung Quốc, đã chinh phục mọi danh hiệu World Championship và Olympic.\n\n- Sponge cứng nhất ~40–41° (DHS), topsheet dính siêu mạnh — tạo xoáy chết người và bóng chìm cực nhanh. Khi kết hợp booster, đây là tổ hợp vũ khí mạnh nhất trong bóng bàn hiện đại. Lót xanh cứng và crispy nhất — đây là loại Ma Long, Fan Zhendong dùng. Lót cam mềm hơn, hấp thu booster tốt hơn cho người không quen với sponge quá cứng.\n\n- Phiên bản NEO (inorganic) là lựa chọn bắt buộc cho thi đấu ITTF, phản ứng tốt nhất với keo vô cơ.\n\n- Lưu ý: H3 Quốc Gia đòi hỏi kỹ thuật tốt để kiểm soát. Đây là mặt vợt dành cho vận động viên đã có nền tảng vững chắc, không phải cho người mới bắt đầu.","{\"- Tốc độ\":\"84\",\"- Độ xoáy\":\"92\",\"- Kiểm soát\":\"78\",\"- Loại mặt\":\"Gai ngược tacky (dính)\",\"- Độ cứng\":\"~40–41° (DHS)\",\"- Lót cam\":\"Mềm hơn, phù hợp booster nhiều lớp\",\"- Lót xanh\":\"Cứng nhất, chuẩn quốc gia TQ\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","DHS H3 National",0,"1.230.000 đ",1,"[{\"name\":\"Thường Lót Cam\",\"price\":\"1230000\"},{\"name\":\"Thường Lót Xanh\",\"price\":\"1360000\"},{\"name\":\"NEO Lót Cam\",\"price\":\"1550000\"},{\"name\":\"NEO Lót Xanh\",\"price\":\"1670000\"}]"],
    ["dhs-h3-tuyen-tinh","DHS H3 Tuyển Tỉnh","mat-vot","dhs","- DHS H3 Tuyển Tỉnh (Provincial) là cấp độ chất lượng cao hơn hàng chợ, được dùng bởi các vận động viên cấp tỉnh của Trung Quốc.\n\n- Sponge cứng hơn ~39–40° (DHS), topsheet dính mạnh hơn — tạo xoáy dày và nặng hơn đáng kể. Lót cam (orange sponge) mềm hơn, hấp thu booster tốt, phù hợp để \"bơm\" tăng hiệu suất. Lót xanh (blue sponge) cứng hơn, crispy hơn, tốc độ cao hơn và phù hợp cho thi đấu trực tiếp.\n\n- Phiên bản NEO có xử lý inorganic primer — bắt buộc cho thi đấu ITTF, phản ứng tốt hơn với keo booster sau bơm.\n\n- Đây là bước tiến rõ rệt so với hàng chợ về chất lượng, phù hợp cho người chơi nghiêm túc muốn chơi theo phong cách Trung Quốc đúng nghĩa.","{\"- Tốc độ\":\"82\",\"- Độ xoáy\":\"90\",\"- Kiểm soát\":\"80\",\"- Loại mặt\":\"Gai ngược tacky (dính)\",\"- Độ cứng\":\"~39–40° (DHS)\",\"- Lót cam\":\"Mềm hơn, dễ bơm booster\",\"- Lót xanh\":\"Cứng hơn, crispy, cho thi đấu\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","DHS H3 Provincial",0,"800.000 đ",1,"[{\"name\":\"Thường Lót Cam\",\"price\":\"800000\"},{\"name\":\"Thường Lót Xanh\",\"price\":\"960000\"},{\"name\":\"NEO Lót Cam\",\"price\":\"880000\"},{\"name\":\"NEO Lót Xanh\",\"price\":\"1100000\"}]"],
    ["evolution-mx-p-50","Evolution MX-P 50","mat-vot","tibhar","- Tibhar Evolution MX-P 50 là phiên bản sponge cứng hơn của Evolution MX-P nổi tiếng, dành cho người chơi muốn thêm tốc độ và xoáy trên lối chơi tấn công mạnh.\n\n- Sponge 50° cứng hơn MX-P thường (47.5°) — tạo cảm giác crispy hơn, tốc độ bóng rời mặt vợt cao hơn. Phù hợp cho forehand loop tốc độ cao và tấn công bùng nổ.\n\n- Lý tưởng cho vận động viên đã quen với MX-P và muốn nâng cấp lên mức độ cứng và nhanh hơn một bậc.","{\"- Tốc độ\":\"92\",\"- Độ xoáy\":\"90\",\"- Công nghệ\":\"Tăng lực + ITTF Approved\",\"- Loại mặt\":\"Mặt gai ngược\",\"- Độ cứng\":\"50° (cứng hơn MX-P thường)\"}","[]",0,"new",null,0,"1.150.000 đ",1,"[]"],
    ["fortino-performance","FORTINO PERFORMANCE/FORCE","cot-vot","tibhar","- Tibhar Fortino Performance và Force là hai phiên bản tầm trung trong dòng Fortino — cân bằng giữa tốc độ và kiểm soát.\n\n- Fortino Performance thiên về tốc độ và tấn công bùng nổ, Fortino Force cân bằng hơn với kiểm soát tốt hơn. Cả hai đều dùng carbon cho lực tấn công.\n\n- Phù hợp cho người chơi muốn nâng cấp lên cốt carbon mà không cần tới mức Fortino Pro.","{\"- Loại\":\"Gỗ + Carbon\",\"- Kiểu chơi\":\"ALL+/OFF-\",\"- Xuất xứ\":\"Đức\"}","[]",0,"new",null,0,"2.250.000 đ",1,"[{\"name\":\"Performance\",\"price\":\"2250000\"},{\"name\":\"Force\",\"price\":\"2250000\"}]"],
    ["fortino-pro","FORTINO PRO","cot-vot","tibhar","- Tibhar Fortino Pro là cốt vợt cao cấp nhất trong dòng Fortino — thiết kế cho lối chơi tấn công toàn diện với carbon.\n\n- Kết hợp gỗ ngoại cao cấp với lớp carbon bên trong, Fortino Pro cho tốc độ xuất sắc khi tấn công xa bàn đồng thời vẫn cho cảm giác bóng tốt ở cự ly gần. Cán vợt to, phù hợp bàn tay lớn.\n\n- Dành cho vận động viên chuyên nghiệp muốn cốt vợt tấn công toàn năng với thương hiệu Đức uy tín.","{\"- Loại\":\"Carbon (Arylate Carbon)\",\"- Lớp\":\"5 lớp gỗ + 2 lớp carbon\",\"- Kiểu chơi\":\"ALL+/OFF\",\"- Xuất xứ\":\"Đức\"}","[]",0,"new","Hàng Cao Cấp",0,"4.600.000 đ",1,"[]"],
    ["grass-dtecs","Tibhar Grass Dtecs","mat-vot","tibhar","- Tibhar Grass Dtecs là phiên bản Grass tích hợp công nghệ DTECS — cải thiện tính nhất quán và độ ổn định của hiệu ứng gai dài.\n\n- DTECS xử lý bề mặt gai giúp tăng ma sát kiểm soát, cú chop đều hơn và ổn định hơn so với Grass thường. Hiệu ứng phản xoáy được tối ưu hóa.\n\n- Lựa chọn Grass nâng cấp cho người chơi đã quen với Grass thường và muốn thêm độ ổn định.","{\"- Tốc độ\":\"65\",\"- Kiểm soát\":\"86\",\"- Công nghệ\":\"DTECS\",\"- Loại mặt\":\"Gai dài\",\"- Kiểu chơi\":\"Cắt bóng phòng thủ\"}","[]",0,"new","Gai Dài Dtecs",0,"1.060.000 đ",1,"[]"],
    ["grass-dtecs-gs","Tibhar Grass Dtecs GS","mat-vot","tibhar","- Tibhar Grass Dtecs GS (Gold Sponge) là phiên bản cao cấp nhất của dòng Grass, kết hợp DTECS với sponge gold đặc biệt.\n\n- Sponge gold có công thức đặc biệt mang lại cảm giác bóng tốt hơn, kiểm soát chi tiết hơn trong cú chop dài. Thêm một chút tốc độ so với Grass Dtecs thường.\n\n- Dành cho vận động viên phòng thủ gai dài đẳng cấp cao muốn mặt vợt tốt nhất trong dòng Grass của Tibhar.","{\"- Tốc độ\":\"68\",\"- Kiểm soát\":\"84\",\"- Công nghệ\":\"DTECS + Gold Sponge\",\"- Loại mặt\":\"Gai dài cao cấp\",\"- Kiểu chơi\":\"Cắt bóng phòng thủ\"}","[]",0,"new","Gai Dài Gold",0,"1.090.000 đ",1,"[]"],
    ["grass-flex","Tibhar Grass Flex","mat-vot","tibhar","- Tibhar Grass Flex là mặt vợt gai trung độ linh hoạt cao của Tibhar, thiết kế để cân bằng giữa phòng thủ và phản công.\n\n- Gai trung Flex uyển chuyển hơn gai dài — phù hợp cho lối chơi phòng thủ gần bàn với khả năng chuyển sang phản công nhanh. Ít \"rủi ro\" hơn gai dài cho người mới tập dùng gai.\n\n- Lựa chọn tốt cho người chơi phòng thủ muốn gai linh hoạt, dễ kiểm soát hơn gai dài thuần túy.","{\"- Tốc độ\":\"72\",\"- Kiểm soát\":\"86\",\"- Công nghệ\":\"Flex gai trung\",\"- Loại mặt\":\"Gai trung\",\"- Kiểu chơi\":\"Phòng thủ linh hoạt\"}","[]",0,"new","Gai Trung",0,"1.090.000 đ",1,"[]"],
    ["jorgic-7","JORGIC 7","cot-vot","tibhar","- Tibhar Jorgic 7 là cốt vợt gỗ thuần 7 lớp chữ ký Darko Jorgic — cho cảm giác bóng tự nhiên và kiểm soát xuất sắc.\n\n- 7 lớp gỗ tự nhiên mang lại dwell time dài, phù hợp cho loop xoáy nặng và đánh cú ngắn chính xác. Tốc độ vừa phải nhưng kiểm soát cực tốt — dễ chơi hơn cốt carbon.\n\n- Lý tưởng cho người chơi muốn cốt vợt all-round gỗ cao cấp với thương hiệu Tibhar.","{\"- Loại\":\"Gỗ thuần (7 lớp)\",\"- Kiểu chơi\":\"ALL+/OFF-\",\"- Xuất xứ\":\"Đức\"}","[]",0,"new",null,0,"1.850.000 đ",1,"[]"],
    ["jorgic-carbon","JORGIC CARBON","cot-vot","tibhar","- Tibhar Jorgic Carbon là cốt vợt chữ ký của tay vợt người Slovenia Darko Jorgic — một trong những tài năng trẻ xuất sắc nhất thế giới.\n\n- Carbon cứng vừa phải, cho tốc độ tốt khi tấn công xa bàn và kiểm soát ổn định ở gần bàn. Phù hợp với lối chơi hai tay tấn công linh hoạt đặc trưng của Jorgic.\n\n- Lựa chọn tốt cho vận động viên tấn công cần cốt carbon tốc độ trong tầm giá hợp lý.","{\"- Loại\":\"Carbon\",\"- Kiểu chơi\":\"OFF\",\"- Xuất xứ\":\"Đức\"}","[]",0,"new",null,0,"3.300.000 đ",1,"[]"],
    ["liberty-basic","Liberty Basic","cot-vot","unrex","- Unrex Liberty Basic là cốt vợt gỗ thuần giá rẻ nhất trong dòng Liberty của Unrex — điểm khởi đầu hoàn hảo cho người mới.\n\n- Nhẹ, kiểm soát tốt, tha thứ cho lỗi kỹ thuật — giúp người mới bắt đầu tập trung vào kỹ thuật cơ bản mà không bị ảnh hưởng bởi tốc độ quá cao. Giá thành rất phải chăng.\n\n- Phù hợp cho học sinh, người mới tập bóng bàn, hoặc mua cho con em trong gia đình tập luyện cơ bản.","{\"- Loại\":\"Gỗ thuần cơ bản\",\"- Kiểu chơi\":\"DEF/ALL-\",\"- Xuất xứ\":\"Việt Nam/Unrex\"}","[]",0,"new",null,0,"480.000 đ",1,"[]"],
    ["quantum-x-pro-nt","Quantum X Pro NT","mat-vot","tibhar","- Tibhar Quantum X Pro NT là phiên bản \"Natural Topsheet\" của Quantum X Pro — thiết kế để mang lại cảm giác tự nhiên và bóng ra đường rõ ràng hơn phiên bản thường.\n\n- Topsheet NT cho phép cảm nhận bóng trực tiếp hơn, cú đánh có cảm giác chắc chắn và kiểm soát tốt ở tốc độ cao. Giữ được tất cả tốc độ và xoáy của Quantum X Pro.\n\n- Dành cho vận động viên tấn công ưa thích cảm giác \"natural\" thay vì topsheet xử lý nhiều.","{\"- Tốc độ\":\"92\",\"- Độ xoáy\":\"88\",\"- Công nghệ\":\"Natural Topsheet + ITTF\",\"- Loại mặt\":\"Mặt gai ngược\"}","[]",0,"new",null,0,"1.260.000 đ",1,"[]"],
    ["shang-kun-zlc","SHANG KUN HYBRID ZLC","cot-vot","tibhar","- Tibhar Shang Kun Hybrid ZLC là phiên bản Zylon Carbon (ZLC) của cốt vợt chữ ký Shang Kun — nhanh hơn và mạnh hơn phiên bản ALC.\n\n- ZLC (Zylon) cứng hơn ALC, cho tốc độ bóng rời mặt vợt cực cao và \"dwell time\" ngắn hơn. Phù hợp cho lối chơi tấn công bùng nổ, loop tốc độ cao xa bàn.\n\n- Dành cho vận động viên tấn công nâng cao đã quen với Shang Kun ALC và muốn thêm tốc độ.","{\"- Loại\":\"ZL-Carbon (Zylon)\",\"- Lớp\":\"5 gỗ + 2 ZLC\",\"- Kiểu chơi\":\"OFF\",\"- Xuất xứ\":\"Đức\"}","[]",0,"new","ZLC",0,"4.700.000 đ",1,"[]"],
    ["speedy-xd-dtecs","Tibhar Speedy XD-D","mat-vot","tibhar","- Tibhar Speedy XD-D là mặt vợt gai ngắn với công nghệ DTECS của Tibhar — thiết kế cho lối chơi tấn công nhanh, phá xoáy hiệu quả.\n\n- Gai ngắn DTECS cho tốc độ phản xạ cao, phù hợp cho backhand tấn công gần bàn và blok/hit trực tiếp. Hiệu ứng phá xoáy tốt khi đối thủ loop mạnh.\n\n- Phù hợp cho vận động viên sử dụng gai ngắn theo phong cách tấn công châu Á.","{\"- Tốc độ\":\"88\",\"- Kiểm soát\":\"82\",\"- Công nghệ\":\"DTECS\",\"- Loại mặt\":\"Gai ngắn\",\"- Kiểu chơi\":\"Tấn công nhanh\"}","[]",0,"new","Gai Ngắn",0,"1.090.000 đ",1,"[]"],
    ["tibhar-5q","Tibhar 5Q","mat-vot","tibhar","- Tibhar 5Q là dòng mặt vợt Q-Series đa lớp của Tibhar, cân bằng tốc độ và xoáy cho lối chơi tấn công toàn diện.\n\n- Phiên bản 5Q là nền tảng, 5Q VIP có topsheet xử lý cao cấp hơn cho thêm xoáy, 5Q Sound thiết kế để tăng \"âm thanh\" và cảm giác khi đánh bóng chắc.\n\n- Dòng 5Q phù hợp cho người chơi tầm trung đến nâng cao muốn mặt vợt Tibhar với hiệu suất cao trong tầm giá hợp lý.","{\"- Tốc độ\":\"85\",\"- Độ xoáy\":\"86\",\"- Công nghệ\":\"Q-Series multi-layer\",\"- Loại mặt\":\"Mặt gai ngược\"}","[]",0,"new",null,0,"1.060.000 đ",1,"[{\"name\":\"5Q\",\"price\":\"1060000\"},{\"name\":\"5Q VIP\",\"price\":\"1060000\"},{\"name\":\"5Q Sound\",\"price\":\"1060000\"}]"],
    ["tibhar-genius","Tibhar Genius","mat-vot","tibhar","- Tibhar Genius là mặt vợt all-round của Tibhar, thiết kế cho người chơi muốn cân bằng kiểm soát và tấn công trong một gói giải pháp đơn giản.\n\n- Genius Optimum là phiên bản tối ưu hóa với sponge được điều chỉnh cho kiểm soát tốt hơn, phù hợp với cốt vợt tốc độ cao.\n\n- Cả hai đều là lựa chọn tốt cho người chơi mới nâng cấp từ mặt vợt cơ bản, muốn trải nghiệm chất lượng Tibhar với giá hợp lý.","{\"- Tốc độ\":\"83\",\"- Độ xoáy\":\"84\",\"- Công nghệ\":\"All-round control\",\"- Loại mặt\":\"Mặt gai ngược\"}","[]",0,"new",null,0,"990.000 đ",1,"[{\"name\":\"Genius\",\"price\":\"990000\"},{\"name\":\"Genius Optimum\",\"price\":\"990000\"}]"],
    ["tibhar-grass","Tibhar Grass","mat-vot","tibhar","- Tibhar Grass là mặt vợt gai dài nổi tiếng của Tibhar — một trong những loại gai dài được ưa chuộng nhất thế giới cho lối chơi cắt bóng phòng thủ.\n\n- Gai Grass tạo hiệu ứng phản xoáy mạnh, bóng trả về với quỹ đạo thấp và khó đoán. Hiệu quả đặc biệt khi chop (cắt) xa bàn và phòng thủ chủ động.\n\n- Đây là dòng gai dài huyền thoại — được dùng bởi nhiều nhà vô địch châu Âu và thế giới trong phong cách phòng thủ.","{\"- Tốc độ\":\"65\",\"- Kiểm soát\":\"86\",\"- Loại mặt\":\"Gai dài\",\"- Kiểu chơi\":\"Cắt bóng phòng thủ\"}","[]",0,"new","Gai Dài",0,"1.060.000 đ",1,"[]"],
    ["unrex-coral","Coral","cot-vot","unrex","- Unrex Coral là cốt vợt tầm trung của Unrex — bước nâng cấp trên Fulmen với tốc độ và độ bung bẩy tốt hơn một chút.\n\n- Thiết kế cho lối chơi tấn công vừa phải, phù hợp với người chơi đang phát triển từ phong cách all-round lên tấn công. Kiểm soát tốt trong các tình huống đánh nhanh gần bàn.\n\n- Giá trị tốt trong hệ sinh thái sản phẩm Unrex Việt Nam.","{\"- Loại\":\"Gỗ tổng hợp\",\"- Kiểu chơi\":\"ALL+/OFF-\",\"- Xuất xứ\":\"Việt Nam/Unrex\"}","[]",0,"new",null,0,"1.190.000 đ",1,"[]"],
    ["unrex-fulmen","Fulmen","cot-vot","unrex","- Unrex Fulmen là cốt vợt gỗ thuần tầm trung của Unrex — thiết kế cho lối chơi all-round với kiểm soát tốt và tốc độ vừa phải.\n\n- Phù hợp cho người chơi muốn cốt vợt cân bằng, dễ kiểm soát với giá tầm trung. Xử lý tốt cả hai bên forehand và backhand.\n\n- Lựa chọn tốt trong danh mục Unrex cho người chơi trung cấp không muốn lên carbon ngay.","{\"- Loại\":\"Gỗ thuần\",\"- Kiểu chơi\":\"ALL/ALL+\",\"- Xuất xứ\":\"Việt Nam/Unrex\"}","[]",0,"new",null,0,"1.050.000 đ",1,"[]"],
    ["varispin-dtecs","Tibhar Varispin Dtecs","mat-vot","tibhar","- Tibhar Varispin Dtecs ứng dụng công nghệ DTECS — xử lý bề mặt kỹ thuật số giúp tối ưu hóa ma sát và spin trên topsheet.\n\n- Thiết kế đặc biệt để tạo xoáy đa dạng, phù hợp cho lối chơi chiến thuật với nhiều biến đổi xoáy. Tốc độ trung bình nhưng spin rất cao.\n\n- Lựa chọn tốt cho người chơi ưu tiên xoáy và biến đổi hơn tốc độ thuần túy.","{\"- Tốc độ\":\"78\",\"- Độ xoáy\":\"86\",\"- Công nghệ\":\"DTECS (Digital Technology in Table Tennis Covering Surfaces)\",\"- Loại mặt\":\"Gai ngược\"}","[]",0,"new","Dtecs",0,"490.000 đ",1,"[]"],
    ["yinhe-9000e","Yinhe 9000E","mat-vot","yinhe","- Yinhe 9000E là mặt vợt gai ngược cơ bản của GALAXY dành cho tập luyện và người mới bắt đầu.\n\n- Sponge mềm, kiểm soát tốt, dễ đánh — giúp người học nhanh nắm vững kỹ thuật cơ bản mà không lo bóng đi loạn. Giá thành rất phải chăng.\n\n- Lựa chọn kinh tế nhất để bắt đầu hành trình bóng bàn.","{\"- Tốc độ\":\"68\",\"- Độ xoáy\":\"68\",\"- Kiểm soát\":\"92\",\"- Loại mặt\":\"Gai ngược\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"140.000 đ",1,"[]"],
    ["yinhe-9000z","Yinhe 9000Z","mat-vot","yinhe","- Yinhe 9000Z là mặt vợt gai ngược tacky giá rẻ của GALAXY, phù hợp cho người mới tập chơi theo lối tấn công kiểu Trung Quốc.\n\n- Bề mặt dính nhẹ giúp tạo xoáy cơ bản, mút mềm dễ kiểm soát bóng. Lựa chọn tiết kiệm để bắt đầu làm quen với mặt vợt tacky.\n\n- Thích hợp cho người mới, học sinh, lớp bóng bàn cơ sở.","{\"- Tốc độ\":\"72\",\"- Độ xoáy\":\"74\",\"- Kiểm soát\":\"90\",\"- Loại mặt\":\"Gai ngược tacky\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"180.000 đ",1,"[]"],
    ["yinhe-955","Yinhe 955 (Có Lót)","mat-vot","yinhe","- Yinhe 955 (có lót) kết hợp hiệu ứng phản xoáy của gai dài với độ êm hơn nhờ có sponge.\n\n- Sponge giúp hấp thu một phần lực, cho phép kiểm soát bóng tốt hơn trong các tình huống chặn đỡ. Vẫn giữ được tính năng gây rối đặc trưng của gai dài.\n\n- Lựa chọn cho người muốn trải nghiệm gai dài nhưng dễ kiểm soát hơn phiên bản OX.","{\"- Loại mặt\":\"Gai dài (có lót)\",\"- Kiểu chơi\":\"Phòng thủ xa bàn\",\"- Kiểm soát\":\"88\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Dài",0,"130.000 đ",1,"[]"],
    ["yinhe-955-ox","Yinhe 955 (Không Lót)","mat-vot","yinhe","- Yinhe 955 OX là mặt vợt gai dài không sponge của GALAXY — loại mặt vợt đặc biệt nhất trong bóng bàn.\n\n- Gai dài không lót tạo hiệu ứng \"phản xoáy\" — bóng xoáy mạnh từ đối thủ sẽ trả về với xoáy ngược chiều, cực kỳ khó đoán. Lý tưởng cho kiểu chơi phòng thủ xa bàn \"cut\" và \"chop\".\n\n- Phù hợp cho người chơi thủ thuật muốn gây khó dễ tối đa cho đối thủ với giá rất thấp.","{\"- Loại mặt\":\"Gai dài (không lót)\",\"- Kiểu chơi\":\"Phòng thủ xa bàn\",\"- Kiểm soát\":\"90\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Dài OX",0,"90.000 đ",1,"[]"],
    ["yinhe-earth-pro","Yinhe Earth Pro","mat-vot","yinhe","- Yinhe Earth Pro là mặt vợt gai ngược tacky thiên về kiểm soát của GALAXY, phù hợp cho lối chơi ổn định và nhất quán.\n\n- Sponge mềm hơn Venus Pro, giúp bóng bám tốt trên mặt vợt và cho cảm giác rõ ràng. Tốt cho cú chặn đánh, đẩy ngắn và phòng thủ linh hoạt.\n\n- Dành cho người chơi ưu tiên kiểm soát và độ ổn định hơn tốc độ tối đa.","{\"- Tốc độ\":\"80\",\"- Độ xoáy\":\"80\",\"- Kiểm soát\":\"86\",\"- Loại mặt\":\"Gai ngược tacky\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"390.000 đ",1,"[]"],
    ["yinhe-hang-tuyen-tt","Hàng Tuyển Triều Tiên","cot-vot","yinhe","- Hàng Tuyển Triều Tiên là dòng cốt vợt đặc biệt được sản xuất theo tiêu chuẩn và yêu cầu của Đội tuyển Quốc gia Bóng Bàn Triều Tiên — một trong những đội mạnh nhất thế giới.\n\n- Từng cây vợt được tuyển chọn kỹ lưỡng qua kiểm tra chất lượng nghiêm ngặt, đảm bảo đặc tính vật lý nhất quán và chất lượng đồng đều. Không phải hàng thương mại thông thường.\n\n- Phù hợp cho vận động viên nghiêm túc muốn sở hữu cốt vợt chất lượng tuyển quốc gia với lịch sử và uy tín của trường phái bóng bàn Triều Tiên.","{\"- Loại\":\"Carbon đặc biệt\",\"- Xuất xứ\":\"Triều Tiên / GALAXY\",\"- Kiểu chơi\":\"OFF\",\"- Ghi chú\":\"Hàng tuyển chọn đặc biệt\"}","[]",0,"new","Hàng Tuyển Chọn",0,"3.850.000 đ",1,"[]"],
    ["yinhe-jupiter-2","Yinhe Jupiter 2","mat-vot","yinhe","- Yinhe Jupiter 2 là mặt vợt gai ngược phiên bản nâng cấp của Jupiter, với tốc độ cải thiện và cảm giác bóng tốt hơn.\n\n- Sponge đàn hồi cao hơn thế hệ trước, giúp tạo lực tốt hơn trên các cú loop tấn công. Vẫn giữ được kiểm soát ổn định cho phong cách đánh toàn diện.\n\n- Lựa chọn phổ biến trong phân khúc tầm trung của GALAXY, giá trị tốt cho đồng tiền.","{\"- Tốc độ\":\"82\",\"- Độ xoáy\":\"80\",\"- Kiểm soát\":\"84\",\"- Loại mặt\":\"Gai ngược\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"299.000 đ",1,"[]"],
    ["yinhe-mars-ii","Yinhe Mars II","mat-vot","yinhe","- Yinhe Mars II là mặt vợt gai ngược tầm trung của GALAXY, phù hợp cho người chơi nghiệp dư muốn cân bằng tốc độ và kiểm soát.\n\n- Sponge đàn hồi tốt, tốc độ trung bình khá — hỗ trợ đánh loop cơ bản và tấn công linh hoạt. Dễ dùng, tương thích với nhiều kiểu cốt vợt.\n\n- Phù hợp cho học sinh, người chơi phong trào muốn nâng cấp từ mặt vợt cơ bản.","{\"- Tốc độ\":\"80\",\"- Độ xoáy\":\"80\",\"- Kiểm soát\":\"84\",\"- Loại mặt\":\"Gai ngược\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"290.000 đ",1,"[]"],
    ["yinhe-mercury-jp","Yinhe Mercury JP","mat-vot","yinhe","- Yinhe Mercury JP là mặt vợt gai ngược tacky cao cấp nhất trong dòng GALAXY tiêu chuẩn, được phát triển cho lối chơi tấn công chủ động.\n\n- Bề mặt dính mạnh, sponge cứng vừa phải giúp tạo xoáy mạnh trên các cú loop tốc độ. Đặc biệt hiệu quả khi phối hợp với keo booster để tăng tốc và nảy.\n\n- Phù hợp cho vận động viên trung cấp đến nâng cao muốn chuyển sang lối chơi Trung Quốc chính thống.","{\"- Tốc độ\":\"86\",\"- Độ xoáy\":\"88\",\"- Kiểm soát\":\"80\",\"- Loại mặt\":\"Gai ngược tacky\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"450.000 đ",1,"[]"],
    ["yinhe-neptune","Yinhe Neptune (Có Lót)","mat-vot","yinhe","- Yinhe Neptune (có lót) kết hợp gai dài Neptune chất lượng cao với sponge để tăng độ ổn định.\n\n- Sponge giúp Neptune có lót dễ chơi hơn phiên bản OX, đặc biệt trong các cú chặn đỡ nhanh gần bàn. Vẫn giữ tính năng phản xoáy và gây rối đặc trưng.\n\n- Lựa chọn gai dài linh hoạt cho cả phòng thủ xa và trung bình bàn.","{\"- Loại mặt\":\"Gai dài (có lót)\",\"- Kiểu chơi\":\"Phòng thủ xa bàn\",\"- Kiểm soát\":\"88\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Dài",0,"150.000 đ",1,"[]"],
    ["yinhe-neptune-ox","Yinhe Neptune (Không Lót)","mat-vot","yinhe","- Yinhe Neptune OX là mặt vợt gai dài không sponge cao cấp hơn 955 của GALAXY, với gai được thiết kế tối ưu hóa hiệu ứng phản xoáy.\n\n- Gai Neptune có hình học cải tiến so với 955 — tạo độ lắc và gây rối nhiều hơn khi đối thủ đánh xoáy mạnh. Hiệu quả trong cắt bóng và phòng thủ xa bàn.\n\n- Phù hợp cho người chơi phòng thủ muốn gai dài cao cấp hơn trong tầm giá tốt.","{\"- Loại mặt\":\"Gai dài (không lót)\",\"- Kiểu chơi\":\"Phòng thủ xa bàn\",\"- Kiểm soát\":\"90\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Dài OX",0,"100.000 đ",1,"[]"],
    ["yinhe-no-01","No. 01","cot-vot","yinhe","- Yinhe No. 01 là một trong những cốt vợt nổi tiếng nhất của GALAXY — được thiết kế theo yêu cầu của các tuyển thủ Triều Tiên.\n\n- Tốc độ cao, cảm giác bóng sắc bén — lý tưởng cho lối chơi tấn công mạnh với loop tốc độ và tấn công bùng nổ. Cán vợt đặc trưng của kiểu chơi Triều Tiên/Đông Á.\n\n- Lựa chọn phổ biến trong cộng đồng người chơi thích phong cách Đông Á với giá thành hợp lý.","{\"- Loại\":\"Carbon đặc biệt\",\"- Kiểu chơi\":\"OFF\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"1.450.000 đ",1,"[]"],
    ["yinhe-no-01x-limited","No. 01x Limited","cot-vot","yinhe","- Yinhe No. 01x Limited là phiên bản giới hạn cao cấp của No. 01 nổi tiếng — được nâng cấp với vật liệu và công nghệ tốt nhất.\n\n- Phiên bản \"x Limited\" sử dụng vật liệu carbon cao cấp hơn và quá trình gia công tỉ mỉ hơn, mang lại cảm giác bóng sắc nét và tốc độ vượt trội so với No. 01 thường.\n\n- Sản phẩm dành cho collector và vận động viên muốn sở hữu phiên bản đặc biệt của dòng cốt vợt huyền thoại GALAXY.","{\"- Loại\":\"Carbon đặc biệt (phiên bản giới hạn)\",\"- Kiểu chơi\":\"OFF+\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Limited Edition",0,"4.500.000 đ",1,"[]"],
    ["yinhe-pluto","Yinhe Pluto (Có Lót)","mat-vot","yinhe","- Yinhe Pluto (có lót sponge) là mặt vợt gai trung linh hoạt của GALAXY, phù hợp cho lối chơi phòng thủ và tấn công đặc biệt.\n\n- Có sponge giúp giảm rung, tăng kiểm soát so với phiên bản OX. Khả năng hấp thu xoáy và phản trả bóng ít xoáy — tạo sự ngạc nhiên cho đối thủ.\n\n- Lựa chọn phổ biến cho người chơi chiến thuật muốn đa dạng hóa với một bên gai trung.","{\"- Loại mặt\":\"Gai trung (có lót)\",\"- Kiểu chơi\":\"Phòng thủ / Tấn công đặc biệt\",\"- Kiểm soát\":\"86\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Trung",0,"180.000 đ",1,"[]"],
    ["yinhe-pluto-ox","Yinhe Pluto (Không Lót)","mat-vot","yinhe","- Yinhe Pluto OX (không lót) là mặt vợt gai trung không sponge của GALAXY, chuyên dùng cho kiểu chơi phòng thủ và gây nhiễu xoáy.\n\n- Gai trung không lót cho phép bóng tiếp xúc trực tiếp với mặt gỗ cốt vợt, tạo cảm giác cứng và phản xạ nhanh. Rất khó đoán đường bóng trả về.\n\n- Dùng phổ biến cho backhand phòng thủ trong các lối chơi \"cut\" hoặc \"push\" gần bàn.","{\"- Loại mặt\":\"Gai trung (không lót)\",\"- Kiểu chơi\":\"Phòng thủ / Gây nhiễu\",\"- Kiểm soát\":\"88\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Trung OX",0,"120.000 đ",1,"[]"],
    ["yinhe-pluto-select-nt","Yinhe Pluto Select NT","mat-vot","yinhe","- Yinhe Pluto Select NT là phiên bản thi đấu cao cấp của dòng Pluto, được ITTF chứng nhận cho thi đấu quốc tế.\n\n- Gai được gia công chính xác hơn, sponge chất lượng cao — mang lại cảm giác ổn định và kiểm soát vượt trội so với Pluto thường. Đặc biệt hiệu quả trong cắt bóng phòng thủ xa bàn.\n\n- Dành cho vận động viên thi đấu nghiêm túc theo lối chơi phòng thủ với gai trung.","{\"- Loại mặt\":\"Gai trung cao cấp\",\"- Kiểu chơi\":\"Phòng thủ chiến lược\",\"- ITTF\":\"Được phê duyệt thi đấu\",\"- Kiểm soát\":\"88\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Trung ITTF",0,"690.000 đ",1,"[]"],
    ["yinhe-pro-12s","Pro 12s","cot-vot","yinhe","- Yinhe Pro 12s là cốt vợt carbon tầm trung của GALAXY, phiên bản nâng cấp trong dòng \"Pro\" — thiết kế cho lối chơi tấn công toàn diện.\n\n- Carbon Arylate (ALC) mang lại tốc độ tốt khi tấn công xa bàn đồng thời giữ được cảm giác bóng ổn định ở gần bàn. Cân bằng tốt giữa lực và kiểm soát.\n\n- Phù hợp cho vận động viên trung cấp đến nâng cao muốn carbon trong tầm giá hợp lý của GALAXY.","{\"- Loại\":\"Carbon (Arylate)\",\"- Lớp\":\"5 gỗ + 2 ALC\",\"- Kiểu chơi\":\"OFF\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"1.290.000 đ",1,"[]"],
    ["yinhe-qing","Yinhe Qing","mat-vot","yinhe","- Yinhe Qing là mặt vợt gai dài thiết kế đặc biệt cho lối chơi cắt bóng (chop) xa bàn của GALAXY.\n\n- Gai Qing có hình học phù hợp cho cú cắt dứt khoát — bóng trả về mang xoáy lạ, thấp và khó đoán. Đặc biệt hiệu quả trong cú phòng thủ choppé kiểu Đông Á.\n\n- Phù hợp cho người chơi phòng thủ xa bàn muốn mặt vợt gai dài chuyên biệt.","{\"- Loại mặt\":\"Gai dài\",\"- Kiểu chơi\":\"Cắt bóng phòng thủ\",\"- Kiểm soát\":\"88\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Dài",0,"190.000 đ",1,"[]"],
    ["yinhe-qing-soft","Yinhe Qing Soft","mat-vot","yinhe","- Yinhe Qing Soft là phiên bản sponge mềm hơn của Qing, cho cảm giác bóng tốt hơn và dễ kiểm soát hơn khi cắt bóng.\n\n- Sponge mềm hơn Qing thường giúp bóng \"ăn\" vào mặt vợt sâu hơn, tạo cảm giác ổn định trong các cú chop dài. Ít cứng và crispy hơn, nhưng nhất quán hơn.\n\n- Lựa chọn lý tưởng cho người mới chuyển sang lối chơi phòng thủ gai dài, hoặc ai muốn gai dài dễ kiểm soát.","{\"- Loại mặt\":\"Gai dài mềm\",\"- Kiểu chơi\":\"Cắt bóng phòng thủ\",\"- Kiểm soát\":\"90\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Dài Mềm",0,"250.000 đ",1,"[]"],
    ["yinhe-uranus","Yinhe Uranus","mat-vot","yinhe","- Yinhe Uranus là mặt vợt gai ngắn của GALAXY, thiết kế cho lối chơi tấn công nhanh gần bàn và phá xoáy.\n\n- Gai ngắn giúp trả bóng có ít xoáy hơn, khiến đối thủ khó đọc đường bóng. Tốc độ cao, phản xạ nhanh — lý tưởng cho đánh trực tiếp (hit) và backhand gần bàn.\n\n- Phù hợp cho vận động viên muốn thêm biến đổi vào lối chơi với một bên gai ngắn, một bên gai ngược.","{\"- Tốc độ\":\"82\",\"- Kiểm soát\":\"86\",\"- Loại mặt\":\"Gai ngắn\",\"- Kiểu chơi\":\"Tấn công gần bàn\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Ngắn",0,"190.000 đ",1,"[]"],
    ["yinhe-uranus-jean","Yinhe Uranus-Jean","mat-vot","yinhe","- Yinhe Uranus-Jean là phiên bản nâng cấp của Uranus với gai mật độ cao hơn, cải thiện tốc độ và độ ổn định.\n\n- Khả năng phá xoáy tốt hơn Uranus thường, cú đánh crispy và trực tiếp hơn. Cảm giác kiểm soát tốt khi chặn bóng xoáy mạnh từ đối thủ.\n\n- Lựa chọn gai ngắn chất lượng trong tầm giá tốt, phù hợp cho người chơi đang muốn phát triển lối chơi đặc biệt.","{\"- Tốc độ\":\"84\",\"- Kiểm soát\":\"86\",\"- Loại mặt\":\"Gai ngắn cao cấp\",\"- Kiểu chơi\":\"Tấn công gần bàn\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new","Gai Ngắn",0,"250.000 đ",1,"[]"],
    ["yinhe-venus-pro","Yinhe Venus Pro","mat-vot","yinhe","- Yinhe Venus Pro là mặt vợt gai ngược tacky all-round của GALAXY, cân bằng giữa tốc độ, xoáy và kiểm soát.\n\n- Sponge đàn hồi tốt, topsheet dính vừa phải — tạo xoáy đủ mạnh trên loop tấn công trong khi vẫn cho phép kiểm soát bóng tốt khi đánh gần bàn.\n\n- Lựa chọn tốt cho người chơi nghiệp dư đến trung cấp muốn mặt vợt đa năng với giá hợp lý.","{\"- Tốc độ\":\"84\",\"- Độ xoáy\":\"82\",\"- Kiểm soát\":\"84\",\"- Loại mặt\":\"Gai ngược tacky\",\"- Xuất xứ\":\"Trung Quốc\"}","[]",0,"new",null,0,"390.000 đ",1,"[]"],
  ].forEach(r => insP.run(...r));
}

// Seed từ db-seed.json nếu có (dữ liệu thực), hoặc fallback sample data
const SEED_FILE = path.join(__dirname, 'db-seed.json');
if (fs.existsSync(SEED_FILE)) {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (seed.categories?.length && catCount.c === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO categories (slug,label,description,image,sort_order) VALUES (?,?,?,?,?)');
    seed.categories.forEach(r => ins.run(r.slug, r.label, r.description, r.image, r.sort_order));
  }

  const brandCount = db.prepare('SELECT COUNT(*) as c FROM brands').get();
  if (seed.brands?.length && brandCount.c === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO brands (slug,label,logo,sort_order) VALUES (?,?,?,?)');
    seed.brands.forEach(r => ins.run(r.slug, r.label, r.logo, r.sort_order));
  }

  const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (seed.products?.length && prodCount.c === 0) {
    const ins = db.prepare(`INSERT OR IGNORE INTO products
      (id,slug,name,category_slug,brand_slug,gear_subcategory,description,specs,images,
       featured,condition,badge,sort_order,price,in_stock,variants,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    seed.products.forEach(r => ins.run(
      r.id, r.slug, r.name, r.category_slug, r.brand_slug, r.gear_subcategory,
      r.description, r.specs, r.images, r.featured, r.condition, r.badge, r.sort_order,
      r.price, r.in_stock, r.variants, r.created_at, r.updated_at
    ));
  }

  const comboCount = db.prepare('SELECT COUNT(*) as c FROM combos').get();
  if (seed.combos?.length && comboCount.c === 0) {
    const ins = db.prepare(`INSERT OR IGNORE INTO combos
      (id,slug,name,level,blade,rubber_fh,rubber_bh,description,images,badge,sort_order,price,in_stock)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    seed.combos.forEach(r => ins.run(
      r.id, r.slug, r.name, r.level, r.blade, r.rubber_fh, r.rubber_bh,
      r.description, r.images, r.badge, r.sort_order, r.price, r.in_stock
    ));
  }

  const artCount = db.prepare('SELECT COUNT(*) as c FROM articles').get();
  if (seed.articles?.length && artCount.c === 0) {
    const ins = db.prepare(`INSERT OR IGNORE INTO articles
      (id,slug,title,excerpt,content,cover_image,category,tags,published_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    seed.articles.forEach(r => ins.run(
      r.id, r.slug, r.title, r.excerpt, r.content, r.cover_image,
      r.category, r.tags, r.published_at, r.created_at
    ));
  }

  if (seed.settings?.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)');
    seed.settings.forEach(r => ins.run(r.key, r.value, r.updated_at));
  }
} else {
  // Fallback: seed categories và brands cơ bản
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (catCount.c === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO categories (slug,label,description,image,sort_order) VALUES (?,?,?,?,?)');
    [
      ['cot-vot','Cốt Vợt','Cốt vợt chính hãng Butterfly, Tibhar, Unrex, Yinhe','/images/cat-cot-vot.jpg',1],
      ['mat-vot','Mặt Vợt','Mặt vợt thi đấu và luyện tập chính hãng','/images/cat-mat-vot.jpg',2],
      ['bong','Bóng','Bóng thi đấu và luyện tập tiêu chuẩn ITTF','/images/cat-bong.jpg',3],
      ['ban','Bàn','Bàn bóng bàn trong nhà, ngoài trời, gấp gọn','/images/cat-ban.jpg',4],
      ['do-thi-dau','Đồ Thi Đấu','Giày, áo, quần và phụ kiện thi đấu','/images/cat-do-thi-dau.jpg',5],
      ['combo-vot','Combo Vợt','Bộ combo cốt + mặt vợt khuyên dùng theo trình độ','/images/cat-combo.jpg',6],
      ['do-cu','Đồ Cũ','Dụng cụ đã qua sử dụng còn tốt, giá tốt','/images/cat-do-cu.jpg',7],
      ['kien-thuc','Kiến Thức','Bài viết, hướng dẫn và review sản phẩm','/images/cat-kien-thuc.jpg',8],
    ].forEach(c => ins.run(...c));
  }

  const brandCount = db.prepare('SELECT COUNT(*) as c FROM brands').get();
  if (brandCount.c === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO brands (slug,label,sort_order) VALUES (?,?,?)');
    [['butterfly','BUTTERFLY',1],['tibhar','TIBHAR',2],['unrex','UNREX',3],['yinhe','YINHE',4],['khac','Các Hãng Khác',5]]
      .forEach(b => ins.run(...b));
  }
}

module.exports = db;
