import type {Rect} from '../../src/layout/geometry';
import type {Cell} from '../../src/layout/types';
import {
  assignStrokes,
  overlapFraction,
  type StrokeBox,
} from '../../src/ink/assign';

const R = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

const cell = (id: string, rect: Rect): Cell => ({id, kind: 'letter', rect});

/** Two touching 100 px boxes side by side: A = [0,100), B = [100,200). */
const A = cell('A', R(0, 0, 100, 100));
const B = cell('B', R(100, 0, 200, 100));

const stroke = (index: number, bounds: Rect): StrokeBox => ({index, bounds});

/** A stroke box of size w×h centred on (x, y). */
const around = (index: number, x: number, y: number, w = 10, h = 10) =>
  stroke(index, R(x - w / 2, y - h / 2, x + w / 2, y + h / 2));

const byCell = (a: ReturnType<typeof assignStrokes>) =>
  Object.fromEntries(a.byCell);

describe('overlapFraction', () => {
  it('is 0 when the boxes do not intersect', () => {
    expect(overlapFraction(R(200, 200, 210, 210), A.rect)).toBe(0);
  });

  it('is 0 when the boxes only touch (right/bottom exclusive)', () => {
    expect(overlapFraction(R(100, 0, 150, 50), A.rect)).toBe(0);
    expect(overlapFraction(R(0, 100, 50, 150), A.rect)).toBe(0);
  });

  it('is 1 when the stroke is inside the cell', () => {
    expect(overlapFraction(R(10, 10, 20, 30), A.rect)).toBe(1);
    expect(overlapFraction(A.rect, A.rect)).toBe(1);
  });

  it('is the fraction of the stroke box covered by the cell', () => {
    // Half of the stroke's width is inside A.
    expect(overlapFraction(R(50, 0, 150, 100), A.rect)).toBeCloseTo(0.5);
    // A quarter: half the width and half the height.
    expect(overlapFraction(R(50, 50, 150, 150), A.rect)).toBeCloseTo(0.25);
  });

  it('is measured against the stroke, not the cell', () => {
    // The cell is entirely inside a stroke 4× its area.
    expect(overlapFraction(R(-50, -50, 150, 150), A.rect)).toBeCloseTo(0.25);
  });

  it('never exceeds 1', () => {
    const f = overlapFraction(R(10, 10, 10.5, 10.5), A.rect);
    expect(f).toBeLessThanOrEqual(1);
    expect(f).toBeGreaterThan(0);
  });

  it('returns a finite number for zero-area strokes (no division by zero)', () => {
    for (const s of [
      R(50, 50, 50, 50), // dot
      R(0, 50, 200, 50), // perfectly horizontal
      R(50, 0, 50, 200), // perfectly vertical
    ]) {
      const f = overlapFraction(s, A.rect);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  // BUG (src/ink/assign.ts:43-46): the comment says zero-area strokes are
  // "treated as 1 px thick", but intersection() returns null for any
  // zero-width or zero-height rect, so overlapFraction returns 0 before the
  // 1 px rule is reached. A dot inside a cell should overlap it fully, and a
  // horizontal line half inside a cell should overlap it by 0.5.
  it('treats a dot inside a cell as fully overlapping it', () => {
    expect(overlapFraction(R(50, 50, 50, 50), A.rect)).toBe(1);
  });

  it('treats a horizontal line as 1 px thick', () => {
    expect(overlapFraction(R(0, 50, 200, 50), A.rect)).toBeCloseTo(0.5);
  });
});

describe('assignStrokes', () => {
  it('assigns a stroke to the cell containing the centre of its box', () => {
    const a = assignStrokes([around(0, 50, 50), around(1, 150, 50)], [A, B]);
    expect(byCell(a)).toEqual({A: [0], B: [1]});
    expect(a.unassigned).toEqual([]);
    expect(a.ambiguous).toEqual([]);
  });

  it('still assigns a stroke whose centre is just outside the cell (padding)', () => {
    // 10 px past A's bottom edge, default pad is 12.
    expect(byCell(assignStrokes([around(0, 50, 110)], [A]))).toEqual({A: [0]});
    // 10 px left of A's left edge.
    expect(byCell(assignStrokes([around(0, -10, 50)], [A]))).toEqual({A: [0]});
  });

  it('respects a custom pad', () => {
    expect(
      assignStrokes([around(0, 50, 110)], [A], {pad: 5}).unassigned,
    ).toEqual([0]);
    expect(byCell(assignStrokes([around(0, 50, 130)], [A], {pad: 40}))).toEqual(
      {A: [0]},
    );
  });

  it('between two touching cells, the cell actually containing the centre wins', () => {
    // Centre at x=102 is inside both padded rects but only inside B.
    expect(byCell(assignStrokes([around(0, 102, 50)], [A, B]))).toEqual({
      B: [0],
    });
    expect(byCell(assignStrokes([around(0, 102, 50)], [B, A]))).toEqual({
      B: [0],
    });
    // And x=98 belongs to A whatever the cell order.
    expect(byCell(assignStrokes([around(0, 98, 50)], [A, B]))).toEqual({
      A: [0],
    });
    expect(byCell(assignStrokes([around(0, 98, 50)], [B, A]))).toEqual({
      A: [0],
    });
  });

  it('a centre exactly on a shared edge belongs to the right/lower cell', () => {
    expect(byCell(assignStrokes([around(0, 100, 50)], [A, B]))).toEqual({
      B: [0],
    });
  });

  // BUG (src/ink/assign.ts:69-76): the comment says that when several padded
  // cells hold the centre "take the one whose real rect is closest", but when
  // the centre is inside none of the real rects the code takes holders[0]
  // (the first cell in list order). A letter written just above the boundary
  // between two touching boxes, on B's side, lands in A.
  it('when the centre is only in padding, the nearest real cell wins', () => {
    // Centre (110, -5): 5 px above B, but 10 px right of / 5 px above A.
    expect(byCell(assignStrokes([around(0, 110, -5)], [A, B]))).toEqual({
      B: [0],
    });
  });

  it('leaves a stroke far from every cell unassigned', () => {
    const a = assignStrokes([around(7, 1000, 1000)], [A, B]);
    expect(a.byCell.size).toBe(0);
    expect(a.unassigned).toEqual([7]);
    expect(a.ambiguous).toEqual([]);
  });

  it('assigns nothing when there are no cells', () => {
    const a = assignStrokes([around(0, 50, 50)], []);
    expect(a.unassigned).toEqual([0]);
  });

  it('returns empty results for no strokes', () => {
    const a = assignStrokes([], [A, B]);
    expect(a.byCell.size).toBe(0);
    expect(a.unassigned).toEqual([]);
    expect(a.ambiguous).toEqual([]);
  });

  describe('overlap fallback (centre outside every padded cell)', () => {
    // pad 0 so the fallback is reachable; centre of [60,180) is x=120.
    const wide = stroke(0, R(60, 0, 180, 100)); // 40/120 = 1/3 inside A

    it('assigns when the best overlap reaches minOverlap', () => {
      expect(
        byCell(assignStrokes([wide], [A], {pad: 0, minOverlap: 0.3})),
      ).toEqual({A: [0]});
    });

    it('leaves the stroke unassigned below minOverlap', () => {
      expect(
        assignStrokes([wide], [A], {pad: 0, minOverlap: 0.5}).unassigned,
      ).toEqual([0]);
    });

    it('uses a default minOverlap of 0.5 (inclusive)', () => {
      // Centre exactly on A's right edge: outside A, overlap exactly 0.5.
      const half = stroke(0, R(50, 0, 150, 100));
      expect(byCell(assignStrokes([half], [A], {pad: 0}))).toEqual({A: [0]});
    });

    it('picks the cell with the largest overlap', () => {
      const C = cell('C', R(200, 0, 300, 100));
      // [60,220): 40 px over A, 20 px over C; centre x=140 is in neither.
      const s = stroke(0, R(60, 0, 220, 100));
      expect(
        byCell(assignStrokes([s], [C, A], {pad: 0, minOverlap: 0.2})),
      ).toEqual({A: [0]});
    });
  });

  describe('ambiguity', () => {
    it('flags a stroke that overlaps a second cell by ≥ 30%', () => {
      // [20,160): centre 90 → A; 60/140 ≈ 43% over B.
      const a = assignStrokes([stroke(3, R(20, 0, 160, 100))], [A, B]);
      expect(byCell(a)).toEqual({A: [3]});
      expect(a.ambiguous).toEqual([{index: 3, cellIds: ['A', 'B']}]);
    });

    it('does not flag a small overlap', () => {
      // [40,120): centre 80 → A; 20/80 = 25% over B.
      const a = assignStrokes([stroke(0, R(40, 0, 120, 100))], [A, B]);
      expect(a.ambiguous).toEqual([]);
    });

    it('lists every other cell over the threshold, chosen cell first', () => {
      const C = cell('C', R(0, 100, 100, 200));
      const D = cell('D', R(100, 100, 200, 200));
      // A 100×100 box centred on the shared corner: 25% in each cell.
      const s = stroke(0, R(50, 50, 150, 150));
      const a = assignStrokes([s], [A, B, C, D], {ambiguousOverlap: 0.25});
      expect(byCell(a)).toEqual({D: [0]});
      expect(a.ambiguous).toEqual([{index: 0, cellIds: ['D', 'A', 'B', 'C']}]);
    });

    it('respects a custom ambiguousOverlap', () => {
      const s = stroke(0, R(40, 0, 120, 100)); // 25% over B
      const a = assignStrokes([s], [A, B], {ambiguousOverlap: 0.2});
      expect(a.ambiguous).toEqual([{index: 0, cellIds: ['A', 'B']}]);
    });
  });

  it('handles zero-area strokes (dots and straight lines)', () => {
    const dot = stroke(0, R(50, 50, 50, 50));
    const hline = stroke(1, R(110, 40, 190, 40));
    const vline = stroke(2, R(30, 10, 30, 90));
    const a = assignStrokes([dot, hline, vline], [A, B]);
    expect(byCell(a)).toEqual({A: [0, 2], B: [1]});
    expect(a.unassigned).toEqual([]);
    expect(a.ambiguous).toEqual([]);
  });

  it('keeps input order within a cell and reports the caller indexes', () => {
    const a = assignStrokes(
      [
        around(5, 40, 40),
        around(2, 150, 50),
        around(9, 60, 60),
        around(1, 50, 50),
        around(4, 999, 999),
        around(0, 120, 20),
      ],
      [A, B],
    );
    expect(a.byCell.get('A')).toEqual([5, 9, 1]);
    expect(a.byCell.get('B')).toEqual([2, 0]);
    expect(a.unassigned).toEqual([4]);
  });

  it('works on a real probe-like row of touching crossword boxes', () => {
    const row = Array.from({length: 5}, (_, i) =>
      cell(`G-${i}`, R(i * 112, 0, (i + 1) * 112, 112)),
    );
    // One letter per box, each a bit off-centre and poking out of the box.
    const strokes = row.map((c, i) =>
      stroke(i, R(c.rect.left + 20, -8, c.rect.left + 100, 104)),
    );
    const a = assignStrokes(strokes, row);
    expect(byCell(a)).toEqual({
      'G-0': [0],
      'G-1': [1],
      'G-2': [2],
      'G-3': [3],
      'G-4': [4],
    });
    expect(a.ambiguous).toEqual([]);
  });
});
