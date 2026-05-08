const { app, BrowserWindow, ipcMain, Menu, MenuItem, protocol, net, desktopCapturer, shell, screen, dialog, crashReporter } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { WebSocket } = require('ws');
const { execFile, execFileSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

// #region agent log — native crash reporter (captures GPU/C++ crashes JS handlers miss)
crashReporter.start({ uploadToServer: false });
// #endregion

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// #region agent log
// Writable log paths — userData is always writable in both dev and packaged app.
// __dirname inside an ASAR is read-only, so we MUST use app.getPath('userData').
function _dbgLogPath() {
  try { return path.join(app.getPath('userData'), 'debug-6cf3ea.log'); } catch { return path.join(require('os').homedir(), 'debug-6cf3ea.log'); }
}
function _dbgWrite(obj) {
  try { fs.appendFileSync(_dbgLogPath(), JSON.stringify(obj) + '\n'); } catch {}
}

// Global crash handlers — catch the exact error before the process dies.
process.on('uncaughtException', (err) => {
  _dbgWrite({sessionId:'6cf3ea',type:'uncaughtException',error:err?.message,stack:err?.stack,timestamp:Date.now()});
  try { dialog.showErrorBox('[Combobulator debug] Uncaught exception — please screenshot', String(err?.stack || err)); } catch {}
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : '';
  _dbgWrite({sessionId:'6cf3ea',type:'unhandledRejection',error:msg,stack,timestamp:Date.now()});
  try { dialog.showErrorBox('[Combobulator debug] Unhandled rejection — please screenshot', String(stack || msg)); } catch {}
});

// IPC debug log forwarding (renderer → file)
const DEBUG_LOG = path.join(__dirname, '..', 'debug-0a018f.log');
ipcMain.on('debug:log', (_event, payload) => {
  if (payload && payload.sessionId === '6cf3ea') { _dbgWrite(payload); return; }
  try { fs.appendFileSync(DEBUG_LOG, JSON.stringify(payload) + '\n'); } catch {}
});
// #endregion

// --- Configurable data directory ---
// app-config.json lives permanently in the default userData folder and acts as
// a pointer to wherever the user has chosen to store their actual data.
const APP_CONFIG_FILE = path.join(app.getPath('userData'), 'app-config.json');

function loadAppConfig() {
  try {
    if (fs.existsSync(APP_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(APP_CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveAppConfig(cfg) {
  try {
    fs.writeFileSync(APP_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save app config:', e);
  }
}

function getDataDir() {
  const cfg = loadAppConfig();
  return cfg.customDataDir || app.getPath('userData');
}

function getStoragePaths() {
  const cfg = loadAppConfig();
  const dataDir = cfg.customDataDir || app.getPath('userData');
  return {
    cfg,
    dataDir,
    dataFile: path.join(dataDir, 'Combobulator-data.json'),
    imagesDir: path.join(dataDir, 'images'),
    isCustom: !!cfg.customDataDir,
  };
}

let DATA_FILE = getStoragePaths().dataFile;
let IMAGES_DIR = getStoragePaths().imagesDir;

const storageSession = {
  status: 'unknown',
  writeAllowed: false,
  reason: '',
  backupCreatedFor: null,
};

function updateStoragePaths() {
  const paths = getStoragePaths();
  DATA_FILE = paths.dataFile;
  IMAGES_DIR = paths.imagesDir;
  return paths;
}

function setStorageSession(status, writeAllowed, reason = '') {
  storageSession.status = status;
  storageSession.writeAllowed = writeAllowed;
  storageSession.reason = reason;
}

function inspectStorage() {
  const paths = updateStoragePaths();
  try {
    const dirExists = fs.existsSync(paths.dataDir);
    if (!dirExists) {
      return {
        status: paths.isCustom ? 'unreachable' : 'missing',
        message: paths.isCustom
          ? 'Your custom data folder is unavailable. Connect the VPN or mapped drive before opening Combobulator.'
          : 'Data directory does not exist yet.',
        ...paths,
      };
    }

    let dirStat;
    try {
      dirStat = fs.statSync(paths.dataDir);
    } catch (e) {
      return {
        status: paths.isCustom ? 'unreachable' : 'error',
        message: paths.isCustom
          ? 'Your custom data folder is unavailable. Connect the VPN or mapped drive before opening Combobulator.'
          : `Could not read data directory: ${e.message}`,
        ...paths,
      };
    }

    if (!dirStat.isDirectory()) {
      return {
        status: 'error',
        message: 'Configured data path is not a folder.',
        ...paths,
      };
    }

    if (!fs.existsSync(paths.dataFile)) {
      return {
        status: 'missing',
        message: 'No data file found in the configured data folder.',
        ...paths,
      };
    }

    let raw;
    try {
      raw = fs.readFileSync(paths.dataFile, 'utf-8');
    } catch (e) {
      return {
        status: 'error',
        message: `Could not read data file: ${e.message}`,
        ...paths,
      };
    }

    try {
      JSON.parse(raw);
    } catch (e) {
      return {
        status: 'error',
        message: `Data file is not valid JSON: ${e.message}`,
        ...paths,
      };
    }

    return {
      status: 'ok',
      data: raw,
      message: '',
      ...paths,
    };
  } catch (e) {
    return {
      status: 'error',
      message: `Storage check failed: ${e.message}`,
      ...paths,
    };
  }
}

function makeBackupIfNeeded(dataFile) {
  if (!fs.existsSync(dataFile)) return;
  if (storageSession.backupCreatedFor === dataFile) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(path.dirname(dataFile), `Combobulator-data.backup-${timestamp}.json`);
  fs.copyFileSync(dataFile, backupFile);
  storageSession.backupCreatedFor = dataFile;
}

function ensureImagesDirAvailable() {
  const { imagesDir } = updateStoragePaths();
  const parentDir = path.dirname(imagesDir);
  if (!fs.existsSync(parentDir)) {
    throw new Error('Data directory is unavailable.');
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  return imagesDir;
}

const LOCAL_TRANSCRIPTION_MODELS = {
  tiny: {
    filename: 'ggml-tiny.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  },
  base: {
    filename: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  },
  small: {
    filename: 'ggml-small.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  },
  medium: {
    filename: 'ggml-medium.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  },
};
const BUNDLED_WHISPER_RUNTIME_ZIP = 'whisper-bin-x64-v1.8.4.zip';
const LOCAL_SUMMARY_MODELS = {
  'gemma-4-e2b-it-q4': {
    id: 'gemma-4-e2b-it-q4',
    label: 'Gemma 4 E2B-it Q4',
    filename: 'gemma-4-e2b-it-edited-q4_0.gguf',
    url: 'https://huggingface.co/gguf-org/gemma-4-e2b-it-gguf/resolve/main/gemma-4-e2b-it-edited-q4_0.gguf',
    minimumBytes: 2.5 * 1024 * 1024 * 1024,
  },
  'qwen3-4b-q4-k-m': {
    id: 'qwen3-4b-q4-k-m',
    label: 'Qwen3 4B Q4_K_M',
    filename: 'Qwen3-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
    minimumBytes: 2.2 * 1024 * 1024 * 1024,
  },
};
const BUNDLED_LLAMA_RUNTIME_ZIP = 'llama-b8833-bin-win-cpu-x64.zip';

function getLocalTranscriptionDirs() {
  const root = path.join(app.getPath('userData'), 'local-transcription');
  return {
    root,
    binDir: path.join(root, 'bin'),
    modelsDir: path.join(root, 'models'),
    tmpDir: path.join(root, 'tmp'),
  };
}

function ensureLocalTranscriptionDirs() {
  const dirs = getLocalTranscriptionDirs();
  fs.mkdirSync(dirs.binDir, { recursive: true });
  fs.mkdirSync(dirs.modelsDir, { recursive: true });
  fs.mkdirSync(dirs.tmpDir, { recursive: true });
  return dirs;
}

function getBundledLocalTranscriptionDirs() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'local-transcription') : '',
    path.join(__dirname, '..', 'local-transcription'),
    path.join(__dirname, 'local-transcription'),
  ].filter(Boolean);

  for (const root of candidates) {
    if (fs.existsSync(root)) {
      return {
        root,
        binDir: path.join(root, 'bin'),
        modelsDir: path.join(root, 'models'),
        cacheDir: path.join(root, '.cache'),
      };
    }
  }

  return {
    root: candidates[0] || path.join(__dirname, '..', 'local-transcription'),
    binDir: path.join(candidates[0] || path.join(__dirname, '..', 'local-transcription'), 'bin'),
    modelsDir: path.join(candidates[0] || path.join(__dirname, '..', 'local-transcription'), 'models'),
    cacheDir: path.join(candidates[0] || path.join(__dirname, '..', 'local-transcription'), '.cache'),
  };
}

function findWhisperBinaryInDir(binDir) {
  const candidates = process.platform === 'win32'
    ? ['whisper-cli.exe', 'main.exe', 'whisper.exe']
    : ['whisper-cli', 'main', 'whisper'];
  for (const name of candidates) {
    const file = path.join(binDir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function getWhisperBinaryPath() {
  const bundled = getBundledLocalTranscriptionDirs();
  const bundledBinary = findWhisperBinaryInDir(bundled.binDir);
  if (bundledBinary) return bundledBinary;

  const installedBundledBinary = ensureBundledWhisperRuntimeInstalled();
  if (installedBundledBinary) return installedBundledBinary;

  const dirs = ensureLocalTranscriptionDirs();
  return findWhisperBinaryInDir(dirs.binDir);
}

function getBundledWhisperRuntimeArchivePath() {
  const bundled = getBundledLocalTranscriptionDirs();
  const archivePath = path.join(bundled.cacheDir, BUNDLED_WHISPER_RUNTIME_ZIP);
  return fs.existsSync(archivePath) ? archivePath : null;
}

function ensureBundledWhisperRuntimeInstalled() {
  const dirs = ensureLocalTranscriptionDirs();
  const existing = findWhisperBinaryInDir(dirs.binDir);
  if (existing) return existing;

  const archivePath = getBundledWhisperRuntimeArchivePath();
  if (!archivePath) return null;

  const extractDir = path.join(dirs.tmpDir, `whisper-runtime-${Date.now()}`);
  try {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
    ], { windowsHide: true });

    const executable = findFileRecursive(extractDir, (file) => {
      const name = path.basename(file).toLowerCase();
      return ['whisper-cli.exe', 'main.exe', 'whisper.exe'].includes(name);
    });
    if (!executable) return null;

    const targetExe = path.join(dirs.binDir, 'whisper-cli.exe');
    fs.copyFileSync(executable, targetExe);
    for (const dll of findFilesRecursive(extractDir, (file) => file.toLowerCase().endsWith('.dll'))) {
      fs.copyFileSync(dll, path.join(dirs.binDir, path.basename(dll)));
    }
    return targetExe;
  } catch (e) {
    console.error('Failed to install bundled whisper.cpp runtime:', e);
    return null;
  } finally {
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
  }
}

function findFileRecursive(dir, predicate) {
  return findFilesRecursive(dir, predicate)[0] || null;
}

function findFilesRecursive(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findFilesRecursive(fullPath, predicate));
    else if (predicate(fullPath)) found.push(fullPath);
  }
  return found;
}

function getLocalModelInfo(modelSize) {
  const size = LOCAL_TRANSCRIPTION_MODELS[modelSize] ? modelSize : 'base';
  const model = LOCAL_TRANSCRIPTION_MODELS[size];
  const dirs = ensureLocalTranscriptionDirs();
  const bundled = getBundledLocalTranscriptionDirs();
  const bundledModelPath = path.join(bundled.modelsDir, model.filename);
  const userModelPath = path.join(dirs.modelsDir, model.filename);
  const bundledStat = fs.existsSync(bundledModelPath) ? fs.statSync(bundledModelPath) : null;
  const userStat = fs.existsSync(userModelPath) ? fs.statSync(userModelPath) : null;
  const bundledAvailable = !!bundledStat && bundledStat.size > 1024 * 1024;
  const userAvailable = !!userStat && userStat.size > 1024 * 1024;
  const modelPath = bundledAvailable ? bundledModelPath : userModelPath;
  const activeStat = bundledAvailable ? bundledStat : userStat;
  return {
    size,
    ...model,
    modelPath,
    userModelPath,
    bundledModelPath,
    modelAvailable: bundledAvailable || userAvailable,
    modelBundled: bundledAvailable,
    modelInstalledInUserData: userAvailable,
    modelSizeBytes: activeStat?.size || 0,
    bundledRoot: bundled.root,
    bundledBinDir: bundled.binDir,
    bundledModelsDir: bundled.modelsDir,
    bundledRuntimeArchivePath: getBundledWhisperRuntimeArchivePath(),
    ...dirs,
  };
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects while downloading model.'));
      return;
    }

    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destination, redirects + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const tmp = `${destination}.download`;
      const out = fs.createWriteStream(tmp);
      response.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          try { if (fs.existsSync(destination)) fs.unlinkSync(destination); } catch {}
          fs.renameSync(tmp, destination);
          resolve();
        });
      });
      out.on('error', (err) => {
        try { fs.unlinkSync(tmp); } catch {}
        reject(err);
      });
    });

    request.on('error', reject);
    request.setTimeout(120000, () => {
      request.destroy(new Error('Model download timed out.'));
    });
  });
}

