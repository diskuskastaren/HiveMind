import { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useStore } from '../store/store';
import { useTranscription, type TranscriptionMode } from '../hooks/useTranscription';
import { summarizeMeetingTranscript, MAX_SUMMARY_TOKENS } from '../utils/summarize';
import { getMailtoUrl, summaryToPlainTextForEmail, summaryToHtmlForEmail } from '../utils/export';
import { AudioVisualizer } from './AudioVisualizer';
import type { Transcript } from '../types';
import { MeetingReview } from './MeetingReview';

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

/** Very simple markdown → HTML for the AI summary output */
function renderSummary(md: string) {
  const html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm, '<p class="font-semibold mt-3 mb-1 first:mt-0">$1</p>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc leading-snug text-subtle-foreground">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return { __html: html };
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
  const updateNote = useStore((s) => s.updateNote);
  const openConfirmDialog = useStore((s) => s.openConfirmDialog);
  const summarySettings = useStore(useShallow((s) => ({
    model: s.settings.gptModel,
    temperature: s.settings.temperature,
    customInstructions: s.settings.customSummaryInstructions,
  })));

  const [subTab, setSubTab] = useState<'summary' | 'raw'>('summary');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState('');
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [editedRawText, setEditedRawText] = useState('');

  // Reset edit mode when the user navigates to a different transcript
  useEffect(() => {
    setIsEditingRaw(false);
    setEditedRawText('');
  }, [transcript.id]);

  const handleRegenerateSummary = useCallback(async () => {
    if (!transcript.rawText || !apiKey) return;
    setIsSummarizing(true);
    setSummarizeError('');
    try {
      const summary = await summarizeMeetingTranscript(transcript.rawText, apiKey, {
        ...summarySettings,
        maxTokens: MAX_SUMMARY_TOKENS,
      });
      updateTranscript(noteId, transcript.id, { summary });
    } catch (e: any) {
      setSummarizeError(e?.message ?? 'Summarization failed');
    }
    setIsSummarizing(false);
  }, [transcript, apiKey, summarySettings, noteId, updateTranscript]);

  const handleInsertIntoNote = useCallback(() => {
    if (!transcript.rawText || !note) return;
    const section = `<h2>Meeting Transcript</h2><p style="white-space:pre-wrap">${transcript.rawText.trim()}</p>`;
    updateNote(noteId, { content: (note.content || '') + section });
  }, [transcript, note, noteId, updateNote]);

  const handleAddSummaryToNote = useCallback(() => {
    if (!transcript.summary || !note) return;
    const html = renderSummary(transcript.summary).__html;
    const section = `<h2>Meeting Summary</h2>${html}`;
    updateNote(noteId, { content: (note.content || '') + section });
  }, [transcript, note, noteId, updateNote]);

  const handleEmailSummary = useCallback(() => {
    if (!transcript.summary || !note) return;
    const projectNames = (note.projectIds || [])
      .map((id) => projects.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];
    const baseSubject = note.title ? `Meeting summary: ${note.title}` : 'Meeting summary';
    const subject = projectNames.length > 0 ? `[${projectNames.join(', ')}] - ${baseSubject}` : baseSubject;
    const outlookOpen = (window as any).electronOutlookMail?.open;
    if (typeof outlookOpen === 'function') {
      outlookOpen(subject, summaryToHtmlForEmail(transcript.summary));
    } else {
      const url = getMailtoUrl(subject, summaryToPlainTextForEmail(transcript.summary));
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

  // Auto-trigger summary generation when arriving at a transcript that has text but no summary
  useEffect(() => {
    if (transcript.rawText && !transcript.summary && !isSummarizing && apiKey) {
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
            {!isSummarizing && transcript.summary && <div dangerouslySetInnerHTML={renderSummary(transcript.summary)} />}
            {!isSummarizing && !transcript.summary && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                {summarizeError && <p className="text-xs text-destructive">{summarizeError}</p>}
                <p className="text-xs text-muted-foreground">
                  {apiKey ? 'No summary generated yet.' : 'Add an OpenAI API key to generate summaries.'}
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
            <Button variant="outline" size="xs" className="flex-1" onClick={handleEmailSummary} title="Open default mail app with summary in body">
              <Mail /> Email summary
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {subTab === 'summary' && (transcript.summary || isSummarizing) && (
            <>
              {transcript.summary && <CopyButton text={transcript.summary} />}
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
  const updateTranscript = useStore((s) => s.updateTranscript);
  const openaiApiKey = useStore((s) => s.settings.openaiApiKey);
  const groqApiKey = useStore((s) => s.settings.groqApiKey);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const summarySettings = useStore(useShallow((s) => ({
    model: s.settings.gptModel,
    temperature: s.settings.temperature,
    customInstructions: s.settings.customSummaryInstructions,
  })));

  const [mode, setMode] = useState<TranscriptionMode>(
    () => useStore.getState().settings.defaultAudioMode,
  );
  const [showStartScreen, setShowStartScreen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveText, setLiveText] = useState('');
  // Which transcript is open in detail view (null = list view)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const liveScrollRef = useRef<HTMLDivElement>(null);
  // Captures the note ID at recording start so handleStop always writes summary to the right note
  const recordingNoteIdRef = useRef<string>('');
  // Captures wall-clock start time so the elapsed timer never resets when switching notes
  const recordingStartTimeRef = useRef<number>(0);

  const { start, stop, visualizerStream, visualizerLevels, debugStatus, transcriptIdRef } = useTranscription({
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
    // #region agent log
    try { (window as any).electronDebug?.log({sessionId:'6cf3ea',location:'TranscriptTab.tsx:handleStart',message:'handleStart called',data:{noteId:note?.id,isRecording,mode},timestamp:Date.now(),hypothesisId:'H-RENDERER'}); } catch {}
    // #endregion
    const ok = await start(setLiveText);
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
    if (rawText && openaiApiKey && noteIdForSummary && tid) {
      try {
        const summary = await summarizeMeetingTranscript(rawText, openaiApiKey, {
          ...summarySettings,
          maxTokens: MAX_SUMMARY_TOKENS,
        });
        updateTranscript(noteIdForSummary, tid, { summary });
      } catch {
        // Summary generation is best-effort; the raw text is already saved
      }
    }
  }, [stop, openaiApiKey, summarySettings, updateTranscript, transcriptIdRef]);

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
          <AudioVisualizer stream={visualizerStream} levels={visualizerLevels} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {mode === 'system' ? <Volume2 className="size-3.5" /> : <Mic className="size-3.5" />}
            {mode === 'system' ? 'All audio (system) · Groq Whisper' : 'Microphone · built-in speech recognition'}
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
            {debugStatus ? (
              <p className="mt-3 font-mono text-2xs text-warning">{debugStatus}</p>
            ) : (
              mode === 'system' && <p className="mt-3 text-2xs text-muted-foreground">Transcribing in batches via Groq Whisper…</p>
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
            <p className="font-medium">Captures remote participants too. Transcribed via Groq Whisper.</p>
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
            Transcribes your microphone in real time with built-in speech recognition. Free — no API key needed.
          </p>
        )}

        <Button variant="destructive" onClick={handleStart} disabled={mode === 'system' && !groqApiKey}>
          <span className="size-2 rounded-full bg-white" /> Start recording
        </Button>
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
