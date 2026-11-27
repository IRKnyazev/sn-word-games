import {probeZones} from '../../src/layout/probe';
import {TapDetector, toolName} from '../../src/probes/tap';

const zones = probeZones();
const read = zones.find(z => z.id === 'READ')!.rect;
const mid = {x: (read.left + read.right) / 2, y: (read.top + read.bottom) / 2};

describe('TapDetector', () => {
  it('reports a finger tap inside a zone', () => {
    const d = new TapDetector(zones);
    expect(d.feed({action: 0, ...mid, toolType: 1})).toBeNull();
    const tap = d.feed({action: 1, x: mid.x + 10, y: mid.y, toolType: 1});
    expect(tap?.zone.id).toBe('READ');
    expect(tap?.tool).toBe('finger');
    expect(tap?.moved).toBe(10);
  });

  it('ignores a drag of more than 50 px', () => {
    const d = new TapDetector(zones);
    d.feed({action: 0, ...mid, toolType: 2});
    expect(
      d.feed({action: 1, x: mid.x + 60, y: mid.y, toolType: 2}),
    ).toBeNull();
  });

  it('ignores an up outside the zone it started in', () => {
    const d = new TapDetector(zones);
    d.feed({action: 0, x: read.left + 2, y: mid.y});
    expect(d.feed({action: 1, x: read.left - 10, y: mid.y})).toBeNull();
  });

  it('ignores downs outside every zone, cancels and multi-touch', () => {
    const d = new TapDetector(zones);
    d.feed({action: 0, x: 10, y: 10});
    expect(d.feed({action: 1, x: 10, y: 10})).toBeNull();
    d.feed({action: 0, ...mid});
    d.feed({action: 3, ...mid});
    expect(d.feed({action: 1, ...mid})).toBeNull();
    d.feed({action: 0, ...mid});
    expect(d.feed({action: 1, ...mid, pointerCount: 2})).toBeNull();
  });

  it('an up without a down does nothing', () => {
    expect(new TapDetector(zones).feed({action: 1, ...mid})).toBeNull();
  });

  it('names tools', () => {
    expect([1, 2, 0, undefined].map(toolName)).toEqual([
      'finger',
      'pen',
      'unknown',
      'unknown',
    ]);
  });
});
