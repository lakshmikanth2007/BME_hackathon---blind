/**
 * Global mode state machine. Only one PRIMARY mode runs at a time
 * (reader | navigation | summary | live | idle). Obstacle detection is an
 * orthogonal overlay that may run alongside navigation and live.
 */
import { debugLog } from '@/state/debugLog';

export type PrimaryMode = 'idle' | 'reader' | 'navigation' | 'summary' | 'live';

export interface ModeState {
  primary: PrimaryMode;
  obstacleOverlay: boolean;
}

/** Which primary modes tolerate the obstacle overlay staying on. */
const OVERLAY_ALLOWED: PrimaryMode[] = ['idle', 'navigation', 'live'];

type Listener = (s: ModeState) => void;

export class ModeMachine {
  private state: ModeState = { primary: 'idle', obstacleOverlay: false };
  private listeners = new Set<Listener>();

  get(): ModeState {
    return { ...this.state };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.get());
    return () => this.listeners.delete(fn);
  }

  /** Enter a primary mode, exiting the current one. Returns the previous mode. */
  setPrimary(mode: PrimaryMode): PrimaryMode {
    const prev = this.state.primary;
    if (prev === mode) return prev;
    this.state.primary = mode;
    // Reader OCR and full-frame summary conflict with obstacle overlay's camera
    // use pattern; keep the overlay only where it is allowed.
    if (!OVERLAY_ALLOWED.includes(mode)) this.state.obstacleOverlay = false;
    debugLog('mode', `${prev} -> ${mode}`);
    this.emit();
    return prev;
  }

  setObstacleOverlay(on: boolean): void {
    if (on && !OVERLAY_ALLOWED.includes(this.state.primary)) {
      debugLog('mode', `obstacle overlay refused in ${this.state.primary}`, 'error');
      return;
    }
    this.state.obstacleOverlay = on;
    debugLog('mode', `obstacle overlay ${on ? 'on' : 'off'}`);
    this.emit();
  }

  describeLocation(): string {
    const p = this.state.primary;
    const overlay = this.state.obstacleOverlay ? ' Obstacle detection is on.' : '';
    const names: Record<PrimaryMode, string> = {
      idle: 'the home screen, ready for a command',
      reader: 'the document reader',
      navigation: 'path guidance',
      summary: 'scene description',
      live: 'live mode',
    };
    return `You are in ${names[p]}.${overlay}`;
  }

  private emit(): void {
    const s = this.get();
    this.listeners.forEach((l) => l(s));
  }
}
