import { TextStitcher, toSentences } from '@/features/reader/textStitcher';
import { ReadingBuffer } from '@/features/reader/readingBuffer';

describe('TextStitcher de-duplication (acceptance)', () => {
  it('never reads the same line twice across overlapping frames', () => {
    const s = new TextStitcher();
    s.addFrame([
      { text: 'The quick brown fox.', box: { x: 0.1, y: 0.1, w: 0.8, h: 0.05 } },
      { text: 'Jumps over the dog.', box: { x: 0.1, y: 0.2, w: 0.8, h: 0.05 } },
    ]);
    // Next frame drifted: repeats line 2, adds line 3.
    const added = s.addFrame([
      { text: 'Jumps over the dog.', box: { x: 0.1, y: 0.1, w: 0.8, h: 0.05 } },
      { text: 'The end is near.', box: { x: 0.1, y: 0.2, w: 0.8, h: 0.05 } },
    ]);
    expect(added).toEqual(['The end is near.']);
    expect(s.getLines()).toEqual([
      'The quick brown fox.',
      'Jumps over the dog.',
      'The end is near.',
    ]);
  });

  it('keeps top-to-bottom, left-to-right reading order', () => {
    const s = new TextStitcher();
    s.addFrame([
      { text: 'second', box: { x: 0.1, y: 0.5, w: 0.3, h: 0.05 } },
      { text: 'first', box: { x: 0.1, y: 0.1, w: 0.3, h: 0.05 } },
    ]);
    expect(s.getLines()).toEqual(['first', 'second']);
  });
});

describe('ReadingBuffer pause/repeat/resume (acceptance)', () => {
  it('supports next, repeat, skip and back', () => {
    const b = new ReadingBuffer();
    b.setSentences(toSentences('One. Two. Three. Four.'));
    expect(b.next()).toBe('One.');
    expect(b.next()).toBe('Two.');
    expect(b.repeatLast()).toBe('Two.'); // repeat does not advance
    expect(b.next()).toBe('Three.');
    b.back();
    expect(b.next()).toBe('Two.'); // "go back" -> previous sentence
    expect(b.next()).toBe('Three.');
    b.skip(); // skip Four
    expect(b.next()).toBe(null); // end of page
  });
});
