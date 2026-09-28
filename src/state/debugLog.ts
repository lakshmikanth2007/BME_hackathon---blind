/**
 * In-memory ring buffer of intents and errors, surfaced on the developer-only
 * debug screen. Never spoken to the user.
 */
export type DebugLevel = 'info' | 'error';

export interface DebugEntry {
  t: number;
  kind: string;
  message: string;
  level: DebugLevel;
}

const MAX = 300;
const buffer: DebugEntry[] = [];
const listeners = new Set<(entries: DebugEntry[]) => void>();

export function debugLog(
  kind: string,
  message: string,
  level: DebugLevel = 'info'
): void {
  buffer.push({ t: Date.now(), kind, message, level });
  if (buffer.length > MAX) buffer.shift();
  listeners.forEach((l) => l([...buffer]));
  // Also mirror to console for `adb logcat` during the hackathon.
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : console.log)(`[${kind}] ${message}`);
}

export function getDebugEntries(): DebugEntry[] {
  return [...buffer];
}

export function subscribeDebug(fn: (entries: DebugEntry[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
