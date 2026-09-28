/**
 * Feature 5: Live Mode. Streams sampled frames to the VLM and narrates only
 * what CHANGED. Obstacle alerts always outrank narration (handled by the
 * speech-priority tiers). Interruptible questions are grounded in the current
 * frame. Cost/battery: skip near-identical frames, cap API rate, low-res.
 */
import { VoiceController } from '@/voice/VoiceController';
import { vision, OfflineError } from '@/services/vision';
import { livePrompt, followUpPrompt } from '@/voice/prompts';
import { FRAME } from '@/config/thresholds';
import { debugLog } from '@/state/debugLog';

/** Provided by the camera layer: grab the current low-res frame as base64. */
export type FrameGrabber = () => Promise<{ base64: string; hash: string } | null>;

export class LiveController {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastNarration = '';
  private lastHash = '';
  private inFlight = false;
  private currentFrame: string | null = null;

  constructor(
    private voice: VoiceController,
    private grab: FrameGrabber
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNarration = '';
    this.lastHash = '';
    this.voice.answer('Live mode on. I will describe changes around you.');
    this.timer = setInterval(() => void this.tick(), FRAME.LIVE_SAMPLE_MS);
    debugLog('live', 'start');
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.voice.cancelTag('live');
    this.voice.answer('Live mode off.');
    debugLog('live', 'stop');
  }

  private async tick(): Promise<void> {
    if (!this.running || this.inFlight) return;
    const frame = await this.grab();
    if (!frame) return;

    // Skip near-identical frames (cheap hash-similarity gate).
    if (frameSimilar(this.lastHash, frame.hash)) return;
    this.lastHash = frame.hash;
    this.currentFrame = frame.base64;

    this.inFlight = true;
    try {
      const text = await vision.describe({
        prompt: livePrompt(this.lastNarration),
        imagesBase64: [frame.base64],
        maxTokens: 120,
      });
      if (text && text.trim().toUpperCase() !== 'NO_CHANGE') {
        this.lastNarration = text;
        this.voice.narrate(text);
        debugLog('live', text);
      }
    } catch (e) {
      if (e instanceof OfflineError) {
        this.voice.answer('No internet, live mode is limited.');
        this.stop();
      }
    } finally {
      this.inFlight = false;
    }
  }

  /** Answer an interrupting question grounded in the current frame. */
  async question(q: string): Promise<boolean> {
    const frame = this.currentFrame ?? (await this.grab())?.base64;
    if (!frame) return false;
    try {
      const text = await vision.describe({
        prompt: followUpPrompt(q),
        imagesBase64: [frame],
        maxTokens: 150,
      });
      this.voice.answer(text);
      return true;
    } catch {
      this.voice.answer("I couldn't see that clearly.");
      return true;
    }
  }
}

/** Very rough perceptual-hash similarity gate (Hamming on hex strings). */
export function frameSimilar(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length >= FRAME.FRAME_SIMILARITY_SKIP;
}
