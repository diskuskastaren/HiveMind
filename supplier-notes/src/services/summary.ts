export type SummaryProviderId = 'openai' | 'local';

export type LocalSummaryModelId = 'gemma-4-e2b-it-q4' | 'qwen3-4b-q4-k-m';

export const LOCAL_SUMMARY_MODELS: Record<LocalSummaryModelId, {
  id: LocalSummaryModelId;
  label: string;
  filename: string;
  sizeLabel: string;
}> = {
  'gemma-4-e2b-it-q4': {
    id: 'gemma-4-e2b-it-q4',
    label: 'Gemma 4 E2B-it Q4',
    filename: 'gemma-4-e2b-it-edited-q4_0.gguf',
    sizeLabel: '~3.04 GB',
  },
  'qwen3-4b-q4-k-m': {
    id: 'qwen3-4b-q4-k-m',
    label: 'Qwen3 4B Q4_K_M',
    filename: 'Qwen3-4B-Q4_K_M.gguf',
    sizeLabel: '~2.5 GB',
  },
};

/** Safety cap - prevents runaway cost on very long cloud summaries. */
export const MAX_SUMMARY_TOKENS = 2000;

const BASE_SUMMARY_PROMPT =
  'You are an expert meeting-notes assistant. Convert the following raw transcript into a clear, structured summary using relevant headings and bullet points where appropriate.';

export interface SummarizeOptions {
  model?: string;
  localModel?: LocalSummaryModelId;
  maxTokens?: number;
  temperature?: number;
  customInstructions?: string;
}

export interface SummaryRequest {
  rawText: string;
  apiKey?: string;
  options?: SummarizeOptions;
}

export interface SummaryProvider {
  id: SummaryProviderId;
  label: string;
  isLocal: boolean;
  summarize(request: SummaryRequest): Promise<string>;
}

function getSystemPrompt(customInstructions = '') {
  return customInstructions
    ? `${BASE_SUMMARY_PROMPT}\n\n${customInstructions}`
    : BASE_SUMMARY_PROMPT;
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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: getSystemPrompt(customInstructions) },
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

export const openAiSummaryProvider: SummaryProvider = {
  id: 'openai',
  label: 'Cloud summary via OpenAI',
  isLocal: false,
  summarize({ rawText, apiKey, options }) {
    if (!apiKey) throw new Error('OpenAI API key is required for cloud summaries.');
    return summarizeMeetingTranscript(rawText, apiKey, options);
  },
};

export const localSummaryProvider: SummaryProvider = {
  id: 'local',
  label: 'Local summary',
  isLocal: true,
  async summarize({ rawText, options }) {
    const localApi = (window as any).electronSummary;
    if (!localApi?.summarize) {
      throw new Error('Local summaries are only available in the Electron app.');
    }
    const localModel = options?.localModel || 'gemma-4-e2b-it-q4';
    const result = await localApi.summarize(rawText, localModel, {
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      customInstructions: options?.customInstructions,
    });
    if (!result?.ok) {
      throw new Error(result?.error || 'Local summary failed.');
    }
    return result.summary ?? '';
  },
};

export function getSummaryProvider(providerId: SummaryProviderId): SummaryProvider {
  return providerId === 'local' ? localSummaryProvider : openAiSummaryProvider;
}
