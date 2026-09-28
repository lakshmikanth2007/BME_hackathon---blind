/**
 * Speech-to-text via @react-native-voice/voice (Android SpeechRecognizer).
 * Emits partial and final transcripts. The VoiceController drives start/stop
 * and guarantees the mic is never open while TTS is speaking.
 */
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from '@react-native-voice/voice';
import { Language, LANGUAGE_TAGS } from '@/config/types';

export interface SttHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd?: () => void;
}

class SttService {
  private listening = false;
  private handlers: SttHandlers | null = null;

  constructor() {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const best = e.value?.[0];
      if (best && this.handlers) this.handlers.onFinal(best);
    };
    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const best = e.value?.[0];
      if (best && this.handlers?.onPartial) this.handlers.onPartial(best);
    };
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      this.listening = false;
      this.handlers?.onError(e.error?.message ?? 'speech recognition error');
    };
    Voice.onSpeechEnd = () => {
      this.listening = false;
      this.handlers?.onEnd?.();
    };
  }

  isListening(): boolean {
    return this.listening;
  }

  async start(language: Language, handlers: SttHandlers): Promise<void> {
    if (this.listening) await this.stop();
    this.handlers = handlers;
    this.listening = true;
    try {
      await Voice.start(LANGUAGE_TAGS[language]);
    } catch (e) {
      this.listening = false;
      handlers.onError(String(e));
    }
  }

  async stop(): Promise<void> {
    this.listening = false;
    try {
      await Voice.stop();
    } catch {
      /* ignore — already stopped */
    }
  }

  async destroy(): Promise<void> {
    try {
      await Voice.destroy();
      Voice.removeAllListeners();
    } catch {
      /* ignore */
    }
  }
}

export const stt = new SttService();
