/**
 * Camera helpers around react-native-vision-camera. Provides direction mapping
 * and posture gating that the feature modules rely on. Frame capture / photo /
 * video are performed by the Camera component in the UI layer and handed to
 * features; this module holds the pure, testable pieces.
 */
import { Direction } from '@/config/types';
import { POSTURE } from '@/config/thresholds';

/** Map a horizontal box centre (0..1) to a spoken direction. */
export function horizontalToDirection(centreX: number): Direction {
  if (centreX < 0.2) return 'left';
  if (centreX < 0.4) return 'slightly left';
  if (centreX < 0.6) return 'ahead';
  if (centreX < 0.8) return 'slightly right';
  return 'right';
}

/**
 * Decide whether frame processing should run given device attitude.
 * Accelerometer gravity vector (x,y,z, in g). We want the phone roughly
 * upright (screen facing the user, camera forward), not flat or pocketed.
 */
export function shouldProcessFrames(gravity: {
  x: number;
  y: number;
  z: number;
}): boolean {
  // Tilt from vertical: angle between device -Z axis and gravity.
  const norm = Math.hypot(gravity.x, gravity.y, gravity.z) || 1;
  const tiltRad = Math.acos(Math.min(1, Math.abs(gravity.y) / norm));
  const tiltDeg = (tiltRad * 180) / Math.PI;
  return tiltDeg <= POSTURE.MAX_TILT_DEG;
}
