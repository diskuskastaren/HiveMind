import { useEffect, useRef } from 'react';

export type LevelsSubscriber = (listener: (levels: number[]) => void) => () => void;

interface AudioVisualizerProps {
  /** Microphone stream analysed locally (mic mode). */
  stream?: MediaStream | null;
  /** Frequency levels pushed from the hidden capture window (system-audio mode). */
  subscribeLevels?: LevelsSubscriber;
}

const BAR_COUNT = 40;
const BAR_GAP = 2;
// Minimum bar height as a fraction of canvas height so bars are always visible
const MIN_BAR_RATIO = 0.08;
// Levels older than this are treated as silence (capture paused or stopped).
const STALE_LEVELS_MS = 500;

/**
 * One animation loop draws whichever source is active. System-audio levels arrive ~30×/s over
 * IPC; they are kept in a ref instead of React state so the transcript panel does not re-render
 * on every update. The canvas transform is set from devicePixelRatio on every frame — the
 * system-audio path used to skip that and drew into the top-left part of the canvas on scaled
 * (125–200 %) displays.
 */
export function AudioVisualizer({ stream, subscribeLevels }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<{ data: Uint8Array; at: number } | null>(null);

  useEffect(() => {
    if (!subscribeLevels) return;
    return subscribeLevels((levels) => {
      levelsRef.current = { data: Uint8Array.from(levels), at: performance.now() };
    });
  }, [subscribeLevels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let streamData: Uint8Array<ArrayBuffer> | null = null;
    if (stream) {
      try {
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.75;
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        streamData = new Uint8Array(analyser.frequencyBinCount);
      } catch (error) {
        console.warn('AudioVisualizer: Web Audio API not available', error);
      }
    }

    const silence = new Uint8Array(BAR_COUNT);
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const rect = canvas.getBoundingClientRect();
      // Canvas hidden/collapsed (e.g. another view active) — skip this frame
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let data: Uint8Array = silence;
      if (analyser && streamData) {
        analyser.getByteFrequencyData(streamData);
        data = streamData;
      } else if (levelsRef.current && performance.now() - levelsRef.current.at < STALE_LEVELS_MS) {
        data = levelsRef.current.data;
      }
      drawBars(ctx, rect.width, rect.height, data, recordingColor(canvas));
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      audioCtx?.close().catch(() => {});
    };
  }, [stream]);

  return <canvas ref={canvasRef} className="w-full" style={{ height: 44, display: 'block' }} aria-hidden="true" />;
}

/** The --recording design token, so the bars follow the light/dark theme. */
function recordingColor(el: Element): string {
  return getComputedStyle(el).getPropertyValue('--recording').trim() || '#dc2626';
}

export function drawBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8Array,
  color: string,
) {
  ctx.clearRect(0, 0, width, height);

  const totalGap = BAR_GAP * (BAR_COUNT + 1);
  const barWidth = Math.max(0, (width - totalGap) / BAR_COUNT);

  // Sample the frequency data evenly across the array into BAR_COUNT buckets
  const bucketSize = Math.max(1, Math.floor(data.length / BAR_COUNT));

  for (let i = 0; i < BAR_COUNT; i++) {
    // Average a small bucket for each bar to smooth out noise
    let sum = 0;
    for (let j = 0; j < bucketSize; j++) {
      sum += data[i * bucketSize + j] ?? 0;
    }
    const avg = sum / bucketSize;
    const normalised = avg / 255; // 0–1

    const minH = height * MIN_BAR_RATIO;
    const barH = minH + (height - minH) * normalised;

    const x = BAR_GAP + i * (barWidth + BAR_GAP);
    const y = (height - barH) / 2; // vertically centred

    // Color: low amplitude → muted, high → vivid
    ctx.globalAlpha = 0.25 + normalised * 0.75;
    ctx.fillStyle = color;

    const radius = Math.max(0, Math.min(barWidth / 2, 3));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barWidth, barH, radius);
    else ctx.rect(x, y, barWidth, barH);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
