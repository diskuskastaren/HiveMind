/**
 * Turn an exported transcript (Microsoft Teams .vtt, .srt subtitles or plain text) into readable
 * text: cue numbers, timestamps and markup are removed, and consecutive lines from the same speaker
 * are joined as "Speaker: text".
 */
export interface ImportedTranscript {
  text: string;
  /** Seconds, from the last cue's end time when the file has timestamps; otherwise 0. */
  duration: number;
}

const TIMESTAMP = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/g;

const toSeconds = (stamp: string) => {
  const parts = stamp.replace(',', '.').split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
};

export function parseTranscriptFile(content: string): ImportedTranscript {
  const source = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const isCueFormat = /^WEBVTT/.test(source.trimStart()) || /^\d+\n(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}\s+-->/m.test(source);
  if (!isCueFormat) return { text: source.trim(), duration: 0 };

  let duration = 0;
  const lines: Array<{ speaker: string; text: string }> = [];
  for (const block of source.split(/\n{2,}/)) {
    const rows = block.split('\n').map((row) => row.trim()).filter(Boolean);
    if (!rows.length || /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(rows[0])) continue;
    const timingIndex = rows.findIndex((row) => row.includes('-->'));
    if (timingIndex < 0) continue;
    const stamps = rows[timingIndex].match(TIMESTAMP);
    if (stamps?.[1]) duration = Math.max(duration, toSeconds(stamps[1]));
    for (const row of rows.slice(timingIndex + 1)) {
      const voice = /^<v(?:\.[^\s>]+)?\s+([^>]+)>/.exec(row);
      const speaker = voice ? voice[1].trim() : '';
      const text = row.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
      if (!text) continue;
      const previous = lines[lines.length - 1];
      if (previous && previous.speaker === speaker) previous.text += ` ${text}`;
      else lines.push({ speaker, text });
    }
  }
  return {
    text: lines.map((line) => (line.speaker ? `${line.speaker}: ${line.text}` : line.text)).join('\n'),
    duration: Math.round(duration),
  };
}
