/**
 * Feature 2: Obstacle detection + alerts.
 * Consumes per-frame detections (from a TFLite frame processor) already
 * annotated with distance + direction, and drives danger speech, haptics and
 * proximity beeps. Runs as an overlay; can coexist with navigation and live.
 */
import { VoiceController } from '@/voice/VoiceController';
import { DetectedObject } from '@/config/types';
import { haptics, proximityBeep } from '@/services/haptics';
import { debugLog } from '@/state/debugLog';
import { AlertEngine, formatAlert } from './alertEngine';

export interface BeepController {
  /** Start/adjust a repeating beep. */
  set(intervalMs: number, pitchHz: number): void;
  stop(): void;
}

export class ObstacleController {
  private engine = new AlertEngine();
  private running = false;
  private latest: DetectedObject[] = [];

  constructor(
    private voice: VoiceController,
    private beep?: BeepController
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    this.running = true;
    this.engine.reset();
    this.voice.answer('Obstacle detection on.');
    debugLog('obstacle', 'start');
  }

  stop(): void {
    this.running = false;
    this.beep?.stop();
    this.voice.answer('Obstacle detection off.');
    debugLog('obstacle', 'stop');
  }

  /** Called every frame with detections carrying distance + direction. */
  onDetections(objects: DetectedObject[]): void {
    this.latest = objects;
    if (!this.running) return;

    const alert = this.engine.pick(objects);
    if (!alert) {
      this.beep?.stop();
      return;
    }

    if (alert.urgency === 'urgent') {
      this.voice.danger(alert.text, 'obstacle');
      haptics.danger();
      const b = proximityBeep(alert.object.distanceM);
      if (b && this.beep) this.beep.set(b.intervalMs, b.pitchHz);
    } else {
      // Normal alerts ride the NAVIGATION-adjacent priority via danger tier? No:
      // normal obstacle info is an ANSWER-level spoken alert.
      this.voice.speak({
        text: alert.text,
        priority: 1, // NAVIGATION tier: above answers, below danger
        tag: 'obstacle',
      });
      this.beep?.stop();
    }
  }

  /** One-shot "what's in front of me?" — answers even when not running. */
  describeAhead(): void {
    const inFront = this.latest
      .filter((o) => o.box.x + o.box.w / 2 > 0.3 && o.box.x + o.box.w / 2 < 0.7)
      .sort((a, b) => a.distanceM - b.distanceM);
    if (inFront.length === 0) {
      this.voice.answer('Nothing detected directly ahead.');
      return;
    }
    const nearest = inFront[0];
    const approx = nearest.distanceApprox ? ' Distance is approximate.' : '';
    this.voice.answer(`${formatAlert(nearest)}.${approx}`);
  }
}
