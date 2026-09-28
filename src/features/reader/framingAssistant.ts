/**
 * Framing assistant. Given detected page-edge geometry and frame-to-frame
 * motion, it produces spoken guidance ("move left", "closer", "hold steady",
 * "page detected") and decides when the page is steady enough to auto-read.
 */
import { OCR } from '@/config/thresholds';

export interface PageGeometry {
  /** Whether a rectangular page-like quad was found this frame. */
  found: boolean;
  /** Centre of the detected page in frame coords (0..1). */
  centreX: number;
  centreY: number;
  /** Fraction of the frame the page fills (0..1). */
  fill: number;
  /** Normalised motion since last frame (0 still .. 1 large). */
  motion: number;
}

export type FramingCue =
  | 'no page'
  | 'move left'
  | 'move right'
  | 'move up'
  | 'move down'
  | 'closer'
  | 'farther'
  | 'hold steady'
  | 'page detected';

export class FramingAssistant {
  private steadyCount = 0;

  reset(): void {
    this.steadyCount = 0;
  }

  /** Returns the cue to speak, and whether reading should auto-start. */
  evaluate(g: PageGeometry): { cue: FramingCue; ready: boolean } {
    if (!g.found) {
      this.steadyCount = 0;
      return { cue: 'no page', ready: false };
    }
    if (g.centreX < 0.35) return this.notSteady('move right');
    if (g.centreX > 0.65) return this.notSteady('move left');
    if (g.centreY < 0.35) return this.notSteady('move down');
    if (g.centreY > 0.65) return this.notSteady('move up');
    if (g.fill < 0.35) return this.notSteady('closer');
    if (g.fill > 0.9) return this.notSteady('farther');
    if (g.motion > OCR.STEADY_MOTION_MAX) return this.notSteady('hold steady');

    // Well framed and still.
    this.steadyCount++;
    if (this.steadyCount >= OCR.STEADY_FRAMES) {
      return { cue: 'page detected', ready: true };
    }
    return { cue: 'hold steady', ready: false };
  }

  private notSteady(cue: FramingCue): { cue: FramingCue; ready: boolean } {
    this.steadyCount = 0;
    return { cue, ready: false };
  }
}

export const FRAMING_SPEECH: Record<FramingCue, string> = {
  'no page': 'Point the camera at the page.',
  'move left': 'Move left.',
  'move right': 'Move right.',
  'move up': 'Move up.',
  'move down': 'Move down.',
  closer: 'Move closer.',
  farther: 'Move farther.',
  'hold steady': 'Hold steady.',
  'page detected': 'Page detected. Reading now.',
};
