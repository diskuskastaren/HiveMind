# HiveMind quality audit — November 2026

Scope: the whole repository (Electron main/preload/storage, React renderer, store, utilities, build
and release configuration, interactive demo), the six known issues in `Bugs_Improvements`, and a
functional, data-integrity, UX, performance and security review.

Legend: **Verified** — reproduced at runtime before the fix (or proven deterministically from
source, e.g. electron-builder's own code), and re-checked after. **Suspected** — plausible from code
but not reproducible in this environment. **Enhancement** — optional improvement.

## 1. Executive summary

HiveMind's architecture is sound — local-first storage with atomic writes, validation, backups and
fail-closed recovery was already in place — but several everyday workflows could silently lose or
corrupt data, the desktop shell trusted its renderer too much, and four of the six reported issues
had concrete root causes in code. All P0 and P1 items found were fixed and covered by automated
checks; the remaining work needs product decisions or Windows verification, or is low
priority.

Most important fixes:

- **Editor undo could overwrite a note with another note's text** (Ctrl+Z after switching notes).
- **Stored/imported HTML executed** in the app (16 executions of an injected handler in one session),
  with access to the desktop bridge; now parsed inertly and blocked by a CSP.
- **Unsaved task edits were discarded** when the follow-up flag/link/attachment changed.
- **Import replaced all data without asking**; now confirmed, backed up first, validated like storage.
- **Edits made right before quitting** could be lost; writes before loading finished could overwrite
  the workspace with an empty state.
- Known issues #1–#6 investigated; #1–#5 fixed in code, #6 fixed as far as code allows (signing).

## 2. Resolved issues

### P0 — critical

| # | Area | Problem → root cause | Fix | Verification |
|---|------|---------------------|-----|--------------|
| 1 | Note editor | Ctrl+Z right after opening another note restored the previous note's text and saved it into the current note. One TipTap instance serves all notes and `setContent` was recorded in the undo history. | Fresh editor state (empty history) whenever a different note is loaded; same-note external inserts stay undoable. | **Verified** in Chromium before/after (note "Beta" overwritten → intact); browser E2E. |
| 2 | Security | Note HTML parsed via `innerHTML` on live elements (sidebar preview, search index, export, TODO detection) runs inline handlers from imported/stored HTML, with access to the preload API. Transcript text was inserted unescaped. | `DOMParser`-based inert parsing everywhere; escaped inserts; production **Content-Security-Policy** (`script-src 'self'`). | **Verified**: handler ran 16× before, 0× after; no CSP violations in app, demo or Electron. |
| 3 | Electron security | No navigation/`window.open` guard (a dropped file or link replaced the app page while keeping the privileged bridge); `attachment:open` opened any path, `shell:openExternal` any URL scheme. | Navigation allowlist for all windows; external links only http(s)/mailto; attachments only from the managed folder; explicit `sandbox: true`. | **Verified**: E2E check fails against the old `main.cjs` (window navigated away), passes now. |
| 4 | Data loss | JSON import replaced the whole workspace without confirmation/backup and accepted data the storage layer then rejected on every save. | Confirm dialog, flush + automatic backup first, validation matching storage, record normalization, navigation reset. Applies to Settings, command palette and welcome screen. | Unit tests (cross-checked against storage validator); browser E2E. |
| 5 | Data loss | Task dialog discarded unsaved title/description edits whenever the task changed in the store (flag toggle, linking a follow-up, attaching a file) — the form reset effect depended on the task object. | Reset only when another task opens; Escape/outside click with unsaved edits keeps the dialog open with a hint; a typed progress note is saved with Save. | **Verified** in Chromium before/after; browser E2E. |
| 6 | Data integrity | Quitting while writes were queued abandoned them (and left temp files); any store update during the asynchronous initial load wrote the empty default state, which could replace the real workspace. | Window-close handshake flushes the renderer; `before-quit` waits for the storage queue; persistence refuses writes until a read succeeded; restore/folder moves refuse later writes. | Electron E2E (edit-then-close persists, no temp/lock files); persistence unit tests. |

### P1 — high (includes the known issues)

| # | Area | Problem → root cause | Fix | Verification |
|---|------|---------------------|-----|--------------|
| 7 | **Known #1** visualizer, non-mic audio | (a) Levels came from `requestAnimationFrame` in a never-shown capture window; hidden windows stop producing frames (suspected on Windows; rAF ran normally on Linux/Xvfb). (b) The levels path ignored `devicePixelRatio`, drawing into the top-left 1/dpr of the canvas on scaled displays (deterministic). (c) 30 React state updates/s re-rendered the transcript panel. | Timer-driven levels + `backgroundThrottling: false` in the capture window; one animation loop reading levels from a ref; transform set every frame. | Browser E2E with a fake capture bridge at 150 % scaling: bars span the full canvas. (a) not reproducible here — needs a check on Windows. |
| 8 | **Known #2** summary instructions | Prompt prescribed structure; renderer only understood `##`/`-` (orphan `<li>`, raw `###`, `*`, `1.`). | Plain prompt ("Summarize this meeting transcript", same language) + custom instructions; markdown renderer for panel, note, Outlook and plain text; truncation flagged; `max_completion_tokens`, no temperature for reasoning models; incompatible `o1-mini` removed. | Unit tests; browser E2E asserts the exact prompt and list rendering. "Consider changing API" is a product decision — see §5. |
| 9 | **Known #3** linked follow-ups | Links written as two separate updates from three components → one-sided, stale and duplicate links: items showed the wrong partner, appeared "linkable" while linked, side panel showed no link for flagged tasks or resolved items. The "Link existing follow-up…" list in the task dialog opened **off-screen** (Radix item-aligned positioning with no selected value). | Atomic link/unlink store actions; resolver repairs existing data on load/import; links shown on every row with the partner's status and a jump link; pickers only offer unlinked open items; popper positioning for empty-value pickers. | Unit tests (resolver, store actions); browser E2E (link from dialog shows in side panel; picker on-screen). |
| 10 | **Known #4** editing follow-ups | No editing in the side panel; inline editors saved on the blur that follows Escape. | Shared `InlineEditInput` (Enter/blur saves, Escape cancels) for follow-ups and decisions in side panel and board. | Browser E2E. |
| 11 | **Known #5** NDA/privacy | UI and Help claimed mic mode "works offline"/"free"; in the desktop app it falls back to Groq Whisper (cloud). Transcripts were sent to OpenAI automatically after every recording with no setting. | Accurate disclosures (recording screen, Settings, Help → Privacy & Confidentiality); *Summarize recordings automatically* setting; transcript **import** (paste/.vtt/.srt) so meetings can be summarized without sending audio; `docs/PRIVACY.md`. | Browser E2E: with automatic summaries off, importing sends nothing. |
| 12 | **Known #6** Heimdal / updates | `signAndEditExecutable: false` made electron-builder skip signing HiveMind.exe even with a certificate (proven from `winPackager.js`); nothing is signed; failed updates were silent; debug code wrote logs into the install directory and showed "please screenshot" dialogs. | `afterPack` signs the exe whenever signing is configured; updater events logged to `logs/hivemind.log`; failures offer "Download manually"; debug instrumentation removed; `docs/RELEASING.md`. | Unsigned build path unchanged (no-op logged). Signing itself needs a certificate — see §5. |
| 13 | Transcription | Failed Whisper uploads dropped that audio; stop could discard the final chunk; system-mode errors only in the console; failed starts/empty recordings left empty entries; a failed mic fallback kept the microphone open; summaries were requested twice per recording. | Queue with retry (bounded, discards reported); per-segment saving; stop awaits in-flight uploads; visible status + toasts (no `alert()`); cleanup of entries and devices; single-flight summary service. | Browser E2E (mocked Groq outage then success; exactly one OpenAI request). |
| 14 | Meeting analysis | One untraceable/whitespace-different quote failed the whole analysis; due dates in free text. | Invalid suggestions dropped individually (count shown); punctuation-insensitive quote matching; ISO due dates requested. | Unit tests. |
| 15 | Decisions | Side panel listed revoked/superseded decisions like active ones ("Revoke" seemed to do nothing); search opened an empty inline editor. | Current decisions + collapsible "Revoked or replaced"; Undo on revoke; global decision history dialog (from side panel, board, search). | **Verified** (search) before/after; browser E2E. |
| 16 | Electron | No single-instance lock (a second window tripped the "changed outside this app" protection). Disabling Teams detection had no effect on the main process (overlay still appeared). Capture start could hang forever. | Single-instance lock focusing the existing window; Teams detection follows the setting live; 15 s capture start timeout and abort on crash. | Electron E2E (second instance exits). |
| 17 | Settings | Settings added in newer versions were `undefined` for existing users (shallow persist merge). | Hydration merges defaults and drops dangling navigation. | Unit test. |
| 18 | Dependencies | 7 high-severity advisories in shipped libraries (incl. a ProseMirror paste XSS, electron-updater token leak, `ws`); the Electron runtime 40.7.0 had ~25 advisories fixed in later 40.x releases, several relevant here (`shell.openPath` null-byte bypass, cross-origin reads through custom protocols with `supportFetchAPI` — as `app-image:` uses, a context-isolation bypass). | Updated within semver ranges; Electron 40.7.0 → 40.10.6. | All suites re-run on 40.10.6, incl. Windows unpacked build and packaged-app smoke check. |
| 19 | Distribution | All renderer libraries were runtime `dependencies`, so the installer shipped the whole `node_modules` (app.asar 97.3 MB) although Vite already bundles them; test files were packaged too. | Only `electron-updater` and `ws` stay runtime dependencies; tests excluded. | app.asar **97.3 MB → 5.0 MB**; packaged app starts, renders and saves (Linux package with the same file config). |

### P2 — medium

- Due dates were parsed as UTC midnight (wrong day west of UTC, "overdue" from 01:00 on the due day in
  Sweden, inconsistent with My Work) → calendar-day helpers, tested in three time zones.
- Delete confirmations misstated what is removed (decisions are kept) → accurate counts and wording.
- Follow-ups created from a selection, the side panel or the task dialog lost their source note.
- Sidebar rows were components declared inside render → remounted on every keystroke; previews cached.
- Every keystroke and UI toggle serialized and fsynced the whole workspace and decrypted the key file →
  unchanged snapshots skipped, write-behind coalescing (renderer and main), cached keys.
- Undo for task/follow-up deletes from the side panel and board (previously instant, no confirmation).
- Browser image paste crashed for large images; `.eml` subjects not RFC 2047-encoded (å/ä/ö).
- Recently updated projects on Overview not clickable; transcript search results didn't open the
  Transcript tab; My Work lacked an "Internal" filter; Help guide described features that don't exist.

### P3 — low

- Removed unreachable legacy capture code, the never-rendered `KanbanBoard` and its store state, and
  all debug-logging calls; consolidated duplicated helpers (`ownerInitials`, due-date logic,
  HTML-to-text). The Teams overlay window now gets a minimal preload (only its two buttons) instead
  of the full desktop bridge, and helper windows may only show their own page.

### Independent review round

After implementation, a separate reviewer read the full diff without my notes. Its findings and the
outcome:

| Finding | Outcome |
|---------|---------|
| Saving was enabled as soon as the file parsed — if migration/merge then threw (e.g. a supplier without `projectIds`), a UI toggle saved the empty defaults. | Fixed: saving starts only after hydration fully succeeds; `sanitizeWorkspace` tolerates malformed records; load failures show the recovery screen. Unit + browser tests. |
| `start()` could run twice (double-click while starting, Teams auto-start), duplicating chunk handlers, leaking timers/streams. | Fixed: re-entry guard + disabled button while starting. Browser test. |
| Browser speech mode: Stop evaluated the text before the final recognition result arrived (regression). | Fixed: Stop waits for the recognizer's end event. Browser test. |
| Close handshake could time out while a slow write (e.g. a backup) was in flight, dropping the last snapshot. | Fixed: on close, unsent snapshots go to the main process immediately; it finishes its queue before quitting. Unit test. |
| A failed write was not retried without another edit; flush reported success. | Fixed: kept and retried (backoff, and on flush); flush rejects if it still fails. Unit test. |
| Overlay window could navigate to any `file:` URL with the full bridge. | Fixed (minimal overlay preload, page allowlist). Verified in Electron. |
| Browser load failures were invisible. | Fixed with the recovery screen. Browser test. |
| Global shortcuts (search) worked while the task dialog was open and could switch tasks, discarding edits. | Fixed: app shortcuts are ignored while a dialog is open; editor Alt-shortcuts need editor focus. |

### Follow-up: Electron 40.10.6 → 45.2.1

Moves the app to a supported Electron major and clears the 14 Electron advisories `npm audit` still
reported for 40.x. Electron 41–45 breaking changes were reviewed against the code; two affect HiveMind:

| Change | Effect on HiveMind | Outcome |
|--------|--------------------|---------|
| Screen capture permission is requested as `display-capture` (Electron 45). | System-audio recording would fail: the capture window's `getUserMedia` was denied (`NotAllowedError`) because the permission allowlist only knew `desktopCapture`. **Verified**: granted on 40.10.6, denied on 45 with the old code. | `display-capture` added to the allowlist. New E2E check fails against the old `main.cjs` on 45, passes now. |
| Synchronous `safeStorage` deprecated (45; removed in 46). | API keys used the sync API, which printed deprecation warnings and would break on 46. On Linux the sync API reported encryption as unavailable, so any save that carried an API key failed there. | Moved to the asynchronous API (`isAsyncEncryptionAvailable`, `encryptStringAsync`, `decryptStringAsync`, re-encrypts when `shouldReEncrypt` is set). Electron documents that it decrypts data written by the sync API; **verified on Linux**: a key file written by Electron 40 is read by 45. A key file that cannot be decrypted is now kept instead of being overwritten with empty keys on the next save. |

Other changes checked and not applicable: sandboxed preloads lose the `events`/`timers`/`url`/`Buffer`
shims (HiveMind's preloads only use `contextBridge`/`ipcRenderer`); `npm install` no longer downloads
the Electron binary — `require('electron')` fetches it (checksum-verified) the first time it is used.

New Electron E2E checks: desktop capture stream opens; a key file that cannot be decrypted survives
a save; an API key typed in Settings is stored encrypted (not in the data file, not in plain text in
the key file) and shown again after a restart; Electron prints no deprecation warnings. Each new
check was confirmed to fail against the code it guards against (old permission list, removed
key-file guard, a deprecated API call). The
Electron E2E now also runs in the Windows CI job, against Windows' key store (DPAPI) and screen capture.

### Follow-up: backup disk usage

Every backup copied all images and attachments, and up to ~24 backups are kept (10 most recent plus
one per day for 14 days), so the backups folder grew to about 24× the attachments folder. Backups now
hard-link files that are unchanged since the previous backup (same name, size and modification time)
instead of copying them, the way `rsync --link-dest` and Time Machine do:

- Each backup is still a complete folder in the same layout, so restore, older app versions and
  manual recovery work unchanged, and existing backups need no migration (they age out as before).
- Links only point to earlier backups, never to the live `images`/`attachments` folders: editing or
  deleting a live file cannot change a backup, and restored files are real copies.
- A file changed in place gets a fresh copy; earlier backups keep the earlier version.
- Where hard links are unsupported (e.g. FAT/exFAT drives) files are copied as before.
- Measured: 10 backups of 53 MB of files took 511 MB before and 53 MB after; 11 backups took 2.9 s
  before and 0.15 s after.

Notes: Windows Explorer's folder size counts every link, so the backups folder still *looks* as large
as before. Moving the data folder copies backups without links (as before); new backups share files
again. Editing a file inside a backup folder by hand would change every backup that shares it.

### Follow-up: note editor TipTap 2.27 → 3.32

Clears the 41 moderate TipTap/ProseMirror advisories (`npm audit`: 78 → 37 findings; none of the
remaining ones are in the editor). Changes needed beyond new package names (tables, lists,
Placeholder/CharacterCount moved; Link and Underline now come from StarterKit):

| TipTap 3 change | Effect on HiveMind if left alone | Outcome |
|-----------------|----------------------------------|---------|
| The React editor no longer re-renders on every change by default. | Toolbar active states, table tools, template picker, word count and the find counter would stop updating. | `shouldRerenderOnTransaction: true` (TipTap 2 behaviour). |
| `setContent` emits an update by default. | Opening a note would count as an edit: saved again and marked as changed. | `emitUpdate: false` when loading a note or a template. |
| StarterKit adds TrailingNode and ListKeymap. | Notes ending in a list or table would get an extra empty paragraph (saved on open); Backspace/Delete in lists would change. | Both disabled; behaviour identical to before. |
| The selection menu uses Floating UI instead of tippy. | The menu re-registered on every render — an endless render loop that crashed the editor (found by the new checks) — and, without tippy's z-index, it sat behind the sticky toolbar for text near the top of a note. | Menu options defined once; menu placed above the toolbar. |
| Stricter typings. | Revealed a pre-existing bug: collapsible sections declared their attributes in a way TipTap ignores, so every section was saved without its title, as closed, with its content hidden; text typed into a new section was not visible. | Attributes registered (same `data-title`/`data-open` HTML); sections saved by the broken version open again so their content is visible. |

Verification:

- New `scripts/e2e-editor.mjs` (25 checks, also in CI): 20 kinds of stored note — demo notes, every
  mark and block, nested and task lists, tables, mentions, images, collapsibles (incl. ones saved by
  the broken version), inserted summaries and
  transcripts, templates, legacy HTML — open without being rewritten or marked as edited, and keep
  their text; every editor feature is exercised through the UI (toolbar and its active states,
  shortcuts, markdown and typography input rules, Tab/Shift+Tab, Backspace/Delete in lists, task
  checkboxes, links incl. autolink and a blocked `javascript:` URL, tables, slash commands,
  collapsibles, mentions, image and HTML paste, find & replace, selection menu, Alt+T/D/F, undo/redo,
  word count, templates, placeholder).
- The same script was run against TipTap 2 (`main`): 23/25 there (both failures are the collapsible
  bug), 25/25 now. Of 61 recorded outputs (the HTML the editor produced), 49 are identical; the
  differences are the
  collapsible fix and table cells, which TipTap 3 writes without the default `colspan="1" rowspan="1"`
  (column widths kept; older HTML loads unchanged; nothing in the app reads these attributes).
- Screenshots (TipTap 2 vs 3): the selection menu, slash menu and mention list are pixel-identical;
  a rich note differs only by the now-visible collapsible content; the empty-note view differs in two
  pixel rows of the header line above the editor.
- The desktop app: a new Electron check opens a note and pastes an image (saved as an `app-image:`
  file and shown under the CSP); the demo site builds and its editor works.
- Bundle: +25 KB gzipped (Floating UI).

Unchanged on purpose: Tab inside a table cell inserts spaces (as before) rather than moving to the
next cell, because the app's own Tab handling takes precedence.

## 3. Test results

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass (0 errors) |
| `npm test` | 40 unit tests pass (storage, security helpers, persistence, links, dates, markdown, transcript import, search/AI validation, store) — up from 12 |
| `npm run build` | Pass (Vite production build with CSP) |
| `node scripts/e2e-electron.cjs` (Electron 45.2.1; Linux/Xvfb locally and in CI, Windows in CI) | 12/12 pass: navigation guard, IPC allowlists, app-image under CSP, desktop capture permission, single instance, save-on-close, undecryptable key file kept, reload, API key stored encrypted, note editor with image paste, API key read back after restart, no deprecation warnings |
| `node scripts/e2e-browser.mjs` (Chromium) | 13/13 pass: undo isolation, inert HTML, unloadable data left untouched, follow-up editing, task dialog, decisions, undo delete, import confirm, transcript import, recording edge cases (late final result, double start), mic + system recording pipelines |
| `node scripts/e2e-editor.mjs` (Chromium, TipTap 3.32) | 25/25 pass: stored notes open unchanged, and every editor feature (see the TipTap follow-up above) |
| CSP | No violations: app build, demo site, Electron |
| `npm audit` | 37 findings, none in shipped code: no Electron advisories since 45.2.1, no editor advisories since TipTap 3. `--omit=dev` reports 0 (the bundled renderer libraries are devDependencies, see #19). The remaining high/critical advisories are in build tools (electron-builder, Vite and their dependencies), which are not shipped. |
| `electron-builder --win --x64 --dir` (on Linux, Electron 45.2.1) | Pass: afterPack edits icon/version resources and logs "not signed (no signing configuration)" |
| Packaged app smoke (Linux `--dir` build, same files config, Electron 45.2.1) | Starts from app.asar, renders, saves over IPC, writes its log |
| CI Windows job | Builds the NSIS installer, runs the Electron E2E and launches the packaged app (`scripts/smoke-electron.cjs`) |

**Not tested (environment limits):** installing with the NSIS installer, recording real system
audio and the hidden-window frame behaviour on Windows (known #1a), Outlook draft opening, Teams
local API, electron-updater download/install and code signing. The Windows executable itself is
launched in CI. No real provider requests were made; all
AI calls in tests are intercepted locally.

## 4. Remaining issues (prioritized)

- **Decided — releases stay unsigned (open source, MIT).** Expect SmartScreen warnings and occasional
  antivirus flags; mitigations and the free SignPath option are in `docs/RELEASING.md`.
- **P1 — Verify known #1 and the Electron 45 upgrade on Windows.** Record system audio on a Windows
  machine (ideally at 125–150 % display scaling) and confirm the visualizer moves; check that API keys
  saved by the previous version are still shown in Settings, and that the Teams overlay and an update
  from the previous release work.
- **P3 — Build-tool advisories.** Vite and electron-builder (and their dependencies) carry the remaining
  `npm audit` findings; they are not shipped, but newer majors would clear them.
- **P3 — Unused settings.** `releaseVersionDraft`, `releaseNotesDraft` and `releaseHistory` are no
  longer used by any screen (kept so older data files round-trip unchanged).
- **P3 — Bundle size.** One 1.4 MB JS chunk; irrelevant for the desktop app, could be split for the web demo.

## 5. Product decisions (alternatives documented, not changed)

- **"Consider changing API" (known #2).** Options: keep OpenAI (current); use Groq's
  OpenAI-compatible chat API so one key covers transcription and summaries; or allow a custom
  OpenAI-compatible endpoint (e.g. an Azure OpenAI deployment covered by a company agreement — the
  strongest option for NDA work). The request layer (`chatCompletionBody`, `providerError`) is ready.
- **Default for automatic summaries.** Kept *on* (previous behaviour). For a team handling NDA
  material, defaulting to *off* is the safer choice.
- **Task dialog close behaviour.** Cancel discards; Escape/outside-click with unsaved edits now keeps
  the dialog open. Auto-save on close would be the alternative.

## 6. Recommended next steps

1. Watch the first `CI` runs (`.github/workflows/ci.yml`): Linux tests + end-to-end checks, and a
   Windows job that builds the installer, launches it and attaches it as an artifact.
2. Use that installer for the Windows checks in §3 (visualizer with system audio, update flow).
3. Report false positives to Heimdal for each release (or apply for free signing via SignPath).
4. Decide on the summary provider/endpoint question for NDA meetings.
5. Keep Electron on a supported major (Electron supports the latest three).
