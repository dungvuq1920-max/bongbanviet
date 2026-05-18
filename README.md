# BBV n8n Workflow-as-Code Automation

This repository is the source of truth for BongBanViet automation workflows. It keeps n8n workflow JSON files in Git and business logic in TypeScript modules so production n8n can be updated through import scripts instead of manual UI editing.

## Folder Tree

```text
workflows/
  01-facebook-post.json
  02-tiktok-video-post.json
  03-shopee-product-sync.json
  04-tiktok-shop-post.json
src/
  common/
    env.ts
    logger.ts
    retry.ts
    validators.ts
    ai-content.ts
  facebook/
    fetch-source-data.ts
    format-facebook-post.ts
    publish-facebook.ts
  tiktok/
    fetch-video.ts
    prepare-caption.ts
    upload-tiktok.ts
  shopee/
    fetch-product-info.ts
    normalize-product.ts
    publish-shopee.ts
  tiktok-shop/
    fetch-product-video.ts
    format-tiktok-shop-content.ts
    publish-tiktok-shop.ts
scripts/
  import-workflows.ts
  export-workflows.ts
  sync-ui-changes.ts
  validate-workflows.ts
  deploy-after-build.ts
credentials/
  README.md
package.json
tsconfig.json
.env.example
railway.toml
```

## What This Repo Does

It defines 4 production-oriented n8n workflow templates:

1. Fetch source data and post to a Facebook Page through the Meta Graph API.
2. Fetch video metadata and publish to TikTok through the TikTok Content Posting API.
3. Fetch product information and create or update Shopee listings through Shopee Open Platform.
4. Fetch product and video information and create or update TikTok Shop product/content through the official TikTok Shop API.

All secrets must be stored in environment variables. The workflows include placeholders and TODO comments where each official platform requires account-specific fields, permissions, signing, category mappings, or upload sessions.

## Install

```bash
npm install
```

Use Node.js 20 or newer.

