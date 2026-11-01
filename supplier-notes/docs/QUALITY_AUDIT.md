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
checks; the remaining work needs product or purchasing decisions (code signing, TipTap 3) or is low
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
| 18 | Dependencies | 7 high-severity production advisories (incl. a ProseMirror paste XSS, electron-updater token leak, `ws`). | Updated within semver ranges. | `npm audit --omit=dev`: 0 high/critical; full test suite re-run. |
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

## 3. Test results

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass (0 errors) |
| `npm test` | 38 unit tests pass (storage, security helpers, persistence, links, dates, markdown, transcript import, search/AI validation, store) — up from 12 |
| `npm run build` | Pass (Vite production build with CSP) |
| `node scripts/e2e-electron.cjs` (Electron 40.7, Linux/Xvfb) | 6/6 pass: navigation guard, IPC allowlists, app-image under CSP, single instance, save-on-close, reload |
| `node scripts/e2e-browser.mjs` (Chromium) | 13/13 pass: undo isolation, inert HTML, unloadable data left untouched, follow-up editing, task dialog, decisions, undo delete, import confirm, transcript import, recording edge cases (late final result, double start), mic + system recording pipelines |
| CSP | No violations: app build, demo site, Electron |
| `npm audit --omit=dev` | 0 high/critical (41 moderate — TipTap 2.x) |
| `electron-builder --win --x64 --dir` (on Linux) | Pass: afterPack edits icon/version resources and logs "not signed (no signing configuration)" |
| Packaged app smoke (Linux `--dir` build, same files config) | Starts from app.asar, renders, saves over IPC, writes its log |

**Not tested (environment limits):** Windows-specific behaviour — the NSIS installer itself and
running the Windows executable (only the unpacked Windows build was produced here), `scripts/smoke-electron.cjs`, real desktop
audio capture and the hidden-window frame behaviour (known #1a), Outlook draft opening, Teams local
API, electron-updater download/install and code signing. No real provider requests were made; all
AI calls in tests are intercepted locally.

## 4. Remaining issues (prioritized)

- **P1 — Code signing (known #6).** Requires a certificate or Azure Trusted Signing account; config is
  ready (`docs/RELEASING.md`). Then report the signed build to Heimdal.
- **P1 — Verify known #1 on Windows.** Record system audio on a Windows machine (ideally at 125–150 %
  display scaling) and confirm the visualizer moves.
- **P2 — TipTap 2 → 3 migration** to clear 41 moderate advisories (breaking API changes in the editor).
- **P2 — Backup disk usage.** Each backup copies all images and attachments (up to ~24 backups);
  large attachment folders multiply. Consider hard links or content-addressed storage.
- **P3 — Unused settings.** `releaseVersionDraft`, `releaseNotesDraft` and `releaseHistory` are no
  longer used by any screen (kept so older data files round-trip unchanged).
- **P3 — Bundle size.** One 1.3 MB JS chunk; irrelevant for the desktop app, could be split for the web demo.

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

1. Obtain signing, publish a signed release, ask users on older versions to install it manually.
2. Run the Windows checks listed in §3 and `scripts/e2e-electron.cjs` on Windows.
3. Add `npm test`, `npm run build` and both E2E scripts to a CI workflow (GitHub Actions has Xvfb
   and Playwright available).
4. Decide on the summary provider/endpoint question for NDA meetings.
5. Plan the TipTap 3 migration.
