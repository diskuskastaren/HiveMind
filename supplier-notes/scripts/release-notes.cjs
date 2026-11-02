// Release helper used by .github/workflows/release.yml (run from supplier-notes/).
//   node scripts/release-notes.cjs check [tag]  The tag, if given, must be v<package.json version>, and
//                                               docs/release-notes/<version>.md must exist.
//   node scripts/release-notes.cjs write        Writes release/RELEASE_NOTES.md: those notes plus the
//                                               SHA-256 checksum of the built installer.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { version } = pkg;
const notesFile = path.join(root, 'docs', 'release-notes', `${version}.md`);
const installerName = `${pkg.build.productName}-Setup-${version}.exe`;
const fail = (message) => { console.error(message); process.exit(1); };
const [mode, tag] = process.argv.slice(2);

if (mode === 'check') {
  if (tag && tag !== `v${version}`) fail(`Tag ${tag} does not match package.json version ${version} (expected v${version}).`);
  if (!fs.existsSync(notesFile)) fail(`Release notes missing: docs/release-notes/${version}.md`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  console.log(`HiveMind ${version}: ${tag ? `tag ${tag} matches, ` : ''}release notes found`);
} else if (mode === 'write') {
  const installer = path.join(root, 'release', installerName);
  if (!fs.existsSync(installer)) fail(`Installer not found: release/${installerName}`);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  const body = `${fs.readFileSync(notesFile, 'utf8').trimEnd()}

## Checksum

SHA-256 of \`${installerName}\`:

\`\`\`
${sha256}
\`\`\`

To check a download in PowerShell: \`Get-FileHash .\\${installerName} -Algorithm SHA256\`
`;
  fs.writeFileSync(path.join(root, 'release', 'RELEASE_NOTES.md'), body);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
  console.log(body);
} else {
  fail('Usage: node scripts/release-notes.cjs check [tag] | write');
}
