/**
 * Vision-language model client. Talks to Claude (Anthropic Messages API) or
 * Gemini depending on env. Used by scene summary, live mode, and path reasoning.
 * All calls need internet; callers must handle the offline path themselves.
 */
import { env, hasVlmKey } from '@/config/env';
import { debugLog } from '@/state/debugLog';

export interface VisionRequest {
  prompt: string;
  /** Base64-encoded JPEG frames (1 for a photo, several for a video). */
  imagesBase64: string[];
  /** Optional audio transcript to include (video summaries). */
  transcript?: string;
  maxTokens?: number;
}

export class OfflineError extends Error {
  constructor() {
    super('No internet');
    this.name = 'OfflineError';
  }
}

export const vision = {
  configured(): boolean {
    return hasVlmKey();
  },

  async describe(req: VisionRequest): Promise<string> {
    if (!hasVlmKey()) throw new OfflineError();
    try {
      const text =
        env.vlmProvider === 'gemini'
          ? await callGemini(req)
          : await callClaude(req);
      return text.trim();
    } catch (e) {
      debugLog('vision-error', String(e), 'error');
      throw e;
    }
  },
};

async function callClaude(req: VisionRequest): Promise<string> {
  const content: unknown[] = [];
  for (const img of req.imagesBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: img },
    });
  }
  let prompt = req.prompt;
  if (req.transcript) prompt += `\n\nAudio transcript: "${req.transcript}"`;
  content.push({ type: 'text', text: prompt });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.vlmApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.vlmModel,
      max_tokens: req.maxTokens ?? 400,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: { text?: string }[] };
  return json.content.map((c) => c.text ?? '').join(' ');
}

async function callGemini(req: VisionRequest): Promise<string> {
  const parts: unknown[] = req.imagesBase64.map((img) => ({
    inline_data: { mime_type: 'image/jpeg', data: img },
  }));
  let prompt = req.prompt;
  if (req.transcript) prompt += `\n\nAudio transcript: "${req.transcript}"`;
  parts.push({ text: prompt });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.vlmModel}:generateContent?key=${env.vlmApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: req.maxTokens ?? 400 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates: { content: { parts: { text?: string }[] } }[];
  };
  return (
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(' ') ?? ''
  );
}
