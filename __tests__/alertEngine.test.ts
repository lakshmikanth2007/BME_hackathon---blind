import { AlertEngine, urgencyFor, formatAlert } from '@/features/obstacle/alertEngine';
import { DetectedObject } from '@/config/types';

function obj(over: Partial<DetectedObject>): DetectedObject {
  return {
    id: 'o1',
    type: 'chair',
    box: { x: 0.4, y: 0.4, w: 0.2, h: 0.3 },
    score: 0.9,
    distanceM: 1.5,
    distanceApprox: false,
    direction: 'ahead',
    ...over,
  };
}

describe('urgency tiers', () => {
  it('is silent beyond 3m', () => expect(urgencyFor(4)).toBe('silent'));
  it('is normal between 1 and 3m', () => expect(urgencyFor(1.5)).toBe('normal'));
  it('is urgent under 1m', () => expect(urgencyFor(0.7)).toBe('urgent'));
});

describe('alert formatting (acceptance)', () => {
  it('formats "Chair, 1.5 meters, ahead"', () => {
    expect(formatAlert(obj({}))).toBe('Chair, 1.5 meters, ahead');
  });
});

describe('AlertEngine', () => {
  it('announces a chair at 1.5m ahead', () => {
    const e = new AlertEngine();
    const a = e.pick([obj({})], 1000);
    expect(a?.urgency).toBe('normal');
    expect(a?.text).toBe('Chair, 1.5 meters, ahead');
  });

  it('escalates to urgent as the user gets closer', () => {
    const e = new AlertEngine();
    e.pick([obj({ distanceM: 1.5 })], 1000);
    const near = e.pick([obj({ distanceM: 0.6 })], 5000);
    expect(near?.urgency).toBe('urgent');
    expect(near?.text).toMatch(/^Stop!/);
  });

  it('de-duplicates when distance barely changes', () => {
    const e = new AlertEngine();
    expect(e.pick([obj({ distanceM: 1.5 })], 1000)).not.toBeNull();
    expect(e.pick([obj({ distanceM: 1.45 })], 5000)).toBeNull();
  });

  it('prioritises stairs over a nearer chair', () => {
    const e = new AlertEngine();
    const a = e.pick(
      [obj({ id: 'c', type: 'chair', distanceM: 1.0 }), obj({ id: 's', type: 'stairs', distanceM: 2.5 })],
      1000
    );
    expect(a?.object.type).toBe('stairs');
  });
});
