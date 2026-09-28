/**
 * VoiceController — the single owner of the shared audio channel.
 *
 * Responsibilities:
 *  - Priority speech queue: any higher-priority utterance interrupts a lower one.
 *  - Mic <-> speaker mutual exclusion: the mic is never open while TTS speaks.
 *  - Listening lifecycle: wake word / double-tap -> listen -> route intent.
 *  - Global speech knobs: rate, volume, language.
 *  - "repeat" support: remembers the last utterance per priority.
 *
 * Everything that wants to talk goes through `speak()`. Nothing calls
 * expo-speech directly.
 */
import { tts } from '@/services/tts';
import { stt } from '@/services/stt';
import { haptics } from '@/services/haptics';
import { Language, SpeechPriority } from '@/config/types';
import { TTS_DEFAULTS, TIMING } from '@/config/thresholds';
import { debugLog } from '@/state/debugLog';

export interface SpeechItem {
  text: string;
  priority: SpeechPriority;
  /** If true, drops any queued/current speech of strictly lower priority. */
  interrupt?: boolean;
  /** Tag so a feature can cancel its own pending items (e.g. stale narration). */
  tag?: string;
  onDone?: () => void;
}

export type ListenState = 'idle' | 'listening' | 'processing';

export interface VoiceControllerCallbacks {
  /** Called with the final recognised transcript to be routed to an intent. */
  onTranscript: (text: string) => void;
  /** State changes, for the UI/debug screen. */
  onListenState?: (state: ListenState) => void;
}

export class VoiceController {
  private queue: SpeechItem[] = [];
  private current: SpeechItem | null = null;
  private speaking = false;

  private language: Language = 'en';
  private rate = TTS_DEFAULTS.rate;
  private volume = 1.0;

  private listenState: ListenState = 'idle';
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  /** Auto-retries for the current listen session, so a missed start doesn't
   * force the user to double-tap again. */
  private listenRetries = 0;
  private static MAX_LISTEN_RETRIES = 1;
  /** Delay before a retry, long enough to avoid ERROR_TOO_MANY_REQUESTS. */
  private static RETRY_DELAY_MS = 900;

  /** Last thing said at each priority, for "repeat". */
  private lastSpoken = new Map<SpeechPriority, string>();

  constructor(private cb: VoiceControllerCallbacks) {}

  // ---- Configuration -------------------------------------------------------

  setLanguage(lang: Language): void {
    this.language = lang;
  }
  getLanguage(): Language {
    return this.language;
  }
  faster(): void {
    this.rate = Math.min(TTS_DEFAULTS.RATE_MAX, this.rate + TTS_DEFAULTS.RATE_STEP);
  }
  slower(): void {
    this.rate = Math.max(TTS_DEFAULTS.RATE_MIN, this.rate - TTS_DEFAULTS.RATE_STEP);
  }
  louder(): void {
    this.volume = Math.min(1, this.volume + TTS_DEFAULTS.VOLUME_STEP);
  }
  softer(): void {
    this.volume = Math.max(0.1, this.volume - TTS_DEFAULTS.VOLUME_STEP);
  }

  // ---- Speaking ------------------------------------------------------------

  /**
   * Enqueue speech. Higher priority (lower enum value) is spoken first.
   * `interrupt` cuts off any currently-playing lower-priority utterance.
   */
  speak(item: SpeechItem): void {
    debugLog('speak', `[${SpeechPriority[item.priority]}] ${item.text}`);

    // A danger/interrupt item pre-empts anything strictly lower priority.
    if (item.interrupt && this.current && this.current.priority > item.priority) {
      this.dropQueuedBelow(item.priority);
      tts.stop();
      this.speaking = false;
      // Re-queue nothing: the interrupted item is abandoned by design.
      this.current = null;
    }

    // Never speak while the mic is open — stop listening first.
    if (this.listenState === 'listening') {
      void this.stopListening();
    }

    this.insertByPriority(item);
    this.pump();
  }

  /** Convenience helpers per tier. */
  danger(text: string, tag?: string): void {
    this.speak({ text, priority: SpeechPriority.DANGER, interrupt: true, tag });
  }
  answer(text: string, onDone?: () => void): void {
    this.speak({ text, priority: SpeechPriority.ANSWER, onDone });
  }
  reading(text: string, onDone?: () => void, tag = 'reader'): void {
    this.speak({ text, priority: SpeechPriority.READING, onDone, tag });
  }
  narrate(text: string, tag = 'live'): void {
    this.speak({ text, priority: SpeechPriority.NARRATION, tag });
  }
  navigation(text: string, tag = 'nav'): void {
    this.speak({ text, priority: SpeechPriority.NAVIGATION, tag });
  }

  /** Re-read the most recent utterance at a given priority (default reading). */
  repeat(priority: SpeechPriority = SpeechPriority.READING): void {
    const last =
      this.lastSpoken.get(priority) ?? this.lastSpoken.get(SpeechPriority.ANSWER);
    if (last) this.speak({ text: last, priority });
  }

  /** Stop everything currently queued/playing (the "stop" / "cancel" command). */
  stopSpeaking(): void {
    this.queue = [];
    this.current = null;
    this.speaking = false;
    tts.stop();
  }

  /** Remove queued items belonging to a feature (e.g. stale live narration). */
  cancelTag(tag: string): void {
    this.queue = this.queue.filter((i) => i.tag !== tag);
  }

  private insertByPriority(item: SpeechItem): void {
    const idx = this.queue.findIndex((q) => q.priority > item.priority);
    if (idx === -1) this.queue.push(item);
    else this.queue.splice(idx, 0, item);
  }

