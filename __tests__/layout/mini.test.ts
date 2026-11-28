import {
  centre,
  contains,
  containsRect,
  intersects,
  type Rect,
  type Size,
} from '../../src/layout/geometry';
import {miniLayout, wrapText, type MiniLayout} from '../../src/layout/mini';
import {MANTA_PAGE, probeZones} from '../../src/layout/probe';
import type {Shape} from '../../src/layout/types';
import {cellKey, whiteCells} from '../../src/model/grid';
import {SAMPLE_MINI} from '../../src/puzzles/sample';

const p = SAMPLE_MINI;
const SMALL_PAGE: Size = {width: 1404, height: 1872};

/** Recognition error 117 clusters near the bottom of the page. */
const MAX_WRITING_BOTTOM = 0.85;

const pageRect = (size: Size): Rect => ({
  left: 0,
  top: 0,
  right: size.width,
  bottom: size.height,
});

const zone = (layout: MiniLayout, id: string): Rect => {
  const z = layout.page.zones.find(x => x.id === id);
  if (!z) {
    throw new Error(`no zone ${id}`);
  }
  return z.rect;
};

const textShapes = (layout: MiniLayout) =>
  layout.page.shapes.filter(
    (s): s is Extract<Shape, {kind: 'text'}> => s.kind === 'text',
  );

/** Every pair of distinct rects in the list. */
const pairs = <T>(xs: T[]): [T, T][] =>
  xs.flatMap((a, i) => xs.slice(i + 1).map(b => [a, b] as [T, T]));

