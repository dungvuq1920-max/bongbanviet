# Telegram AI Bot

Bot này chạy độc lập với website hiện tại và dùng long polling của Telegram.

## Thiết lập

1. Vào Telegram, mở `@BotFather`, chạy `/newbot` và lấy token.
2. Tạo hoặc cập nhật file `.env` ở thư mục dự án:

```env
TELEGRAM_BOT_TOKEN=token_tu_botfather
TELEGRAM_ALLOWED_USER_IDS=telegram_user_id_cua_ban

OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
TELEGRAM_DEFAULT_PROVIDER=openai
```

Nếu chưa biết `telegram_user_id`, chỉ cần cấu hình `TELEGRAM_BOT_TOKEN`, chạy bot, nhắn `/whoami` cho bot rồi lấy `User id` đưa vào `TELEGRAM_ALLOWED_USER_IDS`.

3. Chạy bot:

```bash
npm run bot
```

## Lệnh Telegram

- `/ask <nội dung>`: hỏi bằng provider đang chọn.
- `/mode openai|gemini|claude|claude-code|auto`: đổi provider mặc định cho chat.
- `/openai <nội dung>`: hỏi OpenAI/ChatGPT.
- `/gemini <nội dung>`: hỏi Gemini.
- `/claude <nội dung>`: hỏi Claude API.
- `/code <nội dung>`: gọi Claude Code CLI trong workspace.
- `/reset`: xóa ngữ cảnh chat đang giữ trong RAM.
- `/status`: xem key/provider đang sẵn sàng.
- `/models`: xem model mặc định.
- `/whoami`: xem Telegram user id và chat id.

## Claude Code

`/code` dùng lệnh `claude` đã cài trên máy. Mặc định bot chạy với:

```env
TELEGRAM_CLAUDE_CODE_PERMISSION_MODE=plan
```

Chế độ này phù hợp để hỏi/phân tích/lập kế hoạch từ Telegram. Nếu muốn cho bot sửa file, đổi sang `acceptEdits`, `auto` hoặc `bypassPermissions`, nhưng chỉ nên làm khi bot đã bị giới hạn bằng `TELEGRAM_ALLOWED_USER_IDS` hoặc `TELEGRAM_ALLOWED_CHAT_IDS`.

Các biến hữu ích:

```env
TELEGRAM_WORKSPACE_DIR=.
CLAUDE_CODE_MODEL=sonnet
TELEGRAM_CLAUDE_CODE_TIMEOUT_MS=600000
TELEGRAM_CLAUDE_CODE_TOOLS=default
```

## Ghi chú triển khai

- Bot không lưu lịch sử xuống file, chỉ giữ ngữ cảnh trong RAM.
- Trên Railway hoặc VPS, nên chạy bot như một process riêng với command `npm run bot`.
- Nếu chạy chung với website, cần process manager như PM2 hoặc cấu hình service riêng; file `server.js` hiện không bị thay đổi để tránh ảnh hưởng website.
