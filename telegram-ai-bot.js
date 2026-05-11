const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

loadDotEnv(path.join(__dirname, '.env'));

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WORKSPACE_DIR = process.env.TELEGRAM_WORKSPACE_DIR
  ? path.resolve(process.env.TELEGRAM_WORKSPACE_DIR)
  : __dirname;
const PROVIDERS = new Set(['auto', 'openai', 'gemini', 'claude', 'claude-code']);
const DEFAULT_PROVIDER = normalizeProvider(process.env.TELEGRAM_DEFAULT_PROVIDER || 'openai');
const MAX_HISTORY_MESSAGES = readInt(process.env.TELEGRAM_MAX_HISTORY_MESSAGES, 12);
const MAX_PROMPT_CHARS = readInt(process.env.TELEGRAM_MAX_PROMPT_CHARS, 24000);
const MAX_REPLY_CHARS = readInt(process.env.TELEGRAM_MAX_REPLY_CHARS, 16000);
const API_TIMEOUT_MS = readInt(process.env.TELEGRAM_AI_TIMEOUT_MS, 90000);
const CLAUDE_CODE_TIMEOUT_MS = readInt(process.env.TELEGRAM_CLAUDE_CODE_TIMEOUT_MS, 600000);
const TELEGRAM_MESSAGE_LIMIT = 3900;

const ALLOWED_USER_IDS = parseIdSet(process.env.TELEGRAM_ALLOWED_USER_IDS);
const ALLOWED_CHAT_IDS = parseIdSet(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
const sessions = new Map();

const SYSTEM_PROMPT = [
  'Bạn là trợ lý AI làm việc trong Telegram cho dự án BongBanViet.',
  'Trả lời bằng tiếng Việt nếu người dùng không yêu cầu ngôn ngữ khác.',
  'Ưu tiên câu trả lời ngắn gọn, có bước thực hiện rõ ràng, và nêu rủi ro khi có thao tác ảnh hưởng tới mã nguồn hoặc dữ liệu.',
].join('\n');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function parseIdSet(value) {
  const ids = new Set();
  if (!value) return ids;

  for (const item of value.split(/[,\s]+/)) {
    const trimmed = item.trim();
    if (trimmed) ids.add(trimmed);
  }

  return ids;
}

function readInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeProvider(value) {
  const provider = String(value || '').toLowerCase().replace('_', '-');
  return PROVIDERS.has(provider) ? provider : 'openai';
}

function getSession(chatId) {
  const key = String(chatId);
  if (!sessions.has(key)) {
    sessions.set(key, {
      provider: DEFAULT_PROVIDER,
      history: [],
    });
  }
  return sessions.get(key);
}

function isAllowed(message) {
  const userId = String(message.from?.id || '');
  const chatId = String(message.chat?.id || '');

  if (ALLOWED_USER_IDS.size === 0 && ALLOWED_CHAT_IDS.size === 0) return false;
  if (userId && ALLOWED_USER_IDS.has(userId)) return true;
  return Boolean(chatId && ALLOWED_CHAT_IDS.has(chatId));
}

function providerStatus() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    'claude-code': true,
  };
}

function chooseAutoProvider() {
  const status = providerStatus();
  if (status.openai) return 'openai';
  if (status.gemini) return 'gemini';
  if (status.claude) return 'claude';
  return 'claude-code';
}

function modelConfigText() {
  return [
    `OpenAI: ${process.env.OPENAI_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.4-mini'}`,
    `Gemini: ${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}`,
    `Claude API: ${process.env.CLAUDE_MODEL || 'claude-sonnet-4-5'}`,
    `Claude Code: ${process.env.CLAUDE_CODE_MODEL || process.env.CLAUDE_MODEL || 'sonnet'}`,
  ].join('\n');
}

function helpText(userId) {
  return [
    'Bot chat AI cho Telegram',
    '',
    `Telegram user id của bạn: ${userId || 'không rõ'}`,
    '',
    'Lệnh chính:',
    '/ask <nội dung> - hỏi bằng provider đang chọn',
    '/mode openai|gemini|claude|claude-code|auto - đổi provider',
    '/openai <nội dung> - hỏi ChatGPT/OpenAI',
    '/gemini <nội dung> - hỏi Gemini',
    '/claude <nội dung> - hỏi Claude API',
    '/code <nội dung> - chạy Claude Code CLI trong workspace',
    '/reset - xóa ngữ cảnh chat trong RAM',
    '/status - xem provider/key đang sẵn sàng',
    '/models - xem model mặc định',
    '/whoami - xem Telegram id để thêm allowlist',
    '',
    'Bot sẽ từ chối xử lý nếu chưa cấu hình TELEGRAM_ALLOWED_USER_IDS hoặc TELEGRAM_ALLOWED_CHAT_IDS.',
  ].join('\n');
}

