const ExcelJS = require('exceljs');
const path = require('path');

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BongBanViet.com';
  workbook.created = new Date();

  // ── Sheet 1: Sản Phẩm ──────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet('Sản Phẩm', {
    views: [{ state: 'frozen', ySplit: 2 }],
    properties: { tabColor: { argb: 'FFD62B2B' } },
  });

  const RED    = 'FFD62B2B';
  const WHITE  = 'FFFFFFFF';
  const LIGHT  = 'FFFFF5F5';
  const SAMPLE = 'FFFFF0F0';
  const GRAY   = 'FFF5F5F5';

  // ── Row 1: Tiêu đề lớn ───────────────────────────────────────────────────
  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = '🏓 BÓNG BÀN VIỆT — Template Import Sản Phẩm Hàng Loạt';
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 36;

  // ── Row 2: Header cột ─────────────────────────────────────────────────────
  const headers = [
    { header: 'Danh Mục *',             key: 'danhmuc',  width: 22 },
    { header: 'Hãng',                    key: 'hang',     width: 20 },
    { header: 'Tên Sản Phẩm *',          key: 'ten',      width: 38 },
    { header: 'Ảnh (Paste ảnh hoặc URL)', key: 'anh',      width: 28 },
    { header: 'Giá Bán',                 key: 'gia',      width: 18 },
    { header: 'Thông Số Kỹ Thuật',       key: 'thongso',  width: 52 },
    { header: 'Miêu Tả Sản Phẩm',        key: 'mieuta',   width: 60 },
  ];

  sheet.columns = headers;

  const headerRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h.header;
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D2D2D' } };
    cell.font  = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top:    { style: 'medium', color: { argb: RED } },
      bottom: { style: 'medium', color: { argb: RED } },
      left:   { style: 'thin',   color: { argb: 'FF555555' } },
      right:  { style: 'thin',   color: { argb: 'FF555555' } },
    };
  });
  headerRow.height = 32;

  // ── Data Validation (rows 3–500) ─────────────────────────────────────────
  const categories = 'Cốt Vợt,Mặt Vợt,Bóng,Bàn,Đồ Thi Đấu - Giày,Đồ Thi Đấu - Trang Phục & PK,Combo Vợt,Đồ Cũ';
  const brands     = 'Butterfly,Tibhar,Unrex,Yinhe,Các Hãng Khác';

  for (let r = 3; r <= 500; r++) {
    sheet.getCell(`A${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: [`"${categories}"`],
      showErrorMessage: true, errorStyle: 'stop',
      errorTitle: 'Danh mục không hợp lệ',
      error: 'Vui lòng chọn từ danh sách',
    };
    sheet.getCell(`B${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: [`"${brands}"`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Hãng không hợp lệ',
      error: 'Vui lòng chọn từ danh sách',
    };
    // Zebra rows
    if (r % 2 === 0) {
      ['A','B','C','D','E','F','G'].forEach(col => {
        sheet.getCell(`${col}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } };
      });
    }
  }

  // ── Row 3: Dòng hướng dẫn (italic, mờ) ──────────────────────────────────
  const guideRow = sheet.getRow(3);
  const guides = [
    'Chọn danh mục từ mũi tên ▼',
    'Chọn hãng từ mũi tên ▼ (nếu có)',
    'Nhập tên sản phẩm đầy đủ',
    'PASTE ẢNH: Click ô này → Ctrl+V\nHoặc nhập URL:\n/images/products/file.jpg',
    'VD: 4.500.000đ\n(để trống = Hết hàng)',
    'Mỗi thông số 1 dòng:\nTên: Giá trị\nVD: Lớp: 5+2 ALC',
    'Mô tả chi tiết sản phẩm,\ncó thể nhiều dòng',
  ];
  guides.forEach((g, i) => {
    const cell = guideRow.getCell(i + 1);
    cell.value = g;
    cell.font = { italic: true, color: { argb: 'FF888888' }, size: 9 };
    cell.alignment = { wrapText: true, vertical: 'top' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
  });
  guideRow.height = 60;

  // ── Rows 4–6: Dòng mẫu ──────────────────────────────────────────────────
  const samples = [
    {
      danhmuc: 'Cốt Vợt',
      hang:    'Butterfly',
      ten:     'Viscaria ALC',
      anh:     '/images/products/viscaria.jpg',
      gia:     '4.500.000đ',
      thongso: 'Lớp: 5+2 ALC\nTốc độ: OFF+\nControl: 8.0\nTrọng lượng: 86g',
      mieuta:  'Cốt vợt huyền thoại, tốc độ cao, cảm giác bóng tuyệt vời. Phù hợp tay ngang tấn công mạnh.',
    },
    {
      danhmuc: 'Mặt Vợt',
      hang:    'Tibhar',
      ten:     'Evolution MX-P',
      anh:     '/images/products/mx-p.jpg',
      gia:     '1.800.000đ',
      thongso: 'Độ nảy: 12.8\nVòng xoáy: 10.2\nĐộ cứng: 42°\nĐộ dày: 2.1mm',
      mieuta:  'Mặt vợt thi đấu chuyên nghiệp, nảy cao, xoáy tốt. Phù hợp tay tấn công hiện đại.',
    },
    {
      danhmuc: 'Combo Vợt',
      hang:    '',
      ten:     'Combo Tập Luyện Cơ Bản',
      anh:     '/images/products/combo-basic.jpg',
      gia:     '2.200.000đ',
      thongso: 'Cốt: IV-S (Unrex)\nMặt FH: MX-P 47° (Tibhar)\nMặt BH: MX-P 42° (Tibhar)',
      mieuta:  'Bộ combo lý tưởng cho người mới bắt đầu muốn nâng cấp từ vợt pre-made.',
    },
  ];

  samples.forEach((s, idx) => {
    const row = sheet.addRow(s); // row 4, 5, 6
    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SAMPLE } };
      cell.font = { color: { argb: 'FF333333' }, size: 10, italic: true };
      cell.alignment = { wrapText: true, vertical: 'top' };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left:   { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right:  { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };
    });
    // Dòng A in đậm
    row.getCell(1).font = { bold: true, color: { argb: RED }, size: 10 };
    row.height = 100;
    // Ghi chú "Dòng mẫu" ở cột G
    if (idx === 0) {
      row.getCell(7).value = '← Dòng mẫu, xoá trước khi import\n\n' + s.mieuta;
    }
    // Column D: instructions for image paste
    row.getCell(4).value = s.anh;
    row.getCell(4).note = 'Click ô này → Ctrl+V để paste ảnh';
  });

  // ── Rows 8–300: Data rows với chiều cao chuẩn để chứa ảnh paste ─────────
  sheet.properties.defaultRowHeight = 100;

  // ── Row 7 trở đi: vùng nhập liệu thực ──────────────────────────────────
  const startRow = sheet.addRow(['']);
  const startCell = sheet.getCell(`A${startRow.number}`);
  startCell.value = '▶ Bắt đầu nhập sản phẩm từ dòng này ▶';
  sheet.mergeCells(`A${startRow.number}:G${startRow.number}`);
  startCell.font = { bold: true, color: { argb: WHITE }, size: 10 };
  startCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
  startCell.alignment = { horizontal: 'center', vertical: 'middle' };
  startRow.height = 22;

  // ── Sheet 2: Hướng Dẫn ───────────────────────────────────────────────────
  const guide = workbook.addWorksheet('📋 Hướng Dẫn', {
    properties: { tabColor: { argb: 'FF4CAF50' } },
  });

  guide.columns = [
    { width: 5  },
    { width: 28 },
    { width: 70 },
  ];

  const addGuideRow = (col, text, opts = {}) => {
    const row = guide.addRow(['', col, text]);
    if (opts.header) {
      row.getCell(2).font = { bold: true, size: 12, color: { argb: WHITE } };
      row.getCell(3).font = { bold: true, size: 12, color: { argb: WHITE } };
      [2, 3].forEach(c => {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
      });
      row.height = 28;
    } else if (opts.sub) {
      row.getCell(2).font = { bold: true, size: 10, color: { argb: RED } };
      row.getCell(3).font = { size: 10 };
      row.height = 18;
    } else {
      row.getCell(2).font = { size: 10 };
      row.getCell(3).font = { size: 10, color: { argb: 'FF444444' } };
    }
    row.getCell(2).alignment = { vertical: 'top' };
    row.getCell(3).alignment = { vertical: 'top', wrapText: true };
  };

  addGuideRow('🏓 HƯỚNG DẪN SỬ DỤNG TEMPLATE', 'BongBanViet.com — Import Sản Phẩm Hàng Loạt', { header: true });
  guide.addRow([]);

  addGuideRow('BƯỚC 1', 'Mở sheet "Sản Phẩm"', { sub: true });
  addGuideRow('', 'Chuyển sang tab "Sản Phẩm" ở phía dưới màn hình.');
  guide.addRow([]);

  addGuideRow('BƯỚC 2', 'Xoá 3 dòng mẫu màu hồng', { sub: true });
  addGuideRow('', 'Dòng 4, 5, 6 là ví dụ minh hoạ. Xoá trước khi import thật.');
  guide.addRow([]);

  addGuideRow('BƯỚC 3', 'Nhập sản phẩm từ dòng xanh lá', { sub: true });
  addGuideRow('', 'Bắt đầu điền từ dòng có chữ "▶ Bắt đầu nhập..." trở xuống.');
  guide.addRow([]);

  addGuideRow('CỘT A — Danh Mục *', 'BẮT BUỘC. Click ô → chọn từ mũi tên ▼', { sub: true });
  const catList = [
    'Cốt Vợt', 'Mặt Vợt', 'Bóng', 'Bàn',
    'Đồ Thi Đấu - Giày', 'Đồ Thi Đấu - Trang Phục & PK',
    'Combo Vợt', 'Đồ Cũ'
  ];
  addGuideRow('', 'Các lựa chọn:\n' + catList.map(c => `  • ${c}`).join('\n'));
  guide.getRow(guide.rowCount).height = 120;
  guide.addRow([]);

  addGuideRow('CỘT B — Hãng', 'Chỉ dùng cho Cốt Vợt / Mặt Vợt. Click ô → chọn từ mũi tên ▼', { sub: true });
  addGuideRow('', '• Butterfly  • Tibhar  • Unrex  • Yinhe  • Các Hãng Khác\nĐể trống nếu không áp dụng (Bóng, Bàn, Combo...)');
  guide.addRow([]);

  addGuideRow('CỘT C — Tên Sản Phẩm *', 'BẮT BUỘC. Nhập tên đầy đủ, chính xác.', { sub: true });
  addGuideRow('', 'VD: Viscaria ALC, Tenergy 05, Joola Inside 15...');
  guide.addRow([]);

  addGuideRow('CỘT D — Ảnh', '2 cách thêm ảnh:', { sub: true });
  addGuideRow('CÁCH 1 — Paste ảnh', '1. Copy ảnh (Ctrl+C từ trình duyệt, thư mục, hay Zalo)\n2. Click vào ô cột D của hàng sản phẩm tương ứng\n3. Nhấn Ctrl+V → ảnh hiện ra trực tiếp trong Excel\n4. Khi import, ảnh tự động upload lên server');
  guide.getRow(guide.rowCount).height = 70;
  addGuideRow('CÁCH 2 — Nhập URL/đường dẫn', '• Đường dẫn đã upload:  /images/products/ten-file.jpg\n• URL online:            https://example.com/anh.jpg\n• Để trống nếu chưa có ảnh');
  guide.getRow(guide.rowCount).height = 55;
  guide.addRow([]);

  addGuideRow('CỘT E — Giá Bán', 'Nhập giá dạng text có đơn vị. Để trống = Hết hàng.', { sub: true });
  addGuideRow('', '• Có giá    → hiển thị "Còn hàng" (xanh)\n• Để trống  → hiển thị "Hết hàng" (đỏ)\nVD: 4.500.000đ  |  1.800.000đ  |  Liên hệ');
  guide.getRow(guide.rowCount).height = 55;
  guide.addRow([]);

  addGuideRow('CỘT F — Thông Số Kỹ Thuật', 'Mỗi thông số một dòng, định dạng "Tên: Giá trị"', { sub: true });
  addGuideRow('', 'Ví dụ:\nLớp: 5+2 ALC\nTốc độ: OFF+\nControl: 8.0\nTrọng lượng: 86g\n\nChỉ áp dụng cho Cốt Vợt, Mặt Vợt. Để trống nếu không cần.');
  guide.getRow(guide.rowCount).height = 90;
  guide.addRow([]);

  addGuideRow('CỘT G — Miêu Tả', 'Mô tả chi tiết sản phẩm. Có thể nhiều dòng.', { sub: true });
  addGuideRow('', 'Ngắn gọn, súc tích. Tập trung vào điểm nổi bật của sản phẩm.');
  guide.addRow([]);
  guide.addRow([]);

  addGuideRow('LƯU Ý QUAN TRỌNG', '', { sub: true });
  addGuideRow('', '⚠ Không xoá hoặc đổi tên cột header (dòng 2).\n⚠ Cột có dấu * là bắt buộc — để trống sẽ bị lỗi khi import.\n⚠ File ảnh cần upload lên server trước, rồi điền đường dẫn vào cột D.\n⚠ Lưu file dạng .xlsx trước khi upload lên hệ thống.');
  guide.getRow(guide.rowCount).height = 80;

  // ── Output ───────────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, 'template-import-san-pham.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log('✅ Template đã tạo:', outPath);
}

generateTemplate().catch(err => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
