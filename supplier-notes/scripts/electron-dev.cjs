const { spawn } = require('child_process');
const path = require('path');
const { createServer } = require('vite');

const ROOT = path.join(__dirname, '..');

(async () => {
  const vite = await createServer({
    root: ROOT,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  });

  await vite.listen();
  const address = vite.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const viteUrl = `http://127.0.0.1:${port}`;

  const electronPath = String(require('electron'));
  const electron = spawn(electronPath, ['--disable-gpu', '--in-process-gpu', '--disable-gpu-sandbox', '.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: viteUrl },
    cwd: ROOT,
  });

  const shutdown = async (code = 0) => {
    try { await vite.close(); } catch {}
    process.exit(code);
  };

  electron.on('close', (code) => {
    shutdown(code || 0);
  });

  process.on('SIGINT', () => {
    try { electron.kill(); } catch {}
    shutdown(0);
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