async function telegramApi(method, payload, timeoutMs = 70000) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram ${method} HTTP ${response.status}`);
  }

  return data.result;
}

async function sendMessage(chatId, text, options = {}) {
  const safeText = text && text.trim() ? text : '(không có nội dung trả về)';
  const chunks = splitTelegramMessage(safeText);

  for (const chunk of chunks) {
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
      ...options,
    }, 30000);
  }
}

function splitTelegramMessage(text) {
  if (text.length <= TELEGRAM_MESSAGE_LIMIT) return [text];

  const chunks = [];
  let remaining = text;
  while (remaining.length > TELEGRAM_MESSAGE_LIMIT) {
    let cut = remaining.lastIndexOf('\n', TELEGRAM_MESSAGE_LIMIT);
    if (cut < 1200) cut = remaining.lastIndexOf(' ', TELEGRAM_MESSAGE_LIMIT);
    if (cut < 1200) cut = TELEGRAM_MESSAGE_LIMIT;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  return `${text.slice(0, maxChars)}\n\n[Đã rút gọn vì vượt ${maxChars} ký tự]`;
}

function renderPrompt(history, userText) {
  const parts = [SYSTEM_PROMPT];

  if (history.length) {
    parts.push('Ngữ cảnh trước đó:');
    for (const item of history.slice(-MAX_HISTORY_MESSAGES)) {
      parts.push(`${item.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${item.content}`);
    }
  }

  parts.push(`Yêu cầu mới: ${userText}`);
  return truncateText(parts.join('\n\n'), MAX_PROMPT_CHARS);
}

function remember(session, userText, assistantText) {
  session.history.push({ role: 'user', content: truncateText(userText, 4000) });
  session.history.push({ role: 'assistant', content: truncateText(assistantText, 4000) });

  const keep = MAX_HISTORY_MESSAGES * 2;
  if (session.history.length > keep) {
    session.history.splice(0, session.history.length - keep);
  }
}

async function askProvider(provider, prompt) {
  if (provider === 'auto') provider = chooseAutoProvider();
  if (provider === 'openai') return askOpenAI(prompt);
  if (provider === 'gemini') return askGemini(prompt);
  if (provider === 'claude') return askClaude(prompt);
  if (provider === 'claude-code') return askClaudeCode(prompt);
  throw new Error(`Provider không hợp lệ: ${provider}`);
}

async function askOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Thiếu OPENAI_API_KEY');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.4-mini',
      input: prompt,
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `OpenAI HTTP ${response.status}`);

  return truncateText(
    data.output_text ||
      data.output?.flatMap(item => item.content || []).map(item => item.text || '').filter(Boolean).join('\n') ||
      '',
    MAX_REPLY_CHARS,
  );
}

async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Thiếu GEMINI_API_KEY');

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Gemini HTTP ${response.status}`);

  return truncateText(
    data.candidates?.[0]?.content?.parts?.map(part => part.text || '').filter(Boolean).join('\n') || '',
    MAX_REPLY_CHARS,
  );
}

