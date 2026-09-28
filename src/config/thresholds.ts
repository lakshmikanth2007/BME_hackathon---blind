/**
 * Central tuning constants. Every magic number lives here so the demo can be
 * calibrated on-site without hunting through feature code.
 */

export const DISTANCE = {
  /** Beyond this, obstacles are silent unless the user explicitly asks. */
  IGNORE_M: 3.0,
  /** 1..3 m -> normal spoken alert. */
  NORMAL_M: 3.0,
  /** Under this -> urgent "Stop!" + strong haptic + rising beep. */
  URGENT_M: 1.0,
  /** Only re-announce an obstacle if its distance changed by at least this. */
  RESPEAK_DELTA_M: 0.4,
} as const;

export const FRAME = {
  /** Obstacle detection target frame rate. */
  OBSTACLE_FPS: 12,
  /** Live-mode: send one frame to the VLM every N ms. */
  LIVE_SAMPLE_MS: 2500,
  /** Reader: OCR a frame every N ms while framing/reading. */
  READER_SAMPLE_MS: 500,
  /** Skip a live/summary frame if it is at least this similar to the last one. */
  FRAME_SIMILARITY_SKIP: 0.92,
  /** Path guidance: recompute route every N ms. */
  NAV_RECOMPUTE_MS: 1000,
} as const;

export const TIMING = {
  /** Max time we wait for on-device command -> response start. */
  RESPONSE_BUDGET_MS: 1500,
  /** How long the mic listens after a wake before giving up. */
  LISTEN_TIMEOUT_MS: 10000,
  /** Video summary auto-stop. */
  VIDEO_MAX_MS: 10000,
  /** Debounce for re-speaking identical alerts. */
  ALERT_MIN_GAP_MS: 1200,
} as const;

export const OCR = {
  /** Two lines are "the same" if similarity >= this (dedupe across frames). */
  LINE_DUP_SIMILARITY: 0.82,
  /** A page is "steady" once frame-to-frame motion is under this (0..1). */
  STEADY_MOTION_MAX: 0.06,
  /** Consecutive steady frames required before auto-reading. */
  STEADY_FRAMES: 3,
} as const;

export const TTS_DEFAULTS = {
  rate: 1.0,
  pitch: 1.0,
  RATE_STEP: 0.15,
  RATE_MIN: 0.5,
  RATE_MAX: 2.0,
  VOLUME_STEP: 0.15,
} as const;

/** Attitude gating: pause frame processing when the phone is not roughly upright. */
export const POSTURE = {
  /** Degrees from vertical allowed before we assume the phone is pocketed/flat. */
  MAX_TILT_DEG: 55,
} as const;
