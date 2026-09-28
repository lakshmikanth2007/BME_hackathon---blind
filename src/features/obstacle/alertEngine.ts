/**
 * Turns a set of detected obstacles into at most one spoken alert per tick,
 * applying urgency tiers, priority (nearest / most dangerous), rate-limiting
 * and de-duplication.
 */
import { DetectedObject, ObstacleType } from '@/config/types';
import { DISTANCE, TIMING } from '@/config/thresholds';

export type Urgency = 'silent' | 'normal' | 'urgent';

export interface Alert {
  urgency: Urgency;
  text: string;
  object: DetectedObject;
}

/** Obstacles that always win priority regardless of distance ordering. */
const HIGH_DANGER: ObstacleType[] = ['stairs', 'vehicle'];

export function urgencyFor(distanceM: number): Urgency {
  if (distanceM < DISTANCE.URGENT_M) return 'urgent';
  if (distanceM <= DISTANCE.NORMAL_M) return 'normal';
  return 'silent';
}

export function formatAlert(obj: DetectedObject): string {
  const label = capitalise(obj.type === 'unknown' ? 'object' : obj.type);
  const dist = obj.distanceM.toFixed(1);
  return `${label}, ${dist} meters, ${obj.direction}`;
}

export function formatUrgent(obj: DetectedObject): string {
  const label = obj.type === 'unknown' ? 'obstacle' : obj.type;
  return `Stop! ${capitalise(label)} ${obj.direction}.`;
}

export class AlertEngine {
  /** Remembers last announced distance per object id for dedupe. */
  private lastDistance = new Map<string, number>();
  private lastSpokenAt = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.lastDistance.clear();
    this.lastSpokenAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Choose the single obstacle to announce this tick, or null if nothing
   * warrants speech. `now` is injectable for testing.
   */
  pick(objects: DetectedObject[], now: number = Date.now()): Alert | null {
    const candidates = objects.filter(
      (o) => o.distanceM <= DISTANCE.NORMAL_M && inCorridor(o)
    );
    if (candidates.length === 0) return null;

    // Priority: high-danger types first, then nearest.
    candidates.sort((a, b) => {
      const da = HIGH_DANGER.includes(a.type) ? 0 : 1;
      const db = HIGH_DANGER.includes(b.type) ? 0 : 1;
      if (da !== db) return da - db;
      return a.distanceM - b.distanceM;
    });

    const target = candidates[0];
    const urgency = urgencyFor(target.distanceM);

    // Urgent alerts bypass the rate limiter (safety-critical).
    if (urgency !== 'urgent') {
      if (now - this.lastSpokenAt < TIMING.ALERT_MIN_GAP_MS) return null;
      const prev = this.lastDistance.get(target.id);
      if (
        prev !== undefined &&
        Math.abs(prev - target.distanceM) < DISTANCE.RESPEAK_DELTA_M
      ) {
        return null; // hasn't moved enough to re-announce
      }
    }

    this.lastDistance.set(target.id, target.distanceM);
    this.lastSpokenAt = now;

    return {
      urgency,
      object: target,
      text: urgency === 'urgent' ? formatUrgent(target) : formatAlert(target),
    };
  }
}

/** Is the object in the walking corridor (roughly the central horizontal band)? */
function inCorridor(o: DetectedObject): boolean {
  const cx = o.box.x + o.box.w / 2;
  return cx > 0.1 && cx < 0.9;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
