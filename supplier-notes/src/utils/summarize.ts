/**
 * Sends an audio blob to OpenAI Whisper for transcription.
 * Used in 30-second batches during system audio recording.
 */
export async function transcribeAudioChunk(audioBlob: Blob, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');

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

/**
 * Sends a raw transcript to GPT-4o-mini to produce a structured meeting summary.
 */
export async function summarizeMeetingTranscript(rawText: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a meeting notes assistant. Summarize the transcript concisely using markdown. Use exactly these sections: ## Key Points, ## Decisions Made, ## Action Items. Be brief, factual, and use bullet points.',
        },
        {
          role: 'user',
          content: `Please summarize this meeting transcript:\n\n${rawText}`,
        },
      ],
      max_tokens: 600,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
