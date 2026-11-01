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

### What changed in the app

- `scripts/after-pack.cjs` signs `HiveMind.exe` after editing its resources **whenever signing is
  configured**, so configuring a certificate now signs the app binary as well as the installer and
  uninstaller. Without signing configuration the build behaves as before (no-op, logged).
- All updater activity (check, download, signature verification, installer launch, errors) is
  written to `%APPDATA%\supplier-notes\logs\hivemind.log`. Ask an affected user for this file.
- If a download or install fails, the app keeps the error visible and offers **Download manually**,
  which opens the latest GitHub release.
- The debug instrumentation is removed.

## Signing decision: releases are unsigned

HiveMind is a free, open-source (MIT) project, so releases are **not code-signed** by choice. What
that means in practice:

- **Windows SmartScreen** may show "Windows protected your PC" for a new installer. Users choose
  *More info → Run anyway*. Reputation is tracked per file, so each new unsigned version can show
  the warning again until enough people have downloaded it.
- **Antivirus heuristics (e.g. Heimdal)** may still flag the installer or block the downloaded update.
  When that happens the app shows **Download manually**, which opens the latest GitHub release, and
  details are written to `%APPDATA%\supplier-notes\logs\hivemind.log`.
- **Reduce false positives:** report the release's installer to the antivirus vendor as a false
  positive (most vendors have a submission form), or ask the organization's IT to allow-list it.
  Publishing the SHA-256 checksum of each installer in the release notes lets users verify downloads:
  ```powershell
  Get-FileHash .\HiveMind-Setup-<version>.exe -Algorithm SHA256
  ```

### If signing is wanted later (free for open source)

[SignPath Foundation](https://signpath.org/) signs open-source projects free of charge. Its published
requirements include an OSI-approved license (MIT qualifies), source in a public repository, a fully
automated build (the `CI` workflow builds the installer on `windows-latest`), and a credit line in the
project. Apply via [signpath.org](https://signpath.org/); check the current terms there.

The build is already prepared: `scripts/after-pack.cjs` signs `HiveMind.exe` whenever signing is
configured (by default `signAndEditExecutable: false` would skip it), and electron-builder then also
signs the installer and writes the publisher into `app-update.yml`, so the updater verifies downloaded
updates. Configuration options:

- *Azure Trusted Signing*:
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
  with `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` set when building (Windows).
- *A certificate file*: set `CSC_LINK` (or `WIN_CSC_LINK`) and `CSC_KEY_PASSWORD`.
- *SignPath*: integrates with GitHub Actions to sign the installer built by CI (see SignPath's documentation).

Users on an unsigned version must install the first signed release manually, because older builds
cannot verify a publisher they don't know.

## Release checklist

The `CI` workflow (`.github/workflows/ci.yml`) runs on every push and pull request:

- **Linux:** typecheck, unit tests, production build, Electron end-to-end checks (Xvfb) and browser
  end-to-end checks (Playwright, AI providers mocked).
- **Windows:** builds the unsigned installer with `--publish never`, launches the packaged app with
  `scripts/smoke-electron.cjs`, and attaches the installer to the run as the `HiveMind-installer`
  artifact (kept 7 days) for manual testing.

To release:

1. Bump `version` in `supplier-notes/package.json` and push; wait for CI to pass.
2. Install the CI artifact on a test machine: check recording (incl. the visualizer with system
   audio), then quit and reopen.
3. On a Windows machine with a GitHub token that may create releases: `npm run electron:publish`.
4. Add the installer's SHA-256 checksum and the changes to the GitHub release notes.
5. On a machine with the previous version, confirm the update arrives and installs; if not, read
   `%APPDATA%\supplier-notes\logs\hivemind.log`.

The same checks locally:

```bash
npm ci
npm run typecheck
npm test
npm run build
xvfb-run -a node scripts/e2e-electron.cjs   # Linux; on Windows: node scripts/e2e-electron.cjs
node scripts/e2e-browser.mjs                 # needs Playwright: npx playwright install chromium
npx electron-builder --win --publish never   # Windows; release/HiveMind-Setup-<version>.exe
node scripts/smoke-electron.cjs              # Windows only; launches the packaged app
```
