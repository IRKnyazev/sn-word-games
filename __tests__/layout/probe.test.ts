import {
  isSymmetric,
  numberGrid,
  parseGrid,
  runLengths,
} from '../../src/layout/crossword';
import {
  contains,
  containsRect,
  intersects,
  type Rect,
  type Size,
} from '../../src/layout/geometry';
import {
  LINE_WORDS,
  MANTA_PAGE,
  PROBE_CROSSWORD,
  PROBE_PAGE_IDS,
  WORDLE_WORDS,
  probeLayoutForPage,
  probePages,
  probeZones,
} from '../../src/layout/probe';
import type {Cell, PageLayout, Shape} from '../../src/layout/types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SMALL_PAGE: Size = {width: 1404, height: 1872};

/** Recognition error 117 clusters near the bottom of the page. */
const MAX_WRITING_BOTTOM = 0.85;

const pageRect = (size: Size): Rect => ({
  left: 0,
  top: 0,
  right: size.width,
  bottom: size.height,
});

const cellById = (page: PageLayout, id: string): Cell => {
  const cell = page.cells.find(c => c.id === id);
  if (!cell) {
    throw new Error(`no cell ${id} on ${page.id}`);
  }
  return cell;
};

const expectedOf = (page: PageLayout, ids: string[]): string =>
  ids.map(id => cellById(page, id).expected ?? '?').join('');

const groupById = (page: PageLayout, id: string) => {
  const group = page.groups.find(g => g.id === id);
  if (!group) {
    throw new Error(`no group ${id} on ${page.id}`);
  }
  return group;
};

const textShapes = (page: PageLayout) =>
  page.shapes.filter(
    (s): s is Extract<Shape, {kind: 'text'}> => s.kind === 'text',
  );

const allRects = (page: PageLayout): {name: string; rect: Rect}[] => [
  ...page.cells.map(c => ({name: `cell ${c.id}`, rect: c.rect})),
  ...page.zones.map(z => ({name: `zone ${z.id}`, rect: z.rect})),
  ...Object.entries(page.areas).map(([k, r]) => ({name: `area ${k}`, rect: r})),
];

const whiteSquares = PROBE_CROSSWORD.join('')
  .split('')
  .filter(ch => ch === '.').length;

