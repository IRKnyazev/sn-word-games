import {
  area,
  boundsOfPoints,
  centre,
  clampTo,
  contains,
  containsRect,
  formatRect,
  height,
  inset,
  intersection,
  intersects,
  outset,
  rect,
  roundOut,
  union,
  width,
  type Rect,
} from '../../src/layout/geometry';

const R = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

describe('rect helpers', () => {
  it('rect() builds edges from left/top and size', () => {
    expect(rect(10, 20, 30, 40)).toEqual(R(10, 20, 40, 60));
  });

  it('width, height and area', () => {
    const r = rect(10, 20, 30, 40);
    expect(width(r)).toBe(30);
    expect(height(r)).toBe(40);
    expect(area(r)).toBe(1200);
  });

  it('area of an empty or inverted rect is 0, never negative', () => {
    expect(area(R(5, 5, 5, 50))).toBe(0);
    expect(area(R(10, 10, 0, 20))).toBe(0);
    expect(area(R(0, 10, 10, 0))).toBe(0);
  });

  it('centre is the midpoint (may be fractional)', () => {
    expect(centre(R(0, 0, 100, 50))).toEqual({x: 50, y: 25});
    expect(centre(R(0, 0, 3, 3))).toEqual({x: 1.5, y: 1.5});
  });

  it('inset shrinks and outset grows every side', () => {
    expect(inset(R(0, 0, 100, 100), 10)).toEqual(R(10, 10, 90, 90));
    expect(outset(R(0, 0, 100, 100), 10)).toEqual(R(-10, -10, 110, 110));
    expect(inset(R(0, 0, 100, 100), -10)).toEqual(
      outset(R(0, 0, 100, 100), 10),
    );
  });
});

describe('contains (left/top inclusive, right/bottom exclusive)', () => {
  const r = R(0, 0, 10, 10);

  it('includes the top-left corner and interior points', () => {
    expect(contains(r, {x: 0, y: 0})).toBe(true);
    expect(contains(r, {x: 5, y: 5})).toBe(true);
    expect(contains(r, {x: 9.999, y: 9.999})).toBe(true);
  });

  it('excludes the right and bottom edges', () => {
    expect(contains(r, {x: 10, y: 5})).toBe(false);
    expect(contains(r, {x: 5, y: 10})).toBe(false);
    expect(contains(r, {x: 10, y: 10})).toBe(false);
  });

  it('excludes points outside the left and top edges', () => {
    expect(contains(r, {x: -0.001, y: 5})).toBe(false);
    expect(contains(r, {x: 5, y: -0.001})).toBe(false);
  });

  it('an empty rect contains nothing', () => {
    expect(contains(R(5, 5, 5, 5), {x: 5, y: 5})).toBe(false);
  });
});

describe('containsRect', () => {
  const outer = R(0, 0, 100, 100);

  it('is true for an equal rect and for a rect strictly inside', () => {
    expect(containsRect(outer, outer)).toBe(true);
    expect(containsRect(outer, R(10, 10, 90, 90))).toBe(true);
  });

  it('is false when any edge pokes out', () => {
    expect(containsRect(outer, R(-1, 10, 50, 50))).toBe(false);
    expect(containsRect(outer, R(10, -1, 50, 50))).toBe(false);
    expect(containsRect(outer, R(10, 10, 101, 50))).toBe(false);
    expect(containsRect(outer, R(10, 10, 50, 101))).toBe(false);
  });
});

