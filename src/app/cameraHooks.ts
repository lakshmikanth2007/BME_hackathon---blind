/**
 * Bridges the react-native-vision-camera layer to the feature controllers.
 *
 * The heavy native pieces — frame processors for TFLite object detection and
 * ML Kit OCR, ARCore/MiDaS depth, photo/video capture — are attached to the
 * <Camera> component in App.tsx and pushed here via `registerCamera`. Until a
 * dev build with those native modules is running, the grabbers return null and
 * the app degrades gracefully (spoken "camera not ready").
 *
 * This indirection keeps AppController free of React/native-camera types and
 * makes the whole pipeline unit-testable with fakes.
 */
import { CapturedMedia } from '@/features/summary/SummaryController';

export interface CameraBridge {
  takePhoto: () => Promise<CapturedMedia | null>;
  recordVideo: (maxMs: number) => Promise<CapturedMedia | null>;
  grabFrame: () => Promise<{ base64: string; hash: string } | null>;
  depthRays: () => { bearingRad: number; distanceM: number }[];
}

let bridge: CameraBridge | null = null;

export function registerCamera(b: CameraBridge): void {
  bridge = b;
}

export function makeAppHooks(videoMaxMs: number) {
  return {
    capturePhoto: async () => (bridge ? bridge.takePhoto() : null),
    captureVideo: async () => (bridge ? bridge.recordVideo(videoMaxMs) : null),
    liveFrameGrabber: async () => (bridge ? bridge.grabFrame() : null),
    navFrameGrabber: async () => {
      const f = bridge ? await bridge.grabFrame() : null;
      return f?.base64 ?? null;
    },
    depthRays: () => (bridge ? bridge.depthRays() : []),
  };
}
