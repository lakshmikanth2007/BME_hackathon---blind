/** Small, dependency-free fuzzy string helpers for intent matching. */

/** Normalised Levenshtein similarity in [0,1]. */
export function similarity(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - dist / max;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  return normalise(s).split(' ').filter(Boolean);
}

/** Fraction of phrase tokens that appear (fuzzily) in the utterance. */
export function tokenOverlap(utterance: string, phrase: string): number {
  const uTok = tokens(utterance);
  const pTok = tokens(phrase);
  if (pTok.length === 0) return 0;
  let hits = 0;
  for (const p of pTok) {
    if (uTok.some((u) => u === p || similarity(u, p) >= 0.8)) hits++;
  }
  return hits / pTok.length;
}
