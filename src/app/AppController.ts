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
import { vision, OfflineError } from '@/services/vision';

/** Cloud prompts for the camera-powered "detection" features (no on-device ML). */
const OCR_PROMPT =
  'You are reading a document to a blind person. Extract ALL readable text in ' +
  'the image, in natural reading order (top to bottom, left to right). Return ' +
  'only the text content, with no commentary. If there is no readable text, ' +
  'reply with exactly NO_TEXT.';
const OBSTACLE_PROMPT =
  'You are helping a blind person walk safely. From this forward-facing photo, ' +
  'list up to three obstacles or objects in their path, nearest first. For each, ' +
  'give the name, a rough distance (for example, about two meters), and a ' +
  'direction (left, ahead, or right), as one short spoken sentence each. If the ' +
  'path looks clear, reply with exactly: Path looks clear.';

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

  /** Periodic cloud obstacle-scan loop state. */
  private obstacleTimer: ReturnType<typeof setInterval> | null = null;
  private obstacleInFlight = false;

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
    this.voice.answer('Welcome to EyeSight, your voice assistant for the world around you.');
    this.voice.answer(
      'I can read printed text aloud, describe what the camera sees, tell you about ' +
        'obstacles ahead, guide you to a door, and narrate your surroundings live.'
    );
    this.voice.answer(
      'To use me, double-tap anywhere on the screen, then speak. For example, say ' +
        'describe this, or read this, or what is in front of me. Say help any time to hear all commands.'
    );
    this.voice.answer(
      'One reminder: I assist your white cane or guide dog. I do not replace them.'
    );
    this.voice.answer('Ready. Double-tap and speak.');
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
      // Echo what was heard so the user knows the mic worked, even when the
      // command wasn't recognised.
      this.voice.answer(`I heard, ${text}. But I didn't understand. Say help to hear the commands.`);
      return;
    }
    await this.dispatch(intent.name, intent.target);
  }

  // ---- Cloud-powered camera features (no on-device ML) --------------------

  /** Snap the page, OCR it with the vision model, then read it aloud. */
  private async readViaCloud(): Promise<void> {
    this.voice.reading('Reading the page. Hold the camera steady.');
    const media = await this.hooks.capturePhoto();
    if (!media) {
      this.voice.answer("I couldn't use the camera. Please check camera permission.");
      return;
    }
    try {
      const text = await vision.describe({
        prompt: OCR_PROMPT,
        imagesBase64: media.imagesBase64,
        maxTokens: 800,
      });
      if (!text || text.trim().toUpperCase().includes('NO_TEXT')) {
        this.voice.reading('I could not find any text. Hold the page steady and a bit closer, then say read this again.');
        return;
      }
      this.reader.loadText(text);
    } catch (e) {
      this.speakVisionError(e);
    }
  }

  /** One-shot "what's in front of me" via a single photo. */
  private async checkAheadViaCloud(): Promise<void> {
    this.voice.answer('Checking ahead.');
    const media = await this.hooks.capturePhoto();
    if (!media) {
      this.voice.answer("I couldn't use the camera. Please check camera permission.");
      return;
    }
    try {
      const text = await vision.describe({
        prompt: OBSTACLE_PROMPT,
        imagesBase64: media.imagesBase64,
        maxTokens: 200,
      });
      this.voice.answer(text);
    } catch (e) {
      this.speakVisionError(e);
    }
  }

  /** Periodic obstacle scanning: take a photo every few seconds and speak it. */
  private startCloudObstacleLoop(): void {
    if (this.obstacleTimer) return;
    this.voice.answer('Obstacle detection on. I will check the path every few seconds.');
    const tick = async () => {
      if (this.obstacleInFlight) return;
      this.obstacleInFlight = true;
      try {
        const media = await this.hooks.capturePhoto();
        if (media) {
          const text = await vision.describe({
            prompt: OBSTACLE_PROMPT,
            imagesBase64: media.imagesBase64,
            maxTokens: 160,
          });
          if (text && !/path looks clear/i.test(text)) {
            // Speak at navigation priority so it outranks ordinary answers.
            this.voice.navigation(text, 'obstacle');
          }
        }
      } catch (e) {
        this.speakVisionError(e);
        this.stopCloudObstacleLoop();
      } finally {
        this.obstacleInFlight = false;
      }
    };
    void tick();
    this.obstacleTimer = setInterval(() => void tick(), 4500);
  }

  private stopCloudObstacleLoop(): void {
    if (this.obstacleTimer) clearInterval(this.obstacleTimer);
    this.obstacleTimer = null;
    this.voice.cancelTag('obstacle');
  }

  private speakVisionError(e: unknown): void {
    if (e instanceof OfflineError) {
      // OfflineError means no API key is configured — not a network failure.
      this.voice.answer(
        'The A I vision key is not set up, so this feature cannot run. Please add a valid A P I key.'
      );
    } else {
      // A real network / server error from the vision call.
      this.voice.answer(
        'I could not reach the vision service. Please check your internet and try again.'
      );
    }
    debugLog('vision-error', String(e), 'error');
  }

  private async dispatch(name: IntentName, target?: string): Promise<void> {
    switch (name) {
      // ---- Reader (cloud OCR) ----
      case 'reader.start':
        this.modes.setPrimary('reader');
        await this.readViaCloud();
        break;

      // ---- Obstacle (cloud, periodic photo) ----
      case 'obstacle.start':
        this.modes.setObstacleOverlay(true);
        this.startCloudObstacleLoop();
        break;
      case 'obstacle.stop':
        this.stopCloudObstacleLoop();
        this.modes.setObstacleOverlay(false);
        break;
      case 'obstacle.oneshot':
        await this.checkAheadViaCloud();
        break;

      // ---- Navigation ----
      case 'navigation.start':
        this.modes.setPrimary('navigation');
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
    // Always stop the obstacle scan loop on "stop"/"cancel".
    this.stopCloudObstacleLoop();
    this.modes.setObstacleOverlay(false);
    this.voice.stopSpeaking();
    this.modes.setPrimary('idle');
  }

  async dispose(): Promise<void> {
    this.stopCloudObstacleLoop();
    await this.voice.dispose();
  }

  private setLang(lang: Language): void {
    this.voice.setLanguage(lang);
    const names = { en: 'English', hi: 'Hindi', ta: 'Tamil' } as const;
    this.voice.answer(`Switched to ${names[lang]}.`);
  }
}
