# HiveMind — privacy and confidentiality guide

This guide answers the question raised before sharing HiveMind with colleagues: *can I use it in
meetings covered by an NDA?* It describes exactly what leaves the computer, when, and how to keep
confidential content local. The same information is in the app under **Help → Privacy & Confidentiality**.

## What stays on the computer

- **Workspace data** — projects, suppliers, notes, tasks, decisions, follow-ups and transcript text —
  is stored in the data folder (`%APPDATA%\supplier-notes` by default, or the folder chosen under
  Settings → Data & Storage), together with pasted images, attached files and automatic backups.
- **API keys** are encrypted with the operating system's credential protection (Electron
  `safeStorage`, DPAPI on Windows), stored separately (`api-keys.bin`) and removed from the data file,
  backups and JSON exports.
- **Audio is never stored.** Only the resulting transcript text is saved.
- A **technical log** (`logs/hivemind.log` in the app-data folder) records startup, update and error
  events — never note content, transcripts or keys. Native crash dumps are kept locally and are not
  uploaded.

Notes, tasks, decisions, follow-ups, search, backups and exports never contact any external service.

## What is sent to external services

HiveMind has no servers. Requests go directly from the computer to the provider, authenticated with
the user's own API key.

| Feature | Sent to | What is sent | When |
| --- | --- | --- | --- |
| System-audio recording | Groq (Whisper) | Meeting audio (all computer audio + microphone), in chunks | Every chunk interval while recording (default 60 s) |
| Microphone recording, desktop app | Groq (Whisper) | Microphone audio, in chunks | While recording (Chromium's speech service is unavailable in the desktop app, so HiveMind uses Whisper) |
| Microphone recording, browser | Browser speech service (Google in Chromium) | Microphone audio | While recording |
| Summary | OpenAI | Full transcript + custom summary instructions | When a recording stops (**on by default**; can be turned off) or when "Generate summary" is clicked |
| Meeting analysis | OpenAI | Transcript, short excerpts (≤500 characters) of the 3 most recent notes in the same project, up to 10 current decisions | Only when "Analyze meeting" is clicked |
| Version history (Settings) | GitHub | A request for the public release list | When that tab is opened |
| Update check | GitHub Releases | A request for the latest release metadata/installer | At startup (installed app) |
| Teams detection | Microsoft Teams on the same computer (`localhost`) | Pairing token / meeting state | While enabled; nothing leaves the computer |

## Provider data handling (verify before relying on it)

Policies change; check the current documentation and any agreement your organization has with the
provider. As documented at the time of writing (November 2026):

- **OpenAI API** — data sent to the API is not used for training unless the customer opts in;
  abuse-monitoring logs are kept for up to 30 days; zero-data-retention is available for eligible
  accounts on approval. Source: [OpenAI — Your data](https://developers.openai.com/api/docs/guides/your-data/index.html).
- **Groq API** — Groq states it does not train on customer API data; zero-data-retention can be
  enabled under *Data Controls* in the Groq console. Default retention periods are described
  inconsistently by secondary sources, so confirm on
  [Groq — Your data](https://console.groq.com/docs/your-data).
- **Google (browser speech recognition)** — only applies when HiveMind runs in a browser.

## Recommendations for confidential meetings

1. **Consent and contracts first.** Everyone in the meeting should agree to being recorded, and the
   NDA or customer contract must allow processing the content by OpenAI/Groq as sub-processors.
   If in doubt, ask legal before recording.
2. **Turn off automatic summaries** (Settings → AI & Summarization → *Summarize recordings
   automatically*). Then nothing is sent to OpenAI unless someone clicks "Generate summary" or
   "Analyze meeting".
3. **Enable zero-data-retention** on the OpenAI and Groq accounts whose keys are used, where available.
4. **Use organization-owned API keys** covered by a data-processing agreement rather than personal keys.
5. **Don't record what must not leave the computer.** Typing notes, tasks and decisions never uses
   an external service. Without API keys configured, no content can be sent anywhere.
6. **Treat exports and backups like the originals.** JSON exports and backup folders contain all
   workspace text in readable form. Choose a data folder that is covered by your organization's
   storage policy (e.g. company OneDrive), and use HiveMind on one computer at a time.

## Changes made in this release

- The recording screen, Settings and Help now state where audio and transcripts go. The previous
  text claimed microphone mode "works offline" and was "free — no API key needed", which was not
  true in the desktop app.
- A setting controls whether transcripts are sent to OpenAI automatically after each recording.
- The meeting-analysis panel states what it sends before it is used (unchanged from before).
