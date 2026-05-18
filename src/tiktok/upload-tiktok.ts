import { writeDraft, draftFilename } from "../common/draft-writer.js";
import { logger } from "../common/logger.js";

export type TikTokUploadInput = {
  videoUrl: string;
  caption: string;
  hashtags?: string[];
  productName?: string;
  sourceId: string;
};

export type TikTokDraftResult = {
  mode: "draft";
  jsonPath: string;
  mdPath: string;
  caption: string;
};

export async function uploadTikTok(input: TikTokUploadInput): Promise<TikTokDraftResult> {
  const tags = (input.hashtags || [])
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ") || "#BongBanViet #TableTennis #BongBan";

  const fullCaption = [input.caption, tags].filter(Boolean).join("\n");

  const json = {
    channel: "tiktok",
    generated_at: new Date().toISOString(),
    source_id: input.sourceId,
    video_url: input.videoUrl,
    caption: fullCaption,
    post_info: {
      privacy_level: "PUBLIC_TO_EVERYONE",
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      auto_add_music: true
    },
    manual_steps: [
      "1. Tải video từ link video_url về máy",
      "2. Mở app TikTok → nhấn dấu + để tạo video mới",
      "3. Chọn 'Tải lên' và chọn video vừa tải",
      "4. Dán nội dung caption vào ô mô tả",
      "5. Chọn quyền xem: Công khai (Public to Everyone)",
      "6. Bật 'Cho phép duet', 'Cho phép bình luận', 'Cho phép stitch'",
      "7. Thêm nhạc nền nếu cần (tự động hoặc chọn thủ công)",
      "8. Nhấn 'Đăng' để xuất bản"
    ]
  };

  const markdown = `# TikTok Draft — ${new Date().toISOString().slice(0, 10)}

## Thông tin video

| Trường | Giá trị |
|--------|---------|
| Source ID | \`${input.sourceId}\` |
| Tên sản phẩm | ${input.productName || "—"} |
| Video URL | [Tải tại đây](${input.videoUrl}) |
| Tạo lúc | ${new Date().toLocaleString("vi-VN")} |

## Caption (copy nguyên vào TikTok)

\`\`\`
${fullCaption}
\`\`\`

## Cài đặt bài đăng

- **Quyền xem:** Công khai (Public to Everyone)
- **Duet:** Bật
- **Bình luận:** Bật
- **Stitch:** Bật
- **Nhạc tự động:** Bật

## Các bước đăng thủ công

${json.manual_steps.join("\n")}
`;

  const { jsonPath, mdPath } = await writeDraft({
    filename: draftFilename("tiktok", input.sourceId),
    json,
    markdown
  });

  logger.info("TikTok draft exported", { sourceId: input.sourceId, jsonPath, mdPath });
  return { mode: "draft", jsonPath, mdPath, caption: fullCaption };
}
