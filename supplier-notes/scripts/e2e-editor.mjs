// Note-editor regression checks (browser build). Covers every editor feature through the real UI and
// checks that opening stored notes never rewrites them. Requires Playwright with Chromium:
//   npm run build && node scripts/e2e-editor.mjs
// EDITOR_OBSERVATIONS=<file> additionally writes the HTML the editor produced for each stored note and
// each behaviour, so two editor versions can be compared (see docs/QUALITY_AUDIT.md).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createDemoState } = await import(path.join(root, 'docs/demo/fixture.mjs'));
// 4800–4999: clear of ports Chromium refuses to connect to (e.g. 5060/5061).
const port = 4800 + Math.floor(Math.random() * 200);
const BASE = `http://localhost:${port}/`;
const server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* starting */ }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const browser = await chromium.launch();
const observations = {};
const observe = (key, value) => { observations[key] = value; };
const failures = [];
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`not ok - ${name}\n  ${String(error.message || error).split('\n').join('\n  ')}`); }
}

// HTML as stored by earlier versions of the app (TipTap 2 output and HTML the app writes itself).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CORPUS = {
  'demo note': '<h2>Pilot run planning</h2><p>We reviewed controller readiness and the final enclosure check for the pilot run.</p><h3>Agreed next steps</h3><ul><li><p>Vela will send the controller bill of materials by Tuesday.</p></li><li><p>Release the pilot run after the enclosure fit check passes.</p></li></ul>',
  'marks': '<p><strong>bold</strong> <em>italic</em> <u>underline</u> <s>strike</s> <mark>highlight</mark> <code>code</code> x<sup>2</sup> H<sub>2</sub>O <strong><em>both</em></strong></p>',
  'link': '<p>See <a target="_blank" rel="noopener noreferrer" class="tiptap-link" href="https://example.com/spec">the spec</a> and mail <a target="_blank" rel="noopener noreferrer" class="tiptap-link" href="mailto:a@example.com">us</a>.</p>',
  'headings and blocks': '<h1>Title</h1><h2>Section</h2><h3>Sub</h3><blockquote><p>Quoted</p></blockquote><pre><code>const a = 1;\nconst b = 2;</code></pre><hr><p>after rule</p>',
  'nested lists': '<ol><li><p>One</p><ul><li><p>One a</p></li><li><p>One b</p></li></ul></li><li><p>Two</p></li></ol>',
  'task list': '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done item</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Open item</p><ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Nested</p></div></li></ul></div></li></ul>',
  'table': '<table style="min-width: 75px"><colgroup><col style="min-width: 25px"><col style="min-width: 25px"><col style="min-width: 25px"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Part</p></th><th colspan="1" rowspan="1"><p>Qty</p></th><th colspan="1" rowspan="1"><p>Price</p></th></tr><tr><td colspan="1" rowspan="1"><p>Bolt</p></td><td colspan="1" rowspan="1"><p>4</p></td><td colspan="1" rowspan="1"><p>0.10</p></td></tr></tbody></table><p></p>',
  'table with widths': '<table style="width: 300px"><colgroup><col style="width: 200px"><col style="min-width: 25px"></colgroup><tbody><tr><td colspan="1" rowspan="1" colwidth="200"><p>wide</p></td><td colspan="1" rowspan="1"><p>auto</p></td></tr></tbody></table>',
  'mention': '<p>Ask <span data-type="mention" class="mention" data-id="sup-vela" data-label="Vela Components">@Vela Components</span> about it.</p>',
  'images': `<p>Before</p><img src="app-image://img-1234.png"><img src="${PNG}"><p>After</p>`,
  'collapsible': '<div data-type="collapsible" data-title="Details" data-open="true"><p>Hidden detail</p></div><p>After</p>',
  // As saved before collapsible attributes were registered: no title, always "closed".
  'legacy collapsible': '<div data-type="collapsible" data-open="false"><p>Legacy section text</p></div>',
  'summary insert': '<p>Notes</p><h2>Meeting Summary</h2><h3>Key points</h3><ul><li><p>Point <strong>one</strong></p></li><li><p>Point two</p></li></ul><ol><li><p>Step</p></li></ol><p>Closing paragraph.</p>',
  'transcript insert': '<p>Notes</p><h2>Meeting Transcript</h2><p>[10:01] Alice: hello &amp; welcome</p><p>[10:02] Bob: &lt;b&gt;not bold&lt;/b&gt;</p>',
  'template': '<h2>Agenda</h2><ul><li><p></p></li></ul><h2>Discussion</h2><p></p><h2>Action Items</h2><ul><li><p></p></li></ul>',
  'plain and legacy html': '<div>A div line</div><p>Line one<br>Line two</p><b>bare bold</b><p>    indented</p><p></p>',
  'ends with list': '<p>Intro</p><ul><li><p>last item</p></li></ul>',
  'ends with table': '<p>Intro</p><table><tbody><tr><td><p>cell</p></td></tr></tbody></table>',
  'typography text': '<p>“Quoted” — dash … ellipsis → arrow © 2026 ½</p>',
  'empty': '',
};

