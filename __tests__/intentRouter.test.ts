import { routeIntent } from '@/voice/intentRouter';

describe('intentRouter', () => {
  const cases: [string, string][] = [
    ['read this', 'reader.start'],
    ['read the document please', 'reader.start'],
    ["what's in front of me", 'obstacle.oneshot'],
    ['start obstacle detection', 'obstacle.start'],
    ['find the way out', 'navigation.start'],
    ['take me to the door', 'navigation.start'],
    ['describe this', 'summary.photo'],
    ['start live', 'live.start'],
    ['pause', 'control.pause'],
    ['repeat', 'control.repeat'],
    ['repeat paragraph', 'control.repeatParagraph'],
    ['faster', 'control.faster'],
    ['help', 'meta.help'],
  ];

  it.each(cases)('routes "%s" -> %s', (utterance, expected) => {
    const { intent } = routeIntent(utterance);
    expect(intent?.name).toBe(expected);
  });

  it('extracts navigation target', () => {
    const { intent } = routeIntent('take me to the stairs');
    expect(intent?.name).toBe('navigation.start');
    expect(intent?.target).toBe('stairs');
  });

  it('tolerates minor mis-recognition', () => {
    const { intent } = routeIntent('reed the paige');
    expect(intent?.name).toBe('reader.start');
  });

  it('returns null for gibberish', () => {
    const { intent } = routeIntent('qwlkj zxcv');
    expect(intent).toBeNull();
  });
});
