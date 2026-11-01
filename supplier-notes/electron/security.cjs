const path = require('path');

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

/** Only web and mail links may be handed to the operating system. */
function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return false;
  try { return EXTERNAL_PROTOCOLS.has(new URL(value).protocol); }
  catch { return false; }
}

/** True when `file` resolves to a location strictly inside `directory`. */
function isInsideDirectory(file, directory, platform = process.platform) {
  if (typeof file !== 'string' || !file || typeof directory !== 'string' || !directory) return false;
  const impl = platform === 'win32' ? path.win32 : path.posix;
  const normalize = (value) => (platform === 'win32' ? value.toLowerCase() : value);
  const relative = impl.relative(normalize(impl.resolve(directory)), normalize(impl.resolve(file)));
  return !!relative && !relative.startsWith('..') && !impl.isAbsolute(relative);
}

/**
 * The main window may only show the bundled app (or the Vite dev server in development).
 * Everything else — dropped files, links, redirects — is blocked.
 */
function isAppUrl(value, { devServerUrl, indexFileUrl }) {
  try {
    const url = new URL(value);
    if (devServerUrl) return url.origin === new URL(devServerUrl).origin;
    const index = new URL(indexFileUrl);
    return url.protocol === 'file:' && decodeURIComponent(url.pathname) === decodeURIComponent(index.pathname);
  } catch { return false; }
}

/** RFC 2047 encoded-word so non-ASCII subjects (å, ä, ö) survive in .eml headers. */
function encodeMimeHeader(text) {
  const clean = String(text ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

module.exports = { isSafeExternalUrl, isInsideDirectory, isAppUrl, encodeMimeHeader };
