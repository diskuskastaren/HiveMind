const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const RESOURCE_DIR = path.join(ROOT, 'local-summary');
const CACHE_DIR = path.join(RESOURCE_DIR, '.cache');
const MANIFEST_PATH = path.join(RESOURCE_DIR, 'manifest.json');

const LLAMA_VERSION = 'b8833';
const LLAMA_RUNTIME_ZIP = `llama-${LLAMA_VERSION}-bin-win-cpu-x64.zip`;
const LLAMA_RUNTIME_URL = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_VERSION}/${LLAMA_RUNTIME_ZIP}`;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error(`Too many redirects for ${url}`));
      return;
    }
    if (fs.existsSync(destination) && fs.statSync(destination).size > 1024 * 1024) {
      resolve();
      return;
    }

    const tmp = `${destination}.download`;
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const out = fs.createWriteStream(tmp);
      response.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          fs.renameSync(tmp, destination);
          resolve();
        });
      });
      out.on('error', (error) => {
        try { fs.unlinkSync(tmp); } catch {}
        reject(error);
      });
    });

    request.on('error', reject);
    request.setTimeout(120000, () => request.destroy(new Error(`Download timed out: ${url}`)));
  });
}

async function main() {
  ensureDir(CACHE_DIR);

  const runtimeZipPath = path.join(CACHE_DIR, LLAMA_RUNTIME_ZIP);
  console.log(`Preparing local summary runtime: ${LLAMA_RUNTIME_ZIP}`);
  await downloadFile(LLAMA_RUNTIME_URL, runtimeZipPath);

  const manifest = {
    llamaCpp: {
      version: LLAMA_VERSION,
      runtimeZip: LLAMA_RUNTIME_ZIP,
      source: LLAMA_RUNTIME_URL,
      requires: ['llama-cli.exe', 'llama-server.exe'],
    },
    models: {
      'gemma-4-e2b-it-q4': {
        filename: 'gemma-4-e2b-it-edited-q4_0.gguf',
        source: 'https://huggingface.co/gguf-org/gemma-4-e2b-it-gguf/resolve/main/gemma-4-e2b-it-edited-q4_0.gguf',
        bundled: false,
      },
      'qwen3-4b-q4-k-m': {
        filename: 'Qwen3-4B-Q4_K_M.gguf',
        source: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
        bundled: false,
      },
    },
    preparedAt: new Date().toISOString(),
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('Local summary resources ready.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
