/**
 * Stitches OCR results across frames into a single, de-duplicated, ordered
 * document. ML Kit gives us lines with bounding boxes per frame; as the camera
 * drifts we see overlapping lines. We keep reading order (top-to-bottom, and
 * left-to-right for columns) and never admit a line we've already captured.
 */
import { similarity, normalise } from '@/voice/fuzzy';
import { OCR } from '@/config/thresholds';

export interface OcrLine {
  text: string;
  /** Normalised box in frame coords (0..1). */
  box: { x: number; y: number; w: number; h: number };
}

export class TextStitcher {
  /** Committed lines in reading order. */
  private lines: string[] = [];
  private seen: string[] = [];

  reset(): void {
    this.lines = [];
    this.seen = [];
  }

  /** Ingest one frame's OCR lines; returns any newly added lines. */
  addFrame(frameLines: OcrLine[]): string[] {
    // Order within the frame: rows top->bottom, then columns left->right.
    const ordered = [...frameLines].sort((a, b) => {
      const rowGap = a.box.y - b.box.y;
      if (Math.abs(rowGap) > 0.03) return rowGap; // different rows
      return a.box.x - b.box.x; // same row -> left to right
    });

    const added: string[] = [];
    for (const line of ordered) {
      const t = line.text.trim();
      if (!t) continue;
      if (this.isDuplicate(t)) continue;
      this.seen.push(normalise(t));
      this.lines.push(t);
      added.push(t);
    }
    return added;
  }

  private isDuplicate(text: string): boolean {
    const n = normalise(text);
    return this.seen.some((s) => similarity(s, n) >= OCR.LINE_DUP_SIMILARITY);
  }

  getText(): string {
    return this.lines.join(' ');
  }

  getLines(): string[] {
    return [...this.lines];
  }
}

/** Split committed text into sentences for chunked reading. */
export function toSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]?/g)
    ?.map((s) => s.trim())
    .filter((s) => s.length > 0) ?? [];
}

/** Group sentences into paragraphs by blank-ish gaps (heuristic on length). */
export function toParagraphs(sentences: string[]): string[][] {
  const paras: string[][] = [];
  let cur: string[] = [];
  for (const s of sentences) {
    cur.push(s);
    if (cur.length >= 3) {
      paras.push(cur);
      cur = [];
    }
  }
  if (cur.length) paras.push(cur);
  return paras;
}
