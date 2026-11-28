import {
  anchorMark,
  checkSummary,
  crossMarks,
  inMarkZone,
  judgePuzzle,
  marksFor,
  revealMark,
  tickMarks,
  wrongMark,
  type CheckResult,
} from '../../src/games/mini';
import {
  boundsOfPoints,
  centre,
  containsRect,
  outset,
  type Rect,
} from '../../src/layout/geometry';
import {miniLayout, type MiniLayout} from '../../src/layout/mini';
import {cellKey, whiteCells} from '../../src/model/grid';
import {SAMPLE_MINI} from '../../src/puzzles/sample';
import type {CellReadings} from '../../src/recognise/entries';
import type {GeometrySpec} from '../../src/sdk/types';

const p = SAMPLE_MINI;
const AT = 1_700_000_000_000;
const SMALL_PAGE = {width: 1404, height: 1872};

const letterAt = (key: string): string => {
  const [r, c] = key.split('-').map(Number);
  return p.solution[r][c];
};

/** Every white square inked and read right (from the across reading), plus overrides. */
const readings = (
  overrides: Record<string, CellReadings> = {},
): Record<string, CellReadings> => {
  const out: Record<string, CellReadings> = {};
  for (const c of whiteCells(p)) {
    const key = cellKey(c);
    out[key] = {hasInk: true, across: letterAt(key)};
  }
  return {...out, ...overrides};
};

const judge = (overrides: Record<string, CellReadings> = {}): CheckResult =>
  judgePuzzle(p, readings(overrides), AT);

const boundsOf = (spec: GeometrySpec): Rect => {
  const b = boundsOfPoints(spec.points);
  if (!b) {
    throw new Error('mark without points');
  }
  return b;
};

/** Points are inside the rect (edges included: marks are drawn, not hit-tested). */
const pointsInside = (spec: GeometrySpec, r: Rect): boolean =>
  spec.points.every(
    pt =>
      pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom,
  );

const countInside = (marks: GeometrySpec[], r: Rect): number =>
  marks.filter(m => pointsInside(m, r)).length;

