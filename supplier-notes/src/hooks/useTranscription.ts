import { useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useStore } from '../store/store';
import { transcribeAudioChunk } from '../utils/summarize';
import type { Transcript } from '../types';
import type { LevelsSubscriber } from '../components/AudioVisualizer';

export type TranscriptionMode = 'mic' | 'system';
/** Which service is turning audio into text right now. */
export type TranscriptionEngine = 'speech' | 'whisper';
export interface TranscriptionStatus {
  tone: 'info' | 'warning' | 'error';
  message: string;
}

interface UseTranscriptionOptions {
  noteId: string;
  apiKey: string;
  mode: TranscriptionMode;
}

/**
 * Audio segments that could not be transcribed (e.g. network outage) stay queued and are retried
 * at the next interval. The cap bounds memory: at the default 60 s interval this is ~30 minutes.
 */
const MAX_QUEUED_SEGMENTS = 30;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useTranscription({ noteId, apiKey, mode }: UseTranscriptionOptions) {
  const addTranscript = useStore((s) => s.addTranscript);
  const updateTranscript = useStore((s) => s.updateTranscript);
  const deleteTranscript = useStore((s) => s.deleteTranscript);
  const setTranscriptRecording = useStore((s) => s.setTranscriptRecording);
  const setRecordingNote = useStore((s) => s.setRecordingNote);

  // Captured at start so the recording always saves to the note it began in
  const recordingNoteIdRef = useRef('');
  // Each recording session gets its own transcript entry in the note
  const transcriptIdRef = useRef('');
  const accumulatedRef = useRef('');
  const startTimeRef = useRef(0);
  const isRecordingRef = useRef(false);
  // Groq key captured at start; used for every upload of this recording
  const groqKeyRef = useRef('');

  const [visualizerStream, setVisualizerStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus | null>(null);
  const [engine, setEngine] = useState<TranscriptionEngine>(mode === 'system' ? 'whisper' : 'speech');

  // Mic mode
  const recognitionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Whisper upload queue (both modes)
  const audioChunksRef = useRef<Blob[]>([]);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleBusyRef = useRef(false);
  const cyclePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const discardedSegmentsRef = useRef(0);

  // System audio is captured in a hidden window (isolates GPU crashes from the main app)
  const isSystemModeRef = useRef(false);
  const captureChunkHandlerRef = useRef<((buf: ArrayBuffer) => void) | null>(null);
  const captureErrorHandlerRef = useRef<((msg: string) => void) | null>(null);
  const captureLevelsHandlerRef = useRef<((data: number[]) => void) | null>(null);

  // Visualizer levels go straight to subscribers (no React state at 30 fps)
  const levelListenersRef = useRef(new Set<(levels: number[]) => void>());
  const subscribeLevels = useCallback<LevelsSubscriber>((listener) => {
    levelListenersRef.current.add(listener);
    return () => { levelListenersRef.current.delete(listener); };
  }, []);

  const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<() => Promise<string>>(async () => '');
  const liveTextCallbackRef = useRef<(text: string) => void>(() => {});

  const saveProgress = useCallback((extra?: { duration?: number }) => {
    const id = recordingNoteIdRef.current;
    const tid = transcriptIdRef.current;
    if (!id || !tid) return;
    updateTranscript(id, tid, {
      rawText: accumulatedRef.current,
      duration: extra?.duration ?? Math.floor((Date.now() - startTimeRef.current) / 1000),
    });
  }, [updateTranscript]);

  const appendText = useCallback((text: string) => {
    if (!text) return;
    accumulatedRef.current += text;
    saveProgress();
  }, [saveProgress]);

  /** Recording cannot continue: tell the user and release the microphone/capture. */
  const failedRef = useRef(false);
  const failRecording = useCallback((message: string) => {
    failedRef.current = true;
    toast.error('Recording stopped', { description: message, duration: 10000 });
    void stopRef.current();
  }, []);

  /**
   * Upload queued segments in order. Text is saved after each segment, so a failure part-way
   * keeps what was already transcribed; the failed segment stays at the front of the queue.
   */
  const transcribeQueue = useCallback(async (key: string) => {
    while (audioChunksRef.current.length > 0) {
      const chunk = audioChunksRef.current[0];
      if (chunk.size > 0) {
        const text = await transcribeAudioChunk(chunk, key);
        if (text.trim()) appendText(`${text.trim()} `);
      }
      audioChunksRef.current.shift();
    }
  }, [appendText]);

  const trimQueue = useCallback(() => {
    const excess = audioChunksRef.current.length - MAX_QUEUED_SEGMENTS;
    if (excess <= 0) return;
    audioChunksRef.current.splice(0, excess);
    discardedSegmentsRef.current += excess;
  }, []);

  /** Close the current audio segment, then transcribe everything queued. One cycle at a time. */
  const runCycle = useCallback((closeSegment: () => Promise<void>) => {
    if (cycleBusyRef.current) return cyclePromiseRef.current; // the next tick picks up this audio
    cycleBusyRef.current = true;
    const cycle = (async () => {
      try {
        await closeSegment();
        trimQueue();
        await transcribeQueue(groqKeyRef.current);
        if (discardedSegmentsRef.current) {
          setStatus({ tone: 'warning', message: `${discardedSegmentsRef.current} earlier audio segment(s) could not be transcribed and were discarded.` });
        } else {
          setStatus(null);
        }
      } catch (error) {
        const queued = audioChunksRef.current.length;
        setStatus({
          tone: 'error',
          message: `Transcription failed: ${errorMessage(error)} ${queued ? `${queued} audio segment(s) are kept and will be retried.` : ''}`.trim(),
        });
      } finally {
        cycleBusyRef.current = false;
      }
    })();
    cyclePromiseRef.current = cycle;
    return cycle;
  }, [transcribeQueue, trimQueue]);

  const startSegmentRecorder = useCallback((stream: MediaStream, mimeType: string) => {
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
  }, []);

  /** Stop the mic recorder (delivering its final segment) and optionally start a new one. */
  const rotateSegmentRecorder = useCallback(async (stream: MediaStream, mimeType: string, restart: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
        recorder.stop();
      });
    }
    if (restart && isRecordingRef.current) startSegmentRecorder(stream, mimeType);
    else mediaRecorderRef.current = null;
  }, [startSegmentRecorder]);

  /** Transcribe the microphone with Groq Whisper (when built-in speech recognition is unavailable). */
  const startMicWhisper = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream || !isRecordingRef.current) return false;
    if (!groqKeyRef.current) {
      failRecording('Built-in speech recognition is not available here, and no Groq API key is set. Add a Groq key in Settings → AI & Summarization to transcribe the microphone with Groq Whisper.');
      return false;
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    startSegmentRecorder(stream, mimeType);
    setEngine('whisper');
    const seconds = useStore.getState().settings.chunkIntervalSeconds;
    chunkIntervalRef.current = setInterval(() => {
      void runCycle(() => rotateSegmentRecorder(stream, mimeType, true));
    }, seconds * 1000);
    setStatus({ tone: 'info', message: `Transcribing with Groq Whisper every ${seconds} s.` });
    return true;
  }, [failRecording, rotateSegmentRecorder, runCycle, startSegmentRecorder]);

  const startMicRecording = useCallback(async () => {
    // The microphone stream drives the visualizer and the Whisper path.
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = micStream;
      setVisualizerStream(micStream);
    } catch (error) {
      toast.error('Microphone unavailable', {
        description: `${errorMessage(error)}. Check that a microphone is connected and that HiveMind may use it (Windows Settings → Privacy & security → Microphone).`,
      });
      return false;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return startMicWhisper();

    let fellBack = false;
    const fallBack = () => {
      if (fellBack || !isRecordingRef.current) return;
      fellBack = true;
      recognitionRef.current = null;
      liveTextCallbackRef.current('');
      startMicWhisper();
    };

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognitionRef.current = recognition;
    setEngine('speech');

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) appendText(text + ' ');
        else interim += text;
      }
      liveTextCallbackRef.current(interim);
    };

    recognition.onerror = (e: any) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      if (e.error === 'not-allowed') {
        failRecording('Microphone access was denied. Allow microphone access for HiveMind in Windows Settings → Privacy & security → Microphone, then try again.');
        return;
      }
      // 'network', 'service-not-allowed', … — the online speech service is unavailable (always
      // the case in the desktop app). Switch to Groq Whisper on the same microphone stream.
      try { recognition.abort(); } catch { /* already stopped */ }
      fallBack();
    };

    recognition.onend = () => {
      liveTextCallbackRef.current('');
      if (!isRecordingRef.current || fellBack || recognitionRef.current !== recognition) return;
      try { recognition.start(); } catch { /* already started */ } // normal silence timeout
    };

    try {
      recognition.start();
    } catch {
      return startMicWhisper();
    }
    return true;
  }, [appendText, failRecording, startMicWhisper]);

  const startSystemRecording = useCallback(async () => {
    const electronCapture = (window as any).electronCapture;
    if (!electronCapture) {
      toast.error('System audio is only available in the desktop app', { description: 'Use “Mic only” in the browser.' });
      return false;
    }
    if (!groqKeyRef.current) {
      toast.error('Groq API key required', { description: 'Add a Groq key in Settings → AI & Summarization to transcribe system audio.' });
      return false;
    }

    try {
      const sources: Array<{ id: string; name: string }> = await electronCapture.getSources();
      const screen = sources.find((s) => /entire screen|screen 1|screen$/i.test(s.name)) ?? sources[0];
      if (!screen) throw new Error('No screen source found for audio capture');

      const mimeType: string = await electronCapture.startCapture(screen.id);
      isSystemModeRef.current = true;
      setEngine('whisper');

      const onChunk = (buf: ArrayBuffer) => {
        const blob = new Blob([buf], { type: mimeType });
        if (blob.size > 0) audioChunksRef.current.push(blob);
      };
      electronCapture.onChunk(onChunk);
      captureChunkHandlerRef.current = onChunk;

      const onError = (msg: string) => {
        if (/stopped unexpectedly/i.test(msg)) failRecording(`${msg} Audio captured so far is being transcribed.`);
        else setStatus({ tone: 'error', message: `Audio capture problem: ${msg}` });
      };
      electronCapture.onError(onError);
      captureErrorHandlerRef.current = onError;

      const onLevels = (data: number[]) => levelListenersRef.current.forEach((listener) => listener(data));
      electronCapture.onLevels(onLevels);
      captureLevelsHandlerRef.current = onLevels;

      const seconds = useStore.getState().settings.chunkIntervalSeconds;
      chunkIntervalRef.current = setInterval(() => {
        void runCycle(() => electronCapture.flushCapture());
      }, seconds * 1000);
      return true;
    } catch (e) {
      isSystemModeRef.current = false;
      toast.error('Could not capture system audio', { description: errorMessage(e) });
      return false;
    }
  }, [failRecording, runCycle]);

  const start = useCallback(
    async (onLiveText: (text: string) => void) => {
      recordingNoteIdRef.current = noteId;
      accumulatedRef.current = '';
      startTimeRef.current = Date.now();
      isRecordingRef.current = true;
      groqKeyRef.current = apiKey;
      audioChunksRef.current = [];
      discardedSegmentsRef.current = 0;
      cycleBusyRef.current = false;
      cyclePromiseRef.current = Promise.resolve();
      liveTextCallbackRef.current = onLiveText;
      failedRef.current = false;
      setStatus(null);

      // Each recording session gets its own transcript entry — previous ones are preserved
      const newId = crypto.randomUUID();
      transcriptIdRef.current = newId;
      const newTranscript: Transcript = { id: newId, rawText: '', duration: 0, recordedAt: Date.now() };
      addTranscript(noteId, newTranscript);

      const success = mode === 'system' ? await startSystemRecording() : await startMicRecording();
      if (!success || !isRecordingRef.current) {
        // Nothing was recorded: release devices and remove the empty entry.
        isRecordingRef.current = false;
        recognitionRef.current = null;
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        setVisualizerStream(null);
        if (chunkIntervalRef.current) { clearInterval(chunkIntervalRef.current); chunkIntervalRef.current = null; }
        deleteTranscript(noteId, newId);
        transcriptIdRef.current = '';
        return false;
      }

      setTranscriptRecording(true);
      setRecordingNote(noteId);

      // Safety net: auto-stop after the configured duration in case the user forgets
      const autoStopMs = useStore.getState().settings.autoStopHours * 60 * 60 * 1000;
      autoStopTimeoutRef.current = setTimeout(() => {
        toast.info('Recording stopped automatically', { description: 'The maximum recording length in Settings → Recording was reached.' });
        void stopRef.current();
      }, autoStopMs);

      return true;
    },
    [noteId, apiKey, mode, addTranscript, deleteTranscript, startMicRecording, startSystemRecording, setTranscriptRecording, setRecordingNote],
  );

  const stoppingRef = useRef<Promise<string> | null>(null);
  const stop = useCallback(() => {
    if (stoppingRef.current) return stoppingRef.current;
    const run = (async () => {
      isRecordingRef.current = false;

      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* not started */ }
        recognitionRef.current = null;
      }
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
        chunkIntervalRef.current = null;
      }

      // Collect the final audio segment from whichever recorder is running.
      if (isSystemModeRef.current) {
        const electronCapture = (window as any).electronCapture;
        try { await electronCapture?.stopCapture(); } catch { /* capture window may have crashed */ }
        if (electronCapture) {
          if (captureChunkHandlerRef.current) electronCapture.offChunk(captureChunkHandlerRef.current);
          if (captureErrorHandlerRef.current) electronCapture.offError(captureErrorHandlerRef.current);
          if (captureLevelsHandlerRef.current) electronCapture.offLevels(captureLevelsHandlerRef.current);
        }
        captureChunkHandlerRef.current = null;
        captureErrorHandlerRef.current = null;
        captureLevelsHandlerRef.current = null;
        isSystemModeRef.current = false;
      }
      if (mediaRecorderRef.current && micStreamRef.current) {
        await rotateSegmentRecorder(micStreamRef.current, mediaRecorderRef.current.mimeType, false);
      }

      // Let an upload that is already running finish, then transcribe whatever remains.
      await cyclePromiseRef.current.catch(() => {});
      if (audioChunksRef.current.length > 0 && groqKeyRef.current) {
        try {
          await transcribeQueue(groqKeyRef.current);
        } catch (error) {
          const lost = audioChunksRef.current.length;
          toast.error('Part of the recording could not be transcribed', {
            description: `${lost} audio segment(s) failed: ${errorMessage(error)}`,
            duration: Infinity,
          });
        }
      }
      if (discardedSegmentsRef.current) {
        toast.warning('Part of the recording could not be transcribed', {
          description: `${discardedSegmentsRef.current} audio segment(s) were discarded after repeated failures.`,
          duration: Infinity,
        });
      }

      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      mediaRecorderRef.current = null;
      setVisualizerStream(null);
      audioChunksRef.current = [];
      liveTextCallbackRef.current = () => {};
      setTranscriptRecording(false);
      setRecordingNote(null);
      setStatus(null);

      const id = recordingNoteIdRef.current;
      const tid = transcriptIdRef.current;
      if (!accumulatedRef.current.trim()) {
        if (id && tid) deleteTranscript(id, tid);
        if (tid && !failedRef.current) toast.info('Nothing was transcribed', { description: 'No speech was recognised, so no recording was saved.' });
        transcriptIdRef.current = '';
        return '';
      }
      saveProgress({ duration: Math.floor((Date.now() - startTimeRef.current) / 1000) });
      return accumulatedRef.current;
    })();
    stoppingRef.current = run;
    return run.finally(() => { stoppingRef.current = null; });
  }, [deleteTranscript, rotateSegmentRecorder, saveProgress, setRecordingNote, setTranscriptRecording, transcribeQueue]);

  // Keep stopRef current so timeouts and failure paths always call the latest stop function
  stopRef.current = stop;

  return { start, stop, visualizerStream, subscribeLevels, status, engine, transcriptIdRef };
}