describe('PROBE_CROSSWORD', () => {
  const blocks = parseGrid(PROBE_CROSSWORD);

  it('is 15×15', () => {
    expect(PROBE_CROSSWORD).toHaveLength(15);
    for (const row of PROBE_CROSSWORD) {
      expect(row).toHaveLength(15);
    }
  });

  it('only uses "." and "#"', () => {
    expect(PROBE_CROSSWORD.join('')).toMatch(/^[.#]+$/);
  });

  it('is 180° symmetric', () => {
    expect(isSymmetric(blocks)).toBe(true);
  });

  it('has no across or down run shorter than 3', () => {
    expect(Math.min(...runLengths(blocks))).toBeGreaterThanOrEqual(3);
  });
});

describe.each([
  ['Manta 1920×2560', MANTA_PAGE],
  ['1404×1872', SMALL_PAGE],
])('probe pages on %s', (_name, size) => {
  const pages = probePages(size);
  const [letters, words, crossword] = pages;

  it('has three pages with the expected ids, all at the requested size', () => {
    expect(pages.map(p => p.id)).toEqual([...PROBE_PAGE_IDS]);
    for (const p of pages) {
      expect(p.size).toEqual(size);
      expect(p.title.length).toBeGreaterThan(0);
    }
  });

  describe.each(PROBE_PAGE_IDS.map((id, i) => [id, i] as const))(
    'page %s',
    (_id, index) => {
      const page = pages[index];

      it('every cell, zone and area lies inside the page', () => {
        for (const {name, rect} of allRects(page)) {
          expect({name, inside: containsRect(pageRect(size), rect)}).toEqual({
            name,
            inside: true,
          });
        }
      });

      it('every cell, zone and area has positive size and integer edges', () => {
        for (const {name, rect} of allRects(page)) {
          const edges = [rect.left, rect.top, rect.right, rect.bottom];
          expect({name, ints: edges.every(Number.isInteger)}).toEqual({
            name,
            ints: true,
          });
          expect(rect.right).toBeGreaterThan(rect.left);
          expect(rect.bottom).toBeGreaterThan(rect.top);
        }
      });

      it('every printed shape lies inside the page', () => {
        const inside = (x: number, y: number) =>
          x >= 0 && y >= 0 && x <= size.width && y <= size.height;
        for (const s of page.shapes) {
          if (s.kind === 'rect') {
            expect(containsRect(pageRect(size), s.rect)).toBe(true);
          } else if (s.kind === 'line') {
            expect(inside(s.from.x, s.from.y) && inside(s.to.x, s.to.y)).toBe(
              true,
            );
          } else {
            expect(inside(s.at.x, s.at.y)).toBe(true);
          }
        }
      });

      it('no two cells overlap', () => {
        const overlaps: string[] = [];
        page.cells.forEach((a, i) =>
          page.cells.slice(i + 1).forEach(b => {
            if (intersects(a.rect, b.rect)) {
              overlaps.push(`${a.id}/${b.id}`);
            }
          }),
        );
        expect(overlaps).toEqual([]);
      });

      it('cell ids are unique', () => {
        const ids = page.cells.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('keeps every writing cell above 85% of the page height', () => {
        const limit = size.height * MAX_WRITING_BOTTOM;
        const tooLow = page.cells
          .filter(c => c.kind === 'letter' || c.kind === 'line')
          .filter(c => c.rect.bottom > limit)
          .map(c => c.id);
        expect(tooLow).toEqual([]);
      });

      it('has TAP and READ zones that do not overlap each other', () => {
        expect(page.zones.map(z => z.id).sort()).toEqual(['READ', 'TAP']);
        const [a, b] = page.zones;
        expect(intersects(a.rect, b.rect)).toBe(false);
      });

      it('zones overlap no cell and no area', () => {
        const hits: string[] = [];
        for (const z of page.zones) {
          for (const c of page.cells) {
            if (intersects(z.rect, c.rect)) {
              hits.push(`${z.id}/${c.id}`);
            }
          }
          for (const [k, r] of Object.entries(page.areas)) {
            if (intersects(z.rect, r)) {
              hits.push(`${z.id}/${k}`);
            }
          }
        }
        expect(hits).toEqual([]);
      });

      it('every group refers only to cells on the page', () => {
        const ids = new Set(page.cells.map(c => c.id));
        for (const g of page.groups) {
          expect(g.cellIds.length).toBeGreaterThan(0);
          expect(g.cellIds.filter(id => !ids.has(id))).toEqual([]);
        }
      });

      it('group ids are unique', () => {
        const ids = page.groups.map(g => g.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('every cell belongs to exactly one section group', () => {
        const sections = page.groups.filter(g => g.level === 'section');
        for (const c of page.cells) {
          const n = sections.filter(s => s.cellIds.includes(c.id)).length;
          expect({cell: c.id, sections: n}).toEqual({cell: c.id, sections: 1});
        }
      });

      it('every cell belongs to exactly one word group', () => {
        const wordGroups = page.groups.filter(g => g.level === 'word');
        for (const c of page.cells) {
          const n = wordGroups.filter(g => g.cellIds.includes(c.id)).length;
          expect({cell: c.id, words: n}).toEqual({cell: c.id, words: 1});
        }
      });

      it('all text shapes have non-empty text and positive size', () => {
        const texts = textShapes(page);
        expect(texts.length).toBeGreaterThan(0);
        for (const t of texts) {
          expect(t.text.trim().length).toBeGreaterThan(0);
          expect(t.size).toBeGreaterThan(0);
        }
      });

      it('all strokes and lines have positive width', () => {
        for (const s of page.shapes) {
          if (s.kind === 'line') {
            expect(s.width).toBeGreaterThan(0);
          } else if (s.kind === 'rect') {
            expect(s.strokeWidth ?? 0).toBeGreaterThanOrEqual(0);
          }
        }
      });
    },
  );

  it('TAP and READ are at the same place on every page', () => {
    for (const p of pages) {
      expect(p.zones).toEqual(pages[0].zones);
    }
    expect(probeZones(size)).toEqual(pages[0].zones);
  });

  it('each page has exactly one section-level group per section', () => {
    const sectionIds = pages.map(p =>
      p.groups.filter(g => g.level === 'section').map(g => g.id),
    );
    expect(sectionIds).toEqual([['A', 'B'], ['C', 'D'], ['G']]);
  });

  describe('page 1 (letters)', () => {
    it('asks for A–Z twice, section A then section B, in order', () => {
      expect(letters.cells.map(c => c.expected).join('')).toBe(
        ALPHABET + ALPHABET,
      );
      expect(expectedOf(letters, groupById(letters, 'A').cellIds)).toBe(
        ALPHABET,
      );
      expect(expectedOf(letters, groupById(letters, 'B').cellIds)).toBe(
        ALPHABET,
      );
    });

    it('only has letter cells', () => {
      expect(letters.cells.every(c => c.kind === 'letter')).toBe(true);
    });

    it('section B boxes in a row touch (crossword-size, shared edges)', () => {
      const row = groupById(letters, 'B-row1').cellIds.map(
        id => cellById(letters, id).rect,
      );
      for (let i = 1; i < row.length; i++) {
        expect(row[i].left).toBe(row[i - 1].right);
        expect(row[i].top).toBe(row[i - 1].top);
      }
    });

    it('section A boxes are square and the same size', () => {
      const rects = groupById(letters, 'A').cellIds.map(
        id => cellById(letters, id).rect,
      );
      const w = rects[0].right - rects[0].left;
      for (const r of rects) {
        expect(r.right - r.left).toBe(w);
        expect(r.bottom - r.top).toBe(w);
      }
    });
  });

  describe('page 2 (words)', () => {
    it('Wordle rows spell WORDLE_WORDS', () => {
      const rows = WORDLE_WORDS.map((_, i) =>
        expectedOf(words, groupById(words, `C-row${i + 1}`).cellIds),
      );
      expect(rows).toEqual(WORDLE_WORDS);
    });

    it('Wordle cells are letter cells, line cells expect LINE_WORDS', () => {
      const letterCells = words.cells.filter(c => c.kind === 'letter');
      const lineCells = words.cells.filter(c => c.kind === 'line');
      expect(letterCells).toHaveLength(WORDLE_WORDS.join('').length);
      expect(lineCells.map(c => c.expected)).toEqual(LINE_WORDS);
      expect(expectedOf(words, groupById(words, 'D').cellIds)).toBe(
        LINE_WORDS.join(''),
      );
    });

    it('has the P6 area and no cell intersects it', () => {
      const p6 = words.areas.p6;
      expect(p6).toBeDefined();
      expect(words.cells.filter(c => intersects(c.rect, p6))).toEqual([]);
    });

    it('line cells do not overlap each other vertically', () => {
      const lines = words.cells.filter(c => c.kind === 'line');
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].rect.top).toBeGreaterThanOrEqual(
          lines[i - 1].rect.bottom,
        );
      }
    });
  });

  describe('page 3 (crossword)', () => {
    it('has one letter cell per white square', () => {
      expect(crossword.cells).toHaveLength(whiteSquares);
      expect(crossword.cells.every(c => c.kind === 'letter')).toBe(true);
    });

    it('names cells G-row-col after their white squares (1-based)', () => {
      const expected: string[] = [];
      PROBE_CROSSWORD.forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch === '.') {
            expected.push(`G-${r + 1}-${c + 1}`);
          }
        }),
      );
      expect(crossword.cells.map(c => c.id)).toEqual(expected);
    });

    it('has the P2 area, which no cell intersects', () => {
      const p2 = crossword.areas.p2;
      expect(p2).toBeDefined();
      expect(crossword.cells.filter(c => intersects(c.rect, p2))).toEqual([]);
    });

    it('across-run groups match the grid runs', () => {
      const across = crossword.groups.filter(g => g.id.startsWith('G-across'));
      const blocks = parseGrid(PROBE_CROSSWORD);
      const acrossRuns = runLengths(blocks).slice(0, across.length);
      expect(across.map(g => g.cellIds.length)).toEqual(acrossRuns);
      // The across runs account for every white square exactly once.
      expect(across.reduce((n, g) => n + g.cellIds.length, 0)).toBe(
        whiteSquares,
      );
    });

    it('prints each clue number inside its numbered square', () => {
      const numbers = numberGrid(parseGrid(PROBE_CROSSWORD));
      const texts = textShapes(crossword);
      const inCell: string[] = [];
      numbers.forEach((row, r) =>
        row.forEach((n, c) => {
          if (n > 0) {
            const cell = cellById(crossword, `G-${r + 1}-${c + 1}`);
            const label = texts.find(
              t => t.text === String(n) && contains(cell.rect, t.at),
            );
            expect({n, printed: label !== undefined}).toEqual({
              n,
              printed: true,
            });
            inCell.push(String(n));
          }
        }),
      );
      // No other text is printed inside the grid's cells.
      const gridTexts = texts.filter(t =>
        crossword.cells.some(c => contains(c.rect, t.at)),
      );
      expect(gridTexts.map(t => t.text)).toEqual(inCell);
    });
  });

  it('is deterministic (two calls are deep-equal)', () => {
    expect(probePages(size)).toEqual(probePages(size));
  });
});

