const test = require('node:test');
const assert = require('node:assert/strict');
const { isSafeExternalUrl, isInsideDirectory, isAppUrl, encodeMimeHeader } = require('./security.cjs');

test('only web and mail links can be opened externally', () => {
  assert.equal(isSafeExternalUrl('https://example.com/a?b=c'), true);
  assert.equal(isSafeExternalUrl('http://example.com'), true);
  assert.equal(isSafeExternalUrl('mailto:someone@example.com?subject=Hi'), true);
  for (const unsafe of ['file:///C:/Windows/System32/calc.exe', 'C:\\Windows\\calc.exe', 'javascript:alert(1)',
    'ms-msdt:/id', 'smb://host/share', '', null, 42]) {
    assert.equal(isSafeExternalUrl(unsafe), false, String(unsafe));
  }
});

test('attachment paths must stay inside the managed folder', () => {
  assert.equal(isInsideDirectory('/data/attachments/a.pdf', '/data/attachments', 'linux'), true);
  assert.equal(isInsideDirectory('/data/attachments/../secret.txt', '/data/attachments', 'linux'), false);
  assert.equal(isInsideDirectory('/data/attachments', '/data/attachments', 'linux'), false);
  assert.equal(isInsideDirectory('/data/attachments-evil/x', '/data/attachments', 'linux'), false);
  assert.equal(isInsideDirectory('C:\\Users\\A\\data\\ATTACHMENTS\\x.docx', 'C:\\Users\\a\\Data\\attachments', 'win32'), true);
  assert.equal(isInsideDirectory('D:\\attachments\\x.exe', 'C:\\data\\attachments', 'win32'), false);
  assert.equal(isInsideDirectory('', '/data', 'linux'), false);
});

test('main window navigation is limited to the bundled page or dev server', () => {
  const packaged = { devServerUrl: '', indexFileUrl: 'file:///C:/Program%20Files/HiveMind/resources/app.asar/dist/index.html' };
  assert.equal(isAppUrl('file:///C:/Program%20Files/HiveMind/resources/app.asar/dist/index.html#x', packaged), true);
  assert.equal(isAppUrl('file:///C:/Users/a/Downloads/report.html', packaged), false);
  assert.equal(isAppUrl('https://example.com', packaged), false);
  const dev = { devServerUrl: 'http://localhost:5173', indexFileUrl: '' };
  assert.equal(isAppUrl('http://localhost:5173/src/main.tsx', dev), true);
  assert.equal(isAppUrl('http://localhost:5174/', dev), false);
});

test('email subjects are header-safe and keep non-ASCII characters', () => {
  assert.equal(encodeMimeHeader('Weekly sync'), 'Weekly sync');
  assert.equal(encodeMimeHeader('Line\r\nBcc: attacker@example.com'), 'Line Bcc: attacker@example.com');
  const encoded = encodeMimeHeader('Möte om leveranstider');
  assert.match(encoded, /^=\?UTF-8\?B\?.+\?=$/);
  assert.equal(Buffer.from(encoded.slice(10, -2), 'base64').toString('utf8'), 'Möte om leveranstider');
});
