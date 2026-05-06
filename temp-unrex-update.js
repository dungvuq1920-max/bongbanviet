const Database = require('better-sqlite3');
const db = new Database('C:\\Users\\dungvuq1920\\Desktop\\BONGBANVIET\\db\\bongbanviet.db');

const data = [
  // ─────────────────────────────────────────────
  // 1. UNREX AMBER — 5 lớp gỗ thuần, ALL+/OFF-
  // ─────────────────────────────────────────────
  {
    slug: "unrex-amber",
    specs: {
      "- Phân loại": "ALL+/OFF-",
      "- Tốc độ": "8.5",
      "- Kiểm soát": "9.5",
      "- Trọng lượng": "~83–88g",
      "- Cấu tạo": "5 lớp gỗ thuần (All Wood)",
      "- Độ dày": "~5.8 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cốt vợt 5 lớp gỗ thuần (All Wood), không fiber tổng hợp. Lớp ngoài là gỗ mềm mại, kết hợp lõi gỗ cứng để cân bằng lực và kiểm soát. Sản xuất bởi Unrex Việt Nam theo tiêu chuẩn chất lượng cao.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ vừa phải, phù hợp phong cách tấn công nhẹ nhàng và all-around. Dwell time cao giúp bóng bám mặt vợt lâu hơn, hỗ trợ tốt cho cú topspin chậm đến trung bình. Không thiên tấn công quyết liệt.

3. 🎯 **Kiểm soát & Cảm giác** — Kiểm soát xuất sắc nhờ cấu trúc gỗ thuần hấp thụ rung tốt. Cảm giác bóng mềm, trực quan, dễ cảm nhận điểm tiếp xúc. Phản hồi nhẹ nhàng, không bị giật tay khi đỡ bóng xoáy.

4. 🌟 **Điểm Nổi Bật** — Cốt entry-level thân thiện nhất trong dòng UNREX. Giá thành hợp lý, hoàn toàn do Unrex Việt Nam nghiên cứu và sản xuất, mang bản sắc riêng không phụ thuộc hãng nước ngoài. Lý tưởng để xây dựng nền tảng kỹ thuật vững chắc.

5. 👤 **Phù hợp với ai?** — Người mới bắt đầu và tay vợt nghiệp dư muốn học kỹ thuật topspin cơ bản. Phong cách all-around, thiên kiểm soát và độ ổn định hơn tốc độ.`
  },

  // ─────────────────────────────────────────────
  // 2. DIAMOND PRO — 5 lớp (3 gỗ + 2 Carbon Outer), Kiso Hinoki, OFF+
  // ─────────────────────────────────────────────
  {
    slug: "diamond-pro",
    specs: {
      "- Phân loại": "OFF+",
      "- Tốc độ": "10.5",
      "- Kiểm soát": "9.0",
      "- Trọng lượng": "~88–93g",
      "- Cấu tạo": "5 lớp: 3 gỗ (Kiso Hinoki ngoài) + 2 Carbon (Outer)",
      "- Độ dày": "~6.5 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 5 lớp gồm 3 lớp gỗ và 2 lớp Carbon đặt ở ngoài (Outer). Lớp bề mặt là gỗ Kiso Hinoki 100 năm tuổi — loại gỗ Hinoki già nhất, cứng nhất, cho cảm giác bóng rõ nét và đặc trưng. Lõi gỗ Limba tạo độ đàn hồi cao.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao nhờ Carbon đặt sát bề mặt (Outer) truyền lực trực tiếp, phản hồi tức thì. Lực đánh vào bóng mạnh, quỹ đạo bóng thẳng và nhanh. Thích hợp cho các cú smash, loop tốc độ cao và phản công xa bàn.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác bóng rõ ràng và chắc tay nhờ Kiso Hinoki bề mặt — khác biệt hoàn toàn so với Koto hay Limba. Kiểm soát ở mức tốt cho cốt OFF+, đòi hỏi kỹ thuật tương đối để khai thác tối đa. Rung vừa phải, không quá cứng.

4. 🌟 **Điểm Nổi Bật** — Flagship cao cấp nhất dòng gỗ của Unrex. Kiso Hinoki 100 năm tuổi là vật liệu hiếm, thường chỉ thấy ở cốt premium Butterfly hay Nittaku. Kết hợp carbon giúp Diamond Pro vừa có "hồn" của gỗ Hinoki, vừa có lực của carbon.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ trung đến cao, phong cách tấn công tích cực. Đặc biệt phù hợp người yêu thích cảm giác gỗ Hinoki nhưng muốn thêm tốc độ từ carbon.`
  },

  // ─────────────────────────────────────────────
  // 3. GARNET ALC — 7 lớp (5 gỗ Koto + 2 ALC Outer), OFF
  // ─────────────────────────────────────────────
  {
    slug: "garnet-alc",
    specs: {
      "- Phân loại": "OFF",
      "- Tốc độ": "10.2",
      "- Kiểm soát": "9.5",
      "- Trọng lượng": "~85–90g",
      "- Cấu tạo": "7 lớp: 5 gỗ (Koto ngoài) + 2 Arylate-Carbon (Outer)",
      "- Độ dày": "5.7 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp gồm 5 lớp gỗ và 2 lớp sợi Arylate-Carbon đặt ở ngoài (Outer). Lớp bề mặt là gỗ Koto chất lượng cao, sợi ALC được nhập từ nhà máy Toyobo Nhật Bản — cùng nguồn nguyên liệu với các thương hiệu hàng đầu thế giới.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao ổn định nhờ ALC Outer truyền lực nhanh và đều. Phản hồi mạnh mẽ trong các pha loop tốc độ và tấn công hai cánh. Dễ tạo bóng có tốc độ cao mà vẫn đủ xoáy để ép đối thủ.

3. 🎯 **Kiểm soát & Cảm giác** — Điểm mạnh vượt trội của Garnet ALC là cảm giác mềm mại và ổn định hiếm thấy ở cốt ALC Outer. Gỗ Koto hấp thụ một phần rung giúp cảm giác bóng dễ chịu. Kiểm soát rất tốt, phù hợp thi đấu cường độ cao.

4. 🌟 **Điểm Nổi Bật** — ALC Outer kết hợp Koto mặt ngoài là công thức tối ưu: tốc độ của carbon + cảm giác của gỗ. Sợi ALC Toyobo Nhật Bản đảm bảo chất lượng bền vững. Được nhiều tay vợt chuyên nghiệp Việt Nam tin dùng trong thi đấu thực chiến.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ trung đến chuyên, phong cách tấn công tích cực hai cánh. Người muốn cốt ALC Outer chuẩn mực nhưng vẫn kiểm soát được mà không phải hy sinh cảm giác.`
  },

  // ─────────────────────────────────────────────
  // 4. GARNET KC — 7 lớp (5 gỗ Koto + 2 Kevlar Carbon Outer), OFF+
  // ─────────────────────────────────────────────
  {
    slug: "garnet-kc",
    specs: {
      "- Phân loại": "OFF+",
      "- Tốc độ": "10.7",
      "- Kiểm soát": "9.1",
      "- Trọng lượng": "~85–90g",
      "- Cấu tạo": "7 lớp: 5 gỗ (Koto ngoài) + 2 Kevlar Carbon (Outer)",
      "- Độ dày": "5.8 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp với 5 lớp gỗ và 2 lớp sợi Kevlar Carbon đặt ở ngoài (Outer). Lớp bề mặt gỗ Koto. Sợi Kevlar Carbon là composite đặc biệt kết hợp độ bền Kevlar và tốc độ Carbon, tạo ra vật liệu cứng hơn ALC nhưng ít rung hơn thuần carbon.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao hơn Garnet ALC một bậc nhờ đặc tính cứng hơn của Kevlar Carbon. Phản hồi tức thì và dứt khoát, lực đánh vào bóng lớn. Thích hợp phong cách tấn công quyết liệt, loop tốc độ cao và smash dứt điểm.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác chắc và rõ nét hơn ALC, yêu cầu kỹ thuật tốt hơn để kiểm soát. Rung trung bình — Kevlar hấp thụ một phần dao động từ carbon. Thích hợp cho tay vợt có kỹ thuật cơ bản vững, thích cảm giác cứng cáp.

4. 🌟 **Điểm Nổi Bật** — Sợi Kevlar Carbon là lựa chọn ít phổ biến trên thị trường, mang lại đặc tính riêng biệt: bền hơn, cứng hơn ALC nhưng không thô như thuần carbon. Garnet KC lấp đầy khoảng trống giữa ALC và ZLC trong dòng Garnet.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ khá đến cao, phong cách tấn công mạnh. Người đã quen Garnet ALC và muốn thêm tốc độ, hoặc người thích cảm giác cứng và dứt khoát hơn ALC thông thường.`
  },

  // ─────────────────────────────────────────────
  // 5. GARNET ZC — 7 lớp (5 gỗ Koto + 2 Zylon Carbon Outer), OFF+
  // ─────────────────────────────────────────────
  {
    slug: "garnet-zc",
    specs: {
      "- Phân loại": "OFF+",
      "- Tốc độ": "10.9",
      "- Kiểm soát": "9.0",
      "- Trọng lượng": "~85–90g",
      "- Cấu tạo": "7 lớp: 5 gỗ (Koto ngoài) + 2 Zylon Carbon (Outer)",
      "- Độ dày": "5.7 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp với 5 lớp gỗ và 2 lớp sợi Zylon Carbon đặt ở ngoài (Outer). Lớp bề mặt gỗ Koto. Sợi Zylon Carbon (ZLC) là loại fiber cao cấp nhất trong dòng Garnet, có độ cứng và đàn hồi vượt trội so với ALC và Kevlar Carbon.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao nhất trong 3 phiên bản Garnet. ZLC Outer phóng bóng mạnh và nhanh, tạo áp lực tấn công tối đa. Lực đánh vào bóng dứt khoát, quỹ đạo thẳng và xuyên thủng. Phù hợp tấn công xa bàn, smash và loop tốc độ cao.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác cứng và rõ ràng đặc trưng của ZLC Outer. Đòi hỏi kỹ thuật tốt để kiểm soát bóng trong tay. Rating kiểm soát 102 (Garnet ZC) cho thấy khả năng phản hồi vượt ngưỡng thông thường — cần thích nghi thời gian đầu.

4. 🌟 **Điểm Nổi Bật** — Flagship cao cấp nhất trong dòng Garnet của Unrex. ZLC (Zylon Carbon) là vật liệu cao cấp tương đương ZLF của Butterfly, mang lại tốc độ và lực đàn hồi vượt trội. Ít thương hiệu Việt Nam có cốt ZLC ở mức giá này.

5. 👤 **Phù hợp với ai?** — Tay vợt nâng cao và chuyên nghiệp, phong cách tấn công tốc độ cao. Người đã thành thục kỹ thuật, muốn khai thác tối đa tốc độ và lực từ cốt vợt.`
  },

  // ─────────────────────────────────────────────
  // 6. LIBERTY ALC — 7 lớp (5 gỗ Koto + 2 ALC Innerfiber), OFF
  // ─────────────────────────────────────────────
  {
    slug: "liberty-alc",
    specs: {
      "- Phân loại": "OFF",
      "- Tốc độ": "9.6",
      "- Kiểm soát": "9.5",
      "- Trọng lượng": "~88g (±5g)",
      "- Cấu tạo": "7 lớp: 5 gỗ (Koto ngoài) + 2 Arylate-Carbon (Innerfiber)",
      "- Độ dày": "5.7 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp với 5 lớp gỗ và 2 lớp sợi Arylate-Carbon đặt sâu gần lõi (Innerfiber). Lớp bề mặt gỗ Koto cao cấp. Sợi ALC Toyobo Nhật Bản. Công nghệ sấy lõi mới của Unrex giúp tăng đàn hồi lõi gỗ, khắc phục nhược điểm thiếu lực của Inner ALC truyền thống.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao nhưng được kiểm soát tốt hơn ALC Outer nhờ lớp gỗ Koto dày bao bọc ngoài. Lực đánh tốt, phản hồi ổn định. Không quá nhanh như Garnet ALC nhưng bù lại dễ tạo xoáy và kiểm soát đường bóng hơn.

3. 🎯 **Kiểm soát & Cảm giác** — Điểm mạnh vượt trội: kiểm soát xuất sắc kết hợp cảm giác bóng mềm, dwell time cao hơn ALC Outer. Rung vừa phải, tay cảm nhận bóng rõ ràng. Dễ tạo topspin xoáy sâu và điều chỉnh đường bóng chính xác.

4. 🌟 **Điểm Nổi Bật** — Liberty ALC là sự cân bằng hoàn hảo giữa tốc độ ALC và cảm giác của gỗ thuần. Công nghệ Innerfiber của Unrex được tối ưu riêng biệt, không phải copy nguyên mẫu từ thương hiệu nước ngoài. Tốc độ 96, kiểm soát 95 — một trong những tỷ lệ cân bằng tốt nhất trong dòng UNREX.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ trung đến cao, phong cách tấn công tích cực nhưng cần kiểm soát. Lý tưởng cho người muốn nâng cấp từ gỗ thuần lên carbon lần đầu, hoặc tay vợt cần cốt vừa nhanh vừa tạo xoáy tốt.`
  },

  // ─────────────────────────────────────────────
  // 7. LIBERTY — 7 lớp gỗ thuần (Limba ngoài), ALL+/OFF-
  // ─────────────────────────────────────────────
  {
    slug: "liberty",
    specs: {
      "- Phân loại": "ALL+/OFF-",
      "- Tốc độ": "9.5",
      "- Kiểm soát": "9.5",
      "- Trọng lượng": "~88–92g",
      "- Cấu tạo": "7 lớp gỗ thuần (Limba ngoài, All Wood)",
      "- Độ dày": "~6.8 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp gỗ thuần (All Wood), không fiber tổng hợp. Lớp bề mặt là gỗ Limba — loại gỗ châu Phi nổi tiếng với khả năng tạo xoáy vượt trội. Độ dày 6.8mm cho cảm giác chắc tay và ổn định. Tích hợp công nghệ APH, AVD, SPT, OFT, WBS của Unrex.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ vừa phải nhưng ổn định, phù hợp cho lối chơi tấn công kiểm soát. Lực đánh đủ để tấn công hiệu quả từ tầm trung. Không tạo cú đánh cực mạnh như carbon nhưng bù lại dễ điều chỉnh lực đánh chính xác hơn.

3. 🎯 **Kiểm soát & Cảm giác** — Kiểm soát rất tốt (9.5), cảm giác bóng mềm và dễ chịu đặc trưng của gỗ thuần 7 lớp. Dwell time cao, hỗ trợ mạnh cho topspin xoáy sâu. Công nghệ AVD giảm rung tiêu cực, tay vợt cảm nhận bóng rõ ràng trong mọi pha đánh.

4. 🌟 **Điểm Nổi Bật** — Liberty 7 lớp gỗ là cốt vợt gỗ thuần cao nhất của Unrex — xây dựng kỹ thuật toàn diện. Gỗ Limba ngoài tạo xoáy tốt hơn Koto, phù hợp kiểu đánh dựa vào xoáy để tấn công. Công nghệ OFT tối ưu độ linh hoạt theo khoảng cách đánh.

5. 👤 **Phù hợp với ai?** — Tay vợt từ trung cấp trở lên, phong cách all-around thiên tấn công. Người coi trọng kỹ thuật và kiểm soát hơn tốc độ thuần túy. Đặc biệt phù hợp tay vợt cần nền tảng kỹ thuật vững để sau nâng lên carbon.`
  },

  // ─────────────────────────────────────────────
  // 8. LIBERTY POWER — 7 lớp (5 gỗ Limba + 2 Power Fiber Carbon Outer), OFF
  // ─────────────────────────────────────────────
  {
    slug: "liberty-power",
    specs: {
      "- Phân loại": "OFF",
      "- Tốc độ": "9.3",
      "- Kiểm soát": "9.2",
      "- Trọng lượng": "~89g",
      "- Cấu tạo": "7 lớp: 5 gỗ (Limba ngoài) + 2 Power Fiber Carbon (Outer)",
      "- Độ dày": "5.7 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp gồm 5 lớp gỗ và 2 lớp Power Fiber Carbon đặt ở ngoài (Outer). Lớp bề mặt là gỗ Limba — loại gỗ tạo xoáy tốt nhất hiện nay. Power Fiber là công nghệ sợi tổng hợp thế hệ mới của Unrex, nhanh hơn ALC nhưng vẫn giữ cảm giác mềm mại.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao hơn Liberty gỗ thuần nhờ Power Fiber Carbon Outer. Phản hồi nhanh và đủ lực cho tấn công hai cánh hiệu quả. Đã được tay vợt Trần Anh Tuấn sử dụng giành cú đúp HCV đơn và đôi tại Giải Cúp Báo Hà Nội 2017.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác mềm mại hơn ALC Carbon thông thường — nhờ Limba ngoài và Power Fiber được thiết kế hấp thụ rung tốt. Kiểm soát tốt cho cốt có carbon, dễ thực hiện cả phòng thủ lẫn tấn công đều tay.

4. 🌟 **Điểm Nổi Bật** — Liberty Power là cốt vợt chính thức được tay vợt chuyên nghiệp Việt Nam thi đấu và đạt thành tích cao. Power Fiber Carbon là công nghệ độc quyền Unrex — tốc độ vượt ALC nhưng duy trì cảm giác tốt của Limba. Sự kết hợp Limba + Power Fiber ít thấy trên thị trường.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ trung đến cao, phong cách tấn công toàn diện hai cánh. Người muốn cốt carbon có lực mạnh nhưng không muốn đánh đổi cảm giác bóng như các cốt carbon cứng thông thường.`
  },

  // ─────────────────────────────────────────────
  // 9. LIBERTY SPEED — 7 lớp (5 gỗ + 2 Carbon Outer), OFF+
  // ─────────────────────────────────────────────
  {
    slug: "liberty-speed",
    specs: {
      "- Phân loại": "OFF+",
      "- Tốc độ": "10.5",
      "- Kiểm soát": "9.0",
      "- Trọng lượng": "~85–90g",
      "- Cấu tạo": "7 lớp: 5 gỗ + 2 Carbon (Outer)",
      "- Độ dày": "6.0 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp với 5 lớp gỗ và 2 lớp sợi Carbon đặt ở ngoài (Outer). Thiết kế Carbon Outer tối ưu hóa hoàn toàn cho tốc độ — đây là phiên bản nhanh nhất trong dòng Liberty của Unrex.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ rất cao, phản hồi tức thì và dứt khoát. Carbon Outer truyền lực thẳng vào bóng tạo ra những cú đánh xuyên thủng áp lực. Phù hợp lối chơi tấn công quyết liệt, loop tốc độ và smash dứt điểm ở tầm xa.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác cứng và rõ ràng của Carbon Outer. Kiểm soát đòi hỏi kỹ thuật tốt để thuần hóa tốc độ cao. Dwell time ngắn hơn gỗ thuần — phù hợp tay vợt thích đánh nhanh, điểm tiếp xúc ngắn.

4. 🌟 **Điểm Nổi Bật** — Liberty Speed là phiên bản mạnh nhất dòng Liberty — giữ tên "Liberty" (kiểm soát) nhưng thêm "Speed" (tốc độ) để tạo ra cốt tấn công thuần túy. Giá thành hợp lý hơn Garnet ZC nhưng tốc độ tương đương, phù hợp cho tay vợt ngân sách có hạn.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ khá đến cao, phong cách tấn công tốc độ cao. Người muốn tối đa hóa tốc độ trong dòng Liberty mà không cần lên Garnet.`
  },

  // ─────────────────────────────────────────────
  // 10. NOVA CARBON — 7 lớp (5 gỗ Limba + 2 Carbon Outer), OFF+
  // ─────────────────────────────────────────────
  {
    slug: "nova-carbon",
    specs: {
      "- Phân loại": "OFF+",
      "- Tốc độ": "9.5",
      "- Kiểm soát": "9.0",
      "- Trọng lượng": "~87–92g",
      "- Cấu tạo": "7 lớp: 5 gỗ (Limba ngoài) + 2 Carbon (Outer)",
      "- Độ dày": "6.4 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp gồm 5 lớp gỗ và 2 lớp Carbon đặt ở ngoài (Outer). Lớp bề mặt là gỗ Limba — khác với phần lớn cốt carbon dùng Koto hay Hinoki. Độ dày 6.4mm tạo cảm giác chắc tay.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao với phản hồi bóng nhanh và tốc độ ổn định. Cấu trúc Carbon Outer kết hợp Limba tạo ra bóng vừa nhanh vừa có xoáy tốt hơn carbon thông thường. Thích hợp loop tốc độ, smash và tấn công toàn diện.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác ổn định và dễ chịu hơn Carbon Outer thông thường nhờ Limba hấp thụ một phần rung. Kiểm soát ở mức tốt cho cốt carbon — phù hợp cả tấn công lẫn phòng thủ chủ động. Bóng có quỹ đạo trung bình, dễ kiểm soát đường bóng.

4. 🌟 **Điểm Nổi Bật** — Nova Carbon là cốt vợt carbon giá bình dân nhất của Unrex — điểm vào của phân khúc carbon. Lớp ngoài Limba tạo xoáy vượt trội so với carbon thông thường là tính năng hiếm ở mức giá này. Phù hợp tay vợt muốn trải nghiệm carbon lần đầu.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ trung cấp muốn lần đầu nâng cấp lên cốt carbon, hoặc người chơi phong trào cần cốt đa dụng tốc độ cao với giá hợp lý.`
  },

  // ─────────────────────────────────────────────
  // 11. OPAL — 5 lớp gỗ thuần, ALL+/OFF-
  // ─────────────────────────────────────────────
  {
    slug: "opal",
    specs: {
      "- Phân loại": "ALL+/OFF-",
      "- Tốc độ": "9.0",
      "- Kiểm soát": "9.7",
      "- Trọng lượng": "~83–88g",
      "- Cấu tạo": "5 lớp gỗ thuần (All Wood)",
      "- Độ dày": "~5.7 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cốt vợt 5 lớp gỗ thuần (All Wood), không fiber tổng hợp. Cấu trúc đơn giản nhưng được Unrex tinh chỉnh tỉ mỉ về lựa chọn loại gỗ và ghép lớp để tối ưu cảm giác. Trọng lượng nhẹ, phù hợp nhiều kiểu tay cầm.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ vừa phải, thiên về kiểm soát hơn tốc độ. Dwell time cao giúp bóng bám mặt vợt lâu, hỗ trợ tạo xoáy sâu và tấn công nhẹ nhàng. Không phù hợp cho lối đánh smash mạnh hoặc tấn công xa bàn.

3. 🎯 **Kiểm soát & Cảm giác** — Kiểm soát xuất sắc (9.7) — một trong những cốt kiểm soát tốt nhất dòng UNREX. Cảm giác bóng mềm và trực quan, phản hồi rõ ràng giúp tay vợt điều chỉnh kỹ thuật dễ dàng. Ít rung, thoải mái ngay cả khi đỡ bóng xoáy mạnh.

4. 🌟 **Điểm Nổi Bật** — Opal là cốt vợt kiểm soát cao nhất trong phân khúc gỗ thuần 5 lớp của Unrex. Lý tưởng để xây dựng và hoàn thiện kỹ thuật cơ bản: serve xoáy, đỡ phòng thủ, topspin nhẹ — tất cả đều phản hồi chính xác và rõ ràng.

5. 👤 **Phù hợp với ai?** — Người mới bắt đầu đến trình độ trung cấp, phong cách all-around thiên kiểm soát. Đặc biệt phù hợp người học kỹ thuật cơ bản và tay vợt phòng thủ chủ động.`
  },

  // ─────────────────────────────────────────────
  // 12. RUBY — 7 lớp gỗ thuần, OFF-/OFF
  // ─────────────────────────────────────────────
  {
    slug: "ruby",
    specs: {
      "- Phân loại": "OFF-/OFF",
      "- Tốc độ": "10.0",
      "- Kiểm soát": "9.5",
      "- Trọng lượng": "~84–89g",
      "- Cấu tạo": "7 lớp gỗ thuần (All Wood)",
      "- Độ dày": "6.2 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cốt vợt 7 lớp gỗ thuần cao cấp (All Wood). Cấu trúc 7 lớp tăng độ cứng và lực đánh so với 5 lớp, trong khi vẫn giữ nguyên cảm giác tự nhiên của gỗ. Unrex lựa chọn kỹ lưỡng loại gỗ chất lượng cao cho từng lớp để tối ưu hiệu suất tổng thể.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ trung bình cao — đủ mạnh cho tấn công tích cực nhưng không quá nhanh như carbon. 7 lớp gỗ tạo lực đánh tốt hơn 5 lớp, phù hợp loop tốc độ trung bình và smash ở tầm gần đến trung.

3. 🎯 **Kiểm soát & Cảm giác** — Kiểm soát rất tốt (9.5) — điểm mạnh của gỗ thuần 7 lớp là vừa có lực vừa dễ kiểm soát. Cảm giác bóng chắc tay và rõ ràng hơn 5 lớp, tay vợt cảm nhận được rõ độ xoáy và lực bóng đến. Rung vừa phải, thoải mái.

4. 🌟 **Điểm Nổi Bật** — Ruby là cốt vợt gỗ thuần 7 lớp cao cấp nhất trong dòng đá quý của Unrex (trước khi lên Sapphire). Mang lại trải nghiệm tấn công đủ mạnh mà không cần carbon — lý tưởng cho người không thích cảm giác cứng của fiber tổng hợp.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ trung đến khá, phong cách tấn công kiểm soát. Người yêu thích cảm giác gỗ thuần nhưng muốn thêm lực và tốc độ so với 5 lớp. Phù hợp lối chơi gần bàn đến trung bình.`
  },

  // ─────────────────────────────────────────────
  // 13. TOPAZ ZLC — 7 lớp (5 gỗ + 2 ZL-Carbon Outer), OFF+
  // ─────────────────────────────────────────────
  {
    slug: "topaz-zlc",
    specs: {
      "- Phân loại": "OFF+",
      "- Tốc độ": "11.0",
      "- Kiểm soát": "9.0",
      "- Trọng lượng": "~86–91g",
      "- Cấu tạo": "7 lớp: 5 gỗ + 2 ZL-Carbon (Outer)",
      "- Độ dày": "5.8 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp với 5 lớp gỗ và 2 lớp sợi ZL-Carbon đặt ở ngoài (Outer). ZL-Carbon (Zylon Carbon) là loại sợi carbon cao cấp nhất trong danh mục Unrex, có modulus đàn hồi cao hơn ALC và Kevlar Carbon — tương đương ZLF của Butterfly.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cực cao — nhanh nhất trong dòng Topaz. ZLC Outer phóng bóng với lực cực mạnh và tốc độ tối đa. Loop tốc độ, phản công mạnh và smash dứt điểm đều được thực hiện với uy lực tối đa. Quỹ đạo bóng thẳng và thấp.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác cứng và dứt khoát của ZLC, yêu cầu kỹ thuật cao để kiểm soát. Thời gian làm quen ban đầu cần thiết để điều chỉnh lực đánh. Sau khi thuần thục, ZLC cho phép tấn công chủ động và tự tin ở mọi khoảng cách.

4. 🌟 **Điểm Nổi Bật** — Topaz ZLC là cốt vợt ZLC duy nhất và cao cấp nhất của Unrex trong dòng Topaz. ZLC Outer mang lại tốc độ và lực đàn hồi mà ít cốt nội địa đạt được. Phù hợp tay vợt muốn cốt đỉnh cao của UNREX với mức giá cạnh tranh.

5. 👤 **Phù hợp với ai?** — Tay vợt nâng cao và chuyên nghiệp, phong cách tấn công tốc độ cực cao. Người đã quen với cốt carbon nhanh và muốn đẩy lên giới hạn tốc độ cao nhất.`
  },

  // ─────────────────────────────────────────────
  // 14. TOPAZ CARBON — 7 lớp (5 gỗ + 2 Carbon Outer), OFF+
  // ─────────────────────────────────────────────
  {
    slug: "topaz-carbon",
    specs: {
      "- Phân loại": "OFF+",
      "- Tốc độ": "10.6",
      "- Kiểm soát": "9.1",
      "- Trọng lượng": "~85–90g",
      "- Cấu tạo": "7 lớp: 5 gỗ + 2 Carbon (Outer)",
      "- Độ dày": "5.9 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp với 5 lớp gỗ và 2 lớp Carbon đặt ở ngoài (Outer). Phiên bản carbon chuẩn trong dòng Topaz, cân bằng giữa tốc độ và khả năng tiếp cận. Ít tốn kém hơn Topaz ZLC nhưng vẫn có tốc độ tấn công cao.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao nhờ Carbon Outer truyền lực trực tiếp. Phản hồi nhanh và mạnh, phù hợp tấn công quyết liệt. Loop tốc độ và smash đều hiệu quả. Nhanh hơn Topaz gỗ thuần rõ rệt nhưng dễ kiểm soát hơn Topaz ZLC.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác rõ ràng và chắc tay của Carbon Outer. Đòi hỏi kỹ thuật ổn định để kiểm soát tốt, nhưng thích nghi nhanh hơn ZLC. Phù hợp tay vợt có kinh nghiệm với cốt carbon nhưng chưa sẵn sàng lên ZLC.

4. 🌟 **Điểm Nổi Bật** — Topaz Carbon là bước đệm lý tưởng giữa Topaz gỗ thuần và Topaz ZLC trong cùng dòng sản phẩm. Cho phép tay vợt trải nghiệm tốc độ carbon cao trong dòng Topaz với giá thành hợp lý hơn ZLC.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ khá đến cao, phong cách tấn công tích cực. Người muốn nâng cấp từ Topaz gỗ thuần lên carbon, hoặc người cần cốt tốc độ cao nhưng chưa đủ kỹ thuật cho ZLC.`
  },

  // ─────────────────────────────────────────────
  // 15. TOPAZ — 7 lớp gỗ thuần, ALL+/OFF-
  // ─────────────────────────────────────────────
  {
    slug: "topaz",
    specs: {
      "- Phân loại": "ALL+/OFF-",
      "- Tốc độ": "9.8",
      "- Kiểm soát": "9.6",
      "- Trọng lượng": "~84–89g",
      "- Cấu tạo": "7 lớp gỗ thuần (All Wood)",
      "- Độ dày": "6.2 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cốt vợt 7 lớp gỗ thuần (All Wood). Cấu trúc 7 lớp mang đến độ cứng và lực đánh tốt hơn 5 lớp trong khi vẫn giữ nguyên bản chất cảm giác tự nhiên của gỗ. Unrex tinh chỉnh ghép lớp để Topaz đạt cân bằng hoàn hảo giữa tấn công và kiểm soát.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ tốt cho gỗ thuần 7 lớp — nhanh hơn Opal và Amber (5 lớp) nhưng vẫn có dwell time cao của gỗ. Lực đánh ổn định, phù hợp tấn công từ tầm gần đến trung bình. Dễ tạo bóng xoáy sâu kết hợp tốc độ vừa phải.

3. 🎯 **Kiểm soát & Cảm giác** — Kiểm soát rất tốt (9.6) — điểm mạnh nổi bật của Topaz. Cảm giác bóng mềm và chắc tay cùng lúc, phản hồi rõ ràng trong mọi pha đánh. Ổn định cao, ít lỗi không mong muốn. Lý tưởng cho cả tấn công và phòng thủ chủ động.

4. 🌟 **Điểm Nổi Bật** — Topaz 7 lớp gỗ là cốt vợt đa dụng (all-around) cao cấp nhất trong dòng gỗ thuần UNREX — cân bằng hoàn hảo giữa tốc độ, kiểm soát và cảm giác. Dòng Topaz có đầy đủ phiên bản từ gỗ thuần đến ZLC, cho phép tay vợt nâng cấp dần trong cùng một "gia đình."

5. 👤 **Phù hợp với ai?** — Tay vợt từ trung cấp đến khá, phong cách all-around tấn công kiểm soát. Lý tưởng cho người muốn cốt vợt đa dụng — đánh được nhiều kiểu tình huống mà không cần hy sinh kiểm soát hay tốc độ.`
  },

  // ─────────────────────────────────────────────
  // 16. SAPPHIRE — 7 lớp gỗ thuần, OFF-/OFF
  // ─────────────────────────────────────────────
  {
    slug: "sapphire",
    specs: {
      "- Phân loại": "OFF-/OFF",
      "- Tốc độ": "10.1",
      "- Kiểm soát": "9.5",
      "- Trọng lượng": "~85–90g",
      "- Cấu tạo": "7 lớp gỗ thuần (All Wood)",
      "- Độ dày": "6.3 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cốt vợt 7 lớp gỗ thuần cao cấp (All Wood). Cấu trúc 7 lớp với độ dày 6.3mm — dày nhất trong dòng gỗ thuần UNREX — tạo lực đánh và độ cứng vượt trội. Unrex sử dụng tổ hợp gỗ chất lượng cao cho lớp ngoài và lõi để tối ưu hiệu suất.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ cao nhất trong dòng gỗ thuần 7 lớp UNREX. Lực đánh mạnh hơn Ruby và Topaz nhờ độ dày 6.3mm. Phù hợp tấn công tích cực, loop tốc độ và smash dứt khoát mà không cần carbon.

3. 🎯 **Kiểm soát & Cảm giác** — Cảm giác chắc tay và rõ ràng — đặc trưng của gỗ 7 lớp dày. Kiểm soát tốt (9.5), phản hồi đủ rõ để tay vợt điều chỉnh kỹ thuật. Dwell time cao hơn carbon giúp tạo xoáy tốt.

4. 🌟 **Điểm Nổi Bật** — Sapphire là cốt vợt gỗ thuần tấn công cao cấp nhất của UNREX — mạnh hơn Ruby, nhanh hơn Topaz. Cho tay vợt yêu thích gỗ thuần trải nghiệm hiệu suất tấn công tối đa mà không cần fiber tổng hợp. Cầu nối hoàn hảo giữa gỗ thuần và carbon.

5. 👤 **Phù hợp với ai?** — Tay vợt trình độ trung đến cao, yêu thích phong cách tấn công tích cực nhưng không muốn chuyển sang carbon. Người muốn khai thác tối đa hiệu suất của gỗ thuần trước khi nâng cấp lên cốt fiber.`
  },

  // ─────────────────────────────────────────────
  // 17. FULMEN — 7 lớp (5 gỗ Limba + 2 Carbon lưới Outer), OFF+
  // ─────────────────────────────────────────────
  {
    slug: "unrex-fulmen",
    specs: {
      "- Phân loại": "OFF+",
      "- Tốc độ": "9.9",
      "- Kiểm soát": "7.2",
      "- Trọng lượng": "~84g",
      "- Cấu tạo": "7 lớp: 5 gỗ (Limba ngoài) + 2 Carbon lưới (Outer)",
      "- Độ dày": "7.0 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cấu trúc 7 lớp với 5 lớp gỗ và 2 lớp Carbon lưới (mesh carbon) đặt ở ngoài (Outer). Lớp bề mặt là gỗ Limba — loại gỗ châu Phi nổi tiếng tạo xoáy tốt nhất. Độ dày 7.0mm là đặc biệt — dày nhất trong toàn bộ dòng UNREX, tạo lực đàn hồi mạnh.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ rất cao (9.9), phản hồi mạnh và dứt khoát. Cấu trúc 7.0mm dày kết hợp Carbon lưới Outer tạo ra lực đàn hồi cực lớn — bóng bắn ra với uy lực đáng kể. Fulmen (tiếng Latin: "sấm sét") sống đúng với cái tên của mình.

3. 🎯 **Kiểm soát & Cảm giác** — Kiểm soát thấp (7.2) — Fulmen là cốt tấn công thuần túy, yêu cầu kỹ thuật tốt để thuần hóa. Gỗ Limba ngoài bù đắp một phần bằng cách tăng cảm giác xoáy. Không phù hợp cho lối chơi phòng thủ hoặc kiểm soát.

4. 🌟 **Điểm Nổi Bật** — Fulmen có độ dày 7.0mm — độ dày cực hiếm trong thị trường cốt vợt, tạo ra đặc tính đàn hồi và lực đánh khác biệt hoàn toàn. Carbon lưới (mesh) cho cảm giác khác carbon thông thường — linh hoạt hơn, ít cứng nhắc hơn. Kết hợp Limba + Carbon lưới là công thức độc đáo của UNREX.

5. 👤 **Phù hợp với ai?** — Tay vợt nâng cao và chuyên nghiệp, phong cách tấn công tốc độ cao, ưa cú đánh mạnh và dứt khoát. Người thích cốt dày bất thường với đặc tính đàn hồi cực mạnh. Không dành cho người mới.`
  },

  // ─────────────────────────────────────────────
  // 18. CORAL — 5 lớp gỗ thuần mềm, ALL/ALL+
  // ─────────────────────────────────────────────
  {
    slug: "unrex-coral",
    specs: {
      "- Phân loại": "ALL/ALL+",
      "- Tốc độ": "8.8",
      "- Kiểm soát": "9.6",
      "- Trọng lượng": "~82–87g",
      "- Cấu tạo": "5 lớp gỗ thuần (All Wood, gỗ mềm)",
      "- Độ dày": "~5.6 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cốt vợt 5 lớp gỗ thuần (All Wood) với lựa chọn gỗ mềm, dẻo đặc trưng. Cấu trúc mỏng và nhẹ (5.6mm) giúp vợt linh hoạt và phản hồi nhẹ nhàng. Không fiber tổng hợp — gỗ thuần hoàn toàn theo phong cách all-around cổ điển.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ vừa phải, phù hợp lối chơi all-around không thiên tấn công quyết liệt. Dwell time dài giúp bóng bám vợt lâu — tốt cho các cú topspin xoáy sâu và chính xác. Lực đánh vừa đủ cho tấn công gần bàn.

3. 🎯 **Kiểm soát & Cảm giác** — Kiểm soát rất tốt (9.6), cảm giác bóng mềm mại và dễ chịu. Rung rất ít, tay vợt cảm nhận rõ độ xoáy và tiếp xúc bóng. Đặc biệt thân thiện với người mới hoặc tay vợt chuyển về lối chơi kiểm soát. Gỗ mềm tạo cảm giác "dẻo" đặc trưng.

4. 🌟 **Điểm Nổi Bật** — Coral là cốt vợt kiểm soát và all-around thuần khiết nhất của UNREX — không có yếu tố carbon hay fiber. Gỗ mềm mang lại cảm giác đánh bóng êm ái và dễ chịu, phù hợp luyện kỹ thuật lâu dài mà không mỏi tay. Tên Coral (San Hô) phản ánh sự mềm mại và tự nhiên của cốt vợt.

5. 👤 **Phù hợp với ai?** — Người mới bắt đầu, tay vợt học kỹ thuật cơ bản, hoặc tay vợt thích lối chơi phòng thủ và kiểm soát tuyệt đối. Phù hợp người chơi giải trí, ít cạnh tranh, cần cốt vợt dễ dùng và bền bỉ.`
  },

  // ─────────────────────────────────────────────
  // 19. LIBERTY BASIC — 5 lớp gỗ thuần, entry, DEF/ALL-
  // ─────────────────────────────────────────────
  {
    slug: "liberty-basic",
    specs: {
      "- Phân loại": "ALL-/ALL",
      "- Tốc độ": "8.0",
      "- Kiểm soát": "9.8",
      "- Trọng lượng": "~78–83g",
      "- Cấu tạo": "5 lớp gỗ thuần (All Wood, entry level)",
      "- Độ dày": "~5.4 mm"
    },
    description: `1. 🪵 **Cấu tạo & Vật liệu** — Cốt vợt 5 lớp gỗ thuần (All Wood) dành cho phân khúc entry level. Cấu trúc đơn giản, gỗ nhẹ và mỏng (5.4mm) giúp vợt cực kỳ dễ điều khiển. Không fiber tổng hợp — thuần gỗ tự nhiên 100%. Sản phẩm bình dân nhất trong dòng Liberty.

2. ⚡ **Tốc độ & Sức mạnh** — Tốc độ thấp, thiết kế cho lối chơi chậm và kiểm soát hoàn toàn. Không cần lực đánh lớn vẫn đưa bóng qua lưới an toàn. Phù hợp luyện kỹ thuật cơ bản: footwork, timing, và cảm giác bóng — không bị lỗi do cốt quá nhanh.

3. 🎯 **Kiểm soát & Cảm giác** — Kiểm soát xuất sắc (9.8) — cao nhất trong toàn bộ dòng UNREX. Cảm giác bóng rất mềm và trực quan, tha thứ tối đa cho lỗi kỹ thuật. Lý tưởng để người mới xây dựng phản xạ đúng mà không bị "phản lực" cốt vợt gây lỗi.

4. 🌟 **Điểm Nổi Bật** — Liberty Basic là cốt vợt giá rẻ nhất và dễ dùng nhất của UNREX — điểm khởi đầu tốt nhất cho người mới hoàn toàn. Dù entry level nhưng vẫn là sản phẩm chính hãng UNREX với chất lượng gỗ được kiểm soát, không phải gỗ rẻ tiền kém chất lượng.

5. 👤 **Phù hợp với ai?** — Người mới bắt đầu học bóng bàn, trẻ em, hoặc người chơi giải trí không có nhu cầu thi đấu. Lý tưởng cho học viên trong các câu lạc bộ và trung tâm đào tạo bóng bàn muốn cốt vợt bền và dễ dùng.`
  }
];

const update = db.prepare('UPDATE products SET description = ?, specs = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?');

const tx = db.transaction((items) => {
  for (const item of items) {
    const r = update.run(item.description, JSON.stringify(item.specs), item.slug);
    console.log('Updated', item.slug, r.changes ? '✓' : '✗ (not found)');
  }
});

tx(data);
db.close();
console.log('\nDone! All 19 Unrex cot vot updated.');
