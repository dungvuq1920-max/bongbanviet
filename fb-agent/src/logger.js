/**
 * logger.js — Structured JSON logger, writes to console + logs/agent.log
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'agent.log');

// Ensure log file directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LEVELS.INFO;

const COLORS = {
  DEBUG: '\x1b[36m',  // cyan
  INFO:  '\x1b[32m',  // green
  WARN:  '\x1b[33m',  // yellow
  ERROR: '\x1b[31m',  // red
  RESET: '\x1b[0m',
};

function write(level, message, meta = null) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const ts = new Date().toISOString();
  const entry = { timestamp: ts, level, message };
  if (meta) entry.meta = meta;

  // Pretty console output
  const color = COLORS[level] || '';
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  console.log(`${color}[${ts}] [${level}]${COLORS.RESET} ${message}${metaStr}`);

  // Append JSON line to log file
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
}

module.exports = {
  debug: (msg, meta) => write('DEBUG', msg, meta),
  info:  (msg, meta) => write('INFO',  msg, meta),
  warn:  (msg, meta) => write('WARN',  msg, meta),
  error: (msg, meta) => write('ERROR', msg, meta),
};
