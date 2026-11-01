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
  await service.write(envelope([{ id: 'one', title: 'First' }]));
  await Promise.all([
    service.write(envelope([{ id: 'two', title: 'Second' }])),
    service.write(envelope([{ id: 'three', title: 'Third' }])),
  ]);
  const disk = JSON.parse(await fs.readFile(service.file, 'utf8'));
  assert.equal(disk.state.notes[0].id, 'three');
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

test('coalesces superseded writes, lets callers wait for the queue, and ignores writes after a restore', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hivemind-coalesce-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const service = new StorageService(dir);
  await service.read();
  let diskWrites = 0;
  const original = service.writeLocked.bind(service);
  service.writeLocked = async (raw) => { diskWrites++; return original(raw); };
  const writes = Array.from({ length: 6 }, (_, index) => service.write(envelope([{ id: `n${index}`, title: `Note ${index}` }])));
  assert.ok(service.pending > 0);
  await service.flush();
  assert.equal(service.pending, 0);
  await Promise.all(writes);
  assert.ok(diskWrites < 6, `expected superseded writes to be skipped, got ${diskWrites} disk writes`);
  assert.equal(JSON.parse(await fs.readFile(service.file, 'utf8')).state.notes[0].id, 'n5');

  service.closeForRestart();
  await service.write(envelope([{ id: 'late', title: 'After restore' }]));
  assert.equal(JSON.parse(await fs.readFile(service.file, 'utf8')).state.notes[0].id, 'n5');
});

test('backups share unchanged files with the previous backup and copy changed ones', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hivemind-dedupe-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const service = new StorageService(dir);
  await fs.mkdir(service.imagesDir, { recursive: true });
  await fs.mkdir(service.attachmentsDir, { recursive: true });
  const image = path.join(service.imagesDir, 'img-a.png');
  const doc = path.join(service.attachmentsDir, 'doc.txt');
  await fs.writeFile(image, 'image-bytes');
  await fs.writeFile(doc, 'version 1');
  await service.read();
  await service.write(envelope([{ id: 'one', title: 'First' }]));
  const inBackup = (id, ...parts) => path.join(service.backupDir, id, ...parts);
  const first = (await service.listBackups())[0].id;
  const second = (await service.backup()).id;

  // Unchanged files: one copy on disk, present in both backups.
  const [imageA, imageB, liveImage] = await Promise.all([
    fs.stat(inBackup(first, 'images', 'img-a.png')), fs.stat(inBackup(second, 'images', 'img-a.png')), fs.stat(image)]);
  assert.equal(imageA.ino, imageB.ino);
  assert.ok(imageB.nlink >= 2);
  assert.notEqual(liveImage.ino, imageB.ino, 'live files are never linked to a backup');
  assert.equal(liveImage.nlink, 1);

  // An attachment edited in place (same size, saved later) gets its own copy in the next backup;
  // the earlier backups keep the earlier version.
  await fs.writeFile(doc, 'version 2');
  const later = new Date(Date.now() + 5000);
  await fs.utimes(doc, later, later);
  const third = (await service.backup()).id;
  assert.equal(await fs.readFile(inBackup(third, 'attachments', 'doc.txt'), 'utf8'), 'version 2');
  assert.equal(await fs.readFile(inBackup(second, 'attachments', 'doc.txt'), 'utf8'), 'version 1');
  assert.notEqual((await fs.stat(inBackup(third, 'attachments', 'doc.txt'))).ino, (await fs.stat(inBackup(second, 'attachments', 'doc.txt'))).ino);
  assert.equal((await fs.stat(inBackup(third, 'images', 'img-a.png'))).ino, imageB.ino);

  // Removing an older backup (as pruning does) leaves the newer ones complete.
  await fs.rm(inBackup(first), { recursive: true });
  assert.equal(await fs.readFile(inBackup(third, 'images', 'img-a.png'), 'utf8'), 'image-bytes');

  // Restoring writes real copies; the safety backup taken first shares unchanged files too.
  await service.restore(second);
  assert.equal(await fs.readFile(doc, 'utf8'), 'version 1');
  assert.equal((await fs.stat(doc)).nlink, 1);
  const safety = (await service.listBackups()).find((backup) => backup.id.startsWith('pre-restore-')).id;
  assert.equal(await fs.readFile(inBackup(safety, 'attachments', 'doc.txt'), 'utf8'), 'version 2');
  assert.equal((await fs.stat(inBackup(safety, 'images', 'img-a.png'))).ino, imageB.ino);
});

test('backups fall back to copying where hard links are not supported', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hivemind-nolinks-'));
  const realFs = require('node:fs');
  const link = realFs.promises.link;
  realFs.promises.link = async () => { throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' }); };
  t.after(async () => { realFs.promises.link = link; await fs.rm(dir, { recursive: true, force: true }); });
  const service = new StorageService(dir);
  await fs.mkdir(service.imagesDir, { recursive: true });
  await fs.writeFile(path.join(service.imagesDir, 'img-b.png'), 'pixels');
  await service.read();
  await service.write(envelope());
  const first = (await service.listBackups())[0].id;
  const second = (await service.backup()).id;
  const [a, b] = await Promise.all([first, second].map((id) => fs.stat(path.join(service.backupDir, id, 'images', 'img-b.png'))));
  assert.notEqual(a.ino, b.ino);
  assert.equal(b.nlink, 1);
  assert.equal(await fs.readFile(path.join(service.backupDir, second, 'images', 'img-b.png'), 'utf8'), 'pixels');
});