describe('judgePuzzle', () => {
  it('solves the puzzle when every square is right', () => {
    const r = judge();
    expect(r.solved).toBe(true);
    expect(r.at).toBe(AT);
    expect(Object.keys(r.cells)).toHaveLength(23);
    expect(Object.values(r.cells).every(v => v.status === 'right')).toBe(true);
    for (const e of p.entries) {
      expect(r.entries[e.id]).toBe('right');
      expect(r.readings[e.id]).toBe(e.answer);
    }
  });

  it('counts look-alikes and lower case as right', () => {
    const r = judge({
      '3-1': {hasInk: true, across: '0'}, // O of TOKEN
      '0-3': {hasInk: true, across: '5'}, // S of SPAS
      '2-3': {hasInk: true, down: '✓'}, // V of ALIVE / SEVEN
      '1-2': {hasInk: true, single: 'l'}, // L of TILES
    });
    expect(r.solved).toBe(true);
    expect(r.readings['8A']).toBe('TOKEN');
    expect(r.readings['1A']).toBe('SPAS');
    expect(r.readings['4D']).toBe('SEVEN');
  });

  it('makes both the across and the down entry of a wrong square wrong', () => {
    const r = judge({'1-1': {hasInk: true, across: 'X'}}); // I of TILES / PILOT
    expect(r.solved).toBe(false);
    expect(r.cells['1-1']).toEqual({status: 'wrong', read: 'X'});
    expect(r.entries['5A']).toBe('wrong');
    expect(r.entries['2D']).toBe('wrong');
    const others = p.entries.filter(e => e.id !== '5A' && e.id !== '2D');
    for (const e of others) {
      expect(r.entries[e.id]).toBe('right');
    }
    expect(r.readings['5A']).toBe('TXLES');
    expect(r.readings['2D']).toBe('PXLOT');
  });

  it('makes the entries of an empty square incomplete, not wrong', () => {
    const r = judge({'1-1': {hasInk: false}});
    expect(r.solved).toBe(false);
    expect(r.cells['1-1']).toEqual({status: 'empty', read: ''});
    expect(r.entries['5A']).toBe('incomplete');
    expect(r.entries['2D']).toBe('incomplete');
    expect(r.entries['7A']).toBe('right');
    expect(r.readings['5A']).toBe('T·LES');
    expect(r.readings['2D']).toBe('P·LOT');
  });

  it('treats a square with no readings entry at all as empty', () => {
    const all = readings();
    delete all['4-4'];
    const r = judgePuzzle(p, all, AT);
    expect(r.cells['4-4'].status).toBe('empty');
    expect(r.entries['9A']).toBe('incomplete');
    expect(r.entries['6D']).toBe('incomplete');
    expect(r.readings['9A']).toBe('TEN·');
  });

  it('makes the entries of an unread square incomplete, not wrong', () => {
    const r = judge({'1-1': {hasInk: true}});
    expect(r.solved).toBe(false);
    expect(r.cells['1-1']).toEqual({status: 'unread', read: ''});
    expect(r.entries['5A']).toBe('incomplete');
    expect(r.entries['2D']).toBe('incomplete');
    expect(r.readings['5A']).toBe('T?LES');
    expect(r.readings['2D']).toBe('P?LOT');
  });

  it('calls an entry wrong if it has a wrong square, even with gaps', () => {
    const r = judge({
      '1-0': {hasInk: false},
      '1-1': {hasInk: true},
      '1-2': {hasInk: true, across: 'Q'},
    });
    expect(r.entries['5A']).toBe('wrong');
    expect(r.readings['5A']).toBe('·?QES');
  });

  it('shows a wrong look-alike as the letter it stands for', () => {
    const r = judge({'3-1': {hasInk: true, across: '2'}}); // O read as "2"
    expect(r.cells['3-1']).toEqual({status: 'wrong', read: 'Z'});
    expect(r.readings['8A']).toBe('TZKEN');
  });

  it('finds every entry incomplete on a blank page', () => {
    const r = judgePuzzle(p, {}, AT);
    expect(r.solved).toBe(false);
    for (const e of p.entries) {
      expect(r.entries[e.id]).toBe('incomplete');
      expect(r.readings[e.id]).toBe('·'.repeat(e.answer.length));
    }
  });

  it('judges only white squares', () => {
    const r = judge({'0-4': {hasInk: true, across: 'Q'}});
    expect(r.cells['0-4']).toBeUndefined();
    expect(r.solved).toBe(true);
  });
});

