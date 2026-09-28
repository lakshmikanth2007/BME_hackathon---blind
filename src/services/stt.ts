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
      // Android surfaces a code (e.g. "7/No match", "6/No speech") plus a
      // message; forward both so the controller can distinguish benign
      // "nothing heard" from real failures (permissions, network).
      const code = e.error?.code ?? '';
      const message = e.error?.message ?? 'speech recognition error';
      this.handlers?.onError(`${code} ${message}`.trim());
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
      // Android options: prefer the on-line Google engine, emit partial results
      // (so we get live feedback), and allow a longer pause before the engine
      // decides the user has finished — this makes short commands far more
      // reliable to capture.
      await Voice.start(LANGUAGE_TAGS[language], {
        EXTRA_PARTIAL_RESULTS: true,
        RECOGNIZER_ENGINE: 'GOOGLE',
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
        EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1500,
      });
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