describe.each([
  ['1920×2560', MANTA_PAGE],
  ['1404×1872', SMALL_PAGE],
])('miniLayout(SAMPLE_MINI) at %s', (_name, size) => {
  const layout = miniLayout(p, size);
  const page = pageRect(size);
  const white = whiteCells(p).map(cellKey);
  const squares = layout.page.cells.map(c => c.rect);
  const clueBoxes = Object.values(layout.clueBoxes);
  const check = zone(layout, 'CHECK');
  const reveal = zone(layout, 'REVEAL');

  it('is the page for this puzzle at this size', () => {
    expect(layout.page.id).toBe('mini-sample-1');
    expect(layout.page.title).toBe(p.title);
    expect(layout.page.size).toEqual(size);
  });

  it('keeps every printed shape on the page', () => {
    for (const s of layout.page.shapes) {
      if (s.kind === 'rect') {
        expect(containsRect(page, s.rect)).toBe(true);
      } else if (s.kind === 'line') {
        expect(contains(page, s.from) && contains(page, s.to)).toBe(true);
      } else {
        expect(contains(page, s.at)).toBe(true);
      }
    }
  });

  it('keeps every cell, zone and mark area on the page', () => {
    const rects: Rect[] = [
      ...squares,
      ...layout.page.zones.map(z => z.rect),
      ...clueBoxes,
      ...Object.values(layout.wrongZones),
      ...Object.values(layout.revealZones),
      layout.anchorZone,
    ];
    for (const r of rects) {
      expect(containsRect(page, r)).toBe(true);
    }
  });

  it('has one letter cell per white square, expecting its answer letter', () => {
    expect(layout.page.cells.map(c => c.id)).toEqual(white);
    for (const c of layout.page.cells) {
      const [row, col] = c.id.split('-').map(Number);
      expect(c.kind).toBe('letter');
      expect(c.expected).toBe(p.solution[row][col]);
      expect(c.rect).toEqual(layout.cellRects[row][col]);
    }
  });

  it('has a rect for each white square and null for each block', () => {
    expect(layout.cellRects).toHaveLength(p.height);
    layout.cellRects.forEach((row, r) => {
      expect(row).toHaveLength(p.width);
      row.forEach((rect, c) => {
        expect(rect === null).toBe(p.blocks[r][c]);
      });
    });
  });

  it('does not overlap any two squares', () => {
    for (const [a, b] of pairs(squares)) {
      expect(intersects(a, b)).toBe(false);
    }
  });

  it('lays squares edge to edge in a grid', () => {
    const r00 = layout.cellRects[0][0] as Rect;
    const r01 = layout.cellRects[0][1] as Rect;
    const r10 = layout.cellRects[1][0] as Rect;
    expect(r01.left).toBe(r00.right);
    expect(r10.top).toBe(r00.bottom);
    expect(r01.top).toBe(r00.top);
  });

  it('keeps every square above 85% of the page height', () => {
    for (const r of squares) {
      expect(r.bottom).toBeLessThanOrEqual(size.height * MAX_WRITING_BOTTOM);
    }
  });

  it('has one word group per entry, with the entry squares in order', () => {
    expect(layout.page.groups.map(g => g.id)).toEqual(p.entries.map(e => e.id));
    const cellIds = new Set(layout.page.cells.map(c => c.id));
    for (const e of p.entries) {
      const g = layout.page.groups.find(x => x.id === e.id);
      expect(g?.level).toBe('word');
      expect(g?.label).toBe(`${e.id} ${e.clue}`);
      expect(g?.cellIds).toEqual(e.cells.map(cellKey));
      for (const id of g?.cellIds ?? []) {
        expect(cellIds.has(id)).toBe(true);
      }
    }
  });

  it('has CHECK and REVEAL buttons and nothing else to tap', () => {
    expect(layout.page.zones.map(z => [z.id, z.label]).sort()).toEqual([
      ['CHECK', 'CHECK'],
      ['REVEAL', 'REVEAL'],
    ]);
    expect(intersects(check, reveal)).toBe(false);
  });

  it('keeps the buttons clear of every square and clue box', () => {
    for (const b of [check, reveal]) {
      for (const r of [...squares, ...clueBoxes]) {
        expect(intersects(b, r)).toBe(false);
      }
    }
  });

  it('puts CHECK where the probe pages have READ and REVEAL where they have TAP', () => {
    // The page-button handler relies on the zones being in the same place.
    const probe = probeZones(size);
    const at = (id: string) => probe.find(z => z.id === id)?.rect;
    expect(check).toEqual(at('READ'));
    expect(reveal).toEqual(at('TAP'));
  });

  it('has a wrong zone and a reveal zone for every white square', () => {
    expect(Object.keys(layout.wrongZones).sort()).toEqual([...white].sort());
    expect(Object.keys(layout.revealZones).sort()).toEqual([...white].sort());
  });

  it('puts each wrong and reveal zone inside its square, clear of the centre', () => {
    for (const key of white) {
      const [row, col] = key.split('-').map(Number);
      const square = layout.cellRects[row][col] as Rect;
      const mid = centre(square);
      for (const z of [layout.wrongZones[key], layout.revealZones[key]]) {
        expect(containsRect(square, z)).toBe(true);
        expect(contains(z, mid)).toBe(false);
      }
      expect(intersects(layout.wrongZones[key], layout.revealZones[key])).toBe(
        false,
      );
    }
  });

  it('keeps the clue number corner free of the wrong zone', () => {
    for (const s of textShapes(layout)) {
      for (const z of Object.values(layout.wrongZones)) {
        expect(contains(z, s.at)).toBe(false);
      }
    }
  });

  it('has a clue box for every entry, none overlapping', () => {
    expect(Object.keys(layout.clueBoxes).sort()).toEqual(
      p.entries.map(e => e.id).sort(),
    );
    for (const [a, b] of pairs(clueBoxes)) {
      expect(intersects(a, b)).toBe(false);
    }
  });

  it('keeps clue boxes off the grid and above the buttons', () => {
    for (const b of clueBoxes) {
      for (const sq of squares) {
        expect(intersects(b, sq)).toBe(false);
      }
      expect(b.bottom).toBeLessThanOrEqual(check.top);
    }
  });

  it('puts Across clue boxes in one column and Down in another, in entry order', () => {
    const across = p.entries.filter(e => e.direction === 'across');
    const down = p.entries.filter(e => e.direction === 'down');
    const lefts = (es: typeof across) =>
      new Set(es.map(e => layout.clueBoxes[e.id].left));
    expect(lefts(across).size).toBe(1);
    expect(lefts(down).size).toBe(1);
    expect(layout.clueBoxes['1A'].left).toBeLessThan(
      layout.clueBoxes['1D'].left,
    );
    for (const es of [across, down]) {
      const tops = es.map(e => layout.clueBoxes[e.id].top);
      expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    }
  });

  it('keeps the anchor zone clear of everything else', () => {
    const others: Rect[] = [
      ...squares,
      ...clueBoxes,
      check,
      reveal,
      ...Object.values(layout.wrongZones),
      ...Object.values(layout.revealZones),
    ];
    for (const r of others) {
      expect(intersects(layout.anchorZone, r)).toBe(false);
    }
  });

  it('prints the title, a number in each numbered square and every clue word', () => {
    const texts = textShapes(layout);
    expect(texts.some(t => t.text === p.title)).toBe(true);
    expect(texts.some(t => t.text === `by ${p.byline}`)).toBe(true);
    p.numbers.forEach((row, r) =>
      row.forEach((n, c) => {
        if (n > 0) {
          const sq = layout.cellRects[r][c] as Rect;
          expect(
            texts.some(t => t.text === String(n) && contains(sq, t.at)),
          ).toBe(true);
        }
      }),
    );
    const printed = texts.map(t => t.text).join(' ');
    for (const e of p.entries) {
      for (const word of e.clue.split(/\s+/)) {
        expect(printed).toContain(word);
      }
    }
  });

  it('keeps clue text on the page and Across text out of the Down column', () => {
    const downLeft = layout.clueBoxes['1D'].left;
    const clueTop = layout.clueBoxes['1A'].top;
    for (const t of textShapes(layout)) {
      if (t.anchor !== 'start' || t.at.y < clueTop) {
        continue;
      }
      // Same width estimate wrapText uses.
      const right = t.at.x + t.text.length * t.size * 0.52;
      expect(right).toBeLessThanOrEqual(size.width);
      if (t.at.x < downLeft) {
        expect(right).toBeLessThanOrEqual(downLeft);
      }
      expect(t.at.y).toBeLessThan(check.top);
    }
  });
});