function getLocalSummaryDirs() {
  const root = path.join(app.getPath('userData'), 'local-summary');
  return {
    root,
    binDir: path.join(root, 'bin'),
    modelsDir: path.join(root, 'models'),
    tmpDir: path.join(root, 'tmp'),
  };
}

function ensureLocalSummaryDirs() {
  const dirs = getLocalSummaryDirs();
  fs.mkdirSync(dirs.binDir, { recursive: true });
  fs.mkdirSync(dirs.modelsDir, { recursive: true });
  fs.mkdirSync(dirs.tmpDir, { recursive: true });
  return dirs;
}

function getBundledLocalSummaryDirs() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'local-summary') : '',
    path.join(__dirname, '..', 'local-summary'),
    path.join(__dirname, 'local-summary'),
  ].filter(Boolean);

  for (const root of candidates) {
    if (fs.existsSync(root)) {
      return {
        root,
        cacheDir: path.join(root, '.cache'),
      };
    }
  }

  const root = candidates[0] || path.join(__dirname, '..', 'local-summary');
  return {
    root,
    cacheDir: path.join(root, '.cache'),
  };
}

function findLlamaBinaryInDir(binDir) {
  const candidates = process.platform === 'win32'
    ? ['llama-cli.exe', 'llama-server.exe', 'main.exe']
    : ['llama-cli', 'llama-server', 'main'];
  for (const name of candidates) {
    const file = path.join(binDir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function findLlamaServerBinaryInDir(binDir) {
  const candidates = process.platform === 'win32'
    ? ['llama-server.exe', 'server.exe']
    : ['llama-server', 'server'];
  for (const name of candidates) {
    const file = path.join(binDir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function getBundledLlamaRuntimeArchivePath() {
  const bundled = getBundledLocalSummaryDirs();
  const archivePath = path.join(bundled.cacheDir, BUNDLED_LLAMA_RUNTIME_ZIP);
  return fs.existsSync(archivePath) ? archivePath : null;
}

function ensureBundledLlamaRuntimeInstalled() {
  const dirs = ensureLocalSummaryDirs();
  const existing = findLlamaBinaryInDir(dirs.binDir);
  if (existing) return existing;

  const archivePath = getBundledLlamaRuntimeArchivePath();
  if (!archivePath) return null;

  const extractDir = path.join(dirs.tmpDir, `llama-runtime-${Date.now()}`);
  try {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
    ], { windowsHide: true });

    const executable = findFileRecursive(extractDir, (file) => {
      const name = path.basename(file).toLowerCase();
      return ['llama-cli.exe', 'main.exe'].includes(name);
    });
    const serverExecutable = findFileRecursive(extractDir, (file) => {
      const name = path.basename(file).toLowerCase();
      return ['llama-server.exe', 'server.exe'].includes(name);
    });
    if (!executable) return null;

    const targetExe = path.join(dirs.binDir, 'llama-cli.exe');
    fs.copyFileSync(executable, targetExe);
    if (serverExecutable) {
      fs.copyFileSync(serverExecutable, path.join(dirs.binDir, 'llama-server.exe'));
    }
    for (const dll of findFilesRecursive(extractDir, (file) => file.toLowerCase().endsWith('.dll'))) {
      fs.copyFileSync(dll, path.join(dirs.binDir, path.basename(dll)));
    }
    return targetExe;
  } catch (e) {
    console.error('Failed to install bundled llama.cpp runtime:', e);
    return null;
  } finally {
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
  }
}

function getLlamaBinaryPath() {
  const installedBundledBinary = ensureBundledLlamaRuntimeInstalled();
  if (installedBundledBinary) return installedBundledBinary;
  const dirs = ensureLocalSummaryDirs();
  return findLlamaBinaryInDir(dirs.binDir);
}

function getLlamaServerBinaryPath() {
  ensureBundledLlamaRuntimeInstalled();
  const dirs = ensureLocalSummaryDirs();
  return findLlamaServerBinaryInDir(dirs.binDir);
}

function getLocalSummaryModelInfo(modelId) {
  const id = LOCAL_SUMMARY_MODELS[modelId] ? modelId : 'gemma-4-e2b-it-q4';
  const model = LOCAL_SUMMARY_MODELS[id];
  const dirs = ensureLocalSummaryDirs();
  const modelPath = path.join(dirs.modelsDir, model.filename);
  const stat = fs.existsSync(modelPath) ? fs.statSync(modelPath) : null;
  const modelAvailable = !!stat && stat.size >= model.minimumBytes;
  return {
    ...dirs,
    ...model,
    modelPath,
    modelAvailable,
    modelSizeBytes: stat?.size || 0,
    bundledRoot: getBundledLocalSummaryDirs().root,
    bundledRuntimeArchivePath: getBundledLlamaRuntimeArchivePath(),
  };
}

function splitTranscriptForLocalSummary(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (clean.length <= 9000) return [clean];
  const chunks = [];
  const paragraphs = clean.split(/\n{2,}/);
  let current = '';
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > 9000 && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  const normalized = [];
  for (const chunk of chunks) {
    if (chunk.length <= 11000) {
      normalized.push(chunk);
      continue;
    }
    for (let i = 0; i < chunk.length; i += 9000) {
      normalized.push(chunk.slice(i, i + 9000));
    }
  }
  return normalized;
}

function buildLocalSummaryPrompt(text, customInstructions, phase, modelId = '') {
  const noThink = String(modelId).startsWith('qwen3') ? '\nRespond in non-thinking mode. Do not include <think> blocks.\n' : '';
  const instruction = customInstructions ? `\nExtra instructions: ${customInstructions}\n` : '';
  if (phase === 'merge') {
    return `You are an expert meeting-notes assistant. Merge these partial meeting summaries into one concise, structured final summary with useful headings, decisions, risks, owners, and next steps where available.${noThink}${instruction}\nPartial summaries:\n\n${text}\n\nFinal summary:`;
  }
  return `You are an expert meeting-notes assistant. Summarize this meeting transcript clearly using relevant headings and bullet points. Keep sensitive details accurate, do not invent facts, and preserve decisions, action items, risks, dates, names, and open questions.${noThink}${instruction}\nTranscript:\n\n${text}\n\nSummary:`;
}

function runLlamaPrompt(binaryPath, modelPath, prompt, options = {}) {
  const temperature = Number.isFinite(options.temperature) ? String(options.temperature) : '0.3';
  const predict = String(Math.max(32, Math.min(2048, Number(options.maxTokens) || 700)));
  const contextSize = String(Math.max(512, Math.min(8192, Number(options.contextSize) || 4096)));
  const threads = String(Math.max(1, Math.min(require('os').cpus().length - 1, 8)));
  const args = [
    '-m', modelPath,
    '-p', prompt,
    '-n', predict,
    '--temp', temperature,
    '-c', contextSize,
    '-t', threads,
    '--no-display-prompt',
  ];

  return new Promise((resolve) => {
    execFile(binaryPath, args, {
      timeout: Number(options.timeoutMs) || 20 * 60 * 1000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

const runLlamaSummary = runLlamaPrompt;

function buildLocalAssistantPrompt(question, messages = [], context = '', modelId = '') {
  const recent = Array.isArray(messages) ? messages.slice(-8) : [];
  const isQwen = String(modelId).startsWith('qwen3');
  const history = recent
    .map((message) => {
      const role = message?.role === 'assistant' ? 'Assistant' : 'User';
      return `${role}: ${String(message?.content || '').slice(0, 4000)}`;
    })
    .join('\n\n');
  return [
    'You are a helpful local AI assistant running fully offline inside Combobulator.',
    isQwen ? 'Respond in non-thinking mode. Do not include <think> blocks or hidden reasoning.' : '',
    context
      ? 'Answer using the local app search context first. Cite source numbers like [1] when using a source. If the context does not contain the answer, say what is missing and then answer from general knowledge only if useful.'
      : 'Answer clearly and practically. If you are unsure, say so. Do not claim to have accessed cloud services or external files.',
    context ? `Local app search context:\n\n${context}` : '',
    history ? `Conversation so far:\n\n${history}` : '',
    `User: ${String(question || '').trim()}${isQwen ? ' /no_think' : ''}`,
    'Assistant:',
  ].filter(Boolean).join('\n\n');
}

let localAiServer = null;
let localAiServerModelId = null;
let localAiServerPort = 0;
let localAiServerStartedAt = 0;
let localAiServerReady = false;
let localAiServerStarting = null;

function getLocalAiServerStatus(modelId = 'gemma-4-e2b-it-q4') {
  const info = getLocalSummaryModelInfo(modelId);
  const serverBinaryPath = getLlamaServerBinaryPath();
  return {
    ok: true,
    modelId: info.id,
    modelLabel: info.label,
    modelAvailable: info.modelAvailable,
    serverBinaryAvailable: !!serverBinaryPath,
    serverBinaryPath,
    running: !!localAiServer && !localAiServer.killed,
    ready: localAiServerReady,
    starting: !!localAiServerStarting,
    port: localAiServerPort,
    startedAt: localAiServerStartedAt,
  };
}

function fetchJson(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const req = require(parsed.protocol === 'https:' ? 'https' : 'http').request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Local AI server returned HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve({ content: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('Local AI server request timed out.')));
    req.write(payload);
    req.end();
  });
}

function waitForLocalAiServerReady(port, timeoutMs, sender, requestId) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      fetchJson(`http://127.0.0.1:${port}/completion`, {
        prompt: 'Say OK.',
        n_predict: 1,
        temperature: 0,
      }).then(() => {
        localAiServerReady = true;
        try { sender?.send('summary:progress', { requestId, stage: 'ready', message: 'Local AI server is ready.', timestamp: Date.now() }); } catch {}
        resolve(true);
      }).catch((error) => {
        if (Date.now() - started > timeoutMs) {
          reject(error);
          return;
        }
        setTimeout(ping, 1000);
      });
    };
    ping();
  });
}

async function ensureLocalAiServer(modelId = 'gemma-4-e2b-it-q4', sender, requestId) {
  if (localAiServer && !localAiServer.killed && localAiServerReady && localAiServerModelId === modelId) {
    return getLocalAiServerStatus(modelId);
  }
  if (localAiServerStarting) {
    await localAiServerStarting;
    return getLocalAiServerStatus(modelId);
  }

  const info = getLocalSummaryModelInfo(modelId);
  const serverBinaryPath = getLlamaServerBinaryPath();
  if (!serverBinaryPath) throw new Error('llama-server.exe is missing from the local AI runtime.');
  if (!info.modelAvailable) throw new Error(`Local AI model "${info.label}" is missing. Install it in Settings -> AI & Summarization.`);

  stopLocalAiServer();
  localAiServerStarting = (async () => {
    const port = 39177 + Math.floor(Math.random() * 500);
    localAiServerPort = port;
    localAiServerModelId = info.id;
    localAiServerReady = false;
    localAiServerStartedAt = Date.now();
    try { sender?.send('summary:progress', { requestId, stage: 'server-loading', message: 'Loading Gemma into the background local AI server...', timestamp: Date.now() }); } catch {}

    const threads = String(Math.max(1, Math.min(require('os').cpus().length - 1, 8)));
    localAiServer = require('child_process').spawn(serverBinaryPath, [
      '-m', info.modelPath,
      '--host', '127.0.0.1',
      '--port', String(port),
      '-c', '4096',
      '-t', threads,
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    localAiServer.stdout.on('data', (data) => _dbgWrite({ type: 'localAiServer:stdout', message: String(data).slice(0, 1000), timestamp: Date.now() }));
    localAiServer.stderr.on('data', (data) => _dbgWrite({ type: 'localAiServer:stderr', message: String(data).slice(0, 1000), timestamp: Date.now() }));
    localAiServer.on('exit', () => {
      localAiServer = null;
      localAiServerReady = false;
      localAiServerStarting = null;
      localAiServerPort = 0;
    });

    await waitForLocalAiServerReady(port, 180000, sender, requestId);
  })();

  try {
    await localAiServerStarting;
  } finally {
    localAiServerStarting = null;
  }
  return getLocalAiServerStatus(modelId);
}

function stopLocalAiServer() {
  if (localAiServer && !localAiServer.killed) {
    try { localAiServer.kill(); } catch {}
  }
  localAiServer = null;
  localAiServerReady = false;
  localAiServerStarting = null;
  localAiServerPort = 0;
}

async function askLocalAiServer(prompt, options = {}) {
  const data = await fetchJson(`http://127.0.0.1:${localAiServerPort}/completion`, {
    prompt,
    n_predict: Math.max(32, Math.min(2048, Number(options.maxTokens) || 700)),
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.7,
    stop: ['User:', '</s>'],
    stream: false,
  });
  return String(data.content || data.response || '').trim();
}

// Register custom protocol for serving local images
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-image', privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

ipcMain.handle('store:read', () => {
  const result = inspectStorage();
  if (result.status === 'ok') {
    setStorageSession('ok', true);
  } else if (result.status === 'missing') {
    setStorageSession('missing', true, result.message);
  } else {
    setStorageSession(result.status, false, result.message);
    console.error('Blocked storage read:', result.message);
  }
  return result;
});

ipcMain.handle('store:write', (_event, data) => {
  try {
    const storage = inspectStorage();
    if (storage.status === 'unreachable') {
      throw new Error(storage.message);
    }
    if (storage.status === 'error') {
      throw new Error(storage.message);
    }
    if (!storageSession.writeAllowed) {
      throw new Error(storageSession.reason || 'Storage is locked because the current data file has not been safely opened.');
    }

    const dir = path.dirname(storage.dataFile);
    if (!fs.existsSync(dir)) {
      throw new Error('Data directory is unavailable.');
    }

    if (storage.status === 'ok') {
      makeBackupIfNeeded(storage.dataFile);
    }

    fs.writeFileSync(storage.dataFile, data, 'utf-8');
    setStorageSession('ok', true);
    return { ok: true };
  } catch (e) {
    console.error('Failed to write data file:', e);
    setStorageSession('error', false, e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('store:path', () => updateStoragePaths().dataFile);

ipcMain.handle('store:openFolder', () => shell.openPath(updateStoragePaths().dataDir));

ipcMain.handle('store:getDataDir', () => {
  const result = inspectStorage();
  return {
    dir: result.dataDir,
    isCustom: result.isCustom,
    status: result.status,
    message: result.message,
    path: result.dataFile,
  };
});

ipcMain.handle('store:changeDataDir', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose data folder',
    defaultPath: path.dirname(DATA_FILE),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { changed: false };

  const newDir = result.filePaths[0];
  const oldDataFile = DATA_FILE;
  const oldImagesDir = IMAGES_DIR;
  const newDataFile = path.join(newDir, 'Combobulator-data.json');
  const newImagesDir = path.join(newDir, 'images');

  // Copy existing data file if present and new location doesn't already have one
  try {
    if (fs.existsSync(oldDataFile) && !fs.existsSync(newDataFile)) {
      fs.copyFileSync(oldDataFile, newDataFile);
    }
  } catch (e) {
    console.error('Failed to copy data file:', e);
    return { changed: false, error: 'Could not copy data file to new location.' };
  }

  // Copy images directory contents if present
  try {
    if (fs.existsSync(oldImagesDir)) {
      if (!fs.existsSync(newImagesDir)) fs.mkdirSync(newImagesDir, { recursive: true });
      const files = fs.readdirSync(oldImagesDir);
      for (const file of files) {
        const dest = path.join(newImagesDir, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(oldImagesDir, file), dest);
        }
      }
    }
  } catch (e) {
    console.error('Failed to copy images:', e);
    // Non-fatal — data file already copied, continue
  }

  // Persist the choice
  const cfg = loadAppConfig();
  cfg.customDataDir = newDir;
  saveAppConfig(cfg);

  // Relaunch so all paths are re-resolved from the new location
  app.relaunch();
  app.exit(0);
  return { changed: true };
});

ipcMain.handle('store:resetDataDir', async () => {
  const cfg = loadAppConfig();
  delete cfg.customDataDir;
  saveAppConfig(cfg);
  app.relaunch();
  app.exit(0);
  return { changed: true };
});

ipcMain.handle('updater:check', () =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Update check timed out')); }, 30_000);

    const onAvailable    = (info) => { cleanup(); resolve({ status: 'available', version: info.version }); };
    const onNotAvailable = ()     => { cleanup(); resolve({ status: 'up-to-date' }); };
    const onError        = (err)  => { cleanup(); reject(err); };

    const cleanup = () => {
      clearTimeout(timer);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
    };

    autoUpdater.once('update-available', onAvailable);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.once('error', onError);
    autoUpdater.checkForUpdates().catch((err) => { cleanup(); reject(err); });
  })
);
ipcMain.handle('updater:install', () => { autoUpdater.quitAndInstall(); });

ipcMain.handle('transcription:localStatus', (_event, modelSize = 'base') => {
  const info = getLocalModelInfo(modelSize);
  const binaryPath = getWhisperBinaryPath();
  return {
    ok: true,
    provider: 'whisper.cpp',
    modelSize: info.size,
    modelAvailable: info.modelAvailable,
    modelBundled: info.modelBundled,
    modelInstalledInUserData: info.modelInstalledInUserData,
    modelSizeBytes: info.modelSizeBytes,
    modelPath: info.modelPath,
    userModelPath: info.userModelPath,
    bundledModelPath: info.bundledModelPath,
    modelsDir: info.modelsDir,
    binDir: info.binDir,
    bundledRoot: info.bundledRoot,
    bundledBinDir: info.bundledBinDir,
    bundledModelsDir: info.bundledModelsDir,
    bundledRuntimeArchivePath: info.bundledRuntimeArchivePath,
    bundledRuntimeAvailable: !!info.bundledRuntimeArchivePath || fs.existsSync(info.bundledBinDir),
    binaryAvailable: !!binaryPath,
    binaryBundled: !!binaryPath && (
      binaryPath.startsWith(info.bundledBinDir) ||
      (!!info.bundledRuntimeArchivePath && binaryPath.startsWith(info.binDir))
    ),
    binaryPath,
  };
});

ipcMain.handle('transcription:downloadModel', async (_event, modelSize = 'base') => {
  try {
    const info = getLocalModelInfo(modelSize);
    if (info.modelBundled) {
      return {
        ok: true,
        modelPath: info.modelPath,
        modelSizeBytes: info.modelSizeBytes,
        bundled: true,
      };
    }
    await downloadFile(info.url, info.userModelPath);
    const stat = fs.statSync(info.userModelPath);
    return { ok: true, modelPath: info.userModelPath, modelSizeBytes: stat.size, bundled: false };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('transcription:localTranscribe', async (_event, buffer, mimeType, modelSize = 'base') => {
  const binaryPath = getWhisperBinaryPath();
  const info = getLocalModelInfo(modelSize);
  if (!binaryPath) {
    return {
      ok: false,
      error: 'Bundled whisper.cpp runtime is missing. Rebuild the app with local transcription resources.',
    };
  }
  if (!info.modelAvailable) {
    return {
      ok: false,
      error: `Local Whisper model "${info.size}" is missing. Download it in Settings -> Recording.`,
    };
  }
  if (mimeType !== 'audio/wav') {
    return { ok: false, error: 'Local transcription expects decoded WAV audio.' };
  }

  const dirs = ensureLocalTranscriptionDirs();
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const audioPath = path.join(dirs.tmpDir, `chunk-${sessionId}.wav`);
  const outputBase = path.join(dirs.tmpDir, `chunk-${sessionId}`);
  const outputTxt = `${outputBase}.txt`;

  try {
    fs.writeFileSync(audioPath, Buffer.from(buffer));

    const args = [
      '-m', info.modelPath,
      '-f', audioPath,
      '-otxt',
      '-of', outputBase,
      '--no-prints',
    ];

    const result = await new Promise((resolve) => {
      execFile(binaryPath, args, { timeout: 10 * 60 * 1000, windowsHide: true }, (error, stdout, stderr) => {
        resolve({ error, stdout, stderr });
      });
    });

    if (result.error) {
      const details = String(result.stderr || result.error.message || result.error);
      const lower = details.toLowerCase();
      const friendly = lower.includes('bad allocation') || lower.includes('out of memory')
        ? 'Local transcription ran out of memory. Try a smaller Whisper model.'
        : details.slice(0, 600);
      return { ok: false, error: friendly };
    }

    const text = fs.existsSync(outputTxt)
      ? fs.readFileSync(outputTxt, 'utf-8')
      : String(result.stdout || '');
    return { ok: true, text: text.trim() };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    for (const file of [audioPath, outputTxt]) {
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    }
  }
});

ipcMain.handle('summary:localStatus', (_event, modelId = 'gemma-4-e2b-it-q4') => {
  const info = getLocalSummaryModelInfo(modelId);
  const binaryPath = getLlamaBinaryPath();
  const totalMemory = require('os').totalmem();
  const lowMemory = totalMemory < 8 * 1024 * 1024 * 1024;
  return {
    ok: true,
    provider: 'llama.cpp',
    modelId: info.id,
    modelLabel: info.label,
    modelAvailable: info.modelAvailable,
    modelSizeBytes: info.modelSizeBytes,
    modelPath: info.modelPath,
    modelsDir: info.modelsDir,
    binDir: info.binDir,
    bundledRoot: info.bundledRoot,
    bundledRuntimeArchivePath: info.bundledRuntimeArchivePath,
    bundledRuntimeAvailable: !!info.bundledRuntimeArchivePath,
    binaryAvailable: !!binaryPath,
    serverBinaryAvailable: !!getLlamaServerBinaryPath(),
    serverStatus: getLocalAiServerStatus(info.id),
    binaryBundled: !!binaryPath && binaryPath.startsWith(info.binDir) && !!info.bundledRuntimeArchivePath,
    binaryPath,
    totalMemoryBytes: totalMemory,
    lowMemory,
  };
});

ipcMain.handle('summary:downloadModel', async (_event, modelId = 'gemma-4-e2b-it-q4') => {
  try {
    const info = getLocalSummaryModelInfo(modelId);
    await downloadFile(info.url, info.modelPath);
    const stat = fs.statSync(info.modelPath);
    const ok = stat.size >= info.minimumBytes;
    return {
      ok,
      modelPath: info.modelPath,
      modelSizeBytes: stat.size,
      error: ok ? undefined : 'Downloaded model is smaller than expected. Try installing it again.',
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('summary:deleteModel', async (_event, modelId = 'gemma-4-e2b-it-q4') => {
  try {
    const info = getLocalSummaryModelInfo(modelId);
    if (localAiServerModelId === info.id) {
      stopLocalAiServer();
    }
    if (!fs.existsSync(info.modelPath)) {
      return {
        ok: true,
        deleted: false,
        modelId: info.id,
        modelPath: info.modelPath,
      };
    }
    fs.unlinkSync(info.modelPath);
    return {
      ok: true,
      deleted: true,
      modelId: info.id,
      modelPath: info.modelPath,
    };
  } catch (e) {
    return { ok: false, deleted: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('summary:localSummarize', async (_event, rawText, modelId = 'gemma-4-e2b-it-q4', options = {}) => {
  const binaryPath = getLlamaBinaryPath();
  const info = getLocalSummaryModelInfo(modelId);
  if (!binaryPath) {
    return {
      ok: false,
      error: 'Bundled llama.cpp runtime is missing. Rebuild the app with local summary resources.',
      code: 'runtime_missing',
    };
  }
  if (!info.modelAvailable) {
    return {
      ok: false,
      error: `Local summary model "${info.label}" is missing. Install it in Settings -> AI & Summarization.`,
      code: 'model_missing',
    };
  }
  if (require('os').totalmem() < 8 * 1024 * 1024 * 1024) {
    return {
      ok: false,
      error: 'This machine may not have enough RAM for the local summary model. Try closing other apps or use cloud summary.',
      code: 'insufficient_memory',
    };
  }

  try {
    const chunks = splitTranscriptForLocalSummary(rawText);
    const partials = [];
    for (const chunk of chunks) {
      const prompt = buildLocalSummaryPrompt(chunk, options.customInstructions || '', 'chunk', info.id);
      const result = await runLlamaSummary(binaryPath, info.modelPath, prompt, options);
      if (result.error) {
        const details = String(result.stderr || result.error.message || result.error);
        const lower = details.toLowerCase();
        const friendly = lower.includes('bad allocation') || lower.includes('out of memory') || lower.includes('memory')
          ? 'Local summary ran out of memory. Close other apps, then try again.'
          : details.slice(0, 800);
        return { ok: false, error: friendly };
      }
      partials.push(String(result.stdout || '').trim());
    }

    if (partials.length === 1) {
      return { ok: true, summary: partials[0], modelId: info.id };
    }

    const mergePrompt = buildLocalSummaryPrompt(partials.join('\n\n---\n\n'), options.customInstructions || '', 'merge', info.id);
    const finalResult = await runLlamaSummary(binaryPath, info.modelPath, mergePrompt, {
      ...options,
      maxTokens: Math.max(Number(options.maxTokens) || 900, 1200),
    });
    if (finalResult.error) {
      const details = String(finalResult.stderr || finalResult.error.message || finalResult.error);
      return { ok: false, error: details.slice(0, 800) };
    }
    return { ok: true, summary: String(finalResult.stdout || '').trim(), modelId: info.id };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('summary:localAsk', async (_event, question, modelId = 'gemma-4-e2b-it-q4', options = {}) => {
  const requestId = options.requestId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const progress = (stage, message, extra = {}) => {
    try {
      _event.sender.send('summary:progress', {
        requestId,
        stage,
        message,
        timestamp: Date.now(),
        ...extra,
      });
    } catch {}
  };

  progress('checking', 'Checking local runtime and model...');
  const binaryPath = getLlamaBinaryPath();
  const info = getLocalSummaryModelInfo(modelId);
  if (!binaryPath) {
    return {
      ok: false,
      error: 'Bundled llama.cpp runtime is missing. Rebuild the app with local summary resources.',
      code: 'runtime_missing',
    };
  }
  if (!info.modelAvailable) {
    return {
      ok: false,
      error: `Local AI model "${info.label}" is missing. Install it in Settings -> AI & Summarization.`,
      code: 'model_missing',
    };
  }
  if (require('os').totalmem() < 8 * 1024 * 1024 * 1024) {
    return {
      ok: false,
      error: 'This machine may not have enough RAM for the local AI model. Close other apps, then try again.',
      code: 'insufficient_memory',
    };
  }

  try {
    const prompt = buildLocalAssistantPrompt(question, options.messages, options.context || '', modelId);
    const hasContext = !!String(options.context || '').trim();
    const serverBinaryPath = getLlamaServerBinaryPath();
    if (serverBinaryPath) {
      progress('server-loading', 'Starting or reusing the background local AI server...');
      await ensureLocalAiServer(modelId, _event.sender, requestId);
      progress('generating', 'Generating answer with warm local AI server...');
      const answer = await askLocalAiServer(prompt, {
        temperature: Number.isFinite(options.temperature) ? options.temperature : 0.7,
        maxTokens: Number(options.maxTokens) || 900,
      });
      progress('done', 'Local answer ready.');
      return { ok: true, answer, modelId: info.id, server: true };
    }

    progress('loading', 'Starting Gemma. First token may take a while while the model loads into RAM.', {
      binaryPath,
      modelPath: info.modelPath,
    });
    const result = await runLlamaPrompt(binaryPath, info.modelPath, prompt, {
      temperature: Number.isFinite(options.temperature) ? options.temperature : 0.7,
      maxTokens: Number(options.maxTokens) || 900,
      contextSize: hasContext ? 4096 : 2048,
      timeoutMs: Number(options.timeoutMs) || 120000,
    });
    progress('finalizing', 'Finishing local answer...');
    if (result.error) {
      const details = String(result.stderr || result.error.message || result.error);
      const lower = details.toLowerCase();
      const friendly = lower.includes('timed out')
        ? 'Local AI timed out before producing an answer. The model may be too slow on this machine, or llama.cpp may be stuck loading it.'
        : lower.includes('bad allocation') || lower.includes('out of memory') || lower.includes('memory')
        ? 'Local AI ran out of memory. Close other apps, then try again.'
        : details.slice(0, 800);
      return { ok: false, error: friendly };
    }
    progress('done', 'Local answer ready.');
    return {
      ok: true,
      answer: String(result.stdout || '').trim(),
      modelId: info.id,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('summary:serverStatus', (_event, modelId = 'gemma-4-e2b-it-q4') => {
  return getLocalAiServerStatus(modelId);
});

ipcMain.handle('summary:startServer', async (event, modelId = 'gemma-4-e2b-it-q4') => {
  const requestId = `warm-${Date.now()}`;
  try {
    const status = await ensureLocalAiServer(modelId, event.sender, requestId);
    return { ok: true, ...status };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), ...getLocalAiServerStatus(modelId) };
  }
});

ipcMain.handle('summary:stopServer', () => {
  stopLocalAiServer();
  return { ok: true };
});

// Return screen source IDs so the renderer can capture system audio
ipcMain.handle('desktop:getSources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch (e) {
    console.error('Failed to get desktop sources:', e);
    return [];
  }
});

// Save an image buffer to the images folder, return the filename
ipcMain.handle('image:save', (_event, buffer, ext) => {
  try {
    const storage = inspectStorage();
    if (storage.status === 'unreachable' || storage.status === 'error') {
      throw new Error(storage.message || 'Image storage is unavailable.');
    }
    const imagesDir = ensureImagesDirAvailable();
    const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || 'png'}`;
    const filepath = path.join(imagesDir, filename);
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return filename;
  } catch (e) {
    console.error('Failed to save image:', e);
    return null;
  }
});

// Delete an image file from the images folder
ipcMain.handle('image:delete', (_event, filename) => {
  try {
    const filepath = path.join(updateStoragePaths().imagesDir, filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (e) {
    console.error('Failed to delete image:', e);
  }
});

// Show native file picker and return selected file paths
ipcMain.handle('dialog:openFiles', async (_event) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win || BrowserWindow.getAllWindows()[0], {
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

// Open a referenced attachment from its original location
ipcMain.handle('attachment:open', (_event, filePath) => {
  return shell.openPath(filePath);
});

// Open URL in system default app (e.g. mailto: → Outlook)
ipcMain.handle('shell:openExternal', (_event, url) => {
  return shell.openExternal(url);
});

// Create a new Outlook email with HTML body via a temporary .eml file.
// Opening the file via shell.openExternal uses the default mail client
// (correct Outlook version), and X-Unsent: 1 opens it in compose mode.
ipcMain.handle('mail:openOutlook', async (_event, subject, htmlBody) => {
  try {
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), `outlook-draft-${Date.now()}.eml`);
    const eml = [
      'MIME-Version: 1.0',
      'X-Unsent: 1',
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody,
    ].join('\r\n');
    fs.writeFileSync(tmpFile, eml, 'utf-8');
    await shell.openExternal(tmpFile);
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 15000);
    return true;
  } catch (e) {
    console.error('Failed to open Outlook draft:', e);
    return false;
  }
});

// ── Teams overlay window ───────────────────────────────────────────────────────
let overlayWindow = null;

function showOverlay(mainWindow) {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const overlayWidth = 500;
  const overlayHeight = 190;

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: Math.round((screenWidth - overlayWidth) / 2),
    y: -20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// Immediately hide the overlay (safe at any time — no DWM teardown triggered).
// Use this while Teams is still actively rendering (meeting in progress).
function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

// Destroy the overlay (only call when Teams is NOT actively rendering —
// i.e. at meeting end or app quit). Destroying a transparent/layered window
// while the NVIDIA DWM compositor is rendering Teams crashes the browser
// process in ntdll/gdi32. Hiding is always safe; destroying is not.
function destroyOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
}

// Keep closeOverlay as an alias for destroyOverlay for any call sites that
// are already at a safe moment (meeting end / app quit).
function closeOverlay() { destroyOverlay(); }

// #region agent log — track time of overlay click so we can correlate WS messages
let _overlayClickedAt = 0;
// #endregion

ipcMain.on('overlay:start-recording', (_event) => {
  // #region agent log
  _overlayClickedAt = Date.now();
  _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:overlay:start-recording',message:'overlay start-recording IPC received',data:{allWindowsCount:BrowserWindow.getAllWindows().length,overlayWindowExists:!!(overlayWindow&&!overlayWindow.isDestroyed())},timestamp:_overlayClickedAt,hypothesisId:'H-HIDE'});
  // #endregion
  const mainWindow = BrowserWindow.getAllWindows().find((w) => w !== overlayWindow);

  // Hide (not destroy) the overlay. Teams is still actively rendering video, so
  // destroying the transparent/layered HWND here would crash the main process via
  // DWM/NVIDIA (ntdll/gdi32). The actual destroy happens in destroyOverlay() when
  // the Teams meeting ends and Teams has stopped rendering.
  hideOverlay();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    // #region agent log
    _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:overlay:start-recording',message:'sending teams:meeting-joined to renderer',data:{mainWindowDestroyed:mainWindow.isDestroyed()},timestamp:Date.now(),hypothesisId:'H-HIDE'});
    // #endregion
    mainWindow.webContents.send('teams:meeting-joined');
  }
});

ipcMain.on('overlay:dismiss', () => {
  // Hide rather than destroy — Teams is still rendering.
  hideOverlay();
});

// ── Isolated audio-capture window ─────────────────────────────────────────────
// We run getUserMedia({ chromeMediaSource:'desktop' }) inside a separate hidden
// BrowserWindow so that a GPU-process crash (common when Teams is active) only
// kills the capture window, not the main app.

let captureWindow     = null;
let captureMainWindow = null; // main renderer that started the current capture

function createCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) return captureWindow;

  captureWindow = new BrowserWindow({
    width:       1,
    height:      1,
    show:        false,
    skipTaskbar: true,
    webPreferences: {
      preload:          path.join(__dirname, 'capture-preload.cjs'),
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  captureWindow.loadFile(path.join(__dirname, 'capture.html'));

  // If the GPU process inside the capture window crashes, notify the main renderer
  // but leave the main app running.
  captureWindow.webContents.on('render-process-gone', (_event, details) => {
    if (captureMainWindow && !captureMainWindow.isDestroyed()) {
      captureMainWindow.webContents.send(
        'capture:error',
        `Audio capture process stopped unexpectedly (${details.reason}). ` +
        'Try restarting the recording.',
      );
    }
    captureWindow = null;
  });

  captureWindow.on('closed', () => { captureWindow = null; });

  return captureWindow;
}

// Main renderer → start capture in the hidden window and wait for it to be ready.
ipcMain.handle('desktop:startCapture', async (event, sourceId) => {
  captureMainWindow = BrowserWindow.fromWebContents(event.sender);
  const win = createCaptureWindow();

  // Wait for the capture window's HTML + preload to finish loading.
  if (win.webContents.isLoading()) {
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  }

  // Ask the capture window to start, then wait for either success or failure.
  return new Promise((resolve, reject) => {
    const onReady = (_e, mimeType) => {
      ipcMain.removeListener('capture:error', onError);
      resolve(mimeType);
    };
    const onError = (_e, msg) => {
      ipcMain.removeListener('capture:ready', onReady);
      reject(new Error(msg));
    };
    ipcMain.once('capture:ready', onReady);
    ipcMain.once('capture:error', onError);
    win.webContents.send('capture:do-start', sourceId);
  });
});

// Main renderer → stop capture; resolves only after all final chunks are delivered.
ipcMain.handle('desktop:stopCapture', async () => {
  if (!captureWindow || captureWindow.isDestroyed()) return;

  return new Promise(resolve => {
    // Safety timeout so stop() never hangs if the capture window crashes mid-drain.
    const timer = setTimeout(() => {
      ipcMain.removeListener('capture:stopped', onStopped);
      resolve();
    }, 5000);

    const onStopped = () => {
      clearTimeout(timer);
      resolve();
    };
    ipcMain.once('capture:stopped', onStopped);
    captureWindow.webContents.send('capture:do-stop');
  });
});

ipcMain.handle('desktop:flushCapture', async () => {
  if (!captureWindow || captureWindow.isDestroyed()) return;

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      ipcMain.removeListener('capture:flushed', onFlushed);
      resolve();
    }, 5000);

    const onFlushed = () => {
      clearTimeout(timer);
      resolve();
    };
    ipcMain.once('capture:flushed', onFlushed);
    captureWindow.webContents.send('capture:do-flush');
  });
});

// Forward audio chunks from the capture window to the main renderer.
ipcMain.on('capture:chunk', (_event, buffer) => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:chunk', buffer);
  }
});

// Forward visualizer frequency levels from the capture window to the main renderer.
ipcMain.on('capture:levels', (_event, data) => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:levels', data);
  }
});

// Forward runtime errors from the capture window to the main renderer.
// (Start-phase errors are handled via ipcMain.once inside desktop:startCapture.)
ipcMain.on('capture:error', (_event, msg) => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:error', msg);
  }
});

// Capture window signals that all audio has been flushed; forward then destroy.
ipcMain.on('capture:stopped', () => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:stopped');
  }
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.close();
  }
});

// ── Teams Local WebSocket API integration ─────────────────────────────────────
const TEAMS_TOKEN_FILE = path.join(app.getPath('userData'), 'teams-token.json');

function loadTeamsToken() {
  try {
    if (fs.existsSync(TEAMS_TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TEAMS_TOKEN_FILE, 'utf-8'));
      return data.token || '';
    }
  } catch {}
  return '';
}

function saveTeamsToken(token) {
  try {
    fs.writeFileSync(TEAMS_TOKEN_FILE, JSON.stringify({ token }), 'utf-8');
  } catch {}
}

let teamsWs = null;
let teamsRetryTimer = null;
let teamsWasInMeeting = false;
let teamsConnected = false;

function connectToTeams(mainWindow) {
  if (teamsConnected) return;

  const token = loadTeamsToken();
  const url = `ws://localhost:8124?token=${token}&protocol-version=2.0.0&manufacturer=HiveMind&device=Combobulator&app=Combobulator&app-version=1.0`;

  try {
    teamsWs = new WebSocket(url);
  } catch {
    scheduleTeamsReconnect(mainWindow);
    return;
  }

  teamsWs.on('open', () => {
    teamsConnected = true;
  });

  teamsWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // #region agent log — log WS messages in the 10s window after overlay click
    if (_overlayClickedAt && (Date.now() - _overlayClickedAt) < 10000) {
      _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:teamsWs:message',message:'Teams WS message received after overlay click',data:{msAfterClick:Date.now()-_overlayClickedAt,isInMeeting:msg.meetingUpdate?.meetingState?.isInMeeting,canPair:msg.meetingUpdate?.meetingPermissions?.canPair,hasTokenRefresh:!!msg.tokenRefresh,teamsWasInMeeting},timestamp:Date.now(),hypothesisId:'H-WS'});
    }
    // #endregion

    if (msg.tokenRefresh) {
      saveTeamsToken(msg.tokenRefresh);
    }

    // Before pairing: Teams sends canPair:true without a meetingState object.
    // After pairing: Teams sends the full meetingState with isInMeeting.
    // Both are valid "in meeting" signals.
    const meetingState = msg.meetingUpdate?.meetingState;
    const permissions = msg.meetingUpdate?.meetingPermissions;

    const isInMeeting =
      meetingState?.isInMeeting === true ||
      permissions?.canPair === true;

    if (isInMeeting && !teamsWasInMeeting) {
      teamsWasInMeeting = true;
      showOverlay(mainWindow);
    } else if (!isInMeeting && teamsWasInMeeting) {
      teamsWasInMeeting = false;
      closeOverlay();
    }
  });

  teamsWs.on('close', () => {
    teamsConnected = false;
    teamsWs = null;
    scheduleTeamsReconnect(mainWindow);
  });

  teamsWs.on('error', () => {
    // 'close' fires after 'error', reconnect handled there
  });
}

function scheduleTeamsReconnect(mainWindow) {
  if (teamsRetryTimer) return;
  teamsRetryTimer = setTimeout(() => {
    teamsRetryTimer = null;
    connectToTeams(mainWindow);
  }, 10000);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Combobulator',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  win.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();

    for (const suggestion of params.dictionarySuggestions) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => win.webContents.replaceMisspelling(suggestion),
      }));
    }

    if (params.misspelledWord) {
      if (menu.items.length > 0) menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: `Add "${params.misspelledWord}" to dictionary`,
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      }));
    }

    if (menu.items.length > 0) menu.popup();
  });

  // #region agent log — renderer crash handler
  win.webContents.on('render-process-gone', (_e, details) => {
    _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:render-process-gone',message:'Renderer process gone',data:{reason:details.reason,exitCode:details.exitCode,msAfterOverlayClick:_overlayClickedAt ? Date.now()-_overlayClickedAt : null},timestamp:Date.now(),hypothesisId:'H-RENDERER'});
    try { dialog.showErrorBox('[Combobulator debug] Renderer crashed — please screenshot', `Reason: ${details.reason}  ExitCode: ${details.exitCode}`); } catch {}
  });
  // #endregion

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  // #region agent log — write startup entry immediately so we can confirm build version + log path
  _dbgWrite({sessionId:'6cf3ea',type:'startup',version:'1.2.2',userData:app.getPath('userData'),crashDumps:app.getPath('crashDumps'),timestamp:Date.now()});
  // #endregion
  // Grant microphone and media permissions so Web Speech API and getUserMedia work
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'desktopCapture'];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'desktopCapture'];
    return allowed.includes(permission);
  });

  // Serve local image files via app-image:// protocol
  protocol.handle('app-image', (request) => {
    const filename = decodeURIComponent(new URL(request.url).hostname);
    const filepath = path.join(IMAGES_DIR, filename);
    return net.fetch(`file://${filepath}`);
  });

  const win = createWindow();
  connectToTeams(win);

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('updater:update-available', { version: info.version });
  });
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('updater:update-downloaded', { version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    win.webContents.send('updater:update-not-available');
  });
  autoUpdater.on('error', (err) => {
    win.webContents.send('updater:error', { message: err.message });
  });

  autoUpdater.checkForUpdates().catch((e) => {
    _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:autoUpdater.checkForUpdates',message:'checkForUpdates rejected',data:{error:String(e?.message||e)},timestamp:Date.now(),hypothesisId:'H-UPDATER'});
  });
});

app.on('window-all-closed', () => {
  if (teamsRetryTimer) { clearTimeout(teamsRetryTimer); teamsRetryTimer = null; }
  if (teamsWs) { teamsWs.terminate(); teamsWs = null; }
  stopLocalAiServer();
  closeOverlay();
  if (captureWindow && !captureWindow.isDestroyed()) { captureWindow.close(); captureWindow = null; }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createWindow();
    connectToTeams(win);
  }
});
