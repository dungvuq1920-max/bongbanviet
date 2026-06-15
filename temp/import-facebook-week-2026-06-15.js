const slots = [
  ['2026-06-15','07:30','knowledge','Giữ nhịp chân thấp ngay từ đầu tuần','giữ trọng tâm thấp, vào bóng sớm hơn và hạn chế với tay'],
  ['2026-06-15','10:30','knowledge','Ba dấu hiệu mặt vợt đang mở quá nhiều','đọc đường bóng để chỉnh góc vợt trước khi tăng lực'],
  ['2026-06-15','12:15','product','Bóng Tibhar 40+ SL hợp cho buổi tập đều','chuẩn bị bóng ổn định cho drill, giao bóng và đánh đều'],
  ['2026-06-15','15:30','engagement','Tuần này bạn muốn sửa cú nào trước','chọn một lỗi rõ nhất để tập sâu trong cả tuần'],
  ['2026-06-15','21:15','engagement','Một câu hỏi trước khi đổi mặt vợt','xác định cần nhanh hơn, xoáy hơn hay chắc hơn trước khi mua'],
  ['2026-06-16','07:30','knowledge','Drill hai bước cho người hay với tay','đưa chân tới đúng vị trí trước khi vung tay'],
  ['2026-06-16','10:30','combo','Combo kiểm soát cho người mới nâng cấp','ưu tiên cảm giác vào bàn và độ dễ chơi khi đổi vợt'],
  ['2026-06-16','12:15','product','Dawei 2008XP cho người ưu tiên kiểm soát','một lựa chọn dễ làm quen để tập nền và giữ nhịp'],
  ['2026-06-16','15:30','engagement','Bạn thường mất điểm ở bóng thứ mấy','nhìn lại bóng 2, bóng 3 hay rally dài để tìm điểm cần sửa'],
  ['2026-06-16','18:30','combo','Setup cho người đánh trái tay an toàn','giữ trái tay chắc để đỡ giao, chặn bóng và chuyển hướng'],
  ['2026-06-16','21:15','engagement','Chọn một thói quen nhỏ cho buổi tập tới','lặp lại một việc nhỏ để tạo tiến bộ thật'],
  ['2026-06-17','07:30','knowledge','Sửa lỗi giật bóng nhưng thân người đứng yên','dùng hông và chuyển trọng tâm để cú giật có lực hơn'],
  ['2026-06-17','10:30','knowledge','Vì sao bóng ngắn làm nhiều người vội','bước vào trước, xử lý gọn rồi rút chân ra nhanh'],
  ['2026-06-17','12:15','product','Bao vợt cứng giúp bảo quản setup tốt hơn','giữ vợt gọn, hạn chế va đập và bảo vệ mặt vợt'],
  ['2026-06-17','15:30','engagement','Mini quiz bóng vào giữa người xử lý sao','chọn thuận tay, trái tay hay đổi chân theo tình huống'],
  ['2026-06-17','18:30','combo','Combo thiên xoáy cho người thích mở bóng','cân bằng độ bám, kiểm soát và khả năng vào bàn lặp lại'],
  ['2026-06-17','21:15','product','Bóng Unrex SUN 40+ cho nhóm tập phong trào','chuẩn bị đủ bóng để buổi tập không bị ngắt nhịp'],
  ['2026-06-18','07:30','knowledge','Trả giao bóng xoáy xuống đừng nâng tay quá sớm','giữ đường vợt gọn và đọc xoáy trước khi đẩy hoặc mở bóng'],
  ['2026-06-18','10:30','product','Yinhe Earth Pro khi cần mặt dễ kiểm soát','phù hợp người muốn tập đều, block và mở bóng vừa lực'],
  ['2026-06-18','12:15','combo','Combo cho người chơi lại sau thời gian nghỉ','tìm lại cảm giác bóng bằng setup vừa phải, không quá nảy'],
  ['2026-06-18','15:30','engagement','Bạn thích thắng điểm bằng giao bóng hay rally','xác định phong cách thắng điểm để chọn bài tập phù hợp'],
  ['2026-06-18','18:30','promo','Gửi ngân sách để nhận gợi ý setup cuối tuần','tư vấn theo trình độ, lối chơi và lỗi đang gặp'],
  ['2026-06-18','21:15','knowledge','Recap nhanh ba lỗi làm bóng bay dài','rà điểm chạm, góc vợt và hướng lực trước khi đổi đồ'],
  ['2026-06-19','07:30','knowledge','Checklist trước buổi đánh cuối tuần','khởi động, kiểm tra vợt và chọn một mục tiêu kỹ thuật'],
  ['2026-06-19','10:30','trust','Tư vấn đúng bắt đầu từ việc hỏi đúng','hiểu trình độ, ngân sách và lỗi hiện tại trước khi chốt combo'],
  ['2026-06-19','12:15','promo','Ưu đãi cuối tuần theo nhu cầu thật','gợi ý combo và phụ kiện vừa ngân sách, không mua quá tay'],
  ['2026-06-19','15:30','engagement','Một buổi đánh vui cần điều gì nhất','bình chọn điều làm buổi đánh cuối tuần đáng nhớ hơn'],
  ['2026-06-19','21:15','combo','Setup đi giao lưu nên ưu tiên ổn định','giữ bóng chắc khi gặp bàn lạ, bóng lạ và đối thủ lạ'],
  ['2026-06-20','08:30','knowledge','Tip thực chiến khi bị ép trái liên tục','đổi hướng, giữ bóng thấp và tìm cơ hội thoát nhịp bị động'],
  ['2026-06-20','11:00','trust','Kiểm tra sản phẩm trước khi giao giúp yên tâm hơn','rõ sản phẩm, rõ tình trạng và đóng gói cẩn thận'],
  ['2026-06-20','16:00','engagement','Kèo cuối tuần của bạn là gì','chọn một mục tiêu nhỏ để test trong trận thật'],
  ['2026-06-20','20:30','engagement','Recap thứ bảy một điểm bạn làm tốt','ghi lại điều nên lặp lại thay vì chỉ soi lỗi'],
  ['2026-06-21','08:30','knowledge','FAQ người mới nên tập đều hay đánh trận nhiều','chia thời gian giữa tập nền và đánh trận cho hợp lý'],
  ['2026-06-21','11:00','knowledge','Tổng hợp ba việc nên làm trước tuần tập mới','rà lỗi, kiểm tra dụng cụ và chọn mục tiêu nhỏ'],
  ['2026-06-21','16:00','engagement','Bình chọn chủ đề tuần tới','chọn chủ đề anh em muốn BongBanViet làm sâu hơn'],
  ['2026-06-21','20:30','engagement','Chốt mục tiêu nhỏ cho tuần mới','viết một mục tiêu đủ nhỏ để làm đều từ thứ hai'],
];