describe('miniLayout scaling', () => {
  const big = miniLayout(p);
  const small = miniLayout(p, SMALL_PAGE);
  const s = SMALL_PAGE.width / MANTA_PAGE.width;
  const scaledClose = (a: Rect, b: Rect) => {
    for (const k of ['left', 'top', 'right', 'bottom'] as const) {
      expect(Math.abs(b[k] - a[k] * s)).toBeLessThanOrEqual(1);
    }
  };

  it('defaults to the Manta page', () => {
    expect(big.page.size).toEqual(MANTA_PAGE);
    expect(big).toEqual(miniLayout(p, MANTA_PAGE));
  });

  it('scales every square, clue box and zone in proportion', () => {
    big.page.cells.forEach((c, i) =>
      scaledClose(c.rect, small.page.cells[i].rect),
    );
    for (const id of Object.keys(big.clueBoxes)) {
      scaledClose(big.clueBoxes[id], small.clueBoxes[id]);
    }
    for (const key of Object.keys(big.wrongZones)) {
      scaledClose(big.wrongZones[key], small.wrongZones[key]);
      scaledClose(big.revealZones[key], small.revealZones[key]);
    }
    scaledClose(big.anchorZone, small.anchorZone);
    scaledClose(zone(big, 'CHECK'), zone(small, 'CHECK'));
  });
});

describe('wrapText', () => {
  // size 32 → about 16.6 px a character; 690 px → 41 characters a line.
  const maxChars = (size: number, width: number) =>
    Math.max(8, Math.floor(width / (size * 0.52)));

  it('keeps short text on one line', () => {
    expect(wrapText('Days in a week', 32, 690)).toEqual(['Days in a week']);
    expect(wrapText('Word', 32, 690)).toEqual(['Word']);
  });

  it('wraps long text at word boundaries without losing words', () => {
    const text =
      'A deliberately long clue that will certainly need more than one line to fit in the column';
    const lines = wrapText(text, 32, 690);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(maxChars(32, 690));
    }
  });

  it('fills each line as far as it can', () => {
    const lines = wrapText('aaaa bbbb cccc dddd eeee', 10, 53); // 10 chars
    expect(lines).toEqual(['aaaa bbbb', 'cccc dddd', 'eeee']);
  });

  it('never returns empty lines', () => {
    const cases = [
      '',
      '   ',
      '\n\n',
      '  leading and trailing  ',
      'many    spaces\tand\nbreaks',
      'supercalifragilisticexpialidocious word',
      'word supercalifragilisticexpialidocious',
    ];
    for (const text of cases) {
      for (const line of wrapText(text, 32, 200)) {
        expect(line.trim()).not.toBe('');
        expect(line).toBe(line.trim());
      }
    }
  });

  it('returns no lines for blank text', () => {
    expect(wrapText('', 32, 690)).toEqual([]);
    expect(wrapText('  \n ', 32, 690)).toEqual([]);
  });

  it('collapses runs of white space to one space', () => {
    expect(wrapText('Like  a\tposted\nletter', 32, 690)).toEqual([
      'Like a posted letter',
    ]);
  });

  it('puts a word too long for the line on a line of its own', () => {
    const long = 'x'.repeat(30);
    expect(wrapText(`ab ${long} cd`, 32, 200)).toEqual(['ab', long, 'cd']);
  });

  it('allows at least 8 characters a line however narrow the column', () => {
    expect(wrapText('abcd efg hij', 32, 1)).toEqual(['abcd efg', 'hij']);
  });
});
