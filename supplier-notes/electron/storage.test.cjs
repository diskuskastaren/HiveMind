const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { StorageService, validateData, rebaseManagedAttachments } = require('./storage.cjs');

const envelope = (notes = []) => JSON.stringify({ version: 11, state: {
  projects: [], suppliers: [], notes, tasks: [], decisions: [], followUps: [],
  settings: { openaiApiKey: 'secret', groqApiKey: '' },
} });

test('serializes writes, excludes secrets, and restores a validated backup', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hivemind-storage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let secret = {};
  const service = new StorageService(dir, { readSecret: () => secret, writeSecret: (keys) => { secret = keys; } });
  assert.equal(await service.read(), null);
  await Promise.all([
    service.write(envelope([{ id: 'one', title: 'First' }])),
    service.write(envelope([{ id: 'two', title: 'Second' }])),
  ]);
  const disk = JSON.parse(await fs.readFile(service.file, 'utf8'));
  assert.equal(disk.state.notes[0].id, 'two');
  assert.equal(disk.state.settings.openaiApiKey, '');
  assert.equal(secret.openaiApiKey, 'secret');
  const backups = await service.listBackups();
  assert.ok(backups.length >= 1);
  const backupData = await fs.readFile(path.join(service.backupDir, backups[0].id, 'Combobulator-data.json'), 'utf8');
  assert.equal(JSON.parse(backupData).state.settings.openaiApiKey, '');
  await fs.writeFile(service.file, '{broken');
  await assert.rejects(service.read(), /valid JSON/);
  await assert.rejects(service.write(envelope()), /locked for recovery/);
  await service.restore(backups[0].id);
  assert.equal(JSON.parse(await service.read()).state.notes[0].id, 'one');
  await fs.rm(service.file);
  await assert.rejects(service.read(), /data file is missing/);
  await assert.rejects(service.write(envelope()), /locked for recovery/);
  await service.restore(backups[0].id);
  assert.equal(JSON.parse(await service.read()).state.notes[0].id, 'one');
});

test('rejects malformed data and external changes without replacing a valid file', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hivemind-storage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const service = new StorageService(dir);
  await service.read();
  await service.write(envelope());
  await assert.rejects(service.write('{bad'), /valid JSON/);
  assert.doesNotThrow(() => validateData(require('node:fs').readFileSync(service.file, 'utf8')));
  await fs.writeFile(service.file, envelope([{ id: 'external', title: 'External' }]));
  await assert.rejects(service.write(envelope()), /changed outside/);
  assert.equal(JSON.parse(await fs.readFile(service.file, 'utf8')).state.notes[0].id, 'external');
});

test('copies linked files into managed backups and reports missing links', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hivemind-files-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const external = path.join(dir, 'original.txt');
  await fs.writeFile(external, 'attachment');
  const service = new StorageService(path.join(dir, 'data'));
  await service.read();
  const note = { id: 'note', title: 'Meeting', attachments: [{ id: 'a', fileName: 'original.txt', filePath: external }] };
  await service.write(envelope([note]));
  const managed = JSON.parse(await fs.readFile(service.file, 'utf8')).state.notes[0].attachments[0].filePath;
  assert.ok(managed.startsWith(service.attachmentsDir));
  assert.equal(await fs.readFile(managed, 'utf8'), 'attachment');
  const backup = (await service.listBackups())[0];
  const backedUp = path.join(service.backupDir, backup.id, 'attachments', path.basename(managed));
  assert.equal(await fs.readFile(backedUp, 'utf8'), 'attachment');
  await service.write(envelope([{ ...note, attachments: [{ id: 'missing', fileName: 'gone.txt', filePath: path.join(dir, 'gone.txt') }] }]));
  assert.match(service.status().attachmentWarning, /1 linked attachment/);
});

test('rebases managed attachments when data moves and when an older backup is restored', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hivemind-move-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const oldDir = path.join(dir, 'old');
  const newDir = path.join(dir, 'new');
  const external = path.join(dir, 'source.txt');
  await fs.writeFile(external, 'linked file');
  const oldService = new StorageService(oldDir);
  await oldService.read();
  await oldService.write(envelope([{ id: 'note', title: 'Meeting', attachments: [{ id: 'a', filePath: external }] }]));
  const raw = await fs.readFile(oldService.file, 'utf8');
  const moved = JSON.parse(rebaseManagedAttachments(raw, oldDir, newDir));
  assert.equal(path.dirname(moved.state.notes[0].attachments[0].filePath), path.join(newDir, 'attachments'));

  const backup = (await oldService.listBackups())[0];
  const newService = new StorageService(newDir);
  await fs.mkdir(newService.backupDir, { recursive: true });
  await fs.cp(path.join(oldService.backupDir, backup.id), path.join(newService.backupDir, backup.id), { recursive: true });
  await newService.restore(backup.id);
  const restoredPath = JSON.parse(await fs.readFile(newService.file, 'utf8')).state.notes[0].attachments[0].filePath;
  assert.equal(path.dirname(restoredPath), newService.attachmentsDir);
  assert.equal(await fs.readFile(restoredPath, 'utf8'), 'linked file');
});
