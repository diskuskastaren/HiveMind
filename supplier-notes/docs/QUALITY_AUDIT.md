# HiveMind quality audit — working backlog

Status legend: **Verified** = reproduced at runtime or proven from source; **Suspected** = plausible from
code reading but not reproducible in this environment; **Enhancement** = optional improvement.

This file is the working backlog. The final report (results, verification, remaining issues) is appended
at the end once implementation is done.

## P0 — critical

| # | Area | Problem | Evidence |
|---|------|---------|----------|
| 1 | Editor | Ctrl+Z after switching notes writes the previous note's content into the current note (TipTap history survives `setContent`). | Verified in Chromium: note "Beta" overwritten with "Alpha" text. |
| 2 | Security | Note HTML is parsed with `innerHTML` on live elements (sidebar preview, search index, export, TODO detection), so inline handlers in imported/stored HTML execute with full preload API access. | Verified: an `onerror` handler ran 16× after opening sidebar + search. |
| 3 | Security | Main window has no navigation / `window.open` guard; dropped files or links can replace the app page while keeping the privileged preload bridge. `attachment:open` and `shell:openExternal` accept any path/URL scheme from the renderer. | Verified from source (`electron/main.cjs`). |
| 4 | Data loss | JSON import replaces the whole workspace without confirmation or prior backup, and accepts data the storage layer later rejects (every later save fails). | Verified from source. |
| 5 | Data loss | TaskModal discards unsaved edits whenever the task changes in the store (flag toggle, linking a follow-up, attaching a file). | Verified in Chromium. |
| 6 | Data integrity | Quitting while writes are queued in the main process abandons them (and leaves temp files). | Verified from source (no `before-quit` handling). |

## P1 — high

| # | Area | Problem | Evidence |
|---|------|---------|----------|
| 7 | Known #1 visualizer | System-audio levels are produced by `requestAnimationFrame` in a never-shown window (frame production stops for hidden windows on Windows); the levels path also ignores `devicePixelRatio`, so bars render into the top-left part of the canvas on scaled displays; every level update re-renders the transcript panel at 30 fps. | HiDPI + re-render verified from source; hidden-window stall suspected (not reproducible on Linux/Xvfb, rAF ran at 60 fps there). |
| 8 | Known #3 linked follow-ups | Task↔follow-up links are written as two separate updates from three components; stale one-sided links make items appear linkable twice / show the wrong link; side panel shows no link for flagged tasks and drops it for resolved items; task-card chip does not focus the follow-up. | Verified from source. |
| 9 | Known #4 editing | Follow-ups cannot be edited from the note side panel; inline editors save on blur even after Escape. | Verified from source. |
| 10 | Known #2 summaries | Prompt imposes structure; renderer only understands `##` and `-`, producing orphan `<li>` and raw `###`/`*`/`1.` markup; truncated summaries are not flagged. | Verified from source. |
| 11 | Transcription | Failed Whisper uploads drop that audio permanently; stop() can discard the final chunk while an upload is in flight; system-mode errors are only logged to console; a failed start leaves an empty transcript entry. | Verified from source. |
| 12 | Summaries | Stopping a recording triggers two summary requests (stop handler + detail view auto-trigger). | Verified from source. |
| 13 | Meeting analysis | One suggestion with an untraceable/whitespace-different quote fails the whole analysis. | Verified from source (unit test exists asserting the throw). |
| 14 | Known #5 privacy | UI says mic mode "works offline"/"free"; it uses Google's speech service in browsers and falls back to Groq in the desktop app. Transcripts are auto-sent to OpenAI after every recording with no control. | Verified from source. |
| 15 | Known #6 Heimdal/updates | `signAndEditExecutable: false` makes electron-builder skip signing HiveMind.exe even when a certificate is configured; update failures are hidden; debug instrumentation shows modal "please screenshot" dialogs and writes logs into the install directory. | Verified from electron-builder source + `main.cjs`. |
| 16 | Decisions | Side panel lists revoked/superseded decisions like active ones, so "Revoke" appears to do nothing. Search → decision opens an empty inline editor. | Verified (search) in Chromium; side panel from source. |
| 17 | Electron | No single-instance lock: a second window trips the "changed outside this app" protection and locks saving. | Verified from source. |
| 18 | AI settings | `o1-mini` in model list rejects `temperature`/`max_tokens`; summaries fail. New settings are undefined for existing users (shallow persist merge). | Verified from source. |

## P2 — medium

| # | Area | Problem |
|---|------|---------|
| 19 | Dates | Due dates parsed as UTC midnight: wrong day shown west of UTC, "overdue" from 01:00 on the due day in Sweden, inconsistent with My Work. |
| 20 | Copy | Delete confirmations for note/project/supplier misstate what is removed (decisions are kept). |
| 21 | Follow-ups | Follow-ups created from a selection or the task dialog don't record their source note. |
| 22 | Performance | Sidebar row components are re-created every render, so every keystroke remounts every row and re-parses previews. Every keystroke/UI toggle serializes and writes the whole workspace (fsync) and decrypts the key file. |
| 23 | UX | Native `alert()` dialogs in recording flows. Capture start can hang forever. Recently-updated projects not clickable. Transcript search results don't open the transcript tab. |
| 24 | Email | `.eml` subject header not RFC 2047 encoded (å/ä/ö). Browser image paste crashes on large images. |

## P3 — low

| # | Area | Problem |
|---|------|---------|
| 25 | Dead code | Unused `KanbanBoard`, unreachable legacy capture branch, debug logging calls. |
| 26 | Duplication | `ownerInitials`, due-date helpers duplicated across components. |