describe('intersection / intersects', () => {
  it('returns the overlapping rect', () => {
    expect(intersection(R(0, 0, 10, 10), R(5, 5, 20, 20))).toEqual(
      R(5, 5, 10, 10),
    );
  });

  it('is symmetric', () => {
    const a = R(0, 0, 10, 10);
    const b = R(5, -5, 8, 30);
    expect(intersection(a, b)).toEqual(intersection(b, a));
    expect(intersection(a, b)).toEqual(R(5, 0, 8, 10));
  });

  it('returns the inner rect when one contains the other', () => {
    expect(intersection(R(0, 0, 100, 100), R(10, 20, 30, 40))).toEqual(
      R(10, 20, 30, 40),
    );
  });

  it('touching edges do not intersect (exclusive right/bottom)', () => {
    expect(intersection(R(0, 0, 10, 10), R(10, 0, 20, 10))).toBeNull();
    expect(intersection(R(0, 0, 10, 10), R(0, 10, 10, 20))).toBeNull();
    expect(intersects(R(0, 0, 10, 10), R(10, 10, 20, 20))).toBe(false);
  });

  it('disjoint rects do not intersect', () => {
    expect(intersection(R(0, 0, 10, 10), R(50, 50, 60, 60))).toBeNull();
    expect(intersects(R(0, 0, 10, 10), R(50, 50, 60, 60))).toBe(false);
  });

  it('zero-area rects never intersect anything', () => {
    expect(intersects(R(5, 5, 5, 5), R(0, 0, 10, 10))).toBe(false);
    expect(intersects(R(0, 5, 10, 5), R(0, 0, 10, 10))).toBe(false);
  });

  it('intersects is true for a 1 px overlap', () => {
    expect(intersects(R(0, 0, 10, 10), R(9, 9, 20, 20))).toBe(true);
  });
});

describe('boundsOfPoints', () => {
  it('returns null for no points', () => {
    expect(boundsOfPoints([])).toBeNull();
  });

  it('returns a zero-size rect for a single point', () => {
    expect(boundsOfPoints([{x: 3, y: 4}])).toEqual(R(3, 4, 3, 4));
  });

  it('returns the min/max over all points, in any order', () => {
    expect(
      boundsOfPoints([
        {x: 5, y: 9},
        {x: -2, y: 3},
        {x: 7, y: -1},
        {x: 0, y: 0},
      ]),
    ).toEqual(R(-2, -1, 7, 9));
  });
});

describe('union', () => {
  it('returns null for no rects', () => {
    expect(union([])).toBeNull();
  });

  it('returns the same rect for one rect', () => {
    expect(union([R(1, 2, 3, 4)])).toEqual(R(1, 2, 3, 4));
  });

  it('covers every rect, including disjoint ones', () => {
    expect(
      union([R(0, 0, 10, 10), R(50, -5, 60, 5), R(20, 20, 30, 40)]),
    ).toEqual(R(0, -5, 60, 40));
  });

  it('does not mutate its input', () => {
    const rects = [R(0, 0, 10, 10), R(5, 5, 20, 20)];
    const copy = JSON.parse(JSON.stringify(rects));
    union(rects);
    expect(rects).toEqual(copy);
  });
});

describe('roundOut', () => {
  it('floors left/top and ceils right/bottom', () => {
    expect(roundOut(R(0.2, 1.7, 3.1, 4.9))).toEqual(R(0, 1, 4, 5));
  });

  it('rounds negatives outward too', () => {
    expect(roundOut(R(-0.5, -1.2, 0.4, 0.1))).toEqual(R(-1, -2, 1, 1));
  });

  it('leaves integer rects unchanged', () => {
    expect(roundOut(R(1, 2, 3, 4))).toEqual(R(1, 2, 3, 4));
  });

  it('always covers the original rect', () => {
    const r = R(10.4, 20.6, 30.5, 40.01);
    expect(containsRect(roundOut(r), r)).toBe(true);
  });
});

describe('clampTo', () => {
  const page = {width: 100, height: 200};

  it('leaves a rect inside the page unchanged', () => {
    expect(clampTo(R(10, 20, 30, 40), page)).toEqual(R(10, 20, 30, 40));
  });

  it('clamps every edge into [0, size]', () => {
    expect(clampTo(R(-10, -20, 150, 250), page)).toEqual(R(0, 0, 100, 200));
  });

  it('collapses a rect entirely outside the page onto the edge', () => {
    expect(clampTo(R(120, 210, 150, 260), page)).toEqual(R(100, 200, 100, 200));
    expect(clampTo(R(-50, -50, -10, -10), page)).toEqual(R(0, 0, 0, 0));
  });
});

describe('formatRect', () => {
  it('prints integers as integers', () => {
    expect(formatRect(R(1, 2, 3, 4))).toBe('[1,2 → 3,4]');
  });

  it('prints fractions with one decimal place', () => {
    expect(formatRect(R(1.5, 2.25, 3, 4.04))).toBe('[1.5,2.3 → 3,4.0]');
  });

  it('prints negatives', () => {
    expect(formatRect(R(-10, -2.5, 0, 0))).toBe('[-10,-2.5 → 0,0]');
  });
});
