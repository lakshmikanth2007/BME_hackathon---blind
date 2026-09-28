/**
 * Intent router. Scores an utterance against every known phrase using a blend
 * of whole-phrase similarity and token overlap, then returns the best intent
 * (with a confidence). Extracts a navigation target when present.
 */
import { INTENTS, IntentSpec, NAV_TARGETS } from '@/voice/intents';
import { similarity, tokenOverlap, normalise, tokens } from '@/voice/fuzzy';

export interface RouteResult {
  intent: IntentSpec | null;
  confidence: number;
}

const ACCEPT = 0.55;

export function routeIntent(utterance: string): RouteResult {
  const u = normalise(utterance);
  if (!u) return { intent: null, confidence: 0 };

  let best: { name: (typeof INTENTS)[number]['name']; score: number } | null = null;

  for (const def of INTENTS) {
    for (const phrase of def.phrases) {
      const p = normalise(phrase);
      // Substring match is a strong signal; blend phrase-sim and token overlap.
      const contains = u.includes(p) || p.includes(u) ? 0.3 : 0;
      const score =
        0.5 * similarity(u, p) + 0.5 * tokenOverlap(u, phrase) + contains;
      if (!best || score > best.score) best = { name: def.name, score };
    }
  }

  if (!best || best.score < ACCEPT) return { intent: null, confidence: best?.score ?? 0 };

  const spec: IntentSpec = { name: best.name };
  if (best.name === 'navigation.start') spec.target = extractNavTarget(u);
  return { intent: spec, confidence: Math.min(1, best.score) };
}

function extractNavTarget(u: string): string | undefined {
  const toks = tokens(u);
  for (const t of toks) {
    const hit = NAV_TARGETS.find((n) => similarity(t, n) >= 0.8);
    if (hit) return hit === 'elevator' ? 'lift' : hit;
  }
  return undefined;
}
