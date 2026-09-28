/** Shared domain types used across features and services. */

export type Language = 'en' | 'hi' | 'ta';

export const LANGUAGE_TAGS: Record<Language, string> = {
  en: 'en-US',
  hi: 'hi-IN',
  ta: 'ta-IN',
};

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
};

/** Priority tiers for the shared speech channel. Lower number = spoken first. */
export enum SpeechPriority {
  DANGER = 0,
  NAVIGATION = 1,
  ANSWER = 2,
  READING = 3,
  NARRATION = 4,
}

export type Direction =
  | 'left'
  | 'slightly left'
  | 'ahead'
  | 'slightly right'
  | 'right';

export type ObstacleType =
  | 'wall'
  | 'door'
  | 'person'
  | 'chair'
  | 'pole'
  | 'vehicle'
  | 'stairs'
  | 'unknown';

export interface DetectedObject {
  id: string;
  type: ObstacleType;
  /** Normalised bounding box, values 0..1 relative to frame. */
  box: { x: number; y: number; w: number; h: number };
  /** Detector confidence 0..1. */
  score: number;
  /** Metres. May be approximate (see distanceApprox). */
  distanceM: number;
  distanceApprox: boolean;
  direction: Direction;
}

export interface FrameMeta {
  width: number;
  height: number;
  timestamp: number;
}
