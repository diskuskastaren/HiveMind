/**
 * Transcription (Groq Whisper) and summaries (OpenAI chat completions).
 * Both are called directly from the app with the user's own API keys.
 */

/** Turn a provider error response into a message a user can act on. */
export async function providerError(provider: 'OpenAI' | 'Groq', response: Response): Promise<Error> {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message || '';
  } catch {
    detail = await response.text().catch(() => '');
  }
  const status = response.status;
  if (status === 401) return new Error(`${provider} rejected the API key (401). Check the key in Settings → AI & Summarization.`);
  if (status === 429) return new Error(`${provider} rate limit or quota reached (429). ${detail}`.trim());
  if (status === 413) return new Error(`${provider} rejected the request as too large (413).`);
  return new Error(`${provider} error ${status}${detail ? `: ${detail}` : ''}`);
}

/**
 * Sends an audio blob to Groq Whisper for transcription.
 * Used in batches during system audio recording.
 */
export async function transcribeAudioChunk(audioBlob: Blob, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-large-v3-turbo');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) throw await providerError('Groq', response);

  const data = await response.json();
  return data.text ?? '';
}

/** Safety cap — prevents runaway cost on very long meetings. */
export const MAX_SUMMARY_TOKENS = 2000;

/**
 * Deliberately plain: earlier prompts prescribed sections (key points, actions, decisions),
 * which produced rigid summaries. Users can still add their own instructions in Settings.
 */
export const SUMMARY_PROMPT =
  'Summarize this meeting transcript. Write the summary in the same language as the transcript.';

/** o-series and GPT-5 models reject `temperature` and only accept `max_completion_tokens`. */
export function isReasoningModel(model: string) {
  return /^(o\d|gpt-5)/i.test(model.trim());
}

export function chatCompletionBody(options: {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  maxTokens: number;
  temperature?: number;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    max_completion_tokens: options.maxTokens,
  };
  if (options.temperature != null && !isReasoningModel(options.model)) body.temperature = options.temperature;
  return body;
}

export interface SummarizeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  customInstructions?: string;
}

export interface SummaryResult {
  summary: string;
  /** The model hit the length limit; the summary ends early. */
  truncated: boolean;
}

/**
 * Sends a raw transcript to OpenAI to produce a meeting summary.
 */
export async function summarizeMeetingTranscript(
  rawText: string,
  apiKey: string,
  options: SummarizeOptions = {},
): Promise<SummaryResult> {
  const {
    model = 'gpt-4o-mini',
    maxTokens = MAX_SUMMARY_TOKENS,
    temperature = 0.3,
    customInstructions = '',
  } = options;

  const systemPrompt = customInstructions.trim()
    ? `${SUMMARY_PROMPT}\n\n${customInstructions.trim()}`
    : SUMMARY_PROMPT;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(chatCompletionBody({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText },
      ],
      maxTokens,
      temperature,
    })),
  });

  if (!response.ok) throw await providerError('OpenAI', response);

  const data = await response.json();
  const choice = data.choices?.[0];
  const summary = (choice?.message?.content ?? '').trim();
  if (!summary) throw new Error('OpenAI returned an empty summary. Try again or choose another model.');
  return { summary, truncated: choice?.finish_reason === 'length' };
}
