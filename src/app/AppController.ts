/**
 * AppController — the glue between recognised intents and the feature modules.
 * Owns the VoiceController, the mode machine, and every feature controller.
 * The UI layer feeds it camera frames / detections and forwards double-taps.
 */
import { VoiceController } from '@/voice/VoiceController';
import { routeIntent } from '@/voice/intentRouter';
import { IntentName } from '@/voice/intents';
import { ModeMachine } from '@/state/modeMachine';
import { Language, SpeechPriority } from '@/config/types';
import { debugLog } from '@/state/debugLog';
import { ReaderController } from '@/features/reader/ReaderController';
import { ObstacleController } from '@/features/obstacle/ObstacleController';
import { SummaryController, CapturedMedia } from '@/features/summary/SummaryController';
import { LiveController, FrameGrabber } from '@/features/live/LiveController';
import {
  NavigationController,
  NavFrameGrabber,
  DepthRays,
} from '@/features/navigation/NavigationController';

const HELP_TEXT =
  'You can say: read this, what is in front of me, start obstacle detection, ' +
  'find the way out, describe this, take a picture, record a video, start live, ' +
  'or pause, repeat, faster, slower, and stop.';

export interface AppHooks {
  capturePhoto: () => Promise<CapturedMedia | null>;
  captureVideo: () => Promise<CapturedMedia | null>;
  liveFrameGrabber: FrameGrabber;
  navFrameGrabber: NavFrameGrabber;
  depthRays: DepthRays;
}

export class AppController {
  readonly voice: VoiceController;
  readonly modes = new ModeMachine();
  readonly reader: ReaderController;
  readonly obstacle: ObstacleController;
  readonly summary: SummaryController;
  readonly live: LiveController;
  readonly navigation: NavigationController;

  constructor(private hooks: AppHooks) {
    this.voice = new VoiceController({
      onTranscript: (t) => void this.handleTranscript(t),
    });
    this.reader = new ReaderController(this.voice);
    this.obstacle = new ObstacleController(this.voice);
    this.summary = new SummaryController(this.voice);
    this.live = new LiveController(this.voice, hooks.liveFrameGrabber);
    this.navigation = new NavigationController(
      this.voice,
      hooks.navFrameGrabber,
      hooks.depthRays
    );
  }

  /** Launch greeting, spoken once on startup. */
  greet(): void {
    this.voice.answer('EyeSight ready. Say a command, or double-tap to talk.');
    this.voice.answer(
      'A reminder: I assist your white cane or guide dog. I do not replace them.'
    );
  }

  /** Double-tap fallback from the UI. */
  onDoubleTap(): void {
    void this.voice.startListening();
  }

  /** Wake word ("Hey Eye") fired from Porcupine. */
  onWakeWord(): void {
    void this.voice.startListening();
  }

  async handleTranscript(text: string): Promise<void> {
    const { intent, confidence } = routeIntent(text);
    debugLog('intent', `${text} -> ${intent?.name ?? 'none'} (${confidence.toFixed(2)})`);

    if (!intent) {
      // If a summary/live context is open, treat as a grounded question.
      if (this.summary.hasMedia() && (await this.summary.followUp(text))) return;
      if (this.live.isRunning() && (await this.live.question(text))) return;
      this.voice.answer("I didn't understand. Say help to hear the commands.");
      return;
    }
    await this.dispatch(intent.name, intent.target);
  }

  private async dispatch(name: IntentName, target?: string): Promise<void> {
    switch (name) {
      // ---- Reader ----
      case 'reader.start':
        this.modes.setPrimary('reader');
        this.reader.start();
        break;

      // ---- Obstacle ----
      case 'obstacle.start':
        this.modes.setObstacleOverlay(true);
        this.obstacle.start();
        break;
      case 'obstacle.stop':
        this.obstacle.stop();
        this.modes.setObstacleOverlay(false);
        break;
      case 'obstacle.oneshot':
        this.obstacle.describeAhead();
        break;

      // ---- Navigation ----
      case 'navigation.start':
        this.modes.setPrimary('navigation');
        this.modes.setObstacleOverlay(true);
        this.obstacle.start();
        await this.navigation.start(target ?? 'door');
        break;

      // ---- Summary ----
      case 'summary.photo': {
        this.modes.setPrimary('summary');
        const media = await this.hooks.capturePhoto();
        if (media) await this.summary.summarise(media, 'photo');
        else this.voice.answer("I couldn't take the photo.");
        break;
      }
      case 'summary.video': {
        this.modes.setPrimary('summary');
        this.voice.answer('Recording ten seconds. Hold steady.');
        const media = await this.hooks.captureVideo();
        if (media) await this.summary.summarise(media, 'video');
        else this.voice.answer("I couldn't record the video.");
        break;
      }

      // ---- Live ----
      case 'live.start':
        this.modes.setPrimary('live');
        this.live.start();
        break;
      case 'live.stop':
        this.live.stop();
        this.modes.setPrimary('idle');
        break;

      // ---- Context-aware controls ----
      case 'control.pause':
        this.reader.pause();
        break;
      case 'control.resume':
        this.reader.resume();
        break;
      case 'control.repeat':
        this.routeRepeat();
        break;
      case 'control.repeatParagraph':
        this.reader.repeatParagraph();
        break;
      case 'control.skip':
        this.reader.skip();
        break;
      case 'control.back':
        this.reader.back();
        break;
      case 'control.stop':
      case 'control.cancel':
        this.stopCurrent();
        break;
      case 'control.faster':
        this.voice.faster();
        this.voice.answer('Faster.');
        break;
      case 'control.slower':
        this.voice.slower();
        this.voice.answer('Slower.');
        break;
      case 'control.louder':
        this.voice.louder();
        this.voice.answer('Louder.');
        break;
      case 'control.softer':
        this.voice.softer();
        this.voice.answer('Softer.');
        break;

      // ---- Language ----
      case 'lang.english':
        this.setLang('en');
        break;
      case 'lang.hindi':
        this.setLang('hi');
        break;
      case 'lang.tamil':
        this.setLang('ta');
        break;

      // ---- Meta ----
      case 'meta.help':
        this.voice.answer(HELP_TEXT);
        break;
      case 'meta.where':
        this.voice.answer(this.modes.describeLocation());
        break;
    }
  }

  private routeRepeat(): void {
    const mode = this.modes.get().primary;
    if (mode === 'reader') this.reader.repeat();
    else this.voice.repeat(SpeechPriority.ANSWER);
  }

  private stopCurrent(): void {
    const mode = this.modes.get().primary;
    switch (mode) {
      case 'reader':
        this.reader.stop();
        break;
      case 'live':
        this.live.stop();
        break;
      case 'navigation':
        this.navigation.stop();
        break;
    }
    this.voice.stopSpeaking();
    this.modes.setPrimary('idle');
  }

  private setLang(lang: Language): void {
    this.voice.setLanguage(lang);
    const names = { en: 'English', hi: 'Hindi', ta: 'Tamil' } as const;
    this.voice.answer(`Switched to ${names[lang]}.`);
  }

  async dispose(): Promise<void> {
    await this.voice.dispose();
  }
}
