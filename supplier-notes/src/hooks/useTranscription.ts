import { useRef, useCallback, useState } from 'react';
import { useStore } from '../store/store';
import { transcribeAudioChunk } from '../utils/summarize';
import type { Transcript } from '../types';

// Dual-channel debug logger: IPC file + console (works regardless of preload version)
function dbg(payload: Record<string, unknown>) {
  console.error('[transcript-debug]', JSON.stringify(payload));
  try { (window as any).electronDebug?.log({sessionId:'0a018f',...payload,timestamp:Date.now()}); } catch {}
}

export type TranscriptionMode = 'mic' | 'system';

interface UseTranscriptionOptions {
  noteId: string;
  apiKey: string;
  mode: TranscriptionMode;
}

export function useTranscription({ noteId, apiKey, mode }: UseTranscriptionOptions) {
  const addTranscript = useStore((s) => s.addTranscript);
  const updateTranscript = useStore((s) => s.updateTranscript);
  const setTranscriptRecording = useStore((s) => s.setTranscriptRecording);
  const setRecordingNote = useStore((s) => s.setRecordingNote);

  // Capture the noteId at start time so recording always saves to the right note
  const recordingNoteIdRef = useRef('');
  // Each recording session gets its own transcript entry in the note
  const transcriptIdRef = useRef('');
  const accumulatedRef = useRef('');
  const startTimeRef = useRef(0);
  const isRecordingRef = useRef(false);

  // Reactive stream exposed to the visualizer — set on start, cleared on stop
  const [visualizerStream, setVisualizerStream] = useState<MediaStream | null>(null);
  // Frequency level data forwarded from the hidden capture window (system mode only)
  const [visualizerLevels, setVisualizerLevels] = useState<number[] | null>(null);
  // Human-readable status shown in the UI for debugging
  const [debugStatus, setDebugStatus] = useState('');

  // Mic mode refs
  const recognitionRef = useRef<any>(null);
  // Separate mic stream just for the audio visualizer (Speech Recognition doesn't expose its stream)
  const micStreamRef = useRef<MediaStream | null>(null);

  // System audio mode refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // WebM init segment (first ondataavailable chunk) — must be prepended to every batch blob
  // so that Whisper receives a valid WebM file regardless of which batch it is
  const sysInitChunkRef = useRef<Blob | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // System-audio capture via hidden BrowserWindow (avoids GPU crash in main renderer)
  const isSystemModeRef           = useRef(false);
  const captureMimeTypeRef        = useRef('audio/webm');
  const captureChunkHandlerRef    = useRef<((buf: ArrayBuffer) => void) | null>(null);
  const captureErrorHandlerRef    = useRef<((msg: string) => void) | null>(null);
  const captureLevelsHandlerRef   = useRef<((data: number[]) => void) | null>(null);

  // Auto-stop safety net — fires after 4 hours in case the user forgets to stop
  const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to the stop function so the auto-stop timeout always calls the latest version
  const stopRef = useRef<() => Promise<string>>(async () => '');

  // liveText state is managed via a callback so the component can track it
  const liveTextCallbackRef = useRef<(text: string) => void>(() => {});
  // Keep apiKey accessible inside async callbacks without stale closures
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;
  // Flag set when Web Speech API fails with a network error so onend doesn't auto-restart
  const speechNetworkFailedRef = useRef(false);

  const saveProgress = useCallback((extra?: { duration?: number }) => {
    const noteId = recordingNoteIdRef.current;
    const tid = transcriptIdRef.current;
    if (!noteId || !tid) return;
    updateTranscript(noteId, tid, {
      rawText: accumulatedRef.current,
      duration: extra?.duration ?? Math.floor((Date.now() - startTimeRef.current) / 1000),
    });
  }, [updateTranscript]);

  const appendText = useCallback((text: string) => {
    accumulatedRef.current += text;
    // #region agent log
    dbg({location:'useTranscription.ts:appendText',message:'appendText called',data:{textLen:text.length,noteId:recordingNoteIdRef.current,totalLength:accumulatedRef.current.length},hypothesisId:'H-E'});
    // #endregion
    saveProgress();
  }, [saveProgress]);

  // Fallback: record mic via MediaRecorder → Whisper when Speech API has no network access
  const startMicWhisperFallback = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream) return;
    const key = apiKeyRef.current;
    if (!key) {
      isRecordingRef.current = false;
      setTranscriptRecording(false);
      alert(
        'Mic transcription needs internet access to Google\'s speech servers, which is unavailable.\n\n' +
        'To transcribe offline, add an OpenAI API key in Transcript Settings — it will record your mic directly via OpenAI transcription.',
      );
      return;
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      // #region agent log
      dbg({location:'useTranscription.ts:ondataavailable',message:'audio chunk received',data:{size:e.data.size,chunkCount:audioChunksRef.current.length+1},hypothesisId:'H-F'});
      // #endregion
      if (e.data.size > 0) {
        if (!sysInitChunkRef.current) {
          sysInitChunkRef.current = e.data;
        } else {
          audioChunksRef.current.push(e.data);
        }
      }
    };
    const processChunks = async () => {
      if (audioChunksRef.current.length === 0) return;
      const chunks = audioChunksRef.current;
      audioChunksRef.current = [];
      const parts = sysInitChunkRef.current ? [sysInitChunkRef.current, ...chunks] : chunks;
      const blob = new Blob(parts, { type: mimeType });
      try {
        const text = await transcribeAudioChunk(blob, key);
        if (text) {
          appendText(text + ' ');
          setDebugStatus('Whisper: transcribed chunk');
        }
      } catch (err: any) {
        const msg = String(err);
        // #region agent log
        dbg({location:'useTranscription.ts:processChunks-error',message:'Whisper interval call failed',data:{error:msg},hypothesisId:'H-H'});
        // #endregion
        const friendly = msg.includes('429') || msg.includes('quota')
          ? 'OpenAI quota exceeded — add credits at platform.openai.com/account/billing'
          : `Whisper error: ${msg.slice(0, 80)}`;
        setDebugStatus(friendly);
      }
    };
    recorder.start(1000);
    const chunkMs = useStore.getState().settings.chunkIntervalSeconds * 1000;
    chunkIntervalRef.current = setInterval(processChunks, chunkMs);
    // #region agent log
    dbg({location:'useTranscription.ts:startMicWhisperFallback',message:'Switched to Whisper mic fallback',data:{hasStream:true,hasKey:!!key,chunkMs},hypothesisId:'H-D'});
    setDebugStatus(`Whisper mic fallback active — processing every ${chunkMs / 1000}s`);
    // #endregion
  }, [appendText, setTranscriptRecording, setDebugStatus, setVisualizerStream]);

  const startMicRecording = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    // #region agent log
    dbg({location:'useTranscription.ts:startMicRecording-entry',message:'SR availability check',data:{SpeechRecognition:typeof (window as any).SpeechRecognition,webkitSpeechRecognition:typeof (window as any).webkitSpeechRecognition,SRFound:!!SR,noteId:recordingNoteIdRef.current},hypothesisId:'H-A,H-E'});
    setDebugStatus('SR: starting…');
    // #endregion
    if (!SR) {
      alert('Speech recognition is not supported. Try running in Electron or a Chromium-based browser.');
      return false;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          // #region agent log
          dbg({location:'useTranscription.ts:onresult-final',message:'Final transcript result',data:{textLen:text.length,noteId:recordingNoteIdRef.current},hypothesisId:'H-D,H-E'});
          setDebugStatus(`SR: got result (${text.slice(0,30)}…)`);
          // #endregion
          appendText(text + ' ');
          interim = '';
        } else {
          interim += text;
        }
      }
      liveTextCallbackRef.current(interim);
    };

    recognition.onend = () => {
      liveTextCallbackRef.current('');
      if (!isRecordingRef.current) return;
      if (speechNetworkFailedRef.current) {
        // Network unavailable — fall back to Whisper on the mic stream
        speechNetworkFailedRef.current = false;
        recognitionRef.current = null;
        startMicWhisperFallback();
        return;
      }
      // Normal silence timeout — restart
      try { recognition.start(); } catch { /* already started */ }
    };

    recognition.onerror = (e: any) => {
      // #region agent log
      dbg({location:'useTranscription.ts:recognition.onerror',message:'SpeechRecognition error',data:{error:e.error},hypothesisId:'H-B,H-C,H-D'});
      setDebugStatus(`SR error: ${e.error}`);
      // #endregion
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      console.warn('Speech recognition error:', e.error);
      if (e.error === 'not-allowed') {
        isRecordingRef.current = false;
        setTranscriptRecording(false);
        recognitionRef.current = null;
        alert(
          'Microphone access was denied.\n\n' +
          'Please restart the app — microphone permission has now been granted and will work on the next launch.',
        );
      } else if (e.error === 'network') {
        // Stop the auto-restart loop; onend will trigger the Whisper fallback
        speechNetworkFailedRef.current = true;
      } else if (e.error === 'service-not-allowed') {
        isRecordingRef.current = false;
        setTranscriptRecording(false);
        recognitionRef.current = null;
        alert('Speech recognition service is not available in this context. Try restarting the app.');
      }
    };

    try {
      recognition.start();
      // #region agent log
      dbg({location:'useTranscription.ts:recognition.start-success',message:'recognition.start() called without throwing',hypothesisId:'H-B'});
      setDebugStatus('SR: started OK, waiting for audio…');
      // #endregion
    } catch(err: any) {
      // #region agent log
      dbg({location:'useTranscription.ts:recognition.start-catch',message:'recognition.start() threw',data:{error:(err as any)?.message??String(err)},hypothesisId:'H-B'});
      setDebugStatus(`SR start threw: ${(err as any)?.message}`);
      // #endregion
      return false;
    }

    // Acquire a separate mic stream solely for the audio visualizer.
    // Speech Recognition manages its own internal stream and doesn't expose it.
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = micStream;
      setVisualizerStream(micStream);
    } catch {
      // Visualizer won't work but transcription still continues
    }

    return true;
  }, [appendText, startMicWhisperFallback, setDebugStatus]);

  const startSystemRecording = useCallback(async () => {
    const electronCapture = (window as any).electronCapture;
    if (!electronCapture) {
      alert('System audio capture is only available in the Electron app. Use "Mic only" mode in the browser.');
      return false;
    }
    if (!apiKey) {
      alert('An OpenAI API key is required for system audio transcription.\nAdd one in Transcript Settings.');
      return false;
    }

    try {
      const sources: Array<{ id: string; name: string }> = await electronCapture.getSources();
      const screen =
        sources.find((s) => /entire screen|screen 1|screen$/i.test(s.name)) ?? sources[0];

      if (!screen) throw new Error('No screen source found for audio capture');

      // Delegate getUserMedia to an isolated hidden BrowserWindow so that the
      // GPU-process crash (common when Teams is running) cannot take down the main app.
      const mimeType: string = await electronCapture.startCapture(screen.id);
      captureMimeTypeRef.current = mimeType;
      isSystemModeRef.current = true;

      // Accumulate audio chunk ArrayBuffers forwarded from the hidden window via IPC.
      const chunkHandler = (buf: ArrayBuffer) => {
        const blob = new Blob([buf], { type: mimeType });
        if (!sysInitChunkRef.current) {
          // First chunk is the WebM init segment — keep it as a header prefix.
          sysInitChunkRef.current = blob;
        } else {
          audioChunksRef.current.push(blob);
        }
      };
      electronCapture.onChunk(chunkHandler);
      captureChunkHandlerRef.current = chunkHandler;

      // Surface capture-window errors in the debug status bar.
      const errorHandler = (msg: string) => {
        setDebugStatus(`Capture error: ${msg}`);
      };
      electronCapture.onError(errorHandler);
      captureErrorHandlerRef.current = errorHandler;

      // Subscribe to frequency levels forwarded from the hidden capture window.
      // This reflects the real mixed audio (system + mic) instead of a plain mic stream.
      const levelsHandler = (data: number[]) => setVisualizerLevels(data);
      electronCapture.onLevels(levelsHandler);
      captureLevelsHandlerRef.current = levelsHandler;

      // Periodic Whisper transcription — same logic as before.
      const processChunks = async () => {
        if (audioChunksRef.current.length === 0) return;
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        const parts = sysInitChunkRef.current ? [sysInitChunkRef.current, ...chunks] : chunks;
        const blob = new Blob(parts, { type: mimeType });
        try {
          const text = await transcribeAudioChunk(blob, apiKey);
          if (text) appendText(text + ' ');
        } catch (e) {
          console.error('Whisper error:', e);
        }
      };

      const chunkMs = useStore.getState().settings.chunkIntervalSeconds * 1000;
      chunkIntervalRef.current = setInterval(processChunks, chunkMs);
      return true;
    } catch (e: any) {
      console.error('System audio capture failed:', e);
      isSystemModeRef.current = false;
      alert(`Failed to capture system audio: ${e?.message ?? 'Unknown error'}`);
      return false;
    }
  }, [apiKey, appendText, setDebugStatus]);

  const start = useCallback(
    async (onLiveText: (text: string) => void) => {
      // #region agent log
      try { (window as any).electronDebug?.log({sessionId:'6cf3ea',location:'useTranscription.ts:start',message:'start() called',data:{noteId,mode,hasApiKey:!!apiKeyRef.current},timestamp:Date.now(),hypothesisId:'H-RENDERER'}); } catch {}
      // #endregion
      recordingNoteIdRef.current = noteId;
      accumulatedRef.current = '';
      startTimeRef.current = Date.now();
      isRecordingRef.current = true;
      speechNetworkFailedRef.current = false;
      liveTextCallbackRef.current = onLiveText;

      // Create a new transcript entry for this recording session — previous ones are preserved
      const newId = crypto.randomUUID();
      transcriptIdRef.current = newId;
      const newTranscript: Transcript = { id: newId, rawText: '', duration: 0, recordedAt: Date.now() };
      addTranscript(noteId, newTranscript);

      let success = false;
      if (mode === 'system') {
        success = await startSystemRecording();
      } else {
        success = await startMicRecording();
      }

      if (!success) {
        isRecordingRef.current = false;
        return false;
      }

      setTranscriptRecording(true);
      setRecordingNote(noteId);

      // Safety net: auto-stop after the configured duration in case the user forgets
      const autoStopMs = useStore.getState().settings.autoStopHours * 60 * 60 * 1000;
      autoStopTimeoutRef.current = setTimeout(() => { stopRef.current(); }, autoStopMs);

      return true;
    },
    [noteId, mode, addTranscript, startMicRecording, startSystemRecording, setTranscriptRecording, setRecordingNote],
  );

  // Helper: stop a MediaRecorder and wait for its final ondataavailable + onstop
  const drainRecorder = (recorder: MediaRecorder): Promise<Blob[]> =>
    new Promise((resolve) => {
      const finalChunks: Blob[] = [];
      const origHandler = recorder.ondataavailable;
      recorder.ondataavailable = (e) => {
        origHandler?.call(recorder, e);
        if (e.data.size > 0) finalChunks.push(e.data);
      };
      recorder.onstop = () => resolve(finalChunks);
      recorder.stop();
    });

  const stop = useCallback(async () => {
    isRecordingRef.current = false;

    // Clear the 4-hour auto-stop safety timeout
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }

    // Stop Web Speech API
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Stop the periodic processing interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    const results: string[] = [];

    // ── System audio via hidden capture window ───────────────────────────────
    if (isSystemModeRef.current) {
      const electronCapture = (window as any).electronCapture;

      // Wait for the hidden window to flush its final audio chunk before we
      // remove the listener (stopCapture resolves only after capture:stopped).
      if (electronCapture) {
        try { await electronCapture.stopCapture(); } catch { /* window may have crashed */ }
      }

      // Now safe to remove handlers — no more chunks will arrive.
      if (captureChunkHandlerRef.current && electronCapture) {
        electronCapture.offChunk(captureChunkHandlerRef.current);
        captureChunkHandlerRef.current = null;
      }
      if (captureErrorHandlerRef.current && electronCapture) {
        electronCapture.offError(captureErrorHandlerRef.current);
        captureErrorHandlerRef.current = null;
      }
      if (captureLevelsHandlerRef.current && electronCapture) {
        electronCapture.offLevels(captureLevelsHandlerRef.current);
        captureLevelsHandlerRef.current = null;
      }
      setVisualizerLevels(null);

      // Transcribe any chunks that arrived after the last interval tick.
      const mimeTypeSys = captureMimeTypeRef.current || 'audio/webm';
      if (audioChunksRef.current.length > 0 && apiKey) {
        const sysParts = sysInitChunkRef.current
          ? [sysInitChunkRef.current, ...audioChunksRef.current]
          : audioChunksRef.current;
        const blob = new Blob(sysParts, { type: mimeTypeSys });
        audioChunksRef.current = [];
        try {
          const text = await transcribeAudioChunk(blob, apiKey);
          if (text) results.push(text);
        } catch (e: any) {
          console.error('Whisper final system-audio error:', e);
        }
      }
      sysInitChunkRef.current = null;
      isSystemModeRef.current = false;
    }

    // ── Mic Whisper fallback (MediaRecorder running in main renderer) ────────
    const micMimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      await drainRecorder(mediaRecorderRef.current);
      if (audioChunksRef.current.length > 0 && apiKey) {
        const micParts = sysInitChunkRef.current
          ? [sysInitChunkRef.current, ...audioChunksRef.current]
          : audioChunksRef.current;
        const blob = new Blob(micParts, { type: micMimeType });
        audioChunksRef.current = [];
        try {
          const text = await transcribeAudioChunk(blob, apiKey);
          if (text) results.push(text);
        } catch (e: any) {
          console.error('Whisper final mic-audio error:', e);
        }
      }
      sysInitChunkRef.current = null;
      mediaRecorderRef.current = null;
    }

    if (results.length > 0) appendText(results.join(' ') + ' ');

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    setVisualizerStream(null);
    liveTextCallbackRef.current = () => {};
    setTranscriptRecording(false);
    setRecordingNote(null);

    // Write the final duration now that we know the total elapsed time
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    saveProgress({ duration });

    return accumulatedRef.current;
  }, [apiKey, appendText, saveProgress, setTranscriptRecording, setRecordingNote]);

  // Keep stopRef current so the auto-stop timeout always calls the latest stop function
  stopRef.current = stop;

  return { start, stop, visualizerStream, visualizerLevels, debugStatus, transcriptIdRef };
}