## Environment Setup

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
```

Minimum variables for workflow import/export:

```env
N8N_BASE_URL=https://your-n8n-domain
N8N_API_KEY=your_n8n_api_key
N8N_ACTIVATE_IMPORTED=false
```

Platform variables are grouped by channel:

```env
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=
SHOPEE_PARTNER_ID=
SHOPEE_PARTNER_KEY=
SHOPEE_SHOP_ID=
SHOPEE_ACCESS_TOKEN=
TIKTOK_SHOP_APP_KEY=
TIKTOK_SHOP_APP_SECRET=
TIKTOK_SHOP_ACCESS_TOKEN=
TIKTOK_SHOP_ID=
AI_PROVIDER=
AI_API_KEY=
```

Never commit `.env`. Add the same variables in Railway and in the n8n environment.

## Validate Locally

Run full validation:

```bash
npm run validate
```

If you only want to validate workflow JSON structure before adding real secrets:

```bash
SKIP_ENV_VALIDATION=true npm run validate
```

On Windows PowerShell:

```powershell
$env:SKIP_ENV_VALIDATION="true"; npm run validate
```

Type-check TypeScript:

```bash
npm run typecheck
```

## Import Workflows Into n8n

Create an n8n API key in your n8n instance, then set:

```env
N8N_BASE_URL=https://your-n8n-domain
N8N_API_KEY=your_n8n_api_key
```

Import or update all workflows:

```bash
npm run import:workflows
```

The import script reads every JSON file in `/workflows`, checks whether a workflow with the same name already exists, then creates or updates it through the n8n API. Set `N8N_ACTIVATE_IMPORTED=true` only when you are ready for production triggers to run.

## Export Workflows From n8n

```bash
npm run export:workflows
```

The export script fetches workflows from n8n and writes them back to stable files in `/workflows`. It strips static execution data before saving.

Credential references are kept as metadata only, for example credential `id`, `name`, and `type`. Secret values are not exported.

## Auto Sync Direct n8n UI Edits

If you edit a workflow directly in the n8n UI, run:

```bash
npm run sync:from-n8n
```

This pulls the latest workflow JSON from n8n into `/workflows`. It also creates or updates:

```text
credentials/manifest.json
```

The credential manifest contains only metadata such as credential name/type/id. It does not contain API keys, access tokens, bot tokens, or passwords.

To keep watching n8n UI changes:

```bash
npm run sync:watch
```

Useful sync variables:

```env
N8N_SYNC_INCLUDE_UNKNOWN=false
N8N_SYNC_PRESERVE_CREDENTIAL_REFERENCES=true
N8N_SYNC_CREDENTIAL_MANIFEST=true
N8N_SYNC_INTERVAL_SECONDS=60
N8N_SYNC_GIT_COMMIT=false
N8N_SYNC_GIT_PUSH=false
```

Set `N8N_SYNC_INCLUDE_UNKNOWN=true` if you create extra workflows directly in n8n UI, for example a Telegram API workflow, and want them exported as `custom-*.json`.

Set these only if you want the sync script to commit or push automatically:

```env
N8N_SYNC_GIT_COMMIT=true
N8N_SYNC_GIT_PUSH=true
```

Optional Telegram notification:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

If configured, the sync script sends a Telegram message when UI changes are pulled into the repo. The Telegram bot token stays in `.env`, Railway variables, or n8n credentials, not in workflow JSON.

## Railway Deployment

Recommended flow:

1. Edit locally with Antigravity, Claude, or Codex.
2. Run `npm run validate` and `npm run typecheck`.
3. Commit and push to GitHub.
4. Railway deploys from GitHub.
5. Railway build runs `npm ci && npm run build`.
6. Railway deploy command runs `npm run deploy:railway`.
7. Configure a post-deploy job or manual command to run `npm run import:workflows`.
8. Production n8n executes the latest imported workflows.

This repo does not run n8n itself. It manages workflows as code. Your n8n service should be deployed separately with PostgreSQL persistence.

## Editing Workflows Later

Preferred path:

1. Edit JSON in `/workflows` or update TypeScript modules in `/src`.
2. Validate locally.
3. Push to GitHub.
4. Import into n8n.

Avoid editing production workflows directly in the n8n UI. Use the UI mainly for execution logs, failed-run debugging, and temporary inspection. If you must hotfix in n8n UI, export the workflow back into this repo immediately and commit the change.

If you intentionally edit in n8n UI, use `npm run sync:from-n8n` immediately after the edit. If you added a credential such as an API key or Telegram credential in n8n, the workflow credential reference and credential metadata will be synced, but the secret value must remain inside n8n Credentials or ENV variables.

## Manual Posting (TikTok / Shopee / TikTok Shop)

Workflows 02, 03, 04 do not call platform APIs yet. Instead they write two files per run into the `output/` folder (gitignored):

```
output/
  tiktok-2025-05-18-source123.json     ← structured data
  tiktok-2025-05-18-source123.md       ← human-readable checklist
  shopee-2025-05-18-sku456.json
  shopee-2025-05-18-sku456.md
  tiktok-shop-2025-05-18-sku789.json
  tiktok-shop-2025-05-18-sku789.md
```

Open the `.md` file for step-by-step instructions and copy-ready caption/description. The `.json` file contains all structured data if you want to paste into another tool.

Change the output directory:

```env
DRAFT_OUTPUT_DIR=output   # default, change to any absolute or relative path
```

## AI Content Generation

Set `AI_PROVIDER` in `.env` to enable AI-assisted copy:

| Provider | AI_PROVIDER value | AI_MODEL example |
|----------|-------------------|------------------|
| OpenAI | `openai` | `gpt-4o-mini` |
| Claude (Anthropic) | `claude` | `claude-haiku-4-5-20251001` |
| Disabled | `none` (default) | — |

```env
AI_PROVIDER=claude
AI_API_KEY=sk-ant-...
AI_MODEL=claude-haiku-4-5-20251001
```

The fallback template is used when no provider is configured or the API call fails.

## Chạy n8n Local (Hướng dẫn)

### Cách 1 — Docker (khuyên dùng)

Yêu cầu: [Docker Desktop](https://www.docker.com/products/docker-desktop/) đã cài và đang chạy.

```powershell
# Tạo thư mục lưu dữ liệu n8n
mkdir "$env:USERPROFILE\.n8n"

