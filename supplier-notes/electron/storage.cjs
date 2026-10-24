const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKUP_INTERVAL_MS = 15 * 60 * 1000;
const RECENT_BACKUPS = 10;
const DAILY_BACKUP_DAYS = 14;
const CURRENT_DATA_VERSION = 11;
const CORE_COLLECTIONS = ['suppliers', 'notes', 'tasks', 'decisions'];

function validateData(raw) {
  let envelope;
  try { envelope = JSON.parse(raw); } catch { throw new Error('Data file is not valid JSON'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      !Number.isInteger(envelope.version) || envelope.version < 0 ||
      !envelope.state || typeof envelope.state !== 'object' || Array.isArray(envelope.state)) {
    throw new Error('Data file has an invalid format');
  }
  if (envelope.version > CURRENT_DATA_VERSION) throw new Error('Data file was created by a newer app version');
  for (const key of CORE_COLLECTIONS) {
    if (envelope.state[key] != null && !Array.isArray(envelope.state[key])) {
      throw new Error(`Invalid ${key} collection`);
    }
  }
  if (!CORE_COLLECTIONS.some((key) => Array.isArray(envelope.state[key]))) {
    throw new Error('Data file contains no recognizable collections');
  }
  for (const key of [...CORE_COLLECTIONS, 'projects', 'followUps']) {
    for (const item of envelope.state[key] || []) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string') {
        throw new Error(`Invalid item in ${key}`);
      }
    }
  }
  const requiredText = { suppliers: 'name', notes: 'title', tasks: 'title', decisions: 'text', projects: 'name', followUps: 'text' };
  for (const [key, field] of Object.entries(requiredText)) {
    for (const item of envelope.state[key] || []) {
      if (typeof item[field] !== 'string') throw new Error(`Invalid ${key} ${field}`);
    }
  }
  for (const note of envelope.state.notes || []) {
    if (note.transcripts != null && !Array.isArray(note.transcripts)) throw new Error('Invalid transcripts');
    if (note.attachments != null && !Array.isArray(note.attachments)) throw new Error('Invalid note attachments');
  }
  return envelope;
}

function hash(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

function remapAttachmentPaths(envelope, mapPath) {
  for (const parent of [...(envelope.state.notes || []), ...(envelope.state.tasks || [])]) {
    for (const attachment of parent.attachments || []) {
      if (typeof attachment?.filePath === 'string') {
        attachment.filePath = mapPath(attachment.filePath);
      }
    }
  }
  return envelope;
}

function rebaseManagedAttachments(raw, oldDir, newDir) {
  const envelope = validateData(raw);
  const oldAttachments = path.resolve(oldDir, 'attachments');
  const newAttachments = path.resolve(newDir, 'attachments');
  remapAttachmentPaths(envelope, (file) => {
    const resolved = path.resolve(file);
    return path.dirname(resolved).toLowerCase() === oldAttachments.toLowerCase()
      ? path.join(newAttachments, path.basename(resolved)) : file;
  });
  return JSON.stringify(envelope);
}

async function atomicWrite(file, content) {
  const dir = path.dirname(file);
  await fs.promises.mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.promises.open(temp, 'wx');
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.promises.rename(temp, file);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.rm(temp, { force: true }).catch(() => {});
  }
}

async function copyTree(source, target) {
  if (!fs.existsSync(source)) return;
  await fs.promises.mkdir(target, { recursive: true });
  for (const entry of await fs.promises.readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) await copyTree(path.join(source, entry.name), path.join(target, entry.name));
    else if (entry.isFile()) await fs.promises.copyFile(path.join(source, entry.name), path.join(target, entry.name));
  }
}

class StorageService {
  constructor(dataDir, options = {}) {
    this.readSecret = options.readSecret || (() => ({}));
    this.writeSecret = options.writeSecret || (() => {});
    this.queue = Promise.resolve();
    this.lastHash = null;
    this.blocked = null;
    this.attachmentMap = new Map();
    this.setDataDir(dataDir);
  }

