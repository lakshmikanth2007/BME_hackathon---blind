/**
 * Feature 1: Live Document Reader.
 * States: idle -> framing -> reading -> paused -> finished.
 * Wires the framing assistant, text stitcher and reading buffer to the
 * VoiceController's READING speech tier.
 */
import { VoiceController } from '@/voice/VoiceController';
import { SpeechPriority } from '@/config/types';
import { debugLog } from '@/state/debugLog';
import { TextStitcher, OcrLine, toSentences } from './textStitcher';
import { ReadingBuffer } from './readingBuffer';
import { FramingAssistant, FRAMING_SPEECH, PageGeometry } from './framingAssistant';

export type ReaderState = 'idle' | 'framing' | 'reading' | 'paused' | 'finished';

export class ReaderController {
  private state: ReaderState = 'idle';
  private stitcher = new TextStitcher();
  private buffer = new ReadingBuffer();
  private framing = new FramingAssistant();
  private lastCue = '';

  constructor(private voice: VoiceController) {}

  getState(): ReaderState {
    return this.state;
  }

  start(): void {
    this.stitcher.reset();
    this.buffer.reset();
    this.framing.reset();
    this.state = 'framing';
    this.voice.reading('Document reader ready. Point at the page.');
    debugLog('reader', 'start -> framing');
  }

  /**
   * Cloud path: load already-extracted text (from the vision model's OCR) and
   * start reading it immediately, with full pause/repeat/skip/back support.
   */
  loadText(text: string): void {
    this.stitcher.reset();
    this.framing.reset();
    this.buffer.reset();
    this.buffer.setSentences(toSentences(text));
    this.state = 'reading';
    this.reading = false;
    debugLog('reader', 'cloud text loaded -> reading');
    this.readNext();
  }

  /** Called by the camera layer while framing, with detected page geometry. */
  onFrameGeometry(g: PageGeometry): void {
    if (this.state !== 'framing') return;
    const { cue, ready } = this.framing.evaluate(g);
    if (cue !== this.lastCue) {
      this.voice.reading(FRAMING_SPEECH[cue]);
      this.lastCue = cue;
    }
    if (ready) this.beginReading();
  }

  /** Called with OCR lines each frame (during framing and reading). */
  onOcr(lines: OcrLine[]): void {
    if (this.state === 'idle' || this.state === 'paused') return;
    const added = this.stitcher.addFrame(lines);
    if (added.length) {
      this.buffer.append(toSentences(this.stitcher.getText()));
      if (this.state === 'reading') this.readNextIfIdle();
    }
  }

  private beginReading(): void {
    this.state = 'reading';
    this.buffer.setSentences(toSentences(this.stitcher.getText()));
    debugLog('reader', 'framing -> reading');
    this.readNext();
  }

  private reading = false;
  private readNextIfIdle(): void {
    if (!this.reading) this.readNext();
  }

  private readNext(): void {
    if (this.state !== 'reading') return;
    const sentence = this.buffer.next();
    if (!sentence) {
      // Wait for more stitched text; if none arrives the frame loop will retry.
      this.reading = false;
      if (!this.buffer.hasNext()) this.finishPage();
      return;
    }
    this.reading = true;
    this.voice.reading(sentence, () => {
      this.reading = false;
      this.readNext();
    });
  }

  private finishPage(): void {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.voice.reading('End of page. Turn the page and say continue.');
    debugLog('reader', 'reading -> finished');
  }

  // ---- Voice controls ------------------------------------------------------

  pause(): void {
    if (this.state !== 'reading') return;
    this.state = 'paused';
    this.reading = false;
    this.voice.stopSpeaking();
    this.voice.reading('Paused.');
    debugLog('reader', 'paused');
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'reading';
      this.readNext();
    } else if (this.state === 'finished') {
      // "continue" after end-of-page -> capture the next page.
      this.start();
    }
    debugLog('reader', 'resume');
  }

  repeat(): void {
    const s = this.buffer.repeatLast();
    if (s) this.voice.reading(s);
  }

  repeatParagraph(): void {
    const p = this.buffer.repeatParagraph();
    if (p) this.voice.reading(p);
  }

  skip(): void {
    this.buffer.skip();
    if (this.state === 'reading' && !this.reading) this.readNext();
    else if (this.state === 'paused') this.voice.reading('Skipped.');
  }

  back(): void {
    this.buffer.back();
    if (this.state === 'paused') {
      this.state = 'reading';
    }
    this.reading = false;
    this.readNext();
  }

  stop(): void {
    this.state = 'idle';
    this.reading = false;
    this.voice.stopSpeaking();
    debugLog('reader', 'stopped');
  }
}
