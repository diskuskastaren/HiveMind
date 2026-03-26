import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream?: MediaStream | null;
  levels?: number[] | null;
}

const BAR_COUNT = 40;
const BAR_GAP = 2;
// Minimum bar height as a fraction of canvas height so bars are always visible
const MIN_BAR_RATIO = 0.08;

export function AudioVisualizer({ stream, levels }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Stream-based path: sets up a Web Audio graph and runs its own rAF loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cleanup = () => {
      cancelAnimationFrame(rafRef.current);
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      contextRef.current?.close().catch(() => {});
      sourceRef.current = null;
      analyserRef.current = null;
      contextRef.current = null;
    };

    if (!stream) {
      // Only draw idle bars if levels aren't supplying live data either.
      if (!levels?.length) {
        drawBars(ctx, canvas.width, canvas.height, new Uint8Array(BAR_COUNT).fill(0));
      }
      return cleanup;
    }

    cleanup();

    try {
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      contextRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        // Canvas is hidden/collapsed (e.g. Tasks view active) — skip this frame
        if (rect.width <= 0 || rect.height <= 0) return;
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.scale(dpr, dpr);
        }
        drawBars(ctx, rect.width, rect.height, dataArray);
      };

      draw();
    } catch (e) {
      console.warn('AudioVisualizer: Web Audio API not available', e);
    }

    return cleanup;
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps

  // IPC levels path: draw directly from pre-computed frequency data (system audio mode).
  useEffect(() => {
    if (stream) return; // stream path owns the canvas when active
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!levels?.length) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    // Canvas is hidden/collapsed — skip drawing this frame
    if (rect.width <= 0 || rect.height <= 0) return;
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    drawBars(ctx, rect.width, rect.height, new Uint8Array(levels));
  }, [levels, stream]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: 44, display: 'block' }}
    />
  );
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8Array,
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

    // Color: low amplitude → muted pink, high → vivid red
    const alpha = 0.25 + normalised * 0.75;
    ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`; // tailwind red-500

    const radius = Math.max(0, Math.min(barWidth / 2, 3));
    roundRect(ctx, x, y, barWidth, barH, radius);
    ctx.fill();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Fallback for older browsers
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