describe('checkSummary', () => {
  const none = new Set<string>();

  it('says solved, without a reveal count when nothing was revealed', () => {
    expect(checkSummary(p, judge(), none)).toBe(
      'Solved! Every square is right.',
    );
  });

  it('says solved, with the number of revealed squares', () => {
    expect(checkSummary(p, judge(), new Set(['0-0', '2-2']))).toBe(
      'Solved! Every square is right (2 revealed).',
    );
    expect(checkSummary(p, judge(), new Set(['4-4']))).toBe(
      'Solved! Every square is right (1 revealed).',
    );
  });

  it('counts the right entries first', () => {
    const text = checkSummary(
      p,
      judge({'1-1': {hasInk: true, across: 'X'}}),
      none,
    );
    expect(text.split('\n')[0]).toBe('8 of 10 entries right.');
  });

  it('lists wrong entries with what was read, in entry order', () => {
    const text = checkSummary(
      p,
      judge({'1-1': {hasInk: true, across: 'X'}}),
      none,
    );
    expect(text).toBe(
      ['8 of 10 entries right.', 'Wrong: 5A read TXLES · 2D read PXLOT'].join(
        '\n',
      ),
    );
  });

  it('shows empty and unread squares in a wrong entry reading', () => {
    const r = judge({
      '1-0': {hasInk: false},
      '1-1': {hasInk: true},
      '1-2': {hasInk: true, across: 'Q'},
    });
    expect(checkSummary(p, r, none)).toContain('5A read ·?QES');
  });

  it('lists unread squares by row and column (1-based)', () => {
    const text = checkSummary(p, judge({'1-1': {hasInk: true}}), none);
    expect(text).toBe(
      [
        '8 of 10 entries right.',
        "Couldn't read: row 2 col 2. Try writing it again.",
      ].join('\n'),
    );
  });

  it('lists four unread squares in reading order without an ellipsis', () => {
    const unread = ['0-0', '0-1', '0-2', '0-3'];
    const r = judge(Object.fromEntries(unread.map(k => [k, {hasInk: true}])));
    const line = checkSummary(p, r, none)
      .split('\n')
      .find(l => l.startsWith("Couldn't read"));
    expect(line).toBe(
      "Couldn't read: row 1 col 1, row 1 col 2, row 1 col 3, row 1 col 4. Try writing them again.",
    );
  });

  it('caps the unread list at four and adds an ellipsis', () => {
    const unread = ['4-4', '0-0', '2-3', '1-4', '0-2', '3-0'];
    const r = judge(Object.fromEntries(unread.map(k => [k, {hasInk: true}])));
    const line =
      checkSummary(p, r, none)
        .split('\n')
        .find(l => l.startsWith("Couldn't read")) ?? '';
    // First four in reading order (row by row), not in the order given.
    expect(line).toContain(
      'row 1 col 1, row 1 col 3, row 2 col 5, row 3 col 4, …',
    );
    expect(line).not.toContain('row 4 col 1');
    expect(line).not.toContain('row 5 col 5');
    expect(line.endsWith('Try writing them again.')).toBe(true);
  });

  it('counts one empty square in the singular', () => {
    const text = checkSummary(p, judge({'2-2': {hasInk: false}}), none);
    expect(text).toBe(['8 of 10 entries right.', '1 empty square.'].join('\n'));
  });

  it('counts several empty squares in the plural', () => {
    const r = judge({'2-2': {hasInk: false}, '4-1': {hasInk: false}});
    expect(checkSummary(p, r, none).split('\n')).toContain('2 empty squares.');
    expect(checkSummary(p, judgePuzzle(p, {}, AT), none)).toBe(
      ['0 of 10 entries right.', '23 empty squares.'].join('\n'),
    );
  });

  it('puts the lines in order: count, wrong, unread, empty', () => {
    const r = judge({
      '0-0': {hasInk: true, across: 'Q'},
      '2-2': {hasInk: true},
      '4-4': {hasInk: false},
    });
    expect(checkSummary(p, r, new Set(['1-1']))).toBe(
      [
        '4 of 10 entries right.',
        'Wrong: 1A read QPAS · 1D read QTAT',
        "Couldn't read: row 3 col 3. Try writing it again.",
        '1 empty square.',
      ].join('\n'),
    );
  });
});

describe('mark geometry', () => {
  const box: Rect = {left: 120, top: 1670, right: 168, bottom: 1718};
  const corner: Rect = {left: 492, top: 250, right: 570, bottom: 328};

  const expectInk = (marks: GeometrySpec[], zone: Rect) => {
    for (const m of marks) {
      expect(m.type).toBe('straightLine');
      expect(m.points).toHaveLength(2);
      expect(m.penWidth).toBeGreaterThanOrEqual(100);
      expect(pointsInside(m, zone)).toBe(true);
      for (const pt of m.points) {
        expect(Number.isInteger(pt.x) && Number.isInteger(pt.y)).toBe(true);
      }
    }
  };

  it('draws a tick as two black lines inside the clue box', () => {
    const marks = tickMarks(box);
    expect(marks).toHaveLength(2);
    expectInk(marks, box);
    expect(marks.every(m => m.penColor === 0x00)).toBe(true);
    // The two strokes meet at the bottom of the tick.
    expect(marks[0].points[1]).toEqual(marks[1].points[0]);
  });

  it('draws a cross as two black diagonals inside the clue box', () => {
    const marks = crossMarks(box);
    expect(marks).toHaveLength(2);
    expectInk(marks, box);
    expect(marks.every(m => m.penColor === 0x00)).toBe(true);
    // Both diagonals pass through the middle of the box.
    const mid = centre(box);
    for (const m of marks) {
      const [a, b] = m.points;
      expect((a.x + b.x) / 2).toBeCloseTo(mid.x, 0);
      expect((a.y + b.y) / 2).toBeCloseTo(mid.y, 0);
    }
  });

  it('draws a wrong-square slash as one black line inside its zone', () => {
    const marks = wrongMark(corner);
    expect(marks).toHaveLength(1);
    expectInk(marks, corner);
    expect(marks[0].penColor).toBe(0x00);
  });

  it('draws a reveal as a closed grey triangle inside its zone', () => {
    const marks = revealMark(corner);
    expect(marks).toHaveLength(3);
    expectInk(marks, corner);
    expect(marks.every(m => m.penColor === 0x9d)).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(marks[i].points[1]).toEqual(marks[(i + 1) % 3].points[0]);
    }
  });

  it('draws the anchor as one white horizontal hairline inside its zone', () => {
    const zone: Rect = {left: 24, top: 1600, right: 64, bottom: 1640};
    const marks = anchorMark(zone);
    expect(marks).toHaveLength(1);
    expectInk(marks, zone);
    expect(marks[0].penColor).toBe(0xfe);
    expect(marks[0].penWidth).toBe(100);
    expect(marks[0].points[0].y).toBe(marks[0].points[1].y);
  });

  it('keeps marks inside small zones on the smaller page', () => {
    const small: Rect = {left: 360, top: 183, right: 417, bottom: 240};
    expectInk(wrongMark(small), small);
    expectInk(revealMark(small), small);
    expectInk(tickMarks(small), small);
    expectInk(crossMarks(small), small);
    expectInk(anchorMark(small), small);
  });
});

