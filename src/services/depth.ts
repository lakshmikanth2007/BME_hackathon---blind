/**
 * Distance estimation with graceful degradation:
 *   1. ARCore depth API (when available on device)   -> accurate
 *   2. MiDaS-small monocular depth (TFLite)           -> approximate
 *   3. Bounding-box-size heuristic                    -> approximate
 *
 * The native depth sources are wired at the app boundary; this module exposes
 * a uniform interface and always provides the heuristic fallback so the demo
 * works on any device. When we fall back, `approx` is true and the obstacle
 * feature says "distance is approximate".
 */
import { DetectedObject, ObstacleType } from '@/config/types';

export type DepthSource = 'arcore' | 'midas' | 'heuristic';

export interface DepthEstimate {
  distanceM: number;
  approx: boolean;
  source: DepthSource;
}

/** Rough real-world heights (metres) used to invert bounding-box size -> range. */
const TYPICAL_HEIGHT_M: Record<ObstacleType, number> = {
  person: 1.7,
  chair: 0.9,
  door: 2.0,
  wall: 2.2,
  pole: 2.0,
  vehicle: 1.5,
  stairs: 1.0,
  unknown: 1.0,
};

/**
 * Pinhole heuristic: distance ≈ (realHeight * focalPx) / boxHeightPx.
 * We approximate focal length from a typical phone vertical FOV (~55°).
 */
export function heuristicDistance(
  obj: Pick<DetectedObject, 'type' | 'box'>,
  frameHeightPx: number
): DepthEstimate {
  const vFovRad = (55 * Math.PI) / 180;
  const focalPx = frameHeightPx / (2 * Math.tan(vFovRad / 2));
  const boxHeightPx = Math.max(1, obj.box.h * frameHeightPx);
  const real = TYPICAL_HEIGHT_M[obj.type] ?? 1.0;
  const distance = (real * focalPx) / boxHeightPx;
  return {
    distanceM: clamp(distance, 0.2, 15),
    approx: true,
    source: 'heuristic',
  };
}

/**
 * Sample a depth map (0..1 near..far normalised, or metres if calibrated) at
 * the centre of a bounding box. Used for MiDaS/ARCore paths.
 */
export function sampleDepthMap(
  depthMap: Float32Array,
  mapW: number,
  mapH: number,
  box: DetectedObject['box'],
  metric: boolean,
  source: DepthSource
): DepthEstimate {
  const cx = Math.floor((box.x + box.w / 2) * mapW);
  const cy = Math.floor((box.y + box.h / 2) * mapH);
  const idx = clampInt(cy, 0, mapH - 1) * mapW + clampInt(cx, 0, mapW - 1);
  const raw = depthMap[idx] ?? 0;
  // MiDaS gives relative inverse-depth; map to a plausible metre range.
  const distanceM = metric ? raw : clamp(0.3 + (1 - raw) * 6, 0.3, 12);
  return { distanceM: clamp(distanceM, 0.2, 15), approx: !metric, source };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clampInt(v: number, lo: number, hi: number): number {
  return Math.round(clamp(v, lo, hi));
}