async function askClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Thiếu ANTHROPIC_API_KEY');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
      max_tokens: readInt(process.env.CLAUDE_MAX_TOKENS, 2200),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Claude HTTP ${response.status}`);

  return truncateText(
    data.content?.map(part => part.text || '').filter(Boolean).join('\n') || '',
    MAX_REPLY_CHARS,
  );
}

async function askClaudeCode(prompt) {
  const permissionMode = process.env.TELEGRAM_CLAUDE_CODE_PERMISSION_MODE || 'plan';
  const args = [
    '--print',
    '--output-format',
    'text',
    '--permission-mode',
    permissionMode,
    '--model',
    process.env.CLAUDE_CODE_MODEL || process.env.CLAUDE_MODEL || 'sonnet',
  ];

  if (process.env.TELEGRAM_CLAUDE_CODE_BARE === '1') args.push('--bare');
  if (process.env.TELEGRAM_CLAUDE_CODE_TOOLS) args.push('--tools', process.env.TELEGRAM_CLAUDE_CODE_TOOLS);
  if (process.env.TELEGRAM_CLAUDE_CODE_ALLOWED_TOOLS) {
    args.push('--allowedTools', process.env.TELEGRAM_CLAUDE_CODE_ALLOWED_TOOLS);
  }

  const extraDirs = splitList(process.env.TELEGRAM_CLAUDE_CODE_ADD_DIRS);
  if (extraDirs.length) args.push('--add-dir', ...extraDirs.map(dir => path.resolve(dir)));

  args.push([
    'Bạn đang được gọi từ Telegram qua bot trong workspace sau:',
    WORKSPACE_DIR,
    '',
    'Hãy phản hồi ngắn gọn. Nếu có chỉnh sửa file, liệt kê file đã đổi và cách kiểm tra.',
    'Nếu đang ở permission mode plan, chỉ lập kế hoạch/đề xuất và không sửa file.',
    '',
    prompt,
  ].join('\n'));

  const result = await runProcess('claude', args, {
    cwd: WORKSPACE_DIR,
    timeoutMs: CLAUDE_CODE_TIMEOUT_MS,
  });

  const output = [result.stdout, result.stderr ? `stderr:\n${result.stderr}` : '']
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return truncateText(output, MAX_REPLY_CHARS);
}

function splitList(value) {
  if (!value) return [];
  return value.split(/[;,]/).map(item => item.trim()).filter(Boolean);
}

function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGTERM');
      reject(new Error(`${command} timeout sau ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stdout.on('data', chunk => {
      stdout = truncateText(stdout + chunk.toString('utf8'), MAX_REPLY_CHARS * 3);
    });

    child.stderr.on('data', chunk => {
      stderr = truncateText(stderr + chunk.toString('utf8'), MAX_REPLY_CHARS);
    });

    child.on('error', error => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', code => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);

      if (code !== 0) {
        const detail = stderr || stdout || `exit code ${code}`;
        reject(new Error(`${command} lỗi: ${detail}`));
        return;
      }

      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function parseCommand(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { command: '', arg: trimmed };

  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.slice(1).split('@')[0].toLowerCase();
  return {
    command,
    arg: rest.join(' ').trim(),
  };
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text || '';
  const userId = String(message.from?.id || '');
  const session = getSession(chatId);
  const { command, arg } = parseCommand(text);

  if (command === 'start' || command === 'help') {
    await sendMessage(chatId, helpText(userId));
    return;
  }

  if (command === 'whoami') {
    await sendMessage(chatId, [
      `User id: ${userId || 'không rõ'}`,
      `Chat id: ${chatId}`,
    ].join('\n'));
    return;
  }

  if (!isAllowed(message)) {
    await sendMessage(chatId, [
      'Bot chưa cho phép tài khoản/chat này.',
      `User id: ${userId || 'không rõ'}`,
      `Chat id: ${chatId}`,
      'Thêm một trong hai giá trị này vào TELEGRAM_ALLOWED_USER_IDS hoặc TELEGRAM_ALLOWED_CHAT_IDS trong .env rồi chạy lại bot.',
    ].join('\n'));
    return;
  }

  if (command === 'reset') {
    session.history = [];
    await sendMessage(chatId, 'Đã xóa ngữ cảnh chat trong RAM.');
    return;
  }

  if (command === 'mode') {
    const provider = normalizeProvider(arg);
    session.provider = provider;
    await sendMessage(chatId, `Đã đổi provider sang: ${provider}`);
    return;
  }

  if (command === 'status') {
    const status = providerStatus();
    await sendMessage(chatId, [
      `Provider hiện tại: ${session.provider}`,
      `OpenAI key: ${status.openai ? 'có' : 'thiếu'}`,
      `Gemini key: ${status.gemini ? 'có' : 'thiếu'}`,
      `Claude API key: ${status.claude ? 'có' : 'thiếu'}`,
      `Claude Code CLI: dùng lệnh claude trong ${WORKSPACE_DIR}`,
      `Claude Code permission: ${process.env.TELEGRAM_CLAUDE_CODE_PERMISSION_MODE || 'plan'}`,
    ].join('\n'));
    return;
  }

  if (command === 'models') {
    await sendMessage(chatId, modelConfigText());
    return;
  }

  const providerCommandMap = {
    openai: 'openai',
    gemini: 'gemini',
    claude: 'claude',
    code: 'claude-code',
    ask: session.provider,
  };

  const provider = providerCommandMap[command] || session.provider;
  const userText = command ? arg : text.trim();
  if (!userText) {
    await sendMessage(chatId, 'Bạn gửi thêm nội dung sau lệnh nhé. Ví dụ: /ask viết mô tả sản phẩm vợt bóng bàn');
    return;
  }

  const effectiveProvider = provider === 'auto' ? chooseAutoProvider() : provider;
  await telegramApi('sendChatAction', { chat_id: chatId, action: 'typing' }, 10000).catch(() => {});

  const prompt = renderPrompt(session.history, userText);
  const answer = await askProvider(provider, prompt);
  remember(session, userText, answer);
  await sendMessage(chatId, `[${effectiveProvider}]\n${answer}`);
}

async function pollLoop() {
  let offset = 0;
  console.log('Telegram AI bot đang chạy bằng long polling.');
  console.log(`Workspace: ${WORKSPACE_DIR}`);
  console.log(`Provider mặc định: ${DEFAULT_PROVIDER}`);

  while (true) {
    try {
      const updates = await telegramApi('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      }, 45000);

      for (const update of updates) {
        offset = update.update_id + 1;
        if (!update.message?.text) continue;

        handleMessage(update.message).catch(async error => {
          console.error(error);
          await sendMessage(update.message.chat.id, `Lỗi: ${error.message}`).catch(() => {});
        });
      }
    } catch (error) {
      console.error(`Polling lỗi: ${error.message}`);
      await delay(3000);
    }
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (!TELEGRAM_TOKEN) {
  console.error('Thiếu TELEGRAM_BOT_TOKEN. Hãy tạo bot bằng @BotFather và thêm token vào .env.');
  process.exit(1);
}

pollLoop().catch(error => {
  console.error(error);
  process.exit(1);
});
