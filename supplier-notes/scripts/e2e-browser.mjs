// Browser regression checks for HiveMind (renderer only; Electron features are covered by
// scripts/e2e-electron.cjs). Requires Playwright with Chromium, which is not a project dependency:
//   npx playwright install chromium   (once)   then   npm run build && node scripts/e2e-browser.mjs
// All AI provider requests are intercepted locally — no data or keys leave the machine.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createDemoState } = await import(path.join(root, 'docs/demo/fixture.mjs'));
const port = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${port}/`;
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* starting */ }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
let passed = 0;
const ok = (name) => { passed++; console.log(`ok - ${name}`); };
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('Combobulator-data')).state);
async function open(state, { init, viewport = { width: 1500, height: 950 }, scale = 1 } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => { if (/Content Security Policy/i.test(msg.text())) errors.push(msg.text()); });
  await page.addInitScript((seed) => { localStorage.setItem('Combobulator-data', seed); }, JSON.stringify({ version: 11, state }));
  if (init) await page.addInitScript(init);
  await page.goto(BASE);
  return { page, context, errors };
}

try {
  const demo = () => {
    const state = createDemoState();
    const pid = state.projects[0].id;
    const vela = state.notes[0].supplierIds[0];
    return { state, pid, vela };
  };

  // ── 1. Data safety ─────────────────────────────────────────────────────────
  {
    const { state, pid, vela } = demo();
    state.notes = [
      { id: 'note-a', projectIds: [pid], supplierIds: [vela], title: 'Alpha', content: '<p>Alpha text.</p>', attendees: '', createdAt: 3, updatedAt: 3 },
      { id: 'note-b', projectIds: [pid], supplierIds: [vela], title: 'Beta', content: '<p>Beta text.</p>', attendees: '', createdAt: 2, updatedAt: 2 },
      { id: 'note-x', projectIds: [pid], supplierIds: [vela], title: 'Imported', content: '<p>hi</p><img src="x" onerror="window.__xss=(window.__xss||0)+1">', attendees: '', createdAt: 1, updatedAt: 1 },
    ];
    const { page, context, errors } = await open({ ...state, activeProjectId: pid, openTabs: [vela], activeTabId: vela, activeNoteId: 'note-a', rightPanelOpen: true });
    await page.waitForSelector('.ProseMirror');
    await page.locator('.ProseMirror p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' typed-in-alpha');
    await page.waitForTimeout(700); // outside ProseMirror's 500 ms history grouping
    await page.getByText('Beta', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.locator('.ProseMirror p').first().click();
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    const notes = (await stored(page)).notes;
    assert.equal(notes.find((n) => n.id === 'note-b').content, '<p>Beta text.</p>');
    assert.match(notes.find((n) => n.id === 'note-a').content, /typed-in-alpha/);
    ok('undo after switching notes never writes the previous note into the current one');

    await page.keyboard.press('Control+Shift+F');
    await page.getByLabel('Global search').fill('hi');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__xss || 0), 0);
    ok('HTML stored in notes is never executed (sidebar previews, search index)');
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ── 2. Task, follow-up and decision workflows ──────────────────────────────
  {
    const { state, pid, vela } = demo();
    const { page, context, errors } = await open({ ...state, activeProjectId: pid, openTabs: [vela], activeTabId: vela, activeNoteId: state.notes[0].id, rightPanelOpen: true });
    await page.waitForSelector('.ProseMirror');
    const panel = page.locator('aside[aria-label="Note side panel"]');

    await panel.getByRole('tab', { name: /Follow-ups/ }).click();
    await panel.getByLabel('Add follow-up').first().fill('Ask about tooling cost');
    await panel.getByLabel('Add follow-up').first().press('Enter');
    const row = panel.locator('div.group\\/fu', { hasText: 'Ask about tooling cost' });
    await row.hover();
    await row.getByRole('button', { name: 'Edit follow-up' }).click();
    await panel.getByLabel('Edit follow-up').fill('Ask about tooling cost and lead time');
    await panel.getByLabel('Edit follow-up').press('Enter');
    let fu = (await stored(page)).followUps.find((f) => f.text.startsWith('Ask about tooling'));
    assert.equal(fu.text, 'Ask about tooling cost and lead time');
    assert.equal(fu.noteId, state.notes[0].id);
    const edited = panel.locator('div.group\\/fu', { hasText: 'lead time' });
    await edited.hover();
    await edited.getByRole('button', { name: 'Edit follow-up' }).click();
    await panel.getByLabel('Edit follow-up').fill('SHOULD NOT SAVE');
    await panel.getByLabel('Edit follow-up').press('Escape');
    await page.waitForTimeout(200);
    assert.equal((await stored(page)).followUps.find((f) => f.id === fu.id).text, 'Ask about tooling cost and lead time');
    ok('follow-ups are editable in the side panel; Escape cancels');

    await panel.getByRole('tab', { name: /Tasks/ }).click();
    await panel.locator('[role="button"]').first().click();
    const dialog = page.getByRole('dialog');
    const title = dialog.getByRole('textbox', { name: 'Title', exact: true });
    await title.fill('Edited title kept');
    await page.locator('#task-flag').click();
    assert.equal(await title.inputValue(), 'Edited title kept');
    await dialog.getByRole('combobox').filter({ hasText: 'Link existing follow-up' }).click();
    await page.getByRole('option', { name: 'Ask about tooling cost and lead time' }).click();
    await page.waitForTimeout(200);
    assert.equal(await title.inputValue(), 'Edited title kept');
    await page.keyboard.press('Escape');
    assert.ok(await dialog.getByText('Unsaved changes').isVisible());
    await dialog.getByRole('button', { name: 'Save' }).click();
    let s = await stored(page);
    const task = s.tasks.find((t) => t.title === 'Edited title kept');
    assert.equal(task.linkedFollowUpId, fu.id);
    assert.equal(s.followUps.find((f) => f.id === fu.id).linkedTaskId, task.id);
    await panel.getByRole('tab', { name: /Follow-ups/ }).click();
    assert.ok(await panel.getByText(/Task: Edited title kept/).isVisible());
    ok('task dialog keeps unsaved edits while flagging/linking, links both sides, warns before discarding');

    await panel.getByRole('tab', { name: /Decisions/ }).click();
    const decision = panel.locator('div.group\\/dec').first();
    const decisionText = (await decision.locator('button').first().innerText()).trim();
    await decision.hover();
    await decision.getByRole('button', { name: 'Revoke decision' }).click();
    assert.ok(await panel.getByText(/Revoked or replaced/).isVisible());
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(200);
    assert.equal((await stored(page)).decisions.find((d) => d.text === decisionText).status, 'active');
    await page.keyboard.press('Control+Shift+F');
    await page.getByLabel('Global search').fill(decisionText.split(' ')[0]);
    await page.waitForTimeout(300);
    await page.locator('button:has(span:text-is("decision"))').first().click();
    assert.ok(await page.getByRole('dialog', { name: 'Decision history' }).isVisible());
    await page.keyboard.press('Escape');
    ok('revoked decisions leave the current list (with Undo); search opens decision history');

    await page.getByRole('button', { name: /Follow-up/ }).first().click();
    const card = page.locator('article', { hasText: 'Edited title kept' });
    await card.hover();
    await card.getByRole('button', { name: 'Delete task' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(200);
    s = await stored(page);
    assert.equal(s.tasks.find((t) => t.id === task.id).linkedFollowUpId, fu.id);
    ok('deleting a task from the board can be undone, including its follow-up link');

    await page.keyboard.press('Control+,');
    await page.getByRole('button', { name: 'Data & Storage' }).click();
    const file = { name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 5, exportedAt: 1,
      projects: [{ id: 'imp', name: 'Imported workspace', color: '#000', archived: false, createdAt: 1 }], suppliers: [], notes: [], tasks: [], decisions: [], followUps: [] })) };
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    assert.equal((await stored(page)).projects[0].name, 'Project Solstice');
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replace data' }).click();
    await page.waitForTimeout(300);
    s = await stored(page);
    assert.deepEqual(s.projects.map((p) => p.name), ['Imported workspace']);
    assert.equal(s.activeProjectId, 'imp');
    ok('import asks before replacing data');
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ── 3. Importing a transcript (no recording, nothing sent) ─────────────────
  {
    const { state, pid, vela } = demo();
    state.settings = { ...(state.settings || {}), openaiApiKey: 'test-openai', autoSummarize: false };
    const { page, context, errors } = await open({ ...state, activeProjectId: pid, openTabs: [vela], activeTabId: vela, activeNoteId: state.notes[1].id, rightPanelOpen: true });
    let providerCalls = 0;
    await page.route(/api\.(openai|groq)\.com/, (route) => { providerCalls++; return route.abort(); });
    await page.waitForSelector('.ProseMirror');
    const panel = page.locator('aside[aria-label="Note side panel"]');
    await panel.getByRole('tab', { name: /Transcript/ }).click();
    await panel.getByRole('button', { name: /Paste or import a transcript/ }).click();
    await panel.locator('input[type=file]').setInputFiles({ name: 'meeting.vtt', mimeType: 'text/vtt',
      buffer: Buffer.from('WEBVTT\n\n1\n00:00:01.000 --> 00:00:09.000\n<v Nora Vale>Pilot moves to week 12.</v>\n') });
    await page.waitForTimeout(200);
    await panel.getByRole('button', { name: 'Add transcript' }).click();
    await page.waitForTimeout(300);
    const note = (await stored(page)).notes.find((n) => n.id === state.notes[1].id);
    assert.equal(note.transcripts.at(-1).rawText, 'Nora Vale: Pilot moves to week 12.');
    assert.equal(note.transcripts.at(-1).duration, 9);
    assert.ok(await panel.getByRole('button', { name: /Generate summary/ }).isVisible());
    assert.equal(providerCalls, 0, 'nothing is sent while automatic summaries are off');
    ok('a Teams .vtt transcript can be imported; with automatic summaries off nothing is sent');
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ── 4. Recording, transcription and summaries (providers mocked) ───────────
  for (const mode of ['mic', 'system']) {
    const { state, pid, vela } = demo();
    state.notes = [{ id: 'rec', projectIds: [pid], supplierIds: [vela], title: 'Recorded meeting', content: '<p>Agenda</p>', attendees: '', createdAt: 1, updatedAt: 1 }];
    state.settings = { openaiApiKey: 'test-openai', groqApiKey: 'test-groq', gptModel: 'gpt-4o-mini', temperature: 0.3, customSummaryInstructions: '',
      autoSummarize: true, defaultAudioMode: mode, chunkIntervalSeconds: 15, autoStopHours: 4, teamsEnabled: false, theme: 'light' };
    const init = mode === 'mic'
      ? () => { // Behaves like speech recognition inside Electron: start() fails with "network".
        const Fake = class { start() { setTimeout(() => { this.onerror?.({ error: 'network' }); this.onend?.(); }, 50); } stop() {} abort() {} };
        Object.defineProperty(window, 'SpeechRecognition', { value: Fake, configurable: true });
        Object.defineProperty(window, 'webkitSpeechRecognition', { value: Fake, configurable: true });
      }
      : () => { // The desktop capture bridge, faked: steady loud levels and one audio chunk per flush.
        let onChunk, onLevels, timer;
        const emit = () => onChunk?.(new Uint8Array(2048).fill(7).buffer);
        window.electronCapture = {
          getSources: async () => [{ id: 'screen:0', name: 'Entire screen' }],
          startCapture: async () => { timer = setInterval(() => onLevels?.(Array.from({ length: 64 }, () => 230)), 33); return 'audio/webm'; },
          flushCapture: async () => emit(), stopCapture: async () => { clearInterval(timer); emit(); },
          onChunk: (cb) => { onChunk = cb; }, offChunk: () => {}, onError: () => {}, offError: () => {},
          onLevels: (cb) => { onLevels = cb; }, offLevels: () => {},
        };
      };
    const { page, context, errors } = await open({ ...state, activeProjectId: pid, openTabs: [vela], activeTabId: vela, activeNoteId: 'rec', rightPanelOpen: true }, { init, scale: 1.5 });
    const calls = { groq: 0, openai: [] };
    await page.route('https://api.groq.com/**', (route) => {
      calls.groq++;
      return calls.groq === 1
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporary outage' } }) })
        : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: `segment-${calls.groq}` }) });
    });
    await page.route('https://api.openai.com/**', (route) => {
      calls.openai.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '### Overview\n* First point\n* Second point' } }] }) });
    });
    await page.waitForSelector('.ProseMirror');
    const panel = page.locator('aside[aria-label="Note side panel"]');
    await panel.getByRole('tab', { name: /Transcript/ }).click();
    await panel.getByRole('button', { name: /Start recording/ }).click();
    await page.waitForTimeout(1500);
    const coverage = await page.evaluate(() => {
      const canvas = document.querySelector('aside canvas');
      const row = canvas.getContext('2d').getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data;
      let last = 0;
      for (let x = 0; x < canvas.width; x++) if (row[x * 4 + 3] > 0) last = x;
      return last / canvas.width;
    });
    assert.ok(coverage > 0.9, `visualizer spans the canvas at 150% scaling (${coverage})`);
    await page.waitForTimeout(31000); // two cycles: the first upload fails, the second retries it
    assert.equal(calls.groq, 3);
    await panel.getByRole('button', { name: /Stop recording/ }).click();
    await page.waitForTimeout(2500);
    const note = (await stored(page)).notes[0];
    assert.match(note.transcripts[0].rawText, /segment-2 segment-3 segment-4/);
    assert.equal(calls.openai.length, 1, 'one summary request per recording');
    assert.equal(calls.openai[0].messages[0].content, 'Summarize this meeting transcript. Write the summary in the same language as the transcript.');
    await panel.getByRole('button', { name: 'Add to note' }).click();
    assert.match((await stored(page)).notes[0].content, /<h3>Overview<\/h3><ul><li><p>First point<\/p><\/li>/);
    ok(`${mode} recording: visualizer, retry after a failed upload, final segment, single summary, lists in note`);
    assert.deepEqual(errors, []);
    await context.close();
  }

  console.log(`\n${passed} browser checks passed`);
} finally {
  await browser.close();
  server.kill();
}
