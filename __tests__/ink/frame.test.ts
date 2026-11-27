import type {Rect, Size} from '../../src/layout/geometry';
import {
  detectFrame,
  detectFrameFromMany,
  emrMaxFor,
  emrRectToPx,
  emrToPx,
} from '../../src/ink/frame';

const MANTA: Size = {width: 1920, height: 2560};
const SMALL: Size = {width: 1404, height: 1872};
const MANTA_MAX = {maxX: 21632, maxY: 16224};

const R = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

describe('detectFrame', () => {
  it('is unknown without bounds', () => {
    expect(detectFrame(null, MANTA)).toBe('unknown');
  });

  it('is px for a box inside the page', () => {
    expect(detectFrame(R(100, 200, 300, 400), MANTA)).toBe('px');
    expect(detectFrame(R(0, 0, 1920, 2560), MANTA)).toBe('px');
  });

  it('allows 5% slack past the right and bottom edges', () => {
    expect(detectFrame(R(1900, 0, 2016, 10), MANTA)).toBe('px');
    expect(detectFrame(R(0, 2500, 10, 2688), MANTA)).toBe('px');
  });

  it('is emr beyond page × 1.05 on either axis', () => {
    expect(detectFrame(R(1900, 0, 2017, 10), MANTA)).toBe('emr');
    expect(detectFrame(R(0, 2500, 10, 2689), MANTA)).toBe('emr');
    expect(detectFrame(R(5000, 8000, 5200, 8300), MANTA)).toBe('emr');
  });

  it('honours a custom slack', () => {
    expect(detectFrame(R(0, 0, 2000, 10), MANTA, 1)).toBe('emr');
    expect(detectFrame(R(0, 0, 2000, 10), MANTA, 1.1)).toBe('px');
  });

  it('tolerates slightly negative edges but not very negative ones', () => {
    expect(detectFrame(R(-50, -50, 100, 100), MANTA)).toBe('px');
    expect(detectFrame(R(-97, 0, 100, 100), MANTA)).toBe('unknown');
    expect(detectFrame(R(0, -129, 100, 100), MANTA)).toBe('unknown');
  });

  it('is unknown for very negative boxes even when they also look like EMR', () => {
    expect(detectFrame(R(-1000, 0, 20000, 10), MANTA)).toBe('unknown');
  });
});

describe('detectFrameFromMany', () => {
  const px = R(10, 10, 20, 20);
  const emr = R(9000, 9000, 9100, 9100);
  const bad = R(-5000, -5000, 0, 0);

  it('is unknown when there is no evidence', () => {
    expect(detectFrameFromMany([], MANTA)).toBe('unknown');
    expect(detectFrameFromMany([null, null], MANTA)).toBe('unknown');
    expect(detectFrameFromMany([bad, null], MANTA)).toBe('unknown');
  });

  it('takes the majority verdict', () => {
    expect(detectFrameFromMany([px, px, emr], MANTA)).toBe('px');
    expect(detectFrameFromMany([emr, emr, px], MANTA)).toBe('emr');
  });

  it("lets 'emr' win ties", () => {
    expect(detectFrameFromMany([px, emr], MANTA)).toBe('emr');
    expect(detectFrameFromMany([emr, px, px, emr], MANTA)).toBe('emr');
  });

  it('ignores unknown and null entries when counting', () => {
    expect(detectFrameFromMany([null, bad, px], MANTA)).toBe('px');
    expect(detectFrameFromMany([bad, bad, bad, emr], MANTA)).toBe('emr');
  });
});

describe('emrMaxFor', () => {
  it('knows the Manta and the 1404×1872 page', () => {
    expect(emrMaxFor(MANTA)).toEqual(MANTA_MAX);
    expect(emrMaxFor(SMALL)).toEqual({maxX: 15819, maxY: 11864});
  });

  it('returns null for an unknown page size or a landscape page', () => {
    expect(emrMaxFor({width: 1000, height: 1000})).toBeNull();
    expect(emrMaxFor({width: 2560, height: 1920})).toBeNull();
  });
});

describe('emrToPx (Manta)', () => {
  it('maps the EMR origin to the top-right corner', () => {
    const p = emrToPx({x: 0, y: 0}, MANTA);
    expect(p.x).toBeCloseTo(1919);
    expect(p.y).toBeCloseTo(0);
  });

  it('maps the EMR maxima to the bottom-left corner', () => {
    const p = emrToPx({x: MANTA_MAX.maxX, y: MANTA_MAX.maxY}, MANTA);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(2559);
  });

  it('maps EMR x to page y and EMR y to (reversed) page x', () => {
    const p = emrToPx({x: MANTA_MAX.maxX / 2, y: MANTA_MAX.maxY / 2}, MANTA);
    expect(p.x).toBeCloseTo(1919 / 2);
    expect(p.y).toBeCloseTo(2559 / 2);
    // Moving along EMR x only changes page y.
    const a = emrToPx({x: 1000, y: 500}, MANTA);
    const b = emrToPx({x: 2000, y: 500}, MANTA);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeGreaterThan(a.y);
    // Moving along EMR y only changes page x, in the opposite direction.
    const c = emrToPx({x: 1000, y: 1500}, MANTA);
    expect(c.y).toBeCloseTo(a.y);
    expect(c.x).toBeLessThan(a.x);
  });

  it('scales by roughly 8.45 EMR units per pixel', () => {
    const a = emrToPx({x: 0, y: 0}, MANTA);
    const b = emrToPx({x: 8450, y: 0}, MANTA);
    expect(b.y - a.y).toBeGreaterThan(995);
    expect(b.y - a.y).toBeLessThan(1005);
  });

  it('works for the 1404×1872 page', () => {
    const o = emrToPx({x: 0, y: 0}, SMALL);
    const m = emrToPx({x: 15819, y: 11864}, SMALL);
    expect(o).toEqual({x: 1403, y: 0});
    expect(m.x).toBeCloseTo(0);
    expect(m.y).toBeCloseTo(1871);
  });

  it('throws for a page size without EMR maxima', () => {
    expect(() => emrToPx({x: 0, y: 0}, {width: 1000, height: 1000})).toThrow(
      /1000x1000/,
    );
  });

  it('uses explicit maxima when given', () => {
    const p = emrToPx(
      {x: 100, y: 0},
      {width: 101, height: 201},
      {
        maxX: 100,
        maxY: 100,
      },
    );
    expect(p).toEqual({x: 100, y: 200});
  });
});

describe('emrRectToPx', () => {
  it('returns a normalised rect (left ≤ right, top ≤ bottom)', () => {
    const r = emrRectToPx(R(0, 0, MANTA_MAX.maxX, MANTA_MAX.maxY), MANTA);
    expect(r.left).toBeCloseTo(0);
    expect(r.top).toBeCloseTo(0);
    expect(r.right).toBeCloseTo(1919);
    expect(r.bottom).toBeCloseTo(2559);
  });

  it('maps a small EMR box to a small px box at the right place', () => {
    const emr = R(10816, 8112, 10816 + 845, 8112 + 845);
    const r = emrRectToPx(emr, MANTA);
    expect(r.left).toBeLessThan(r.right);
    expect(r.top).toBeLessThan(r.bottom);
    expect(r.right - r.left).toBeCloseTo(100, -1);
    expect(r.bottom - r.top).toBeCloseTo(100, -1);
    expect(r.right).toBeCloseTo(1919 / 2, 0);
    expect(r.top).toBeCloseTo(2559 / 2, 0);
  });

  it('throws for an unknown page size', () => {
    expect(() => emrRectToPx(R(0, 0, 1, 1), {width: 1, height: 1})).toThrow();
  });
});