describe('marksFor on the sample layout', () => {
  const layout = miniLayout(p);
  const anchor = anchorMark(layout.anchorZone);
  const none = new Set<string>();

  it('draws only the anchor when there is no result and nothing revealed', () => {
    expect(marksFor(p, layout, null, none)).toEqual(anchor);
  });

  it('draws the anchor and reveal triangles when there is no result', () => {
    const marks = marksFor(p, layout, null, new Set(['0-0', '2-2']));
    expect(marks).toHaveLength(1 + 2 * 3);
    expect(marks[0]).toEqual(anchor[0]);
    expect(countInside(marks, layout.revealZones['0-0'])).toBe(3);
    expect(countInside(marks, layout.revealZones['2-2'])).toBe(3);
  });

  it('ticks every clue box when solved', () => {
    const marks = marksFor(p, layout, judge(), none);
    expect(marks).toHaveLength(1 + 10 * 2);
    expect(marks[0]).toEqual(anchor[0]);
    for (const e of p.entries) {
      expect(countInside(marks, layout.clueBoxes[e.id])).toBe(2);
    }
    expect(marks.slice(1).every(m => m.penColor === 0x00)).toBe(true);
  });

  it('crosses wrong entries, ticks right ones and slashes the wrong square', () => {
    const marks = marksFor(
      p,
      layout,
      judge({'1-1': {hasInk: true, across: 'X'}}),
      none,
    );
    // anchor + 8 ticks + 2 crosses + 1 slash
    expect(marks).toHaveLength(1 + 8 * 2 + 2 * 2 + 1);
    expect(marks[0]).toEqual(anchor[0]);
    expect(marks.slice(1, 1 + 2)).toEqual(tickMarks(layout.clueBoxes['1A']));
    expect(marks).toEqual(
      expect.arrayContaining([
        ...crossMarks(layout.clueBoxes['5A']),
        ...crossMarks(layout.clueBoxes['2D']),
        ...wrongMark(layout.wrongZones['1-1']),
      ]),
    );
    expect(countInside(marks, layout.wrongZones['1-1'])).toBe(1);
  });

  it('slashes every wrong square once', () => {
    const r = judge({
      '0-0': {hasInk: true, across: 'Q'},
      '4-4': {hasInk: true, across: 'Q'},
    });
    const marks = marksFor(p, layout, r, none);
    expect(countInside(marks, layout.wrongZones['0-0'])).toBe(1);
    expect(countInside(marks, layout.wrongZones['4-4'])).toBe(1);
    const slashes = marks.filter(m =>
      Object.values(layout.wrongZones).some(z => pointsInside(m, z)),
    );
    expect(slashes).toHaveLength(2);
  });

  it('leaves incomplete entries unmarked', () => {
    const marks = marksFor(p, layout, judge({'1-1': {hasInk: false}}), none);
    expect(marks).toHaveLength(1 + 8 * 2);
    expect(countInside(marks, layout.clueBoxes['5A'])).toBe(0);
    expect(countInside(marks, layout.clueBoxes['2D'])).toBe(0);
    expect(countInside(marks, layout.wrongZones['1-1'])).toBe(0);
  });

  it('adds reveal triangles after the check marks', () => {
    const r = judge({'1-1': {hasInk: true, across: 'X'}});
    const marks = marksFor(p, layout, r, new Set(['1-1', '4-4']));
    expect(marks).toHaveLength(1 + 8 * 2 + 2 * 2 + 1 + 2 * 3);
    expect(marks.slice(-6)).toEqual([
      ...revealMark(layout.revealZones['1-1']),
      ...revealMark(layout.revealZones['4-4']),
    ]);
  });

  it('skips an entry that has no clue box in the layout', () => {
    const clueBoxes = {...layout.clueBoxes};
    delete clueBoxes['5A'];
    const partial: MiniLayout = {...layout, clueBoxes};
    const marks = marksFor(p, partial, judge(), none);
    expect(marks).toHaveLength(1 + 9 * 2);
    expect(countInside(marks, layout.clueBoxes['5A'])).toBe(0);
  });

  it('ignores revealed keys that are not white squares', () => {
    const marks = marksFor(
      p,
      layout,
      null,
      new Set(['0-4', '4-0', 'x', '9-9']),
    );
    expect(marks).toEqual(anchor);
  });

  it('puts the anchor first in every case', () => {
    const cases: [CheckResult | null, Set<string>][] = [
      [null, none],
      [null, new Set(['3-3'])],
      [judge(), none],
      [judgePuzzle(p, {}, AT), new Set(['0-0'])],
    ];
    for (const [r, rev] of cases) {
      expect(marksFor(p, layout, r, rev)[0]).toEqual(anchor[0]);
    }
  });
});