describe('scaling', () => {
  it('defaults to the Manta page', () => {
    expect(probePages()).toEqual(probePages(MANTA_PAGE));
    expect(probeZones()).toEqual(probeZones(MANTA_PAGE));
  });

  it('scales cell positions with the page width', () => {
    const big = probePages(MANTA_PAGE)[0].cells;
    const small = probePages(SMALL_PAGE)[0].cells;
    const s = SMALL_PAGE.width / MANTA_PAGE.width;
    expect(small.map(c => c.id)).toEqual(big.map(c => c.id));
    big.forEach((c, i) => {
      expect(
        Math.abs(small[i].rect.left - c.rect.left * s),
      ).toBeLessThanOrEqual(0.5);
      expect(Math.abs(small[i].rect.top - c.rect.top * s)).toBeLessThanOrEqual(
        0.5,
      );
    });
  });
});

describe('probeLayoutForPage', () => {
  it.each([0, 1, 2])('returns page %i', i => {
    expect(probeLayoutForPage(i)?.id).toBe(PROBE_PAGE_IDS[i]);
    expect(probeLayoutForPage(i, SMALL_PAGE)?.size).toEqual(SMALL_PAGE);
  });

  it.each([-1, 3, 100])('returns null for page %i', i => {
    expect(probeLayoutForPage(i)).toBeNull();
  });
});
