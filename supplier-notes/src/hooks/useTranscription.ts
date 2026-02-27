import { useRef, useCallback, useState } from 'react';
import { useStore } from '../store/store';
import { transcribeAudioChunk } from '../utils/summarize';

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
  const updateNote = useStore((s) => s.updateNote);
  const setTranscriptRecording = useStore((s) => s.setTranscriptRecording);

  // Capture the noteId at start time so recording always saves to the right note
  const recordingNoteIdRef = useRef('');
  const accumulatedRef = useRef('');
  const startTimeRef = useRef(0);
  const isRecordingRef = useRef(false);

  // Reactive stream exposed to the visualizer — set on start, cleared on stop
  const [visualizerStream, setVisualizerStream] = useState<MediaStream | null>(null);
  // Human-readable status shown in the UI for debugging
  const [debugStatus, setDebugStatus] = useState('');

  // Mic mode refs
  const recognitionRef = useRef<any>(null);
  // Separate mic stream just for the audio visualizer (Speech Recognition doesn't expose its stream)
  const micStreamRef = useRef<MediaStream | null>(null);

  // System audio mode refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // liveText state is managed via a callback so the component can track it
  const liveTextCallbackRef = useRef<(text: string) => void>(() => {});
  // Keep apiKey accessible inside async callbacks without stale closures
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;
  // Flag set when Web Speech API fails with a network error so onend doesn't auto-restart
  const speechNetworkFailedRef = useRef(false);

  const saveProgress = useCallback((extra?: { duration?: number }) => {
    const id = recordingNoteIdRef.current;
    if (!id) return;
    updateNote(id, {
      transcript: {
        rawText: accumulatedRef.current,
        duration: extra?.duration ?? Math.floor((Date.now() - startTimeRef.current) / 1000),
        recordedAt: startTimeRef.current,
      },
    });
  }, [updateNote]);

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
        'To transcribe offline, add an OpenAI API key in Transcript Settings — it will record your mic directly via Whisper.',
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
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    const processChunks = async () => {
      if (audioChunksRef.current.length === 0) return;
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];
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
    chunkIntervalRef.current = setInterval(processChunks, 30_000);
    // #region agent log
    dbg({location:'useTranscription.ts:startMicWhisperFallback',message:'Switched to Whisper mic fallback',data:{hasStream:true,hasKey:!!key},hypothesisId:'H-D'});
    setDebugStatus('Whisper mic fallback active — processing every 30s');
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

      const stream = await (navigator.mediaDevices as any).getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screen.id,
          },
        } as any,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screen.id,
            maxWidth: 1,
            maxHeight: 1,
          },
        } as any,
      });

      // Drop the video track — we only need audio
      stream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

      const audioTracks: MediaStreamTrack[] = stream.getAudioTracks();
      if (audioTracks.length === 0) throw new Error('No audio tracks captured from system audio');

      streamRef.current = stream;

      // Mix system audio + microphone into a single stream via Web Audio API
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      // Resume immediately on the user gesture to prevent Chromium from suspending it
      await audioCtx.resume();
      const destination = audioCtx.createMediaStreamDestination();

      audioCtx.createMediaStreamSource(new MediaStream(audioTracks)).connect(destination);

      // Request mic; silently continue with system-only if permission is denied
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = micStream;
        audioCtx.createMediaStreamSource(micStream).connect(destination);
      } catch {
        // Mic unavailable — system audio still captured
      }

      const audioStream = destination.stream;
      setVisualizerStream(audioStream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(audioStream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      const processChunks = async () => {
        // Revive AudioContext if Chromium suspended it between batches
        if (audioCtxRef.current?.state === 'suspended') {
          await audioCtxRef.current.resume();
        }
        if (audioChunksRef.current.length === 0) return;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        try {
          const text = await transcribeAudioChunk(blob, apiKey);
          if (text) appendText(text + ' ');
        } catch (e) {
          console.error('Whisper transcription error:', e);
        }
      };

      recorder.start(1000); // collect data every second
      chunkIntervalRef.current = setInterval(processChunks, 30_000);
      return true;
    } catch (e: any) {
      console.error('System audio capture failed:', e);
      alert(`Failed to capture system audio: ${e?.message ?? 'Unknown error'}`);
      return false;
    }
  }, [apiKey, appendText]);

  const start = useCallback(
    async (onLiveText: (text: string) => void) => {
      recordingNoteIdRef.current = noteId;
      accumulatedRef.current = '';
      startTimeRef.current = Date.now();
      isRecordingRef.current = true;
      speechNetworkFailedRef.current = false;
      liveTextCallbackRef.current = onLiveText;

      // Initialise the transcript record immediately
      updateNote(noteId, {
        transcript: { rawText: '', duration: 0, recordedAt: Date.now() },
      });

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
      return true;
    },
    [noteId, mode, updateNote, startMicRecording, startSystemRecording, setTranscriptRecording],
  );

  const stop = useCallback(async () => {
    isRecordingRef.current = false;

    // Stop Web Speech API
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Stop system audio recorder and process remaining chunks
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // #region agent log
    dbg({location:'useTranscription.ts:stop-mediaRecorder',message:'stop called',data:{hasRecorder:!!mediaRecorderRef.current,chunkCount:audioChunksRef.current.length,apiKeyPresent:!!apiKey},hypothesisId:'H-G,H-H'});
    // #endregion
    if (mediaRecorderRef.current) {
      await new Promise<void>((resolve) => {
        const recorder = mediaRecorderRef.current!;
        recorder.onstop = async () => {
          // #region agent log
          dbg({location:'useTranscription.ts:recorder.onstop',message:'recorder stopped',data:{chunkCount:audioChunksRef.current.length,apiKeyPresent:!!apiKey,mimeType:recorder.mimeType},hypothesisId:'H-G,H-H'});
          // #endregion
          if (audioChunksRef.current.length > 0 && apiKey) {
            const mimeType = recorder.mimeType || 'audio/webm';
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            audioChunksRef.current = [];
            try {
              // #region agent log
              dbg({location:'useTranscription.ts:whisper-call',message:'calling Whisper API',data:{blobSize:blob.size,mimeType},hypothesisId:'H-H'});
              // #endregion
              const text = await transcribeAudioChunk(blob, apiKey);
              // #region agent log
              dbg({location:'useTranscription.ts:whisper-result',message:'Whisper returned',data:{textLen:text?.length??0,text:text?.slice(0,60)},hypothesisId:'H-H'});
              // #endregion
              if (text) appendText(text + ' ');
            } catch(whisperErr: any) {
              const msg = String(whisperErr);
              // #region agent log
              dbg({location:'useTranscription.ts:whisper-error',message:'Whisper call failed',data:{error:msg},hypothesisId:'H-H'});
              // #endregion
              const friendly = msg.includes('429') || msg.includes('quota')
                ? 'OpenAI quota exceeded — add credits at platform.openai.com/account/billing'
                : `Whisper error: ${msg.slice(0, 80)}`;
              setDebugStatus(friendly);
            }
          }
          resolve();
        };
        recorder.stop();
      });
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    setVisualizerStream(null);
    liveTextCallbackRef.current = () => {};
    setTranscriptRecording(false);

    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    saveProgress({ duration });

    return accumulatedRef.current;
  }, [apiKey, appendText, saveProgress, setTranscriptRecording]);

  return { start, stop, visualizerStream, debugStatus };
}
