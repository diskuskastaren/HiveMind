const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs');
const dist = path.join(root, 'dist');
const site = path.join(root, 'site');

if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Build the web app first: npm run build -- --base ./');
if (path.dirname(site) !== root || path.basename(site) !== 'site') throw new Error('Unexpected site output path');
fs.rmSync(site, { recursive: true, force: true });

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

copy(path.join(docs, 'index.html'), path.join(site, 'index.html'));
copy(path.join(docs, 'hivemind-demo.gif'), path.join(site, 'hivemind-demo.gif'));
copy(path.join(docs, 'hivemind-demo.mp4'), path.join(site, 'hivemind-demo.mp4'));
copy(path.join(docs, 'demo', 'fixture.mjs'), path.join(site, 'demo', 'fixture.mjs'));
copy(path.join(docs, 'demo', 'hivemind-tour', 'index.html'), path.join(site, 'demo', 'hivemind-tour', 'index.html'));
fs.cpSync(path.join(docs, 'demo', 'hivemind-tour', 'assets'), path.join(site, 'demo', 'hivemind-tour', 'assets'), { recursive: true });
fs.cpSync(path.join(docs, 'demo', 'hivemind-tour', 'compositions'), path.join(site, 'demo', 'hivemind-tour', 'compositions'), { recursive: true });
fs.cpSync(dist, path.join(site, 'try'), { recursive: true });

const appIndexPath = path.join(site, 'try', 'index.html');
const appIndex = fs.readFileSync(appIndexPath, 'utf8');
const scriptTag = /<script type="module" crossorigin src="([^"]+)"><\/script>/;
const match = appIndex.match(scriptTag);
if (!match) throw new Error('Could not find the Vite entry script in the built app');
const entry = match[1];
const boot = `<script type="module">
import { createDemoState } from '../demo/fixture.mjs';
const key = 'Combobulator-data';
const params = new URLSearchParams(location.search);
if (params.has('reset') || !localStorage.getItem(key)) {
  localStorage.setItem(key, JSON.stringify({ version: 11, state: createDemoState() }));
}
await import(${JSON.stringify(entry)});
</script>`;
fs.writeFileSync(appIndexPath, appIndex.replace(scriptTag, boot));
console.log(`Built interactive demo site in ${site}`);