async function open(state) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    const text = msg.text();
    if (/Content Security Policy/i.test(text) || (/tiptap/i.test(text) && ['warning', 'error'].includes(msg.type()))) errors.push(`${msg.type()}: ${text}`);
  });
  await page.addInitScript((seed) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('Combobulator-data', seed); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify({ version: 11, state }));
  await page.goto(BASE);
  await page.waitForSelector('.ProseMirror');
  return { page, context, errors };
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('Combobulator-data')).state);
async function storedNote(page, id) { return (await stored(page)).notes.find((n) => n.id === id); }
async function waitForStored(page, id, predicate, label) {
  let note;
  for (let i = 0; i < 30; i++) {
    note = await storedNote(page, id);
    if (predicate(note.content || '')) return note.content;
    await page.waitForTimeout(100);
  }
  throw new Error(`stored note never matched: ${label}\n  stored: ${note?.content}`);
}
const editorHTML = (page) => page.evaluate(() => document.querySelector('.ProseMirror').editor.getHTML());
async function setDoc(page, html) {
  await page.evaluate((content) => { const editor = document.querySelector('.ProseMirror').editor; editor.commands.setContent(content); editor.commands.focus('end'); }, html);
  await page.waitForTimeout(50);
}
async function clear(page) { await setDoc(page, ''); }
async function select(page, text, occurrence = 0) {
  await page.evaluate(({ text, occurrence }) => {
    const editor = document.querySelector('.ProseMirror').editor;
    let found = null; let count = 0;
    editor.state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      let index = node.text.indexOf(text);
      while (index !== -1 && !found) {
        if (count++ === occurrence) found = { from: pos + index, to: pos + index + text.length };
        index = node.text.indexOf(text, index + 1);
      }
    });
    if (!found) throw new Error(`text not found in editor: ${text}`);
    editor.chain().focus().setTextSelection(found).run();
  }, { text, occurrence });
  await page.waitForTimeout(50);
}
async function cursorAt(page, text, offset = 0) {
  await page.evaluate(({ text, offset }) => {
    const editor = document.querySelector('.ProseMirror').editor;
    let found = null;
    editor.state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const index = node.text.indexOf(text);
      if (index !== -1) found = pos + index + offset;
    });
    if (found === null) throw new Error(`text not found in editor: ${text}`);
    editor.chain().focus().setTextSelection(found).run();
  }, { text, offset });
  await page.waitForTimeout(50);
}
const toolbar = (page) => page.getByRole('toolbar', { name: 'Formatting' });
const popup = (page, text) => page.locator('body > div[style*="z-index: 9999"] button', { hasText: text });
const tool = (page, name) => toolbar(page).getByRole('button', { name, exact: true });
async function openTabMenu(page, label) {
  const button = page.getByRole('button', { name: label });
  await page.getByRole('tablist', { name: 'Note tabs' }).getByRole('tab', { selected: true }).hover();
  await button.click();
}
async function typeSlow(page, text) { await page.keyboard.type(text, { delay: 15 }); }

