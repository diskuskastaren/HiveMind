import type { MeetingSuggestion, MeetingSuggestionKind } from '../types';

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

export function validateSuggestions(value: unknown, transcript: string): MeetingSuggestion[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { suggestions?: unknown }).suggestions)) {
    throw new Error('AI returned an incomplete analysis');
  }
  const result: MeetingSuggestion[] = [];
  const seen = new Set<string>();
  for (const raw of (value as { suggestions: unknown[] }).suggestions) {
    if (!raw || typeof raw !== 'object') throw new Error('AI returned an invalid suggestion');
    const entry = raw as Record<string, unknown>;
    if (!kinds.includes(entry.kind as MeetingSuggestionKind) || typeof entry.text !== 'string' || !entry.text.trim() ||
      typeof entry.sourceQuote !== 'string' || !entry.sourceQuote.trim() ||
      !transcript.toLocaleLowerCase().includes(entry.sourceQuote.toLocaleLowerCase().trim()) ||
      typeof entry.owner !== 'string' || typeof entry.dueDate !== 'string' ||
      !['low', 'medium', 'high'].includes(String(entry.priority)) ||
      (entry.timestampSeconds !== null && (typeof entry.timestampSeconds !== 'number' || entry.timestampSeconds < 0))) {
      throw new Error('AI analysis contains an invalid or untraceable suggestion');
    }
    const id = suggestionId(String(entry.kind), entry.text);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, kind: entry.kind as MeetingSuggestionKind, text: entry.text.trim(),
      owner: entry.owner.trim(), dueDate: entry.dueDate, priority: entry.priority as MeetingSuggestion['priority'],
      sourceQuote: entry.sourceQuote.trim(), timestampSeconds: entry.timestampSeconds as number | null,
      status: 'pending', saveAs: entry.kind === 'decision' || entry.kind === 'change' ? 'decision' :
        entry.kind === 'followup' || entry.kind === 'question' ? 'followup' : 'task' });
  }
  return result;
}

export async function analyzeMeeting(rawText: string, apiKey: string, model: string, previousContext = '') {
  // Older models in the app's summary selector do not support strict JSON schema.
  const analysisModel = model.startsWith('gpt-4o') ? model : 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: analysisModel,
      messages: [
        { role: 'system', content: 'Extract actionable meeting information. Use an exact, short sourceQuote copied from the transcript for every suggestion. Do not invent facts or timestamps. For timestamps use null unless explicitly present. Classify tasks, decisions, open questions, commitments, followups, and changes compared with prior context. Return only well-supported suggestions.' },
        { role: 'user', content: `Previous context (may be incomplete):\n${previousContext}\n\nTranscript:\n${rawText}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'meeting_analysis', strict: true,
        schema: { type: 'object', additionalProperties: false, required: ['suggestions'], properties: { suggestions: { type: 'array', items: itemSchema } } },
      } },
      max_tokens: 2500,
    }),
  });
  if (!response.ok) throw new Error(`AI analysis failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error('AI analysis was cut off; try a shorter transcript');
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned no analysis');
  const suggestions = validateSuggestions(JSON.parse(content), rawText);
  return { model: analysisModel, suggestions, promptTokens: data.usage?.prompt_tokens as number | undefined,
    completionTokens: data.usage?.completion_tokens as number | undefined };
}
