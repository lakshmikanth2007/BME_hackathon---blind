/**
 * Annotate raw detector outputs (type + box + score) with distance + direction
 * using the best available depth source, falling back to the box-size heuristic.
 */
import { DetectedObject, ObstacleType } from '@/config/types';
import { horizontalToDirection } from '@/services/camera';
import { heuristicDistance, sampleDepthMap, DepthEstimate } from '@/services/depth';

export interface RawDetection {
  id: string;
  type: ObstacleType;
  box: { x: number; y: number; w: number; h: number };
  score: number;
}

export interface DepthContext {
  depthMap?: Float32Array;
  mapW?: number;
  mapH?: number;
  /** True when the depth map is calibrated in metres (ARCore). */
  metric?: boolean;
  source?: 'arcore' | 'midas';
  frameHeightPx: number;
}

export function annotate(
  raw: RawDetection[],
  ctx: DepthContext
): DetectedObject[] {
  return raw.map((d) => {
    let est: DepthEstimate;
    if (ctx.depthMap && ctx.mapW && ctx.mapH) {
      est = sampleDepthMap(
        ctx.depthMap,
        ctx.mapW,
        ctx.mapH,
        d.box,
        !!ctx.metric,
        ctx.source ?? 'midas'
      );
    } else {
      est = heuristicDistance(d, ctx.frameHeightPx);
    }
    const centreX = d.box.x + d.box.w / 2;
    return {
      ...d,
      distanceM: est.distanceM,
      distanceApprox: est.approx,
      direction: horizontalToDirection(centreX),
    };
  });
}
