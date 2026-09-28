/**
 * Thin wrapper over expo-speech. The VoiceController is the only thing that
 * should call these directly — everyone else goes through the speech queue so
 * priorities and interruption are respected.
 */
import * as Speech from 'expo-speech';
import { Language, LANGUAGE_TAGS } from '@/config/types';
import { TTS_DEFAULTS } from '@/config/thresholds';

export interface SpeakOptions {
  language: Language;
  rate: number;
  volume: number;
  onDone?: () => void;
  onError?: (e: unknown) => void;
}

export const tts = {
  speak(text: string, opts: SpeakOptions): void {
    Speech.speak(text, {
      language: LANGUAGE_TAGS[opts.language],
      rate: clampRate(opts.rate),
      pitch: TTS_DEFAULTS.pitch,
      volume: Math.max(0, Math.min(1, opts.volume)),
      onDone: opts.onDone,
      onStopped: opts.onDone,
      onError: opts.onError,
    });
  },

  stop(): void {
    // Immediately cuts current utterance; used for interruption.
    Speech.stop();
  },

  async isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
  },
};

function clampRate(rate: number): number {
  return Math.max(TTS_DEFAULTS.RATE_MIN, Math.min(TTS_DEFAULTS.RATE_MAX, rate));
}
