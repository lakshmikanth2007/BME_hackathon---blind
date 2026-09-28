/**
 * Feature 3: Path guidance ("find the way out", "take me to the door").
 * Phase 1 SCAN: ask the user to turn slowly; locate the target via object
 * detection, sign OCR (EXIT/arrows/room numbers) and the VLM.
 * Phase 2 GUIDE: every ~1s recompute the safest forward step from the
 * occupancy grid and speak short turn-by-turn instructions, correcting drift.
 * Obstacle alerts stay active and outrank guidance speech (priority tiers).
 *
 * Scope: visual guidance to a visible/discoverable target, not GPS navigation.
 */
import { VoiceController } from '@/voice/VoiceController';
import { vision, OfflineError } from '@/services/vision';
import { pathPrompt } from '@/voice/prompts';
import { FRAME } from '@/config/thresholds';
import { debugLog } from '@/state/debugLog';
import {
  OccupancyGrid,
  bearingToInstruction,
} from './occupancyGrid';

export type NavPhase = 'idle' | 'scanning' | 'guiding' | 'arrived';

export interface TargetSighting {
  found: boolean;
  /** Relative bearing to target, radians (0 = ahead, + = right). */
  bearingRad: number;
  approxMeters: number;
  notes: string;
}

/** Grab a frame for the VLM during scanning. */
export type NavFrameGrabber = () => Promise<string | null>;
/** Current depth ray readings: bearing (rad) + distance (m). */
export type DepthRays = () => { bearingRad: number; distanceM: number }[];

export class NavigationController {
  private phase: NavPhase = 'idle';
  private grid = new OccupancyGrid();
  private target = 'door';
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastInstruction = '';
  private targetBearing = 0;
  private remainingM = 0;

  constructor(
    private voice: VoiceController,
    private grabFrame: NavFrameGrabber,
    private depthRays: DepthRays
  ) {}

  getPhase(): NavPhase {
    return this.phase;
  }

  async start(target = 'door'): Promise<void> {
    this.target = target;
    this.phase = 'scanning';
    this.grid.reset();
    this.voice.navigation(`Looking for the ${target}. Turn slowly, please.`);
    debugLog('nav', `scan for ${target}`);
    await this.scan();
  }

  /** One scan attempt against the current frame. */
  private async scan(): Promise<void> {
    const frame = await this.grabFrame();
    if (!frame) {
      this.voice.navigation('Cannot see. Please hold the phone up and turn slowly.');
      return;
    }
    try {
      const raw = await vision.describe({
        prompt: pathPrompt(this.target),
        imagesBase64: [frame],
        maxTokens: 150,
      });
      const sighting = parseSighting(raw);
      if (sighting.found) {
        this.targetBearing = sighting.bearingRad;
        this.remainingM = sighting.approxMeters;
        this.beginGuiding();
      } else {
        this.voice.navigation(sighting.notes || 'Keep turning slowly.');
      }
    } catch (e) {
      if (e instanceof OfflineError) {
        this.voice.navigation('No internet. Path guidance needs a connection.');
        this.stop();
      } else {
        this.voice.navigation('Keep turning slowly.');
      }
    }
  }

  /** Feed a frame during scanning to retry target acquisition. */
  async onScanFrame(): Promise<void> {
    if (this.phase === 'scanning') await this.scan();
  }

  private beginGuiding(): void {
    this.phase = 'guiding';
    this.voice.navigation(
      `${this.target} found, about ${Math.round(this.remainingM)} meters. Guiding you.`
    );
    debugLog('nav', 'guiding');
    this.timer = setInterval(() => this.step(), FRAME.NAV_RECOMPUTE_MS);
  }

  /** Recompute the safest forward step and speak it. */
  private step(): void {
    if (this.phase !== 'guiding') return;

    // Rebuild the local grid from the latest depth rays.
    this.grid.reset();
    for (const ray of this.depthRays()) {
      this.grid.integrate(ray.bearingRad, ray.distanceM);
    }

    if (this.remainingM <= 0.8) {
      this.arrive();
      return;
    }

    const heading = this.grid.nextHeading(this.targetBearing, 1.0);
    if (heading === null) {
      this.speakOnce('Path blocked, please turn around.');
      return;
    }

    const instruction = bearingToInstruction(heading);
    // Assume the user advances ~0.6 m per guidance tick when told to walk.
    if (instruction === 'Walk forward') {
      this.remainingM = Math.max(0, this.remainingM - 0.6);
      this.speakOnce(`Walk forward ${this.remainingM.toFixed(0)} meters.`);
    } else {
      this.speakOnce(instruction + '.');
    }
    // Drift correction: shrink the residual target bearing as we align.
    this.targetBearing *= 0.6;
  }

  private speakOnce(text: string): void {
    if (text === this.lastInstruction) return;
    this.lastInstruction = text;
    this.voice.navigation(text);
  }

  private arrive(): void {
    this.phase = 'arrived';
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.voice.navigation('You have arrived.');
    debugLog('nav', 'arrived');
  }

  stop(): void {
    this.phase = 'idle';
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastInstruction = '';
    debugLog('nav', 'stopped');
  }
}

/** Parse the VLM's compact JSON sighting; tolerant of extra prose. */
export function parseSighting(raw: string): TargetSighting {
  const fallback: TargetSighting = {
    found: false,
    bearingRad: 0,
    approxMeters: 0,
    notes: 'Keep turning slowly.',
  };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const j = JSON.parse(match[0]) as {
      found?: boolean;
      direction?: string;
      approxMeters?: number;
      notes?: string;
    };
    return {
      found: !!j.found,
      bearingRad: directionToBearing(j.direction ?? 'ahead'),
      approxMeters: Number(j.approxMeters ?? 3),
      notes: j.notes ?? fallback.notes,
    };
  } catch {
    return fallback;
  }
}

function directionToBearing(dir: string): number {
  const map: Record<string, number> = {
    left: -Math.PI / 4,
    'slightly left': -Math.PI / 8,
    ahead: 0,
    'slightly right': Math.PI / 8,
    right: Math.PI / 4,
  };
  return map[dir] ?? 0;
}
