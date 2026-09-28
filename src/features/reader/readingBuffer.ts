/**
 * Maintains the reading position over the stitched sentence list so pause,
 * resume, repeat, repeat-paragraph, skip and back all work even if the camera
 * has moved away from the page.
 */
export class ReadingBuffer {
  private sentences: string[] = [];
  /** Index of the sentence to be spoken next. */
  private cursor = 0;
  /** Index of the sentence most recently spoken (for "repeat"). */
  private lastSpoken = -1;

  setSentences(sentences: string[]): void {
    this.sentences = sentences;
  }

  /** Append newly stitched sentences without disturbing the cursor. */
  append(sentences: string[]): void {
    this.sentences = sentences;
  }

  hasNext(): boolean {
    return this.cursor < this.sentences.length;
  }

  /** Get the next sentence and advance. */
  next(): string | null {
    if (!this.hasNext()) return null;
    this.lastSpoken = this.cursor;
    return this.sentences[this.cursor++];
  }

  /** Re-read the last spoken sentence (does not advance). */
  repeatLast(): string | null {
    if (this.lastSpoken < 0) return null;
    return this.sentences[this.lastSpoken];
  }

  /** Re-read the paragraph (block of up to 3 sentences) around lastSpoken. */
  repeatParagraph(): string | null {
    if (this.lastSpoken < 0) return null;
    const start = Math.max(0, this.lastSpoken - (this.lastSpoken % 3));
    const end = Math.min(this.sentences.length, start + 3);
    const para = this.sentences.slice(start, end).join(' ');
    return para || null;
  }

  /** Go back to the previous sentence: the next `next()` returns the sentence
   * before the one most recently spoken. */
  back(): void {
    const anchor = this.lastSpoken >= 0 ? this.lastSpoken : this.cursor;
    this.cursor = Math.max(0, anchor - 1);
  }

  /** Skip the upcoming sentence. */
  skip(): void {
    if (this.cursor < this.sentences.length) this.cursor++;
  }

  reset(): void {
    this.sentences = [];
    this.cursor = 0;
    this.lastSpoken = -1;
  }
}
