const fs = require('fs');
const path = require('path');

const MAX_LOG_BYTES = 1024 * 1024;

/**
 * Minimal append-only log in `<userData>/logs/hivemind.log`, rotated at 1 MB.
 * Only operational events go here (startup, updater, crashes, storage errors) —
 * never note content, transcripts or API keys.
 */
function createLogger(logDir) {
  const file = path.join(logDir, 'hivemind.log');
  const write = (level, message, details) => {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size > MAX_LOG_BYTES) fs.renameSync(file, `${file}.1`);
      const suffix = details === undefined ? '' : ` ${safeJson(details)}`;
      fs.appendFileSync(file, `${new Date().toISOString()} [${level}] ${message}${suffix}\n`);
    } catch { /* Logging must never break the app. */ }
  };
  return {
    file,
    info: (message, details) => write('info', message, details),
    warn: (message, details) => write('warn', message, details),
    error: (message, details) => write('error', message, details),
    debug: () => {},
  };
}

function safeJson(value) {
  if (value instanceof Error) return JSON.stringify({ message: value.message, stack: value.stack });
  try { return JSON.stringify(value); } catch { return String(value); }
}

module.exports = { createLogger };