  private dropQueuedBelow(priority: SpeechPriority): void {
    this.queue = this.queue.filter((i) => i.priority <= priority);
  }

  private pump(): void {
    if (this.speaking || this.current) return;
    const next = this.queue.shift();
    if (!next) return;

    this.current = next;
    this.speaking = true;
    this.lastSpoken.set(next.priority, next.text);

    tts.speak(next.text, {
      language: this.language,
      rate: this.rate,
      volume: this.volume,
      onDone: () => {
        next.onDone?.();
        this.speaking = false;
        this.current = null;
        this.pump();
      },
      onError: (e) => {
        debugLog('tts-error', String(e), 'error');
        this.speaking = false;
        this.current = null;
        this.pump();
      },
    });
  }

  // ---- Listening -----------------------------------------------------------

  /**
   * Begin listening for a command. Triggered by wake word ("Hey Eye"),
   * a double-tap, or programmatically after a prompt. Interrupts any speech
   * that is lower than DANGER (a danger alert should finish first).
   */
  async startListening(): Promise<void> {
    if (this.listenState !== 'idle') return;
    if (this.current && this.current.priority === SpeechPriority.DANGER) {
      // Let the danger alert finish, then listen.
      this.current.onDone = () => void this.startListening();
      return;
    }

    tts.stop();
    this.speaking = false;
    this.current = null;

    this.listenRetries = 0;
    this.setListenState('listening');
    haptics.tick();

    // Speak a short audible cue so the user knows the app is now listening,
    // THEN open the mic (the mic can't be open while TTS plays). This directly
    // answers "is it hearing me?".
    tts.speak('Listening', {
      language: this.language,
      rate: this.rate,
      volume: this.volume,
      onDone: () => void this.openMic(),
      onError: () => void this.openMic(),
    });
  }

  /** Actually open the microphone after the "Listening" cue. */
  private async openMic(): Promise<void> {
    if (this.listenState !== 'listening') return;
    this.listenTimer = setTimeout(() => {
      void this.stopListening();
    }, TIMING.LISTEN_TIMEOUT_MS);

    await stt.start(this.language, {
      onPartial: (text) => {
        // Live feedback: proves the mic is hearing speech.
        debugLog('stt-partial', text);
      },
      onFinal: (text) => this.handleFinal(text),
      onError: (msg) => this.handleSttError(msg),
      onEnd: () => {
        if (this.listenTimer) clearTimeout(this.listenTimer);
      },
    });
  }

  async stopListening(): Promise<void> {
    if (this.listenTimer) clearTimeout(this.listenTimer);
    await stt.stop();
    if (this.listenState === 'listening') this.setListenState('idle');
  }

  /**
   * Classify STT errors. Android reports numeric codes; the common ones during
   * normal use are "no speech" (6) and "no match" (7) — those are NOT failures,
   * they just mean the user hasn't spoken yet, so we stay quiet (a soft tick)
   * instead of nagging. Only real problems (permission, network, busy) get a
   * spoken explanation with a fix.
   */
  private handleSttError(msg: string): void {
    if (this.listenTimer) clearTimeout(this.listenTimer);
    debugLog('stt-error', msg, 'error');

    const m = msg.toLowerCase();

    if (m.includes('permission') || m.startsWith('9')) {
      this.setListenState('idle');
      this.answer(
        'I need microphone permission. Please open settings and allow the microphone for EyeSight.'
      );
      return;
    }
    if (m.includes('network') || m.startsWith('2') || m.startsWith('1 ')) {
      this.setListenState('idle');
      this.answer('Speech recognition needs an internet connection.');
      return;
    }
    // Code 10 = too many requests: the service is rate-limiting us. Never retry
    // (that makes it worse) — just wait and let the user try again.
    if (m.startsWith('10')) {
      this.setListenState('idle');
      haptics.tick();
      return;
    }

    // Benign "no speech / no match / timeout": the recognizer stopped before the
    // user spoke. Re-open the mic once (after a safe delay) so a slow start
    // doesn't force another double-tap. Then give up quietly.
    if (this.listenRetries < VoiceController.MAX_LISTEN_RETRIES) {
      this.listenRetries++;
      debugLog('stt', `re-listening (attempt ${this.listenRetries})`);
      this.setListenState('listening');
      setTimeout(() => void this.openMic(), VoiceController.RETRY_DELAY_MS);
      return;
    }

    this.setListenState('idle');
    haptics.tick(); // silent cue: "I'm ready, double-tap to try again"
  }

  private handleFinal(text: string): void {
    if (this.listenTimer) clearTimeout(this.listenTimer);
    const clean = text.trim();
    debugLog('transcript', clean);
    void stt.stop();
    if (clean.length === 0) {
      // Heard nothing usable — retry the listen window before giving up.
      if (this.listenRetries < VoiceController.MAX_LISTEN_RETRIES) {
        this.listenRetries++;
        this.setListenState('listening');
        setTimeout(() => void this.openMic(), VoiceController.RETRY_DELAY_MS);
        return;
      }
      this.setListenState('idle');
      return;
    }
    this.setListenState('processing');
    this.cb.onTranscript(clean);
    this.setListenState('idle');
  }

  private setListenState(s: ListenState): void {
    this.listenState = s;
    this.cb.onListenState?.(s);
  }

  getListenState(): ListenState {
    return this.listenState;
  }

  async dispose(): Promise<void> {
    this.stopSpeaking();
    await stt.destroy();
  }
}