  setDataDir(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'Combobulator-data.json');
    this.backupDir = path.join(dir, 'backups');
    this.imagesDir = path.join(dir, 'images');
    this.attachmentsDir = path.join(dir, 'attachments');
    this.lastSavedAt = fs.existsSync(this.file) ? fs.statSync(this.file).mtimeMs : null;
    const backups = fs.existsSync(this.backupDir) ? fs.readdirSync(this.backupDir)
      .filter((entry) => !entry.startsWith('.') && fs.statSync(path.join(this.backupDir, entry)).isDirectory()) : [];
    this.lastBackupAt = backups.length ? Math.max(...backups.map((entry) => fs.statSync(path.join(this.backupDir, entry)).mtimeMs)) : null;
  }

  run(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async withLock(operation) {
    const lockPath = `${this.file}.lock`;
    await fs.promises.mkdir(this.dir, { recursive: true });
    let handle;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { handle = await fs.promises.open(lockPath, 'wx'); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const stat = await fs.promises.stat(lockPath).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > 30_000) await fs.promises.rm(lockPath, { force: true }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!handle) throw new Error('Data file is locked by another process');
    const heartbeat = setInterval(() => fs.promises.utimes(lockPath, new Date(), new Date()).catch(() => {}), 10_000);
    heartbeat.unref?.();
    try { return await operation(); }
    finally {
      clearInterval(heartbeat);
      await handle.close();
      await fs.promises.rm(lockPath, { force: true });
    }
  }

  async read() {
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const envelope = validateData(raw);
      this.lastHash = hash(raw);
      this.blocked = null;
      const secrets = await this.readSecret();
      envelope.state.settings = { ...(envelope.state.settings || {}), ...secrets };
      return JSON.stringify(envelope);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.lastHash = null;
        if ((await this.listBackups()).length === 0) return null;
        this.blocked = 'The data file is missing; restore an available backup';
        throw new Error(this.blocked);
      }
      this.blocked = error.message;
      throw error;
    }
  }

  async write(raw) {
    return this.run(() => this.withLock(async () => {
      if (this.blocked) throw new Error(`Storage is locked for recovery: ${this.blocked}`);
      const envelope = validateData(raw);
      const settings = envelope.state.settings || {};
      envelope.state.settings = { ...settings, openaiApiKey: '', groqApiKey: '' };
      const disk = await fs.promises.readFile(this.file, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (disk !== null) validateData(disk);
      if (this.lastHash !== null && disk !== null && hash(disk) !== this.lastHash) {
        this.blocked = 'The data file changed outside this app';
        throw new Error(this.blocked);
      }
      if (this.lastHash === null && disk !== null) {
        this.blocked = 'An existing data file appeared after startup';
        throw new Error(this.blocked);
      }
      await this.copyExternalAttachments(envelope.state);
      await this.writeSecret({ openaiApiKey: settings.openaiApiKey || '', groqApiKey: settings.groqApiKey || '' });
      if (disk && !this.lastBackupAt) {
        try { await this.createBackupLocked(); } catch (error) { this.backupError = error.message; }
      }
      const finalData = JSON.stringify(envelope);
      await atomicWrite(this.file, finalData);
      this.lastHash = hash(finalData);
      this.lastSavedAt = Date.now();
      if (!this.lastBackupAt || this.lastSavedAt - this.lastBackupAt >= BACKUP_INTERVAL_MS) {
        try { await this.createBackupLocked(); } catch (error) { this.backupError = error.message; }
      }
      return this.status();
    }));
  }

  async copyExternalAttachments(state) {
    let missing = 0;
    await fs.promises.mkdir(this.attachmentsDir, { recursive: true });
    for (const parent of [...(state.notes || []), ...(state.tasks || [])]) {
      for (const attachment of parent.attachments || []) {
        if (!attachment || typeof attachment.filePath !== 'string') continue;
        const source = path.resolve(attachment.filePath);
        if (source.startsWith(`${path.resolve(this.attachmentsDir)}${path.sep}`)) continue;
        if (!fs.existsSync(source)) { missing++; continue; }
        if (!this.attachmentMap.has(source)) {
          const target = path.join(this.attachmentsDir, `${crypto.randomUUID()}-${path.basename(source)}`);
          await fs.promises.copyFile(source, target);
          this.attachmentMap.set(source, target);
        }
        attachment.filePath = this.attachmentMap.get(source);
      }
    }
    this.attachmentWarning = missing ? `${missing} linked attachment files could not be found for backup` : null;
  }

  async createBackupLocked() {
    const raw = await fs.promises.readFile(this.file, 'utf8');
    const envelope = validateData(raw);
    if (envelope.state.settings) {
      envelope.state.settings.openaiApiKey = '';
      envelope.state.settings.groqApiKey = '';
    }
    await fs.promises.mkdir(this.backupDir, { recursive: true });
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
    const stage = path.join(this.backupDir, `.${id}.tmp`);
    const target = path.join(this.backupDir, id);
    try {
      await fs.promises.mkdir(stage);
      await fs.promises.writeFile(path.join(stage, 'Combobulator-data.json'), JSON.stringify(envelope), 'utf8');
      await copyTree(this.imagesDir, path.join(stage, 'images'));
      await copyTree(this.attachmentsDir, path.join(stage, 'attachments'));
      await fs.promises.rename(stage, target);
      this.lastBackupAt = Date.now();
      this.backupError = null;
      const backups = await Promise.all((await fs.promises.readdir(this.backupDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('pre-restore-'))
        .map(async (entry) => ({ name: entry.name, createdAt: (await fs.promises.stat(path.join(this.backupDir, entry.name))).mtimeMs })));
      backups.sort((a, b) => b.createdAt - a.createdAt);
      const keep = new Set(backups.slice(0, RECENT_BACKUPS).map((entry) => entry.name));
      const daily = new Set();
      for (const entry of backups) {
        if (Date.now() - entry.createdAt > DAILY_BACKUP_DAYS * 86_400_000) continue;
        const day = new Date(entry.createdAt).toISOString().slice(0, 10);
        if (!daily.has(day)) { daily.add(day); keep.add(entry.name); }
      }
      for (const old of backups.filter((entry) => !keep.has(entry.name))) {
        await fs.promises.rm(path.join(this.backupDir, old.name), { recursive: true, force: true });
      }
      return { id, createdAt: this.lastBackupAt };
    } finally { await fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {}); }
  }

  backup() { return this.run(() => this.withLock(() => this.createBackupLocked())); }

  async listBackups() {
    const entries = await fs.promises.readdir(this.backupDir, { withFileTypes: true }).catch(() => []);
    return Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(async (entry) => ({
        id: entry.name,
        createdAt: (await fs.promises.stat(path.join(this.backupDir, entry.name))).mtimeMs,
      })));
  }

  restore(id) {
    return this.run(() => this.withLock(async () => {
      if (!/^[\w-]+$/.test(id)) throw new Error('Invalid backup ID');
      const source = path.join(this.backupDir, id);
      const raw = await fs.promises.readFile(path.join(source, 'Combobulator-data.json'), 'utf8');
      const restored = validateData(raw);
      const snapshotAttachments = path.join(source, 'attachments');
      remapAttachmentPaths(restored, (file) => {
        const filename = path.basename(file);
        return fs.existsSync(path.join(snapshotAttachments, filename))
          ? path.join(this.attachmentsDir, filename) : file;
      });
      if (fs.existsSync(this.file)) {
        const emergency = path.join(this.backupDir, `pre-restore-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
        await fs.promises.mkdir(emergency, { recursive: true });
        let current = await fs.promises.readFile(this.file, 'utf8');
        try {
          const parsed = validateData(current);
          if (parsed.state.settings) {
            parsed.state.settings.openaiApiKey = '';
            parsed.state.settings.groqApiKey = '';
          }
          current = JSON.stringify(parsed);
        } catch { /* Keep corrupt data for manual recovery. */ }
        await fs.promises.writeFile(path.join(emergency, 'Combobulator-data.json'), current, 'utf8');
        await copyTree(this.imagesDir, path.join(emergency, 'images'));
        await copyTree(this.attachmentsDir, path.join(emergency, 'attachments'));
      }
      const restoredRaw = JSON.stringify(restored);
      await atomicWrite(this.file, restoredRaw);
      await copyTree(path.join(source, 'images'), this.imagesDir);
      await copyTree(path.join(source, 'attachments'), this.attachmentsDir);
      this.lastHash = hash(restoredRaw);
      this.blocked = null;
      this.lastSavedAt = Date.now();
      return this.status();
    }));
  }

  status() {
    return { lastSavedAt: this.lastSavedAt, lastBackupAt: this.lastBackupAt,
      backupError: this.backupError || null, attachmentWarning: this.attachmentWarning || null, error: this.blocked };
  }
}

module.exports = { StorageService, validateData, atomicWrite, rebaseManagedAttachments };
