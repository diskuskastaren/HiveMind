export type TranscriptionProviderId = 'groq' | 'local';

export type LocalWhisperModelSize = 'tiny' | 'base' | 'small' | 'medium';

export interface TranscriptionRequest {
  audioBlob: Blob;
  mimeType: string;
  apiKey?: string;
  modelSize?: LocalWhisperModelSize;
}

export interface TranscriptionProvider {
  id: TranscriptionProviderId;
  label: string;
  isLocal: boolean;
  transcribeChunk(request: TranscriptionRequest): Promise<string>;
}

export async function transcribeAudioChunk(audioBlob: Blob, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-large-v3-turbo');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    throw new Error(`Groq Whisper API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.text ?? '';
}

export const groqTranscriptionProvider: TranscriptionProvider = {
  id: 'groq',
  label: 'Cloud transcription via Groq',
  isLocal: false,
  async transcribeChunk({ audioBlob, apiKey }) {
    if (!apiKey) throw new Error('Groq API key is required for cloud transcription.');
    return transcribeAudioChunk(audioBlob, apiKey);
  },
};

export const localWhisperCppProvider: TranscriptionProvider = {
  id: 'local',
  label: 'Local transcription',
  isLocal: true,
  async transcribeChunk({ audioBlob, mimeType, modelSize = 'base' }) {
    const localApi = (window as any).electronTranscription;
    if (!localApi?.transcribe) {
      throw new Error('Local transcription is only available in the Electron app.');
    }

    const wavBuffer = await audioBlobToWavBuffer(audioBlob);
    const result = await localApi.transcribe(wavBuffer, 'audio/wav', modelSize);
    if (!result?.ok) {
      throw new Error(result?.error || 'Local transcription failed.');
    }
    return result.text ?? '';
  },
};

export function getTranscriptionProvider(providerId: TranscriptionProviderId): TranscriptionProvider {
  return providerId === 'local' ? localWhisperCppProvider : groqTranscriptionProvider;
}

async function audioBlobToWavBuffer(audioBlob: Blob): Promise<ArrayBuffer> {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('Local transcription needs Web Audio decoding, which is not available in this environment.');
  }

  const context = new AudioContextCtor({ sampleRate: 16000 });
  try {
    const decoded = await context.decodeAudioData(await audioBlob.arrayBuffer());
    return encodeWav(decoded, 16000);
  } finally {
    await context.close().catch(() => {});
  }
}

function encodeWav(buffer: AudioBuffer, targetSampleRate: number): ArrayBuffer {
  const channelData = mixToMono(buffer);
  const resampled = buffer.sampleRate === targetSampleRate
    ? channelData
    : resampleLinear(channelData, buffer.sampleRate, targetSampleRate);
  const dataSize = resampled.length * 2;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const sample of resampled) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return wav;
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      mono[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

function resampleLinear(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const sourceIndex = i * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(input.length - 1, left + 1);
    const t = sourceIndex - left;
    output[i] = input[left] * (1 - t) + input[right] * t;
  }
  return output;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
