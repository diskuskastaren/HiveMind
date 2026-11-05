import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Square,
  Copy,
  FileText,
  Settings,
  Trash2,
  RefreshCw,
  Volume2,
  ChevronLeft,
  Check,
  Mail,
  ChevronRight,
  Pencil,
  Sparkles,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useStore } from '../store/store';
import { useTranscription, type TranscriptionMode } from '../hooks/useTranscription';
import { getMailtoUrl } from '../utils/export';
import { escapeHtml } from '../utils/html';
import { summaryToEmailHtml, summaryToHtml, summaryToNoteHtml, summaryToPlainText } from '../utils/markdown';
import { hasSummaryError, requestSummary, useSummaryStatus } from '../utils/summaryService';
import { AudioVisualizer } from './AudioVisualizer';
import type { Transcript } from '../types';
import { MeetingReview } from './MeetingReview';
import { parseTranscriptFile } from '../utils/transcriptImport';

/**
 * Add a transcript that was produced elsewhere (e.g. a Microsoft Teams .vtt export or pasted
 * text). Useful when recording is not allowed: no audio is sent anywhere.
 */
function TranscriptImport({ noteId, meetingTime, onImported }: { noteId: string; meetingTime: number; onImported: (id: string) => void }) {
  const addTranscript = useStore((s) => s.addTranscript);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [duration, setDuration] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    try {
      const parsed = parseTranscriptFile(await file.text());
      setText(parsed.text);
      setDuration(parsed.duration);
      if (!parsed.text) toast.error('No transcript text found in that file');
    } catch (error) {
      toast.error('Could not read the file', { description: String(error) });
    }
  };
  const save = () => {
    const parsed = parseTranscriptFile(text);
    if (!parsed.text) return;
    const id = crypto.randomUUID();
    addTranscript(noteId, { id, rawText: parsed.text, duration: duration || parsed.duration, recordedAt: meetingTime });
    setText(''); setDuration(0); setOpen(false);
    toast.success('Transcript added');
    onImported(id);
  };

  if (!open) {
    return (
      <Button variant="ghost" size="xs" className="self-start text-muted-foreground" onClick={() => setOpen(true)}>
        <FileText /> Paste or import a transcript instead
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">Paste a transcript, or open a .txt, .vtt (Microsoft Teams) or .srt file. Nothing is sent anywhere until you ask for a summary or analysis.</p>
      <Textarea aria-label="Transcript text" className="min-h-28 text-ui" value={text} onChange={(e) => { setText(e.target.value); setDuration(0); }} placeholder="Paste transcript text…" />
      <input ref={fileRef} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void readFile(file); }} />
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="xs" onClick={() => fileRef.current?.click()}>Open file…</Button>
        <span className="flex-1" />
        <Button variant="ghost" size="xs" onClick={() => { setOpen(false); setText(''); }}>Cancel</Button>
        <Button size="xs" onClick={save} disabled={!text.trim()}>Add transcript</Button>
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => toast.error('Could not copy to the clipboard'));
  };
  return (
    <Button variant="outline" size="xs" onClick={handleCopy}>
      {copied ? <Check className="text-success" /> : <Copy />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

// ── Single transcript detail view ────────────────────────────────────────────
interface TranscriptDetailProps {
  transcript: Transcript;
  noteId: string;
  apiKey: string;
  onBack: () => void;
  onStartNew: () => void;
  isRecording: boolean;
}

function TranscriptDetail({ transcript, noteId, apiKey, onBack, onStartNew, isRecording }: TranscriptDetailProps) {
  const note = useStore((s) => s.notes.find((n) => n.id === noteId));
  const projects = useStore((s) => s.projects);
  const updateTranscript = useStore((s) => s.updateTranscript);
  const deleteTranscript = useStore((s) => s.deleteTranscript);
  const appendToNote = useStore((s) => s.appendToNote);
  const addNoteSection = useStore((s) => s.addNoteSection);
  const openConfirmDialog = useStore((s) => s.openConfirmDialog);
  const autoSummarize = useStore((s) => s.settings.autoSummarize);

  const [subTab, setSubTab] = useState<'summary' | 'raw'>('summary');
  const { summarizing: isSummarizing, error: summarizeError } = useSummaryStatus(transcript.id);
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [editedRawText, setEditedRawText] = useState('');

  // Reset edit mode when the user navigates to a different transcript
  useEffect(() => {
    setIsEditingRaw(false);
    setEditedRawText('');
  }, [transcript.id]);

  const handleRegenerateSummary = useCallback(() => {
    if (!transcript.rawText || !apiKey) return;
    requestSummary(noteId, transcript.id).catch(() => { /* shown inline via useSummaryStatus */ });
  }, [transcript, apiKey, noteId]);

  const handleInsertIntoNote = useCallback(() => {
    if (!transcript.rawText || !note) return;
    // Escaped: the transcript is plain text and must never be interpreted as HTML.
    const paragraphs = transcript.rawText.trim().split(/\n+/).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
    // Added to the tab being shown (or the end of a plain note).
    appendToNote(noteId, `<h2>Meeting Transcript</h2>${paragraphs}`);
    toast.success('Transcript added to the note');
  }, [transcript, note, noteId, appendToNote]);

  const handleInsertAsTab = useCallback(() => {
    if (!transcript.rawText || !note) return;
    const paragraphs = transcript.rawText.trim().split(/\n+/).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
    addNoteSection(noteId, { title: 'Transcript', content: paragraphs });
    toast.success('Transcript added as a new tab');
  }, [transcript, note, noteId, addNoteSection]);

  const handleAddSummaryToNote = useCallback(() => {
    if (!transcript.summary || !note) return;
    appendToNote(noteId, `<h2>Meeting Summary</h2>${summaryToNoteHtml(transcript.summary)}`);
    toast.success('Summary added to the note');
  }, [transcript, note, noteId, appendToNote]);

  const handleAddSummaryAsTab = useCallback(() => {
    if (!transcript.summary || !note) return;
    addNoteSection(noteId, { title: 'Summary', content: summaryToNoteHtml(transcript.summary) });
    toast.success('Summary added as a new tab');
  }, [transcript, note, noteId, addNoteSection]);

  const handleEmailSummary = useCallback(() => {
    if (!transcript.summary || !note) return;
    const projectNames = (note.projectIds || [])
      .map((id) => projects.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];
    const baseSubject = note.title ? `Meeting summary: ${note.title}` : 'Meeting summary';
    const subject = projectNames.length > 0 ? `[${projectNames.join(', ')}] - ${baseSubject}` : baseSubject;
    const outlookOpen = (window as any).electronOutlookMail?.open;
    if (typeof outlookOpen === 'function') {
      Promise.resolve(outlookOpen(subject, summaryToEmailHtml(transcript.summary))).then((opened: boolean) => {
        if (opened === false) toast.error('Could not open your mail app', { description: 'Copy the summary and paste it into an email instead.' });
      });
    } else {
      const url = getMailtoUrl(subject, summaryToPlainText(transcript.summary));
      const openExternal = (window as any).electronOpenExternal?.open;
      if (typeof openExternal === 'function') openExternal(url);
      else window.location.href = url;
    }
  }, [transcript, note, projects]);

  const handleDelete = useCallback(() => {
    openConfirmDialog({
      title: 'Delete recording',
      message: 'Delete this recording?',
      confirmLabel: 'Delete',
      onConfirm: () => {
        deleteTranscript(noteId, transcript.id);
        onBack();
      },
    });
  }, [transcript.id, noteId, deleteTranscript, onBack, openConfirmDialog]);

  // With automatic summaries on, opening a transcript without one starts it (once; a request
  // already running for this transcript — e.g. from stopping the recording — is reused).
  useEffect(() => {
    if (autoSummarize && transcript.rawText && !transcript.summary && apiKey && !hasSummaryError(transcript.id)) {
      handleRegenerateSummary();
    }
  // Only run when the transcript id changes (i.e. user selects a different one)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript.id]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-2.5">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to recordings">
          <ChevronLeft />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-ui font-semibold">
            {transcript.recordedAt ? format(new Date(transcript.recordedAt), 'MMM d · HH:mm') : 'Recording'}
          </span>
          <span className="font-mono text-2xs text-muted-foreground">
            {transcript.duration != null ? formatDuration(transcript.duration) : '–'}
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete} title="Delete this recording" aria-label="Delete this recording" className="text-muted-foreground hover:text-destructive">
          <Trash2 />
        </Button>
      </div>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as 'summary' | 'raw')} className="px-3 pt-3">
        <TabsList className="w-full">
          <TabsTrigger value="summary" className="text-xs">
            {isSummarizing ? <RefreshCw className="size-3 animate-spin text-ai" /> : <Sparkles className="size-3 text-ai" />}
            {isSummarizing ? 'Summarizing…' : 'Summary'}
          </TabsTrigger>
          <TabsTrigger value="raw" className="text-xs">
            Transcript
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="px-4 py-4 text-ui leading-relaxed">
        {subTab === 'summary' && (
          <>
            {isSummarizing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="size-3 animate-spin" />
                Generating summary…
              </div>
            )}
            {!isSummarizing && transcript.summary && summarizeError && (
              <p role="alert" className="mb-2 text-xs text-destructive">Regenerating failed: {summarizeError}</p>
            )}
            {!isSummarizing && transcript.summary && <div dangerouslySetInnerHTML={{ __html: summaryToHtml(transcript.summary) }} />}
            {!isSummarizing && !transcript.summary && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                {summarizeError && <p className="text-xs text-destructive">{summarizeError}</p>}
                <p className="text-xs text-muted-foreground">
                  {apiKey ? 'No summary yet. Generating one sends this transcript to OpenAI.' : 'Add an OpenAI API key to generate summaries.'}
                </p>
                {apiKey ? (
                  <Button variant="outline" size="xs" onClick={handleRegenerateSummary}>
                    <Sparkles className="text-ai" />
                    Generate summary
                  </Button>
                ) : null}
              </div>
            )}
          </>
        )}

        {subTab === 'raw' &&
          (isEditingRaw ? (
            <Textarea
              aria-label="Edit transcript"
              className="min-h-64 text-ui"
              value={editedRawText}
              onChange={(e) => setEditedRawText(e.target.value)}
              autoFocus
            />
          ) : (
            <p className="whitespace-pre-wrap text-subtle-foreground">{transcript.rawText ?? ''}</p>
          ))}
      </div>

      {!isRecording && note && <div className="px-3 pb-4"><MeetingReview note={note} transcript={transcript} /></div>}

      <div className="flex flex-col gap-2 border-t px-3 py-3">
        {subTab === 'summary' && transcript.summary && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="xs" className="flex-1" onClick={handleAddSummaryToNote}>
              <FileText /> Add to note
            </Button>
            <Button variant="outline" size="xs" onClick={handleAddSummaryAsTab} title="Add the summary to the note as a new tab">
              <Plus /> As tab
            </Button>
            <Button variant="outline" size="xs" className="flex-1" onClick={handleEmailSummary} title="Open default mail app with summary in body">
              <Mail /> Email summary
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {subTab === 'summary' && (transcript.summary || isSummarizing) && (
            <>
              {transcript.summary && <CopyButton text={summaryToPlainText(transcript.summary)} />}
              <Button variant="ghost" size="xs" onClick={handleRegenerateSummary} disabled={isSummarizing || !apiKey}>
                <RefreshCw /> Regenerate
              </Button>
            </>
          )}
          {subTab === 'raw' && !isEditingRaw && transcript.rawText && (
            <>
              <CopyButton text={transcript.rawText} />
              <Button variant="ghost" size="xs" onClick={handleInsertIntoNote}>
                <FileText /> Insert into note
              </Button>
              <Button variant="ghost" size="xs" onClick={handleInsertAsTab} title="Add the transcript to the note as a new tab">
                <Plus /> As tab
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setEditedRawText(transcript.rawText ?? '');
                  setIsEditingRaw(true);
                }}
              >
                <Pencil /> Edit
              </Button>
            </>
          )}
          {subTab === 'raw' && isEditingRaw && (
            <>
              <Button
                size="xs"
                onClick={() => {
                  updateTranscript(noteId, transcript.id, { rawText: editedRawText });
                  setIsEditingRaw(false);
                }}
              >
                <Check /> Save
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setIsEditingRaw(false)}>
                Cancel
              </Button>
            </>
          )}
          <span className="flex-1" />
          {!isRecording && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onStartNew}
              title="Start a new recording for this note"
              className="bg-recording-soft text-recording hover:bg-recording-soft hover:text-recording hover:opacity-80"
            >
              <span className="size-1.5 rounded-full bg-current" /> New recording
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────
export function TranscriptTab() {
  const note = useStore((s) => s.notes.find((n) => n.id === s.activeNoteId));
  const allNotes = useStore((s) => s.notes);
  const isRecording = useStore((s) => s.transcriptRecording);
  const openaiApiKey = useStore((s) => s.settings.openaiApiKey);
  const groqApiKey = useStore((s) => s.settings.groqApiKey);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const autoSummarize = useStore((s) => s.settings.autoSummarize);
  const chunkSeconds = useStore((s) => s.settings.chunkIntervalSeconds);

  const [mode, setMode] = useState<TranscriptionMode>(
    () => useStore.getState().settings.defaultAudioMode,
  );
  const [showStartScreen, setShowStartScreen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveText, setLiveText] = useState('');
  // Which transcript is open in detail view (null = list view)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const liveScrollRef = useRef<HTMLDivElement>(null);
  // Captures the note ID at recording start so handleStop always writes summary to the right note
  const recordingNoteIdRef = useRef<string>('');
  // Captures wall-clock start time so the elapsed timer never resets when switching notes
  const recordingStartTimeRef = useRef<number>(0);

  const { start, stop, visualizerStream, subscribeLevels, status, engine, transcriptIdRef } = useTranscription({
    noteId: note?.id ?? '',
    apiKey: groqApiKey,
    mode,
  });

  const transcripts = note?.transcripts ?? [];
  const hasTranscripts = transcripts.length > 0;

  // Look up the in-progress transcript from ALL notes so it survives switching the active note
  const inProgressTranscript = isRecording
    ? allNotes.flatMap((n) => n.transcripts ?? []).find((t) => t.id === transcriptIdRef.current)
    : transcripts.find((t) => t.id === transcriptIdRef.current);

  // When a new recording starts, open the live view for that transcript
  useEffect(() => {
    if (isRecording && transcriptIdRef.current) {
      setSelectedId(transcriptIdRef.current);
    }
  }, [isRecording, transcriptIdRef]);

  // After recording stops, stay on the just-finished transcript
  const prevRecordingRef = useRef(isRecording);
  useEffect(() => {
    if (prevRecordingRef.current && !isRecording && transcriptIdRef.current) {
      setSelectedId(transcriptIdRef.current);
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording, transcriptIdRef]);

  // Elapsed timer — driven by a ref set at start so it never resets when switching notes/projects
  useEffect(() => {
    if (!isRecording) { setElapsed(0); return; }
    const startTime = recordingStartTimeRef.current;
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [isRecording]);

  // Auto-scroll the live transcript
  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveText, inProgressTranscript?.rawText]);

  const handleStart = useCallback(async () => {
    setShowStartScreen(false);
    setElapsed(0);
    setLiveText('');
    recordingNoteIdRef.current = note?.id ?? '';
    recordingStartTimeRef.current = Date.now();
    setStarting(true);
    const ok = await start(setLiveText).finally(() => setStarting(false));
    if (ok && transcriptIdRef.current) {
      setSelectedId(transcriptIdRef.current);
    }
  }, [start, transcriptIdRef, note?.id]);

  useEffect(() => {
    const handler = () => { if (!isRecording) handleStart(); };
    window.addEventListener('teams:autostart', handler);
    return () => window.removeEventListener('teams:autostart', handler);
  }, [handleStart, isRecording]);

  const handleStop = useCallback(async () => {
    // Capture the note ID now — before stop() clears any state — using the ref set at start
    const noteIdForSummary = recordingNoteIdRef.current;
    const rawText = await stop();
    setLiveText('');
    const tid = transcriptIdRef.current;
    if (rawText && autoSummarize && openaiApiKey && noteIdForSummary && tid) {
      // The raw transcript is already saved; the summary is best-effort and shared with the
      // detail view (one request per transcript).
      requestSummary(noteIdForSummary, tid).catch((error: Error) =>
        toast.error('Summary could not be generated', { description: `${error.message} The transcript is saved.` }));
    }
  }, [stop, autoSummarize, openaiApiKey, transcriptIdRef]);

  // Show recording UI even when the active note has changed (user navigated away mid-recording)
  if (!note && !isRecording) return null;

  // ── Recording state ─────────────────────────────────────────────────────
  if (isRecording) {
    const displayedLive = (inProgressTranscript?.rawText ?? '') + (liveText ? liveText : '');
    return (
      <div className="flex flex-col gap-4 p-3">
        <div className="flex flex-col gap-3.5 rounded-xl border bg-card p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-recording" />
            <span className="text-ui font-semibold">Recording</span>
            <span className="flex-1" />
            <span className="font-mono text-ui text-subtle-foreground tabular-nums">{formatDuration(elapsed)}</span>
          </div>
          <AudioVisualizer stream={visualizerStream} subscribeLevels={subscribeLevels} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {mode === 'system' ? <Volume2 className="size-3.5" /> : <Mic className="size-3.5" />}
            {mode === 'system' ? 'All audio (system)' : 'Microphone'} · {engine === 'whisper' ? 'Groq Whisper' : 'online speech recognition'}
          </div>
          <Button variant="destructive" size="sm" onClick={handleStop}>
            <Square className="size-3 fill-current" /> Stop recording
          </Button>
        </div>

        <div className="flex flex-col gap-2 px-1">
          <span className="text-xs font-medium text-muted-foreground">Live transcript</span>
          <div ref={liveScrollRef} className="max-h-[50vh] overflow-y-auto">
            {displayedLive ? (
              <p className="text-ui leading-relaxed whitespace-pre-wrap">
                {displayedLive}
                {liveText && <span className="text-muted-foreground italic"> {liveText}</span>}
              </p>
            ) : (
              <p className="text-ui text-muted-foreground italic">Listening…</p>
            )}
            {status ? (
              <p role="status" className={cn('mt-3 text-2xs', status.tone === 'error' ? 'text-destructive' : status.tone === 'warning' ? 'text-warning' : 'text-muted-foreground')}>
                {status.message}
              </p>
            ) : (
              engine === 'whisper' && <p className="mt-3 text-2xs text-muted-foreground">Transcribing in batches via Groq Whisper every {chunkSeconds} s…</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Start / mode selection screen ───────────────────────────────────────
  if (!hasTranscripts || showStartScreen) {
    return (
      <div className="flex flex-col gap-4 p-3">
        <div className="flex items-center justify-between">
          {hasTranscripts ? (
            <Button variant="ghost" size="xs" onClick={() => setShowStartScreen(false)} className="-ml-1 text-muted-foreground">
              <ChevronLeft /> Back
            </Button>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">Record this meeting</span>
          )}
          <Button variant="ghost" size="icon-xs" onClick={toggleSettings} title="Open settings" aria-label="Open settings" className="text-muted-foreground">
            <Settings />
          </Button>
        </div>

        {!hasTranscripts && (
          <p className="-mt-2 px-0.5 text-xs text-muted-foreground">Transcribe audio and generate an AI summary when done.</p>
        )}

        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(v) => v && setMode(v as TranscriptionMode)}
          className="grid w-full grid-cols-2"
          aria-label="Audio source"
        >
          <ToggleGroupItem value="mic" className="text-xs">
            <Mic /> Mic only
          </ToggleGroupItem>
          <ToggleGroupItem value="system" className="text-xs">
            <Volume2 /> All audio
          </ToggleGroupItem>
        </ToggleGroup>

        {mode === 'system' && (
          <div className={cn('flex flex-col gap-1 rounded-lg border p-3 text-xs', groqApiKey ? 'bg-card' : 'bg-warning-soft border-transparent')}>
            <p className="font-medium">Captures all computer audio, including remote participants.</p>
            <p className="text-muted-foreground">Audio is sent to Groq for transcription every {chunkSeconds} s. No audio is stored by HiveMind.</p>
            {!groqApiKey && (
              <Button variant="link" size="xs" onClick={toggleSettings} className="h-auto self-start p-0 text-warning">
                Add Groq API key in Settings →
              </Button>
            )}
            {groqApiKey && (
              <p className="flex items-center gap-1.5 text-success">
                <Check className="size-3.5" /> Groq API key configured
              </p>
            )}
          </div>
        )}

        {mode === 'mic' && (
          <p className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
            Microphone only. Uses the browser’s online speech recognition where available (in Chromium this sends audio to Google);
            in the desktop app that service is usually unavailable, so audio is sent to Groq Whisper with your Groq key.
          </p>
        )}

        <p className="px-0.5 text-2xs leading-relaxed text-muted-foreground">
          {openaiApiKey && autoSummarize
            ? 'When you stop, the transcript is sent to OpenAI for a summary (change in Settings). '
            : 'Summaries are generated only when you ask. '}
          Make sure participants agree to being recorded and that your agreements (e.g. NDAs) allow sharing the content with these services.
        </p>

        <Button variant="destructive" onClick={handleStart} disabled={starting || (mode === 'system' && !groqApiKey)}>
          <span className="size-2 rounded-full bg-white" /> {starting ? 'Starting…' : 'Start recording'}
        </Button>

        {note && (
          <TranscriptImport
            noteId={note.id}
            meetingTime={note.createdAt}
            onImported={(id) => { setShowStartScreen(false); setSelectedId(id); }}
          />
        )}
      </div>
    );
  }
  // ── Transcript detail ───────────────────────────────────────────────────
  const selectedTranscript = selectedId
    ? transcripts.find((t) => t.id === selectedId)
    : null;

  if (selectedTranscript && note) {
    return (
      <TranscriptDetail
        transcript={selectedTranscript}
        noteId={note.id}
        apiKey={openaiApiKey}
        onBack={() => setSelectedId(null)}
        onStartNew={() => { setSelectedId(null); setShowStartScreen(true); }}
        isRecording={isRecording}
      />
    );
  }

  // ── Transcript list ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
        <span className="flex-1 text-xs font-medium text-muted-foreground">Recordings in this note</span>
        <span className="text-2xs text-muted-foreground tabular-nums">{transcripts.length}</span>
        <Button variant="ghost" size="icon-xs" onClick={toggleSettings} title="Open settings" aria-label="Open settings" className="text-muted-foreground">
          <Settings />
        </Button>
      </div>

      <div className="flex flex-col gap-0.5 px-2">
        {[...transcripts]
          .sort((a, b) => b.recordedAt - a.recordedAt)
          .map((t, i, arr) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className="group/rec flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-ui font-medium">{i === 0 ? 'Latest' : `Recording ${arr.length - i}`}</span>
                  {t.summary && (
                    <span className="inline-flex h-4.5 items-center gap-1 rounded-full bg-ai-soft px-1.5 text-2xs font-medium text-ai">
                      <Sparkles className="size-2.5" /> Summary
                    </span>
                  )}
                </div>
                <div className="font-mono text-2xs text-muted-foreground">
                  {t.recordedAt ? format(new Date(t.recordedAt), 'MMM d, HH:mm') : '–'}
                  {t.duration ? ` · ${formatDuration(t.duration)}` : ''}
                </div>
                {t.rawText && <p className="mt-0.5 truncate text-2xs text-muted-foreground">{t.rawText.slice(0, 80)}…</p>}
              </div>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
      </div>

      <div className="p-3">
        <Button variant="destructive" className="w-full" onClick={() => setShowStartScreen(true)}>
          <span className="size-2 rounded-full bg-white" /> New recording
        </Button>
      </div>
    </div>
  );
}
