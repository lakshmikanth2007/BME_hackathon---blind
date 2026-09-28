/**
 * Haptics + proximity audio tones. Used by obstacle detection for the
 * under-1-metre "danger" experience: strong pulse + a rising beep whose
 * pitch/interval tightens as the obstacle gets closer.
 */
import * as Haptics from 'expo-haptics';
import { DISTANCE } from '@/config/thresholds';

export const haptics = {
  /** Strong pulse for imminent collision. */
  danger(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {}
    );
  },

  /** Light tick for confirmations. */
  tick(): void {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },

  success(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
  },
};

/**
 * Map a distance to a proximity-beep cadence. Closer = shorter interval and
 * higher pitch. Returns null when the object is far enough to stay silent.
 * The actual tone generation is done by the audio-tone service on the platform;
 * this keeps the mapping testable and device-independent.
 */
export function proximityBeep(distanceM: number): {
  intervalMs: number;
  pitchHz: number;
} | null {
  if (distanceM > DISTANCE.URGENT_M) return null;
  const t = Math.max(0, Math.min(1, distanceM / DISTANCE.URGENT_M)); // 0 close .. 1 at 1m
  return {
    intervalMs: Math.round(120 + t * 480), // 120ms (touching) .. 600ms (~1m)
    pitchHz: Math.round(1200 - t * 500), // 1200Hz close .. 700Hz far
  };
}
