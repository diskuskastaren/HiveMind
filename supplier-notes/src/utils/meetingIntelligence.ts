import type { MeetingSuggestion, MeetingSuggestionKind } from '../types';
import { chatCompletionBody, providerError } from './summarize.ts';

const kinds: MeetingSuggestionKind[] = ['task', 'decision', 'question', 'commitment', 'followup', 'change'];
export const suggestionId = (kind: string, text: string) => `${kind}:${text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
export const sourceHash = (text: string) => {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0).toString(16);
};
const itemSchema = {
  type: 'object', additionalProperties: false,
  required: ['kind', 'text', 'owner', 'dueDate', 'priority', 'sourceQuote', 'timestampSeconds'],
  properties: {
    kind: { type: 'string', enum: kinds },
    text: { type: 'string' }, owner: { type: 'string' }, dueDate: { type: 'string' },
    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    sourceQuote: { type: 'string' }, timestampSeconds: { type: ['number', 'null'] },
  },
};

/** Lower-case, punctuation-free, single-spaced text, so quotes match across line breaks and commas. */
const comparable = (text: string) => text.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Keep the suggestions that are well-formed and traceable to the transcript; leave out the rest.
 * (A single malformed or paraphrased quote used to discard the whole analysis.) Throws only when
 * the response as a whole is unusable.
 */
export function validateSuggestions(value: unknown, transcript: string): MeetingSuggestion[] & { dropped: number } {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { suggestions?: unknown }).suggestions)) {
    throw new Error('AI returned an incomplete analysis');
  }
  const result = [] as unknown as MeetingSuggestion[] & { dropped: number };
  result.dropped = 0;
  const source = ` ${comparable(transcript)} `;
  const seen = new Set<string>();
  for (const raw of (value as { suggestions: unknown[] }).suggestions) {
    const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const quote = typeof entry.sourceQuote === 'string' ? comparable(entry.sourceQuote) : '';
    if (!kinds.includes(entry.kind as MeetingSuggestionKind) || typeof entry.text !== 'string' || !entry.text.trim() ||
      !quote || !source.includes(` ${quote} `) ||
      typeof entry.owner !== 'string' || typeof entry.dueDate !== 'string' ||
      !['low', 'medium', 'high'].includes(String(entry.priority)) ||
      (entry.timestampSeconds !== null && (typeof entry.timestampSeconds !== 'number' || entry.timestampSeconds < 0))) {
      result.dropped++;
      continue;
    }
    const id = suggestionId(String(entry.kind), entry.text);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, kind: entry.kind as MeetingSuggestionKind, text: entry.text.trim(),
      owner: entry.owner.trim(), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate) ? entry.dueDate : '',
      priority: entry.priority as MeetingSuggestion['priority'],
      sourceQuote: (entry.sourceQuote as string).trim(), timestampSeconds: entry.timestampSeconds as number | null,
      status: 'pending', saveAs: entry.kind === 'decision' || entry.kind === 'change' ? 'decision' :
        entry.kind === 'followup' || entry.kind === 'question' ? 'followup' : 'task' });
  }
  return result;
}

/** Models that support strict JSON-schema output; others fall back to gpt-4o-mini. */
export const supportsStructuredOutput = (model: string) => /^(gpt-4o|gpt-4\.1|gpt-5|o\d)/i.test(model.trim());

export async function analyzeMeeting(rawText: string, apiKey: string, model: string, previousContext = '') {
  const analysisModel = supportsStructuredOutput(model) ? model.trim() : 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...chatCompletionBody({ model: analysisModel, maxTokens: 2500, messages: [] }),
      messages: [
        { role: 'system', content: `Extract actionable meeting information. Use an exact, short sourceQuote copied from the transcript for every suggestion. Do not invent facts or timestamps. For timestamps use null unless explicitly present. Classify tasks, decisions, open questions, commitments, followups, and changes compared with prior context. Return only well-supported suggestions. Write dueDate as YYYY-MM-DD when a date or deadline is stated (today is ${new Date().toISOString().slice(0, 10)}), otherwise an empty string. Write suggestion text in the language of the transcript.` },
        { role: 'user', content: `Previous context (may be incomplete):\n${previousContext}\n\nTranscript:\n${rawText}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'meeting_analysis', strict: true,
        schema: { type: 'object', additionalProperties: false, required: ['suggestions'], properties: { suggestions: { type: 'array', items: itemSchema } } },
      } },
    }),
  });
  if (!response.ok) throw await providerError('OpenAI', response);
  const data = await response.json();
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error('AI analysis was cut off; try a shorter transcript');
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned no analysis');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('AI returned an analysis that is not valid JSON'); }
  const suggestions = validateSuggestions(parsed, rawText);
  return { model: analysisModel, suggestions: [...suggestions], dropped: suggestions.dropped, promptTokens: data.usage?.prompt_tokens as number | undefined,
    completionTokens: data.usage?.completion_tokens as number | undefined };
}
