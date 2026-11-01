# Releasing HiveMind (Windows)

## Why antivirus software (e.g. Heimdal) flags HiveMind and breaks updates

The investigation (November 2026) found that the warning is consistent with how the app is built
and distributed, rather than only a false positive:

1. **Nothing is code-signed.** No signing certificate is configured. In addition,
   `build.win.signAndEditExecutable: false` makes electron-builder skip signing `HiveMind.exe`
   entirely — even if a certificate were configured, only the installer would have been signed
   (see `app-builder-lib/out/winPackager.js`, `signApp()`). The flag is needed because
   `scripts/after-pack.cjs` edits the icon/version resources itself.
2. **Self-updating, unsigned executable.** electron-updater downloads `HiveMind-Setup-x.y.z.exe`
   into the user profile and runs it silently. An unsigned binary that downloads and launches another
   unsigned executable from a user-writable folder is a classic heuristic trigger. When the
   downloaded installer is quarantined, the update fails.
3. **Update failures were invisible.** Errors after "update available" were shown briefly, and
   nothing was logged, so failed or blocked updates looked like "updates don't work".
4. **Debug instrumentation** wrote log files into the installation directory and showed modal
   "[HiveMind debug] … please screenshot" dialogs on any unhandled error.

### What this release changes

- `scripts/after-pack.cjs` signs `HiveMind.exe` after editing its resources **whenever signing is
  configured**, so configuring a certificate now signs the app binary as well as the installer and
  uninstaller. Without signing configuration the build behaves as before (no-op, logged).
- All updater activity (check, download, signature verification, installer launch, errors) is
  written to `%APPDATA%\supplier-notes\logs\hivemind.log`. Ask an affected user for this file.
- If a download or install fails, the app keeps the error visible and offers **Download manually**,
  which opens the latest GitHub release.
- The debug instrumentation is removed.

### What still has to be done (requires a decision/purchase — cannot be done in code)

1. **Get a code-signing identity.** Options:
   - *Azure Trusted Signing* (Microsoft's managed signing service): configure in `package.json`:
     ```json
     "win": {
       "azureSignOptions": {
         "publisherName": "<exactly as in the certificate>",
         "endpoint": "https://<region>.codesigning.azure.net",
         "certificateProfileName": "<profile>",
         "codeSigningAccountName": "<account>"
       }
     }
     ```
     and provide `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` when building
     (Windows build machine).
   - *OV/EV certificate from a CA*: set `CSC_LINK` (or `WIN_CSC_LINK`) and `CSC_KEY_PASSWORD`
     (or use a hardware token/HSM per the CA's instructions).
   Once signed, electron-builder writes the publisher name into `app-update.yml`, and the updater
   verifies the signature of downloaded updates before installing them.
2. **Report the false positive to Heimdal** with the signed build's hash, and ask the organization's
   IT to allow-list the publisher if needed. Signing builds reputation; until then expect some
   SmartScreen/heuristic friction for new versions.
3. **Users on an unsigned version** must install the first signed release manually (Download
   manually / GitHub Releases), because older builds cannot verify a publisher they don't know.

## Release checklist

```bash
npm ci
npm run typecheck
npm test
npm run build
xvfb-run -a node scripts/e2e-electron.cjs   # Linux; on Windows: node scripts/e2e-electron.cjs
npm run electron:build                       # Windows; produces release/HiveMind-Setup-<version>.exe
node scripts/smoke-electron.cjs              # Windows only; launches the packaged app
```

Then bump the version in `package.json`, publish with `npm run electron:publish` (requires a GitHub
token with release permissions), and check `logs/hivemind.log` on a test machine after updating.
