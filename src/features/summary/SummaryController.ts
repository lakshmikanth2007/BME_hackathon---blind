/**
 * Feature 4: Photo / short-video summary + grounded follow-up questions.
 * The camera layer hands us captured media (base64 JPEG frames + optional
 * audio transcript). We call the VLM, speak the summary, and keep the media so
 * follow-ups ("what does the sign say?", "how many people?") stay grounded.
 */
import { VoiceController } from '@/voice/VoiceController';
import { vision, OfflineError } from '@/services/vision';
import { SCENE_SUMMARY_PROMPT, followUpPrompt } from '@/voice/prompts';
import { debugLog } from '@/state/debugLog';

export interface CapturedMedia {
  imagesBase64: string[];
  transcript?: string;
}

export class SummaryController {
  private media: CapturedMedia | null = null;
  private lastSummary = '';

  constructor(private voice: VoiceController) {}

  async summarise(media: CapturedMedia, kind: 'photo' | 'video'): Promise<void> {
    this.media = media;
    this.voice.answer(kind === 'photo' ? 'Got the photo. Describing.' : 'Video captured. Describing.');
    try {
      const text = await vision.describe({
        prompt: SCENE_SUMMARY_PROMPT,
        imagesBase64: media.imagesBase64,
        transcript: media.transcript,
        maxTokens: 500,
      });
      this.lastSummary = text;
      this.voice.answer(text);
      debugLog('summary', text);
    } catch (e) {
      this.handleError(e);
    }
  }

  /** Answer a follow-up grounded in the same media. Returns true if handled. */
  async followUp(question: string): Promise<boolean> {
    if (!this.media) return false;
    // Local shortcuts that don't need the model.
    if (/\b(repeat)\b/i.test(question) && this.lastSummary) {
      this.voice.answer(this.lastSummary);
      return true;
    }
    try {
      const text = await vision.describe({
        prompt: buildFollowUp(question),
        imagesBase64: this.media.imagesBase64,
        transcript: this.media.transcript,
        maxTokens: 300,
      });
      if (/shorter/i.test(question)) this.lastSummary = text;
      this.voice.answer(text);
      return true;
    } catch (e) {
      this.handleError(e);
      return true;
    }
  }

  hasMedia(): boolean {
    return this.media !== null;
  }

  clear(): void {
    this.media = null;
    this.lastSummary = '';
  }

  private handleError(e: unknown): void {
    if (e instanceof OfflineError) {
      this.voice.answer('No internet. Scene description needs a connection.');
    } else {
      this.voice.answer("I couldn't describe that. Please try again.");
    }
  }
}

function buildFollowUp(question: string): string {
  if (/shorter/i.test(question)) return followUpPrompt('Summarise more briefly.');
  if (/more detail|details/i.test(question))
    return followUpPrompt('Give more detail about the scene.');
  return followUpPrompt(question);
}
