import { useSyncExternalStore } from 'react';
import { useStore } from '../store/store';
import { MAX_SUMMARY_TOKENS, summarizeMeetingTranscript } from './summarize';

/**
 * One summary request per transcript at a time. Stopping a recording and opening the
 * transcript both ask for a summary; they used to send two paid requests that raced.
 */
const running = new Map<string, Promise<void>>();
const errors = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useSummaryStatus(transcriptId: string) {
  const running_ = useSyncExternalStore(subscribe, () => running.has(transcriptId));
  const error = useSyncExternalStore(subscribe, () => errors.get(transcriptId) ?? '');
  return { summarizing: running_, error };
}

export function hasSummaryError(transcriptId: string) {
  return errors.has(transcriptId);
}

/** Summarize a transcript with the current settings; reuses a request already in flight. */
export function requestSummary(noteId: string, transcriptId: string): Promise<void> {
  const existing = running.get(transcriptId);
  if (existing) return existing;
  const state = useStore.getState();
  const transcript = state.notes.find((note) => note.id === noteId)?.transcripts?.find((item) => item.id === transcriptId);
  const { openaiApiKey, gptModel, temperature, customSummaryInstructions } = state.settings;
  if (!transcript?.rawText?.trim() || !openaiApiKey) return Promise.resolve();

  errors.delete(transcriptId);
  const job = summarizeMeetingTranscript(transcript.rawText, openaiApiKey, {
    model: gptModel,
    temperature,
    customInstructions: customSummaryInstructions,
    maxTokens: MAX_SUMMARY_TOKENS,
  })
    .then(({ summary, truncated }) => {
      useStore.getState().updateTranscript(noteId, transcriptId, {
        summary: truncated ? `${summary}\n\n_(The summary was cut off at the length limit.)_` : summary,
      });
    })
    .catch((error: unknown) => {
      errors.set(transcriptId, error instanceof Error ? error.message : String(error));
      throw error;
    })
    .finally(() => {
      running.delete(transcriptId);
      notify();
    });
  running.set(transcriptId, job);
  notify();
  return job;
}