const label = {
  knowledge: 'Kiến thức',
  product: 'Sản phẩm',
  combo: 'Combo',
  engagement: 'Tương tác',
  promo: 'Promo',
  trust: 'Trust',
};

const hashtags = {
  knowledge: '#BongBanViet #KyThuatBongBan #HocBongBan #MeoChuyenSau #TableTennis',
  product: '#BongBanViet #DungCuBongBan #HangChinhHang #CotVot #MatVot #BongBanHaNoi',
  combo: '#BongBanViet #ComboVot #TuVanBongBan #SetupBongBan #GoiYSetup',
  engagement: '#BongBanViet #BongBanCongDong #HoiDapBongBan #BinhChon',
  promo: '#BongBanViet #UuDai #KhuyenMai #ComboGiaRe #LienHeZalo',
  trust: '#BongBanViet #HangChinhHang #UyTin #BongBanVietCom',
};

const links = {
  knowledge: 'https://bongbanviet.com/kien-thuc.html',
  product: 'https://bongbanviet.com/san-pham.html',
  combo: 'https://bongbanviet.com/combo-vot.html',
  engagement: 'https://bongbanviet.com',
  promo: 'https://bongbanviet.com',
  trust: 'https://bongbanviet.com',
};

function sourceId(date, time) {
  return `bbv-facebook-${date.replace(/-/g, '')}${time.replace(':', '')}`;
}