try {
  const state = createDemoState();
  const pid = state.projects[0].id;
  const vela = state.notes[0].supplierIds[0];
  const entries = Object.entries(CORPUS);
  const corpusNotes = entries.map(([name, content], index) => ({
    id: `corpus-${index}`, projectIds: [pid], supplierIds: [vela], title: `Corpus ${String(index + 1).padStart(2, '0')} ${name}`,
    content, attendees: '', createdAt: 1000 + index, updatedAt: 1000 + index, transcripts: [],
  }));
  const scratch = { id: 'scratch', projectIds: [pid], supplierIds: [vela], title: 'Scratch', content: '<p>start</p>', attendees: '', createdAt: 5000, updatedAt: 5000, transcripts: [] };
  state.notes = [...state.notes, ...corpusNotes, scratch];
  const seed = { ...state, activeProjectId: pid, openTabs: [vela], activeTabId: vela, activeNoteId: 'scratch', rightPanelOpen: true };

  // ── 1. Stored notes ────────────────────────────────────────────────────────
  {
    const { page, context, errors } = await open(seed);
    await check('every stored note opens with its content, and opening notes never rewrites them', async () => {
      const produced = {};
      for (const note of corpusNotes) {
        await page.getByText(note.title, { exact: true }).first().click();
        await page.waitForFunction((title) => document.querySelector('input[aria-label="Meeting title"]')?.value === title, note.title);
        await page.waitForTimeout(150);
        produced[note.title.replace(/^Corpus \d+ /, '')] = await editorHTML(page);
      }
      await page.waitForTimeout(600);
      const after = (await stored(page)).notes;
      for (const note of corpusNotes) {
        const now = after.find((n) => n.id === note.id);
        assert.equal(now.content, note.content, `${note.title}: stored content changed by opening it`);
        assert.equal(now.updatedAt, note.updatedAt, `${note.title}: marked as edited by opening it`);
      }
      for (const [name, html] of Object.entries(produced)) observe(`corpus: ${name}`, html);
      // Text survives the round trip (the editor may normalize markup, never drop words).
      const words = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').split(/\s+/).filter(Boolean).join(' ');
      for (const [name, html] of entries) {
        if (name === 'plain and legacy html' || name === 'empty') continue;
        assert.equal(words(produced[name]), words(html), `${name}: text changed`);
      }
      assert.match(produced.mention, /data-type="mention"[^>]*data-id="sup-vela"|data-id="sup-vela"[^>]*data-type="mention"/);
      assert.match(produced['task list'], /data-checked="true"/);
      assert.equal((produced.images.match(/<img /g) || []).length, 2);
      assert.equal((produced.table.match(/<th[ >]/g) || []).length, 3);
    });
    await check('the editor shows rich content as formatted elements', async () => {
      await page.getByText(corpusNotes.find((n) => n.title.endsWith(' marks')).title, { exact: true }).first().click();
      await page.waitForTimeout(200);
      const tags = await page.evaluate(() => ['strong', 'em', 'u', 's', 'mark', 'code', 'sup', 'sub'].filter((tag) => document.querySelector(`.ProseMirror ${tag}`)));
      assert.deepEqual(tags, ['strong', 'em', 'u', 's', 'mark', 'code', 'sup', 'sub']);
      await page.getByText(corpusNotes.find((n) => n.title.endsWith(' mention')).title, { exact: true }).first().click();
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.ProseMirror .mention').first().innerText(), '@Vela Components');
      await page.getByText(corpusNotes.find((n) => n.title.endsWith(' legacy collapsible')).title, { exact: true }).first().click();
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.ProseMirror p', { hasText: 'Legacy section text' }).isVisible(), true, 'content of a section saved by the old version is visible');
    });
    await check('no editor warnings or errors while opening notes', async () => { assert.deepEqual(errors, []); });
    await context.close();
  }

  // ── 2. Editing ─────────────────────────────────────────────────────────────
  const { page, context, errors } = await open(seed);
  const NOTE = 'scratch';

  await check('placeholder on an empty note; the template picker is offered and inserts a template', async () => {
    await clear(page);
    await page.waitForSelector('.ProseMirror p.is-editor-empty');
    assert.match(await page.locator('.ProseMirror p.is-editor-empty').getAttribute('data-placeholder'), /type \/ for commands/);
    await toolbar(page).getByRole('button', { name: 'Template' }).click();
    await page.getByRole('menuitem', { name: 'Quick Sync' }).click();
    const content = await waitForStored(page, NOTE, (c) => c.includes('<h2>Blockers</h2>'), 'template');
    observe('template inserted', content);
    await page.waitForTimeout(100);
    assert.equal(await toolbar(page).getByRole('button', { name: 'Template' }).count(), 0, 'Template button hidden once the note has content');
  });

  await check('marks from the toolbar and shortcuts; toolbar buttons show the active state', async () => {
    await setDoc(page, '<p>alpha beta gamma delta epsilon zeta</p>');
    await select(page, 'beta');
    await tool(page, 'Bold').click();
    assert.equal(await tool(page, 'Bold').getAttribute('aria-pressed'), 'true');
    await select(page, 'gamma');
    assert.equal(await tool(page, 'Bold').getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Control+i');
    assert.equal(await tool(page, 'Italic').getAttribute('aria-pressed'), 'true');
    await select(page, 'delta');
    await page.keyboard.press('Control+u');
    await select(page, 'epsilon');
    await tool(page, 'Strikethrough').click();
    await select(page, 'zeta');
    await tool(page, 'Highlight').click();
    const content = await waitForStored(page, NOTE, (c) => c.includes('<mark>zeta</mark>'), 'marks');
    observe('marks applied', content);
    assert.equal(content, '<p>alpha <strong>beta</strong> <em>gamma</em> <u>delta</u> <s>epsilon</s> <mark>zeta</mark></p>');
  });

  await check('headings, quote, code block and lists from the toolbar', async () => {
    const cases = [['Heading 1', /^<h1>line<\/h1>$/], ['Heading 2', /^<h2>line<\/h2>$/], ['Heading 3', /^<h3>line<\/h3>$/],
      ['Quote', /^<blockquote><p>line<\/p><\/blockquote>$/], ['Code block', /^<pre><code>line<\/code><\/pre>$/],
      ['Bullet list', /^<ul><li><p>line<\/p><\/li><\/ul>$/], ['Numbered list', /^<ol><li><p>line<\/p><\/li><\/ol>$/],
      ['Task list', /^<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span><\/span><\/label><div><p>line<\/p><\/div><\/li><\/ul>$/]];
    for (const [button, expected] of cases) {
      await setDoc(page, '<p>line</p>');
      await cursorAt(page, 'line', 2);
      await tool(page, button).click();
      assert.equal(await tool(page, button).getAttribute('aria-pressed'), 'true', `${button} shows as active`);
      const html = await editorHTML(page);
      observe(`block: ${button}`, html);
      assert.match(html, expected, button);
    }
  });

  await check('markdown shortcuts while typing', async () => {
    const cases = [['## Title', /^<h2>Title<\/h2>/], ['- item', /^<ul><li><p>item<\/p><\/li><\/ul>/], ['1. first', /^<ol><li><p>first<\/p><\/li><\/ol>/],
      ['[ ] todo', /^<ul data-type="taskList">.*<p>todo<\/p>/], ['> quoted', /^<blockquote><p>quoted<\/p><\/blockquote>/], ['``` code', /^<pre><code>code<\/code><\/pre>/],
      ['**strong** ', /<strong>strong<\/strong>/], ['*em* ', /<em>em<\/em>/], ['~~gone~~ ', /<s>gone<\/s>/], ['==marked== ', /<mark>marked<\/mark>/], ['`mono` ', /<code>mono<\/code>/]];
    for (const [typed, expected] of cases) {
      await clear(page);
      await typeSlow(page, typed);
      const html = await editorHTML(page);
      observe(`markdown: ${typed}`, html);
      assert.match(html, expected, typed);
    }
    await clear(page);
    await typeSlow(page, 'above');
    await page.keyboard.press('Enter');
    await typeSlow(page, '---');
    const rule = await editorHTML(page);
    observe('markdown: ---', rule);
    assert.match(rule, /<hr>/);
  });

  await check('typography replacements while typing', async () => {
    await clear(page);
    await typeSlow(page, 'wait... ok -> next (c) "quote" 1/2 end');
    const html = await editorHTML(page);
    observe('typography typed', html);
    assert.equal(html, '<p>wait… ok → next © “quote” ½ end</p>');
  });

  await check('Enter, Shift+Enter, Tab and Shift+Tab', async () => {
    await clear(page);
    await typeSlow(page, '- one');
    await page.keyboard.press('Enter');
    await typeSlow(page, 'two');
    await page.keyboard.press('Tab');
    assert.equal(await editorHTML(page), '<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul>');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await editorHTML(page), '<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await typeSlow(page, 'para');
    await page.keyboard.press('Shift+Enter');
    await typeSlow(page, 'next');
    await page.keyboard.press('Home');
    await page.waitForTimeout(150); // the editor picks up native cursor moves asynchronously
    await page.keyboard.press('Tab');
    const html = await editorHTML(page);
    observe('keys: enter/tab', html);
    assert.equal(html, '<ul><li><p>one</p></li><li><p>two</p></li></ul><p>para<br>&nbsp;&nbsp;&nbsp;&nbsp;next</p>');
  });

  await check('Backspace and Delete at list item boundaries behave as before', async () => {
    const results = {};
    for (const [label, html, text, offset, key] of [
      ['backspace at start of 2nd item', '<ul><li><p>one</p></li><li><p>two</p></li></ul>', 'two', 0, 'Backspace'],
      ['backspace at start of 1st item', '<ul><li><p>one</p></li><li><p>two</p></li></ul>', 'one', 0, 'Backspace'],
      ['delete at end of 1st item', '<ul><li><p>one</p></li><li><p>two</p></li></ul>', 'one', 3, 'Delete'],
      ['backspace at start of nested item', '<ul><li><p>one</p><ul><li><p>sub</p></li></ul></li></ul>', 'sub', 0, 'Backspace'],
      ['backspace in paragraph after list', '<ul><li><p>one</p></li></ul><p>after</p>', 'after', 0, 'Backspace'],
    ]) {
      await setDoc(page, html);
      await cursorAt(page, text, offset);
      await page.keyboard.press(key);
      results[label] = await editorHTML(page);
    }
    observe('list keys', results);
  });

  await check('task list checkboxes toggle and are saved', async () => {
    await clear(page);
    await typeSlow(page, '[ ] call Vela');
    const box = page.locator('.ProseMirror ul[data-type="taskList"] input[type="checkbox"]').first();
    await box.click();
    await waitForStored(page, NOTE, (c) => c.includes('data-checked="true"'), 'checked');
    await box.click();
    await waitForStored(page, NOTE, (c) => c.includes('data-checked="false"') && !c.includes('data-checked="true"'), 'unchecked');
  });

  await check('links: add from the toolbar, autolink while typing, remove', async () => {
    await setDoc(page, '<p>see the docs today</p>');
    await select(page, 'docs');
    await tool(page, 'Add link').click();
    await page.getByLabel('Link URL').fill('example.com/a');
    await page.getByLabel('Link URL').press('Enter');
    let content = await waitForStored(page, NOTE, (c) => c.includes('href="https://example.com/a"'), 'link set');
    observe('link set', content);
    assert.match(content, /<a [^>]*class="tiptap-link"[^>]*>docs<\/a>/);
    assert.match(content, /rel="noopener noreferrer"/);
    await cursorAt(page, 'docs', 2);
    assert.equal(await tool(page, 'Remove link').count(), 1, 'toolbar offers Remove link inside a link');
    await tool(page, 'Remove link').click();
    content = await waitForStored(page, NOTE, (c) => !c.includes('<a '), 'link removed');
    await page.keyboard.press('End');
    await typeSlow(page, ' visit https://example.org/x ');
    content = await waitForStored(page, NOTE, (c) => c.includes('href="https://example.org/x"'), 'autolink');
    observe('autolink', content);
    await setDoc(page, '<p>bad link</p>');
    await select(page, 'link');
    await tool(page, 'Add link').click();
    await page.getByLabel('Link URL').fill('javascript:alert(1)');
    await page.getByLabel('Link URL').press('Enter');
    await page.waitForTimeout(200);
    assert.doesNotMatch(await editorHTML(page), /href="javascript:/i);
  });

  await check('tables: insert, add and delete rows and columns, type in cells, delete', async () => {
    await clear(page);
    await tool(page, 'Insert table').click();
    let html = await editorHTML(page);
    observe('table inserted', html);
    const count = async (selector) => page.locator(`.ProseMirror ${selector}`).count();
    assert.equal(await count('tr'), 3);
    assert.equal(await count('th'), 3);
    await typeSlow(page, 'Head');
    await page.locator('.ProseMirror th').nth(1).click();
    await typeSlow(page, 'Two');
    await page.locator('.ProseMirror td').first().click();
    await typeSlow(page, 'Cell');
    html = await waitForStored(page, NOTE, (c) => /<th[^>]*><p>Head<\/p><\/th>/.test(c) && c.includes('<p>Two</p>') && /<td[^>]*><p>Cell<\/p><\/td>/.test(c), 'table text');
    observe('table typed', html);
    await tool(page, 'Add row below').click();
    assert.equal(await count('tr'), 4);
    await tool(page, 'Add column right').click();
    assert.equal(await count('tr:first-child > *'), 4);
    await page.locator('.ProseMirror tr').nth(1).locator('td').nth(1).click(); // the new column
    await tool(page, 'Delete column').click();
    assert.equal(await count('tr:first-child > *'), 3);
    await page.locator('.ProseMirror tr').nth(2).locator('td').first().click(); // the new row
    await tool(page, 'Delete row').click();
    assert.equal(await count('tr'), 3);
    html = await editorHTML(page);
    observe('table edited', html);
    assert.match(html, /<p>Head<\/p>.*<p>Two<\/p>.*<p>Cell<\/p>/);
    await page.locator('.ProseMirror td').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await typeSlow(page, 'after-tab');
    observe('tab in a table cell', await editorHTML(page));
    await tool(page, 'Delete table').click();
    await waitForStored(page, NOTE, (c) => !c.includes('<table'), 'table deleted');
    assert.equal(await tool(page, 'Add row below').count(), 0, 'table tools hidden outside a table');
  });

  await check('slash commands: open at line start, filter, insert blocks; Escape closes', async () => {
    const menuItem = (name) => popup(page, name);
    await clear(page);
    await typeSlow(page, '/');
    await menuItem('Heading 1').waitFor();
    assert.ok(await menuItem('Divider').count() > 0);
    await typeSlow(page, 'head');
    assert.equal(await menuItem('Divider').count(), 0, 'filtered');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await typeSlow(page, 'Second level');
    assert.equal(await editorHTML(page), '<h2>Second level</h2>');
    await page.keyboard.press('Enter');
    await typeSlow(page, '/tab');
    await menuItem('Insert a 3×3 table').waitFor();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.ProseMirror table').count(), 1);
    await clear(page);
    await typeSlow(page, '/');
    await menuItem('Heading 1').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.equal(await menuItem('Heading 1').count(), 0, 'menu closed');
    assert.equal(await editorHTML(page), '<p>/</p>');
    for (const [query, name, expected] of [['bul', 'Bullet List', /^<ul>/], ['num', 'Numbered List', /^<ol>/], ['task', 'Task List', /^<ul data-type="taskList">/],
      ['code', 'Code Block', /^<pre>/], ['quo', 'Quote', /^<blockquote>/], ['div', 'Divider', /<hr>/]]) {
      await clear(page);
      await typeSlow(page, `/${query}`);
      await menuItem(name).first().click();
      const html = await editorHTML(page);
      observe(`slash: ${name}`, html);
      assert.match(html, expected, name);
    }
  });

  await check('collapsible sections: insert from the slash menu, edit the title, collapse and expand', async () => {
    await clear(page);
    await typeSlow(page, '/coll');
    await popup(page, 'Collapsible').click();
    await typeSlow(page, 'inside text');
    const title = page.locator('.ProseMirror input[placeholder="Section title…"]');
    await title.waitFor();
    observe('collapsible title shown', await title.inputValue());
    await title.fill('Pricing');
    let html = await editorHTML(page);
    observe('collapsible inserted', html);
    assert.match(html, /data-type="collapsible"/);
    assert.match(html, /data-title="Pricing"/);
    assert.match(html, /<p>inside text<\/p>/);
    await page.locator('.ProseMirror [data-type="collapsible"] .cursor-pointer, .ProseMirror .cursor-pointer').first().click({ position: { x: 8, y: 8 } });
    html = await editorHTML(page);
    assert.match(html, /data-open="false"/);
    assert.equal(await page.locator('.ProseMirror p', { hasText: 'inside text' }).isVisible(), false, 'content hidden when collapsed');
    await page.locator('.ProseMirror .cursor-pointer').first().click({ position: { x: 8, y: 8 } });
    assert.match(await editorHTML(page), /data-open="true"/);
    assert.equal(await page.locator('.ProseMirror p', { hasText: 'inside text' }).isVisible(), true, 'content shown when expanded');
    await page.waitForTimeout(400);
    const content = (await storedNote(page, NOTE)).content;
    assert.match(content, /data-title="Pricing"/);
  });

  await check('mentions: @ lists suppliers and projects and inserts a mention', async () => {
    await clear(page);
    await typeSlow(page, 'ask @Vel');
    const item = popup(page, 'Vela Components');
    await item.waitFor();
    assert.match(await item.innerText(), /supplier/i);
    await page.keyboard.press('Enter');
    await typeSlow(page, 'and @Sol');
    await popup(page, 'Project Solstice').waitFor();
    await page.keyboard.press('Enter');
    const content = await waitForStored(page, NOTE, (c) => (c.match(/data-type="mention"/g) || []).length === 2, 'mentions');
    observe('mentions inserted', content);
    assert.match(content, new RegExp(`data-id="${vela}"`));
    assert.match(content, /data-label="Vela Components"/);
    assert.match(content, />@Vela Components<\/span>/);
    assert.match(content, /<\/span> and <span/);
  });

  await check('pasting an image inserts it; pasting rich HTML keeps its structure', async () => {
    await clear(page);
    await page.evaluate(async (dataUrl) => {
      const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
      document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, PNG);
    await waitForStored(page, NOTE, (c) => /<img src="data:image\/png;base64,/.test(c), 'image');
    await clear(page);
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData('text/html', '<meta charset="utf-8"><p><b>Bold</b> and <a href="https://x.example/">link</a></p><ul><li>one</li><li>two</li></ul><table><tr><td>c</td></tr></table>');
      transfer.setData('text/plain', 'Bold and link');
      document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    });
    const html = await waitForStored(page, NOTE, (c) => c.includes('<li><p>two</p></li>'), 'pasted html');
    observe('pasted html', html);
    assert.match(html, /<strong>Bold<\/strong>/);
    assert.match(html, /href="https:\/\/x\.example\/"/);
    assert.match(html, /<table/);
  });

  await check('find and replace: counts and steps through matches, replaces', async () => {
    await setDoc(page, '<p>apple banana apple cherry Apple</p>');
    await page.keyboard.press('Control+f');
    const find = page.getByLabel('Find', { exact: true });
    await find.fill('apple');
    const counter = page.getByRole('search').locator('span.font-mono');
    await page.waitForFunction(() => document.querySelector('[role="search"] span.font-mono')?.textContent === '1 of 3');
    assert.equal(await page.locator('.ProseMirror .find-match').count() + await page.locator('.ProseMirror .find-current').count(), 3);
    await find.press('Enter');
    assert.equal(await counter.innerText(), '2 of 3');
    await find.press('Shift+Enter');
    assert.equal(await counter.innerText(), '1 of 3');
    await page.getByLabel('Replace', { exact: true }).fill('pear');
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role="search"] span.font-mono')?.textContent === '1 of 2');
    await page.getByRole('button', { name: 'Replace all' }).click();
    await page.getByRole('search').getByText('No results').waitFor();
    assert.equal(await waitForStored(page, NOTE, (c) => !/apple/i.test(c), 'replaced'), '<p>pear banana pear cherry pear</p>');
    await page.getByRole('button', { name: 'Close find and replace' }).click();
    assert.equal(await page.locator('.ProseMirror .find-match, .ProseMirror .find-current').count(), 0, 'highlights cleared');
  });

  await check('selection menu: appears for a text selection, formats, creates a task', async () => {
    await setDoc(page, '<p>order the spare parts now</p>');
    const menu = page.getByRole('toolbar', { name: 'Selection actions' });
    await cursorAt(page, 'now', 3);
    await page.waitForTimeout(150);
    assert.equal(await menu.isVisible(), false, 'hidden without a selection');
    for (let i = 0; i < 2; i++) await page.keyboard.press('Control+Shift+ArrowLeft');
    await menu.waitFor({ state: 'visible' });
    const box = await menu.boundingBox();
    const text = await page.locator('.ProseMirror p').first().boundingBox();
    assert.ok(box && text && box.y + box.height <= text.y + 4, 'menu sits above the text');
    await menu.getByRole('button', { name: 'Bold' }).click();
    await waitForStored(page, NOTE, (c) => c.includes('<strong>parts now</strong>'), 'bubble bold');
    await menu.getByRole('button', { name: /Task/ }).click();
    const task = (await stored(page)).tasks.find((t) => t.title === 'parts now');
    assert.ok(task, 'task created from the selection');
    assert.equal(task.noteId, NOTE);
  });

  await check('Alt+T, Alt+D and Alt+F create a task, decision and follow-up from the selection', async () => {
    await setDoc(page, '<p>alpha bravo charlie</p>');
    await select(page, 'alpha');
    await page.keyboard.press('Alt+t');
    await select(page, 'bravo');
    await page.keyboard.press('Alt+d');
    await select(page, 'charlie');
    await page.keyboard.press('Alt+f');
    await page.waitForTimeout(300);
    const data = await stored(page);
    assert.ok(data.tasks.some((t) => t.title === 'alpha' && t.noteId === NOTE), 'task');
    assert.ok(data.decisions.some((d) => d.text === 'bravo' && d.noteId === NOTE), 'decision');
    assert.ok(data.followUps.some((f) => f.text === 'charlie' && f.noteId === NOTE), 'follow-up');
    assert.equal(await editorHTML(page), '<p>alpha bravo charlie</p>', 'the note text is unchanged');
  });

  await check('more formatting menu: inline code, superscript, subscript, divider, undo, redo', async () => {
    await setDoc(page, '<p>x2 h2o mono</p>');
    const more = async (item) => {
      await toolbar(page).getByRole('button', { name: 'More formatting' }).click();
      await page.getByRole('menuitemcheckbox', { name: item }).or(page.getByRole('menuitem', { name: item })).first().click();
      await page.waitForTimeout(80);
    };
    await select(page, '2'); await more('Superscript');
    await select(page, '2', 1); await more('Subscript');
    await select(page, 'mono'); await more('Inline code');
    assert.equal(await editorHTML(page), '<p>x<sup>2</sup> h<sub>2</sub>o <code>mono</code></p>');
    await page.keyboard.press('End');
    await more('Divider');
    assert.match(await editorHTML(page), /<hr>/);
    await more('Undo');
    assert.doesNotMatch(await editorHTML(page), /<hr>/);
    await more('Redo');
    assert.match(await editorHTML(page), /<hr>/);
  });

  await check('undo and redo with the keyboard', async () => {
    await clear(page);
    await typeSlow(page, 'first');
    await page.waitForTimeout(700);
    await typeSlow(page, ' second');
    await page.keyboard.press('Control+z');
    assert.equal(await editorHTML(page), '<p>first</p>');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await editorHTML(page), '<p>first second</p>');
  });

  await check('word count follows the text', async () => {
    await clear(page);
    await typeSlow(page, 'one two three');
    await page.getByText('3 words').waitFor();
    await typeSlow(page, ' four');
    await page.getByText('4 words').waitFor();
  });

  await check('Enter in the title moves into the editor', async () => {
    await page.getByLabel('Meeting title').click();
    await page.getByLabel('Meeting title').press('Enter');
    await page.waitForFunction(() => document.activeElement?.classList.contains('ProseMirror'), null, { timeout: 2000 });
  });

  await check('tabs: split a note, separate text and undo per tab, switch, rename, reorder, delete with Undo', async () => {
    const tabs = () => page.getByRole('tablist', { name: 'Note tabs' }).getByRole('tab');
    const titles = async () => (await tabs().allInnerTexts()).map((t) => t.trim());
    // Menus hide the rest of the page from assistive tech until they have closed: poll.
    async function expectTitles(expected) {
      let actual;
      for (let i = 0; i < 30; i++) {
        actual = await titles();
        if (JSON.stringify(actual) === JSON.stringify(expected)) return;
        await page.waitForTimeout(100);
      }
      assert.deepEqual(actual, expected);
    }
    async function waitForNote(predicate, label) {
      for (let i = 0; i < 30; i++) {
        const note = await storedNote(page, NOTE);
        if (predicate(note)) return note;
        await page.waitForTimeout(100);
      }
      throw new Error(`stored note never matched: ${label}\n  stored: ${JSON.stringify(await storedNote(page, NOTE))}`);
    }
    await clear(page);
    await typeSlow(page, 'main text');
    await waitForStored(page, NOTE, (c) => c === '<p>main text</p>', 'main text');
    assert.equal(await page.getByRole('tablist', { name: 'Note tabs' }).count(), 0, 'a plain note shows no tab bar');

    // Split: the dashed "+ Tab" chip. The new tab's name is selected for typing.
    await page.getByRole('button', { name: 'Tab', exact: true }).click();
    const nameInput = page.getByLabel('Tab name');
    await nameInput.waitFor();
    await page.keyboard.type('Valves');
    await page.keyboard.press('Enter');
    await nameInput.waitFor({ state: 'detached' });
    await expectTitles(['Notes', 'Valves']);
    assert.equal(await tabs().nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Tab', exact: true }).count(), 0, 'the chip is replaced by the tab bar');
    assert.equal(await editorHTML(page), '<p></p>', 'a new tab starts empty');

    await page.locator('.ProseMirror').click();
    await typeSlow(page, 'valve text');
    let note = await waitForNote((n) => n.sections?.[1]?.content === '<p>valve text</p>', 'text in the second tab');
    assert.equal(note.sections[0].content, '<p>main text</p>', 'the first tab keeps the note text unchanged');
    assert.equal(note.content, '<h2>Notes</h2><p>main text</p><h2>Valves</h2><p>valve text</p>', 'content mirrors all tabs');

    // Undo stays within the tab.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Control+z');
    assert.equal(await editorHTML(page), '<p></p>', 'undo never brings in another tab\'s text');
    // One redo: with nothing left to redo, ProseMirror treats Ctrl+Shift+Z as Ctrl+Z.
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await editorHTML(page), '<p>valve text</p>');

    // Switch by click and by Ctrl+PageDown.
    await tabs().nth(0).click();
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getHTML() === '<p>main text</p>');
    await page.keyboard.press('Control+PageDown');
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getHTML() === '<p>valve text</p>');

    // Rename by double-click; Escape cancels, Enter saves.
    await tabs().nth(1).dblclick();
    await page.getByLabel('Tab name').fill('Discarded');
    await page.getByLabel('Tab name').press('Escape');
    await expectTitles(['Notes', 'Valves']);
    await tabs().nth(1).dblclick();
    await page.getByLabel('Tab name').fill('Valve delivery');
    await page.getByLabel('Tab name').press('Enter');
    await expectTitles(['Notes', 'Valve delivery']);

    // A third tab from the "+" button, then reorder from the context menu.
    await page.getByRole('button', { name: 'Add tab' }).click();
    await page.getByLabel('Tab name').press('Enter');
    await expectTitles(['Notes', 'Valve delivery', 'Tab 3']);
    await tabs().nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move left' }).click();
    await expectTitles(['Valve delivery', 'Notes', 'Tab 3']);
    note = await waitForNote((n) => n.content.startsWith('<h2>Valve delivery</h2>'), 'reordered mirror');

    // Reorder by dragging.
    await tabs().nth(2).dragTo(tabs().nth(0));
    await expectTitles(['Tab 3', 'Valve delivery', 'Notes']);

    // Delete from the tab menu, with Undo.
    await tabs().nth(0).click();
    await openTabMenu(page, 'Options for tab Tab 3');
    await page.getByRole('menuitem', { name: 'Delete tab' }).click();
    await expectTitles(['Valve delivery', 'Notes']);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expectTitles(['Tab 3', 'Valve delivery', 'Notes']);
    await openTabMenu(page, 'Options for tab Tab 3');
    await page.getByRole('menuitem', { name: 'Delete tab' }).click();

    // Removing all but one tab makes the note plain again.
    await tabs().nth(0).click();
    await openTabMenu(page, 'Options for tab Valve delivery');
    await page.getByRole('menuitem', { name: 'Delete tab' }).click();
    await page.getByRole('tablist', { name: 'Note tabs' }).waitFor({ state: 'detached' });
    note = await waitForNote((n) => !n.sections, 'a plain note again');
    assert.equal(note.content, '<p>main text</p>');
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getHTML() === '<p>main text</p>');
  });

  await check('tabs: the /new tab command adds a tab after the text typed so far', async () => {
    await clear(page);
    await typeSlow(page, 'first');
    await page.keyboard.press('Enter');
    await typeSlow(page, '/new');
    await popup(page, 'New tab').first().waitFor();
    await page.keyboard.press('Enter');
    await page.getByLabel('Tab name').waitFor();
    await page.keyboard.press('Enter');
    const note = await storedNote(page, NOTE);
    assert.equal(note.sections.length, 2);
    assert.doesNotMatch(note.sections[0].content, /\/new/, 'the typed command is removed');
    assert.match(note.sections[0].content, /<p>first<\/p>/);
    // Clean up: back to a plain note for the checks that follow.
    await openTabMenu(page, /Options for tab/);
    await page.getByRole('menuitem', { name: 'Delete tab' }).click();
    await page.getByRole('tablist', { name: 'Note tabs' }).waitFor({ state: 'detached' });
  });

  await check('no editor warnings or errors while editing', async () => { assert.deepEqual(errors, []); });
  await context.close();
} finally {
  await browser.close();
  server.kill();
}

if (process.env.EDITOR_OBSERVATIONS) fs.writeFileSync(process.env.EDITOR_OBSERVATIONS, `${JSON.stringify(observations, null, 2)}\n`);
console.log(`\n${passed} editor checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) process.exitCode = 1;
