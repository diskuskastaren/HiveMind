const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const WHISPER_CPP_VERSION = 'v1.8.4';
const WHISPER_ZIP_URL =
  `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_VERSION}/whisper-bin-x64.zip`;
const BASE_MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';

const root = path.resolve(__dirname, '..');
const resourceRoot = path.join(root, 'local-transcription');
const binDir = path.join(resourceRoot, 'bin');
const modelsDir = path.join(resourceRoot, 'models');
const cacheDir = path.join(resourceRoot, '.cache');

const whisperZip = path.join(cacheDir, `whisper-bin-x64-${WHISPER_CPP_VERSION}.zip`);
const whisperExe = path.join(binDir, 'whisper-cli.exe');
const baseModel = path.join(modelsDir, 'ggml-base.bin');

fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(modelsDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

async function main() {
  if (!fs.existsSync(whisperExe)) {
    await download(WHISPER_ZIP_URL, whisperZip);
    const extractDir = path.join(cacheDir, `whisper-${WHISPER_CPP_VERSION}`);
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${escapePowerShell(whisperZip)}' -DestinationPath '${escapePowerShell(extractDir)}' -Force`,
    ], { stdio: 'inherit' });

    const executable = findFirst(extractDir, ['whisper-cli.exe', 'main.exe', 'whisper.exe']);
    if (!executable) {
      throw new Error(`Could not find whisper.cpp executable in ${whisperZip}`);
    }
    fs.copyFileSync(executable, whisperExe);

    for (const dll of findFiles(extractDir, (file) => file.toLowerCase().endsWith('.dll'))) {
      fs.copyFileSync(dll, path.join(binDir, path.basename(dll)));
    }
  }

  if (!fs.existsSync(baseModel) || fs.statSync(baseModel).size < 1024 * 1024) {
    await download(BASE_MODEL_URL, baseModel);
  }

  fs.writeFileSync(
    path.join(resourceRoot, 'manifest.json'),
    JSON.stringify({
      whisperCppVersion: WHISPER_CPP_VERSION,
      bundledModel: 'base',
      binary: 'bin/whisper-cli.exe',
      model: 'models/ggml-base.bin',
      preparedAt: new Date().toISOString(),
    }, null, 2),
    'utf-8',
  );

  console.log('Local transcription runtime is ready.');
  console.log(`Binary: ${whisperExe}`);
  console.log(`Model:  ${baseModel}`);
}

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error(`Too many redirects for ${url}`));
      return;
    }

    const tmp = `${destination}.download`;
    const request = https.get(url, {
      headers: { 'User-Agent': 'Combobulator local transcription builder' },
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        download(response.headers.location, destination, redirects + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed (${response.statusCode}) for ${url}`));
        return;
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const out = fs.createWriteStream(tmp);
      response.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          fs.renameSync(tmp, destination);
          resolve();
        });
      });
      out.on('error', (error) => {
        fs.rmSync(tmp, { force: true });
        reject(error);
      });
    });

    request.on('error', reject);
    request.setTimeout(180000, () => {
      request.destroy(new Error(`Timed out downloading ${url}`));
    });
  });
}

function findFirst(dir, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return findFiles(dir, (file) => wanted.has(path.basename(file).toLowerCase()))[0] || null;
}

function findFiles(dir, predicate) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(fullPath, predicate));
    else if (predicate(fullPath)) found.push(fullPath);
  }
  return found;
}

function escapePowerShell(value) {
  return value.replace(/'/g, "''");
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