function bullets(pillar, angle) {
  if (pillar === 'knowledge') return [
    `Tập trung vào ${angle}, không sửa quá nhiều thứ trong một buổi.`,
    'Bắt đầu chậm để cảm nhận điểm chạm, sau đó mới tăng tốc.',
    'Quan sát đường bóng sau mỗi cú đánh để biết mình cần chỉnh góc vợt hay chân.',
    'Ghi lại một lỗi lặp lại nhiều nhất sau buổi tập để tuần sau sửa tiếp.',
  ];
  if (pillar === 'product') return [
    `Phù hợp khi bạn cần ${angle}.`,
    'Nên chọn theo mục tiêu tập luyện, trình độ và combo hiện tại.',
    'Đừng chỉ nhìn tên sản phẩm; cảm giác vào bàn mới là thứ quyết định dùng lâu dài.',
    'Nếu chưa chắc, hãy mô tả lối chơi để được tư vấn trước khi chốt.',
  ];
  if (pillar === 'combo') return [
    `Mục tiêu chính của setup này là ${angle}.`,
    'Cốt và mặt vợt nên bổ trợ cho điểm mạnh, đồng thời che bớt điểm yếu hiện tại.',
    'Người đang sửa kỹ thuật nên tránh combo quá nhanh hoặc quá khó kiểm soát.',
    'Một combo hợp tay là combo giúp bạn tự tin trong trận thật, không chỉ đẹp trên thông số.',
  ];
  if (pillar === 'promo') return [
    `BongBanViet tư vấn theo ${angle}.`,
    'Gửi ngân sách, trình độ và lối chơi để nhận gợi ý sát hơn.',
    'Có thể chọn combo, bóng, bao vợt hoặc phụ kiện theo đúng nhu cầu buổi tập.',
    'Ưu tiên phương án dễ dùng và hợp túi tiền trước khi nâng cấp mạnh hơn.',
  ];
  if (pillar === 'trust') return [
    `Điểm quan trọng là ${angle}.`,
    'Tư vấn bắt đầu từ nhu cầu thật, không ép chọn món quá khó chơi.',
    'Thông tin sản phẩm cần rõ ràng để người chơi yên tâm trước khi mua.',
    'Sau khi nhận hàng, nếu cần rà lại cảm giác setup, BongBanViet vẫn hỗ trợ tiếp.',
  ];
  return [
    `Chủ đề hôm nay: ${angle}.`,
    'A: Chọn phương án an toàn và chắc bóng.',
    'B: Chọn phương án tấn công chủ động hơn.',
    'C: Chọn phương án cân bằng để chơi lâu dài.',
    'Comment lựa chọn của bạn để BongBanViet làm nội dung sát hơn.',
  ];
}

function intro(pillar, topic, angle) {
  if (pillar === 'engagement') return `🏓 ${topic} là câu hỏi nhỏ nhưng giúp anh em nhìn rõ thói quen chơi bóng của mình hơn.`;
  if (pillar === 'promo') return `🏓 Cuối tuần là thời điểm tốt để rà lại dụng cụ và chọn phương án mua sắm đúng nhu cầu.`;
  if (pillar === 'trust') return `🏓 Chọn đồ bóng bàn yên tâm hơn khi mọi thứ được tư vấn rõ, kiểm tra kỹ và giải thích dễ hiểu.`;
  return `🏓 ${topic} là một điểm nhỏ nhưng ảnh hưởng rất nhiều tới cảm giác vào bàn của người chơi phong trào.`;
}

function cta(pillar) {
  if (pillar === 'engagement') return 'Bạn chọn phương án nào? Comment bên dưới để BongBanViet cùng anh em phân tích tiếp.';
  if (pillar === 'promo') return 'Inbox hoặc Zalo 096.1269.386, BongBanViet tư vấn theo nhu cầu thật và ngân sách thật.';
  if (pillar === 'trust') return 'Cần kiểm tra setup hoặc hỏi trước khi mua, cứ gửi thông tin cho BongBanViet nhé.';
  return 'Lưu lại để áp dụng trong buổi tập tới. Nếu cần tư vấn theo combo hiện tại, gửi BongBanViet xem cùng.';
}

const posts = slots.map(([date, time, pillar, topic, angle]) => ({
  source_id: sourceId(date, time),
  topic,
  pillar,
  status: 'scheduled',
  brand_voice: 'chuyên nghiệp, gần gũi, thực chiến',
  source_type: 'direct-prompt',
  source_urls: [links[pillar]],
  source_notes: `Tuần mới 15/06/2026 | Slot ${time} | ${label[pillar]}`,
  fact_summary: 'Nội dung tư vấn thực chiến cho người chơi bóng bàn phong trào; không đưa claim về giá, tồn kho hoặc kết quả thi đấu.',
  post_text: `[${label[pillar]}] - ${topic}\n\n${intro(pillar, topic, angle)}\n\n${bullets(pillar, angle).map(x => `• ${x}`).join('\n')}\n\n${cta(pillar)}\n\nBóng Bàn Việt - Đồng Hành Cùng Mọi Tay Vợt\n📌 Website: bongbanviet.com\n📞 Hotline/Zalo: 096.1269.386\n\n${hashtags[pillar]}`,
  website_link: links[pillar],
  image_prompt: `Professional square 1080x1080 Vietnamese Facebook infographic for BongBanViet about "${topic}". Clean premium table tennis retail style, red black white brand palette, realistic table tennis equipment or training scene, readable Vietnamese headline, 3 concise visual bullet points, subtle footer with bongbanviet.com. Use the BongBanViet logo image from "logo_bongbanviet.png" in the final design. Do not distort the logo, no fake QR code, no phone number inside the image.`,
  scheduled_time: `${date}T${time}:00`,
}));

(async () => {
  const res = await fetch('http://localhost:3001/api/fb-posts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ posts }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  console.log(text);
})();
