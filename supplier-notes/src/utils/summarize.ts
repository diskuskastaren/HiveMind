/**
 * Sends an audio blob to OpenAI Whisper for transcription.
 * Used in 30-second batches during system audio recording.
 */
export async function transcribeAudioChunk(audioBlob: Blob, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'gpt-4o-mini-transcribe');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    throw new Error(`Whisper API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.text ?? '';
}

/** Safety cap — prevents runaway cost on very long meetings. The AI decides how much detail is appropriate within this limit. */
export const MAX_SUMMARY_TOKENS = 2000;

const BASE_SUMMARY_PROMPT =
  'You are an expert meeting-notes assistant. Convert the following raw transcript into a clear, structured summary using relevant headings and bullet points where appropriate..';

export interface SummarizeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  customInstructions?: string;
}

/**
 * Sends a raw transcript to OpenAI GPT to produce a structured meeting summary.
 */
export async function summarizeMeetingTranscript(
  rawText: string,
  apiKey: string,
  options: SummarizeOptions = {},
): Promise<string> {
  const {
    model = 'gpt-4o-mini',
    maxTokens = 600,
    temperature = 0.3,
    customInstructions = '',
  } = options;

  const systemPrompt = customInstructions
    ? `${BASE_SUMMARY_PROMPT}\n\n${customInstructions}`
    : BASE_SUMMARY_PROMPT;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please summarize this meeting transcript:\n\n${rawText}` },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
