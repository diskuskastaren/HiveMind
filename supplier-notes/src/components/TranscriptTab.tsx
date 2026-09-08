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
} from 'lucide-react';
import { format } from 'date-fns';
import { useStore } from '../store/store';
import { useTranscription, type TranscriptionMode } from '../hooks/useTranscription';
import { summarizeMeetingTranscript, MAX_SUMMARY_TOKENS } from '../utils/summarize';
import { getMailtoUrl, summaryToPlainTextForEmail, summaryToHtmlForEmail } from '../utils/export';
import { AudioVisualizer } from './AudioVisualizer';
import type { Transcript } from '../types';

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
    .replace(/^## (.+)$/gm, '<p class="font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1 first:mt-0">$1</p>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-700 dark:text-gray-300 leading-snug">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return { __html: html };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {transcript.duration != null ? formatDuration(transcript.duration) : '–'}
          {transcript.recordedAt
            ? ` · ${format(new Date(transcript.recordedAt), 'MMM d, HH:mm')}`
            : ''}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleDelete}
          className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 rounded transition-colors"
          title="Delete this recording"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        {(['summary', 'raw'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              subTab === t
                ? 'text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {t === 'summary' ? 'Summary' : 'Raw Transcript'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {subTab === 'summary' && (
          <>
            {isSummarizing && (
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Generating summary…
              </div>
            )}
            {!isSummarizing && transcript.summary && (
              <div
                className="text-sm leading-relaxed"
                dangerouslySetInnerHTML={renderSummary(transcript.summary)}
              />
            )}
            {!isSummarizing && !transcript.summary && (
              <div className="text-center py-6 space-y-2">
                {summarizeError && (
                  <p className="text-xs text-red-400 dark:text-red-400">{summarizeError}</p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {apiKey ? 'No summary generated yet.' : 'Add an OpenAI API key to generate summaries.'}
                </p>
                {apiKey ? (
                  <button
                    onClick={handleRegenerateSummary}
                    className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Generate summary
                  </button>
                ) : null}
              </div>
            )}
          </>
        )}

        {subTab === 'raw' && (
          isEditingRaw
            ? <textarea
                className="w-full h-full text-sm text-gray-700 dark:text-gray-300 leading-relaxed resize-none border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-800"
                value={editedRawText}
                onChange={(e) => setEditedRawText(e.target.value)}
                autoFocus
              />
            : <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {transcript.rawText ?? ''}
              </p>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 pt-2.5 pb-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2 flex-shrink-0">
        {subTab === 'summary' && transcript.summary && (
          <div className="flex gap-2">
            <button
              onClick={handleAddSummaryToNote}
              className="flex-1 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <FileText className="w-3 h-3 flex-shrink-0" /> Add summary to note
            </button>
            <button
              onClick={handleEmailSummary}
              className="flex-1 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              title="Open default mail app with summary in body"
            >
              <Mail className="w-3 h-3 flex-shrink-0" /> Email summary
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          {subTab === 'summary' && (transcript.summary || isSummarizing) && (
            <>
              {transcript.summary && <CopyButton text={transcript.summary} />}
              <button
                onClick={handleRegenerateSummary}
                disabled={isSummarizing || !apiKey}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate
              </button>
            </>
          )}
          {subTab === 'raw' && !isEditingRaw && transcript.rawText && (
            <>
              <CopyButton text={transcript.rawText} />
              <button
                onClick={handleInsertIntoNote}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <FileText className="w-3 h-3" /> Insert into note
              </button>
              <button
                onClick={() => { setEditedRawText(transcript.rawText ?? ''); setIsEditingRaw(true); }}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </>
          )}
          {subTab === 'raw' && isEditingRaw && (
            <>
              <button
                onClick={() => { updateTranscript(noteId, transcript.id, { rawText: editedRawText }); setIsEditingRaw(false); }}
                className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
              >
                <Check className="w-3 h-3" /> Save
              </button>
              <button
                onClick={() => setIsEditingRaw(false)}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          <div className="flex-1" />
          {!isRecording && (
            <button
              onClick={onStartNew}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Start a new recording for this note"
            >
              <Mic className="w-3 h-3" /> New recording
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Transcript list view ─────────────────────────────────────────────────────
interface TranscriptListProps {
  transcripts: Transcript[];
  onSelect: (id: string) => void;
  onStartNew: () => void;
  isRecording: boolean;
}

function TranscriptList({ transcripts, onSelect, onStartNew, isRecording }: TranscriptListProps) {
  // Newest first
  const sorted = [...transcripts].sort((a, b) => b.recordedAt - a.recordedAt);
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center flex-shrink-0">
        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex-1">
          Recordings
        </span>
        <span className="text-[10px] text-gray-300 dark:text-gray-600">{transcripts.length} total</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.map((t, i) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="w-full text-left px-4 py-3 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3 group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {i === 0 ? 'Latest' : `Recording ${sorted.length - i}`}
                </span>
                {t.summary && (
                  <span className="text-[9px] bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                    AI summary
                  </span>
                )}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">
                {t.recordedAt ? format(new Date(t.recordedAt), 'MMM d, HH:mm') : '–'}
                {t.duration ? ` · ${formatDuration(t.duration)}` : ''}
              </div>
              {t.rawText && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 truncate leading-relaxed">
                  {t.rawText.slice(0, 80)}…
                </p>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 flex-shrink-0 transition-colors" />
          </button>
        ))}
      </div>

      {!isRecording && (
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={onStartNew}
            className="w-full py-2 text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
          >
            <Mic className="w-4 h-4" /> New Recording
          </button>
        </div>
      )}
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
    maxTokens: s.settings.maxTokens,
    autoMaxTokens: s.settings.autoMaxTokens,
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
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold text-red-500">REC</span>
          {mode === 'system' && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
              System audio
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto tabular-nums">{formatDuration(elapsed)}</span>
        </div>

        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <AudioVisualizer stream={visualizerStream} levels={visualizerLevels} />
        </div>

        <div ref={liveScrollRef} className="flex-1 overflow-y-auto p-4">
          {displayedLive ? (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
              {displayedLive}
              {liveText && <span className="text-gray-400 dark:text-gray-500 italic"> {liveText}</span>}
            </p>
          ) : (
            <p className="text-sm text-gray-300 dark:text-gray-600 italic">Listening…</p>
          )}
          {debugStatus ? (
            <p className="text-[10px] text-amber-500 mt-3 font-mono">{debugStatus}</p>
          ) : mode === 'system' && (
            <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-3">
              Transcribing in batches via Groq Whisper…
            </p>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={handleStop}
            className="w-full py-2 text-sm font-medium bg-gray-800 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
          >
            <Square className="w-3.5 h-3.5 fill-current" /> Stop Recording
          </button>
        </div>
      </div>
    );
  }

  // ── Start / mode selection screen ───────────────────────────────────────
  if (!hasTranscripts || showStartScreen) {
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          {hasTranscripts ? (
            <button
              onClick={() => setShowStartScreen(false)}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Transcript
            </span>
          )}
          <button
            onClick={toggleSettings}
            className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 rounded transition-colors"
            title="Open settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {!hasTranscripts && (
          <div className="text-center py-2">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <Mic className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Record this meeting</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              Transcribe audio and generate an AI summary when done
            </p>
          </div>
        )}

        {/* Mode toggle */}
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex gap-1">
          <button
            onClick={() => setMode('mic')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors ${
              mode === 'mic'
                ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Mic className="w-3 h-3" /> Mic only
          </button>
          <button
            onClick={() => setMode('system')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors ${
              mode === 'system'
                ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Volume2 className="w-3 h-3" /> All audio
          </button>
        </div>

        {mode === 'system' && (
          <div className="text-xs bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 space-y-1">
            <p className="font-medium text-gray-700 dark:text-gray-200">Groq API key needed to transcribe</p>
            {!groqApiKey && (
              <button
                onClick={toggleSettings}
                className="text-gray-600 dark:text-gray-300 underline underline-offset-2 mt-1"
              >
                Add Groq API key in Settings →
              </button>
            )}
            {groqApiKey && <p className="text-green-600 dark:text-green-400 font-medium">✓ Groq API key configured</p>}
          </div>
        )}

        {mode === 'mic' && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
            Transcribes your microphone in real-time. Free — no API key needed.
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={mode === 'system' && !groqApiKey}
          className="w-full py-2 text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Mic className="w-4 h-4" /> Start Recording
        </button>
      </div>
    );
  }

  // ── Transcript detail ───────────────────────────────────────────────────
  const selectedTranscript = selectedId
    ? transcripts.find((t) => t.id === selectedId)
    : null;

  if (selectedTranscript) {
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
    <div className="flex flex-col h-full">
      {/* List header with settings */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center flex-shrink-0">
        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex-1">
          Recordings
        </span>
        <span className="text-[10px] text-gray-300 dark:text-gray-600 mr-2">{transcripts.length} total</span>
        <button
          onClick={toggleSettings}
          className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 rounded transition-colors"
          title="Open settings"
        >
          <Settings className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {[...transcripts]
          .sort((a, b) => b.recordedAt - a.recordedAt)
          .map((t, i, arr) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className="w-full text-left px-4 py-3 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3 group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {i === 0 ? 'Latest' : `Recording ${arr.length - i}`}
                  </span>
                  {t.summary && (
                    <span className="text-[9px] bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                      AI summary
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500">
                  {t.recordedAt ? format(new Date(t.recordedAt), 'MMM d, HH:mm') : '–'}
                  {t.duration ? ` · ${formatDuration(t.duration)}` : ''}
                </div>
                {t.rawText && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 truncate leading-relaxed">
                    {t.rawText.slice(0, 80)}…
                  </p>
                )}
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 flex-shrink-0 transition-colors" />
            </button>
          ))}
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
        <button
          onClick={() => setShowStartScreen(true)}
          className="w-full py-2 text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <Mic className="w-4 h-4" /> New Recording
        </button>
      </div>
    </div>
  );
}
