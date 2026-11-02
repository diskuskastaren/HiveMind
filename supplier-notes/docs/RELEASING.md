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

- **Linux:** typecheck, unit tests, production build, Electron end-to-end checks (Xvfb), browser
  end-to-end checks (Playwright, AI providers mocked) and note-editor checks.
- **Windows:** runs the Electron end-to-end checks (incl. API keys in the Windows key store and the
  screen-capture permission), builds the unsigned installer with `--publish never`, launches the
  packaged app with `scripts/smoke-electron.cjs`, and attaches the installer to the run as the
  `HiveMind-installer` artifact (kept 7 days) for manual testing.

To release:

1. **Prepare.** In a pull request: bump `version` in `supplier-notes/package.json` (`npm version
   <x.y.z> --no-git-tag-version`) and add `supplier-notes/docs/release-notes/<x.y.z>.md` (what changed,
   for users). Merge once CI is green.
2. **Test the build.** Install the `HiveMind-installer` artifact from the CI run on `main` on a Windows
   machine that has the previous version and real data:
   - existing notes open correctly (incl. tables and collapsible sections);
   - API keys saved by the previous version are still shown in Settings;
   - recording works, incl. the visualizer with system audio; the Teams overlay appears;
   - Settings → Data lists the backups; quit and reopen.
3. **Build the release.** Either run the `Release` workflow from GitHub's Actions tab (*Run workflow*
   on `main`, step **draft**, version `<x.y.z>`), which tags that commit itself, or tag it and push the
   tag:
   ```bash
   git fetch origin main
   git tag v<x.y.z> origin/main
   git push origin v<x.y.z>
   ```
   The `Release` workflow (`.github/workflows/release.yml`) checks that the tag matches the version,
   runs the Electron checks, builds the installer and uploads it, its `.blockmap` and `latest.yml` to a
   **draft** release, launches the packaged app, and adds the notes and the installer's SHA-256 to the
   draft. Drafts are invisible to users and to the in-app updater; if any step fails, leave the draft
   unpublished.
4. **Publish.** Run the `Release` workflow with step **publish** and the same version: it checks that
   the draft has the installer, blockmap and `latest.yml`, that `latest.yml` names that version and that
   the downloaded installer's SHA-256 matches the notes, then publishes it as the latest release. (Or
   review the draft on GitHub and click **Publish release**.) From then on, installed copies offer the
   update.
5. **Confirm.** On a machine with the previous version, check that the update arrives and installs; if
   not, read `%APPDATA%\supplier-notes\logs\hivemind.log`.

Building never publishes: it always creates a draft (`EP_DRAFT`), and only the explicit **publish** step
(or the button on GitHub) makes a release visible. Pull requests that change
the workflow, the release notes or `scripts/release-notes.cjs` run it without uploading anything. Running the
**draft** step again for the same version replaces any draft an earlier run left behind and builds the
commit the tag points at; to release a different commit under the same version, delete the tag first
(`git push --delete origin v<x.y.z>`).

Without the workflow (fallback): on a Windows machine with a GitHub token that may create releases, run
`npm run electron:publish` (also creates a draft), then add the notes and checksum
(`node scripts/release-notes.cjs write` prints both) and publish the draft.

The same checks locally:

```bash
npm ci
npm run typecheck
npm test
npm run build
xvfb-run -a node scripts/e2e-electron.cjs   # Linux; on Windows: node scripts/e2e-electron.cjs
node scripts/e2e-browser.mjs                 # needs Playwright: npx playwright install chromium
node scripts/e2e-editor.mjs                  # note editor: every feature, stored notes never rewritten
npx electron-builder --win --publish never   # Windows; release/HiveMind-Setup-<version>.exe
node scripts/smoke-electron.cjs              # Windows only; launches the packaged app
```
