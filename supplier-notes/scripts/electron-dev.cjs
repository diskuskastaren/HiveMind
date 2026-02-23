const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 5173;
const VITE_URL = `http://localhost:${PORT}`;

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
  cwd: ROOT,
  shell: process.platform === 'win32',
});

function waitForVite() {
  http
    .get(VITE_URL, () => launchElectron())
    .on('error', () => setTimeout(waitForVite, 500));
}

function launchElectron() {
  const electronPath = String(require('electron'));
  const e = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: VITE_URL },
    cwd: ROOT,
  });
  e.on('close', () => {
    try { vite.kill(); } catch {}
    process.exit();
  });
}

process.on('SIGINT', () => {
  try { vite.kill(); } catch {}
  process.exit();
});

waitForVite();