describe('inMarkZone', () => {
  const layouts: [string, MiniLayout][] = [
    ['1920×2560', miniLayout(p)],
    ['1404×1872', miniLayout(p, SMALL_PAGE)],
  ];

  describe.each(layouts)('on the %s page', (_name, layout) => {
    it('recognises every mark marksFor draws', () => {
      const wrongEverywhere = Object.fromEntries(
        whiteCells(p).map(c => [cellKey(c), {hasInk: true, across: 'Q'}]),
      );
      const sets: GeometrySpec[][] = [
        marksFor(p, layout, judge(), new Set()),
        marksFor(
          p,
          layout,
          judgePuzzle(p, wrongEverywhere, AT),
          new Set(whiteCells(p).map(cellKey)),
        ),
      ];
      for (const marks of sets) {
        for (const m of marks) {
          expect(inMarkZone(layout, boundsOf(m))).toBe(true);
        }
      }
    });

    it('does not claim handwriting in the middle of a square', () => {
      for (const row of layout.cellRects) {
        for (const r of row) {
          if (!r) {
            continue;
          }
          const w = r.right - r.left;
          const h = r.bottom - r.top;
          const middle: Rect = {
            left: Math.round(r.left + w * 0.3),
            top: Math.round(r.top + h * 0.3),
            right: Math.round(r.right - w * 0.3),
            bottom: Math.round(r.bottom - h * 0.3),
          };
          expect(inMarkZone(layout, middle)).toBe(false);
        }
      }
    });

    it('does not claim something the size of a whole square', () => {
      for (const row of layout.cellRects) {
        for (const r of row) {
          if (r) {
            expect(inMarkZone(layout, r)).toBe(false);
          }
        }
      }
    });

    it('does not claim the CHECK or REVEAL buttons', () => {
      for (const z of layout.page.zones) {
        expect(inMarkZone(layout, z.rect)).toBe(false);
      }
    });

    it('allows 4 px of slack around a zone, and no more', () => {
      const b = layout.clueBoxes['5A'];
      expect(inMarkZone(layout, b)).toBe(true);
      expect(inMarkZone(layout, outset(b, 4))).toBe(true);
      expect(inMarkZone(layout, outset(b, 5))).toBe(false);
    });
  });

  it('accepts a small mark anywhere inside one zone', () => {
    const layout = miniLayout(p);
    const z = layout.wrongZones['2-2'];
    const dot: Rect = {
      left: z.left + 10,
      top: z.top + 10,
      right: z.left + 12,
      bottom: z.top + 12,
    };
    expect(containsRect(z, dot)).toBe(true);
    expect(inMarkZone(layout, dot)).toBe(true);
  });
});