# Chạy n8n container
docker run -d `
  --name n8n-local `
  -p 5678:5678 `
  -v "$env:USERPROFILE\.n8n:/home/node/.n8n" `
  -e N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false `
  n8nio/n8n

# Truy cập giao diện
Start-Process "http://localhost:5678"
```

Dừng / khởi động lại:

```powershell
docker stop n8n-local
docker start n8n-local
```

### Cách 2 — npm global

Yêu cầu: Node.js 20+.

```powershell
npm install -g n8n
n8n start
# Giao diện tại http://localhost:5678
```

### Lấy API Key

1. Vào `http://localhost:5678` → đăng ký tài khoản lần đầu.
2. Nhấn avatar góc trên phải → **Settings** → **n8n API**.
3. Tạo API key, copy giá trị.
4. Điền vào `.env`:

```env
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=<api-key-vừa-copy>
```

### Import workflows vào n8n local

```powershell
# Copy .env.example → .env và điền N8N_BASE_URL + N8N_API_KEY
copy .env.example .env

# Import tất cả workflows
npm run import:workflows
```

Sau khi import, workflows xuất hiện trong giao diện n8n. Mở từng workflow, thêm credentials (Facebook Page Token, v.v.) rồi kích hoạt.

### Chạy workflow thủ công

1. Mở n8n tại `http://localhost:5678`.
2. Chọn workflow cần test (ví dụ `01_BBV_FACEBOOK_POST_AUTOMATION`).
3. Nhấn **Execute workflow** (nút tam giác) để chạy ngay với Manual Trigger.
4. Xem kết quả ở từng node bằng cách nhấn vào node đó sau khi chạy xong.

### Xem file draft xuất ra (TikTok / Shopee / TikTok Shop)

Sau khi chạy workflow 02/03/04, file được ghi vào thư mục `output/` trong project:

```powershell
# Xem danh sách file draft mới nhất
Get-ChildItem output | Sort-Object LastWriteTime -Descending | Select-Object -First 10

# Mở file markdown để đọc checklist
notepad output\tiktok-2025-05-18-source123.md
```

### Cấu hình môi trường cho n8n (tuỳ chọn)

Trong giao diện n8n: **Settings → Variables** → thêm các biến môi trường (`FACEBOOK_PAGE_ID`, v.v.) để workflow đọc qua `$env.VARIABLE_NAME`.

Hoặc truyền trực tiếp vào Docker:

```powershell
docker run -d `
  --name n8n-local `
  -p 5678:5678 `
  -v "$env:USERPROFILE\.n8n:/home/node/.n8n" `
  -e FACEBOOK_PAGE_ID=your_page_id `
  -e FACEBOOK_PAGE_ACCESS_TOKEN=your_token `
  n8nio/n8n
```

## Debug Failed Executions

Check in this order:

1. n8n execution log for the failed node and input/output data.
2. Environment variables in n8n or Railway.
3. Official API permission scopes and token expiry.
4. Required fields validated by `/src/common/validators.ts`.
5. Platform-specific TODOs for signing, category attributes, upload sessions, and media requirements.

The logger redacts token-like fields before printing. Keep raw API responses out of public logs if they contain customer data or secrets.

## Official API Notes

This project intentionally avoids browser automation, cookie scraping, password automation, and bypass methods. Each platform integration must be completed against the official API docs for your app, shop, page, permissions, and region.
