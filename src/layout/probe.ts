/**
 * Layouts of the three M0 probe pages. The single source of geometry for the
 * printed templates, the stroke-to-box mapping and the page-button zones.
 *
 * Designed in Manta page pixels (1920×2560) and scaled for other page sizes.
 * Writing areas stay above ~85% of the page height (recognition error 117
 * clusters near the bottom of the page on other devices).
 */
import {parseGrid, numberGrid} from './crossword';
import type {Rect, Size} from './geometry';
import type {Cell, Group, PageLayout, Shape, Zone} from './types';

export const MANTA_PAGE: Size = {width: 1920, height: 2560};

const BLACK = 0;
const TEXT_GREY = 0x60;
const LABEL_GREY = 0x80;
const BUTTON_FILL = 0xe6;

/** Rows A–Z. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const WORDLE_WORDS = [
  'QUIRK',
  'JUMPY',
  'WHARF',
  'GLOVE',
  'BOXED',
  'SCENT',
];
export const LINE_WORDS = ['PUZZLE', 'lantern', 'JUKEBOX', 'whisky'];

/** 15×15, 180°-symmetric, every run ≥ 3 (checked in tests). */
export const PROBE_CROSSWORD = [
  '....#.....#....',
  '....#.....#....',
  '...............',
  '...#....#......',
  '###...#....#...',
  '......#....#...',
  '.....#....#....',
  '....#.....#....',
  '....#....#.....',
  '...#....#......',
  '...#....#...###',
  '......#....#...',
  '...............',
  '....#.....#....',
  '....#.....#....',
];

export const PROBE_PAGE_IDS = [
  'p1-letters',
  'p1-words',
  'p3-crossword',
] as const;
export type ProbePageId = (typeof PROBE_PAGE_IDS)[number];

/** Builds coordinates in Manta units, scaled to the real page. */
class Builder {
  readonly shapes: Shape[] = [];
  readonly cells: Cell[] = [];
  readonly groups: Group[] = [];
  readonly zones: Zone[] = [];
  readonly areas: Record<string, Rect> = {};
  private readonly s: number;

  constructor(readonly size: Size) {
    this.s = size.width / MANTA_PAGE.width;
  }

  u(n: number): number {
    return Math.round(n * this.s);
  }

  r(left: number, top: number, w: number, h: number): Rect {
    // Scale edges (not width) so adjacent rects stay adjacent after rounding.
    return {
      left: this.u(left),
      top: this.u(top),
      right: this.u(left + w),
      bottom: this.u(top + h),
    };
  }

  text(
    x: number,
    y: number,
    text: string,
    size: number,
    opts: {
      weight?: 400 | 600 | 700;
      anchor?: 'start' | 'middle' | 'end';
      grey?: number;
    } = {},
  ): void {
    this.shapes.push({
      kind: 'text',
      at: {x: this.u(x), y: this.u(y)},
      text,
      size: this.u(size),
      weight: opts.weight ?? 400,
      anchor: opts.anchor ?? 'start',
      grey: opts.grey ?? BLACK,
    });
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w: number,
    grey = BLACK,
  ): void {
    this.shapes.push({
      kind: 'line',
      from: {x: this.u(x1), y: this.u(y1)},
      to: {x: this.u(x2), y: this.u(y2)},
      width: Math.max(1, this.u(w)),
      grey,
    });
  }

  box(r: Rect, strokeWidth: number, fill?: number): void {
    this.shapes.push({
      kind: 'rect',
      rect: r,
      strokeWidth: strokeWidth > 0 ? Math.max(1, this.u(strokeWidth)) : 0,
      stroke: BLACK,
      fill,
    });
  }

  fill(r: Rect, grey: number): void {
    this.shapes.push({kind: 'rect', rect: r, strokeWidth: 0, fill: grey});
  }

  letterCell(id: string, r: Rect, expected?: string): Cell {
    const cell: Cell = {id, kind: 'letter', rect: r, expected};
    this.cells.push(cell);
    return cell;
  }

  button(id: string, label: string, left: number, top: number): void {
    const r = this.r(left, top, 320, 130);
    this.box(r, 4, BUTTON_FILL);
    this.text(left + 160, top + 80, label, 44, {weight: 700, anchor: 'middle'});
    this.zones.push({id, label, rect: r});
  }

  /** Header, footer, corner marks, edge ruler and the TAP / READ buttons. */
  frame(title: string, instructions: string[], pageNo: number): void {
    this.text(120, 150, title, 48, {weight: 700});
    instructions.forEach((line, i) =>
      this.text(120, 200 + i * 40, line, 30, {grey: TEXT_GREY}),
    );
    this.button('TAP', 'TAP', 120, 2280);
    this.button('READ', 'READ', 1480, 2280);
    this.text(
      960,
      2490,
      `Supernote Puzzles · M0 probe · page ${pageNo} of 3`,
      26,
      {
        anchor: 'middle',
        grey: LABEL_GREY,
      },
    );
    // Corner marks touching the page edges: shows whether any edge is cropped.
    const W = MANTA_PAGE.width;
    const H = MANTA_PAGE.height;
    const L = 60;
    const t = 6;
    for (const [x, y, dx, dy] of [
      [0, 0, 1, 1],
      [W, 0, -1, 1],
      [0, H, 1, -1],
      [W, H, -1, -1],
    ]) {
      this.fill(
        this.r(Math.min(x, x + dx * L), Math.min(y, y + dy * t), L, t),
        BLACK,
      );
      this.fill(
        this.r(Math.min(x, x + dx * t), Math.min(y, y + dy * L), t, L),
        BLACK,
      );
    }
    // Ruler ticks every 100 px along the left and top edges.
    for (let y = 100; y < H; y += 100) {
      this.line(0, y, y % 500 === 0 ? 36 : 18, y, 2, LABEL_GREY);
    }
    for (let x = 100; x < W; x += 100) {
      this.line(x, 0, x, x % 500 === 0 ? 36 : 18, 2, LABEL_GREY);
    }
  }

  build(id: ProbePageId, title: string): PageLayout {
    return {
      id,
      title,
      size: this.size,
      shapes: this.shapes,
      cells: this.cells,
      groups: this.groups,
      zones: this.zones,
      areas: this.areas,
    };
  }
}

/** Page 1: A–Z in large boxes and in crossword-size boxes. */
function lettersPage(size: Size): PageLayout {
  const b = new Builder(size);
  b.frame(
    'P1 · Letters',
    [
      'Write each capital letter in its own box. Do not save the note.',
      'Then tap READ with your finger. Tap TAP to test the button only.',
    ],
    1,
  );

  // Section A: 160 px boxes with gaps, 9 per row.
  b.text(120, 310, 'A · Large boxes (160 px)', 34, {weight: 600});
  const aCell = 160;
  const aGap = 24;
  const aLeft = (MANTA_PAGE.width - (9 * aCell + 8 * aGap)) / 2;
  const sectionA: string[] = [];
  for (let row = 0; row < 3; row++) {
    const top = 340 + row * (aCell + 80);
    const rowIds: string[] = [];
    for (let col = 0; col < 9; col++) {
      const i = row * 9 + col;
      if (i >= ALPHABET.length) {
        break;
      }
      const letter = ALPHABET[i];
      const left = aLeft + col * (aCell + aGap);
      const r = b.r(left, top, aCell, aCell);
      b.box(r, 3);
      b.text(left + aCell / 2, top + aCell + 36, letter, 28, {
        anchor: 'middle',
        grey: LABEL_GREY,
      });
      const cell = b.letterCell(`A-${letter}`, r, letter);
      rowIds.push(cell.id);
    }
    b.groups.push({
      id: `A-row${row + 1}`,
      level: 'word',
      label: `A row ${row + 1}`,
      cellIds: rowIds,
    });
    sectionA.push(...rowIds);
  }
  b.groups.push({
    id: 'A',
    level: 'section',
    label: 'Section A',
    cellIds: sectionA,
  });

  // Section B: 112 px touching boxes (15×15 crossword size), 13 per row.
  b.text(120, 1130, 'B · Crossword-size boxes (112 px, touching)', 34, {
    weight: 600,
  });
  const bCell = 112;
  const bLeft = (MANTA_PAGE.width - 13 * bCell) / 2;
  const sectionB: string[] = [];
  for (let row = 0; row < 2; row++) {
    const top = 1160 + row * (bCell + 70);
    const rowIds: string[] = [];
    for (let col = 0; col < 13; col++) {
      const letter = ALPHABET[row * 13 + col];
      const left = bLeft + col * bCell;
      const r = b.r(left, top, bCell, bCell);
      b.box(r, 3);
      b.text(left + bCell / 2, top + bCell + 34, letter, 26, {
        anchor: 'middle',
        grey: LABEL_GREY,
      });
      rowIds.push(b.letterCell(`B-${letter}`, r, letter).id);
    }
    b.groups.push({
      id: `B-row${row + 1}`,
      level: 'word',
      label: `B row ${row + 1}`,
      cellIds: rowIds,
    });
    sectionB.push(...rowIds);
  }
  b.groups.push({
    id: 'B',
    level: 'section',
    label: 'Section B',
    cellIds: sectionB,
  });

  return b.build('p1-letters', 'P1 · Letters');
}

/** Page 2: Wordle rows, words on ruled lines, and the P6 marks area. */
function wordsPage(size: Size): PageLayout {
  const b = new Builder(size);
  b.frame(
    'P1 · Words',
    [
      'Rows: write the word shown, one capital per box. Lines: write the word',
      'as shown (capitals or lower case). Do not save. Then tap READ.',
    ],
    2,
  );

  // Section C: six Wordle rows of five 180 px boxes.
  b.text(120, 310, 'C · Wordle rows (180 px)', 34, {weight: 600});
  const cCell = 180;
  const cGap = 18;
  const cLeft = 474;
  const sectionC: string[] = [];
  WORDLE_WORDS.forEach((word, row) => {
    const top = 340 + row * (cCell + 25);
    b.text(cLeft - 40, top + cCell / 2 + 12, word, 34, {
      anchor: 'end',
      grey: TEXT_GREY,
    });
    const ids = [...word].map((letter, col) => {
      const left = cLeft + col * (cCell + cGap);
      const r = b.r(left, top, cCell, cCell);
      b.box(r, 3);
      return b.letterCell(`C${row + 1}-${col + 1}`, r, letter).id;
    });
    b.groups.push({
      id: `C-row${row + 1}`,
      level: 'word',
      label: `Row ${row + 1} ${word}`,
      cellIds: ids,
    });
    sectionC.push(...ids);
  });
  b.groups.push({
    id: 'C',
    level: 'section',
    label: 'Section C',
    cellIds: sectionC,
  });

  // P6 marks area, right of the Wordle rows.
  const p6 = b.r(1520, 340, 300, 420);
  b.box(p6, 2);
  b.text(1670, 390, 'P6 marks', 30, {weight: 600, anchor: 'middle'});
  b.text(1670, 430, "don't write here", 24, {
    anchor: 'middle',
    grey: LABEL_GREY,
  });
  b.areas.p6 = p6;

  // Section D: words on ruled lines.
  b.text(120, 1620, 'D · Words on lines', 34, {weight: 600});
  const lineLeft = 520;
  const lineRight = 1800;
  const sectionD: string[] = [];
  LINE_WORDS.forEach((word, i) => {
    const baseline = 1760 + i * 130;
    b.text(lineLeft - 40, baseline - 10, word, 34, {
      anchor: 'end',
      grey: TEXT_GREY,
    });
    b.line(lineLeft, baseline, lineRight, baseline, 3);
    const r: Rect = {
      left: b.u(lineLeft - 20),
      top: b.u(baseline - 120),
      right: b.u(lineRight),
      bottom: b.u(baseline + 10),
    };
    const cell: Cell = {id: `D${i + 1}`, kind: 'line', rect: r, expected: word};
    b.cells.push(cell);
    b.groups.push({
      id: `D-line${i + 1}`,
      level: 'word',
      label: `Line ${i + 1} ${word}`,
      cellIds: [cell.id],
    });
    sectionD.push(cell.id);
  });
  b.groups.push({
    id: 'D',
    level: 'section',
    label: 'Section D',
    cellIds: sectionD,
  });

  return b.build('p1-words', 'P1 · Words');
}

/** Page 3: 15×15 crossword, quality strip, and the P2 target box. */
function crosswordPage(size: Size): PageLayout {
  const b = new Builder(size);
  b.frame(
    'P3 · Crossword template',
    [
      'Is it sharp, the right size and in the right place? You can write a few',
      'letters in the grid and tap READ.',
    ],
    3,
  );

  const blocks = parseGrid(PROBE_CROSSWORD);
  const numbers = numberGrid(blocks);
  const cell = 112;
  const gridLeft = 120;
  const gridTop = 290;
  const n = blocks.length;
  const rowGroups: string[][] = [];
  for (let r = 0; r < n; r++) {
    let run: string[] = [];
    for (let c = 0; c <= n; c++) {
      if (c < n && !blocks[r][c]) {
        const left = gridLeft + c * cell;
        const top = gridTop + r * cell;
        const rr = b.r(left, top, cell, cell);
        b.box(rr, 2);
        if (numbers[r][c] > 0) {
          b.text(left + 7, top + 26, String(numbers[r][c]), 22, {weight: 600});
        }
        run.push(b.letterCell(`G-${r + 1}-${c + 1}`, rr).id);
      } else {
        if (c < n) {
          b.fill(
            b.r(gridLeft + c * cell, gridTop + r * cell, cell, cell),
            BLACK,
          );
        }
        if (run.length > 0) {
          rowGroups.push(run);
        }
        run = [];
      }
    }
  }
  rowGroups.forEach((ids, i) =>
    b.groups.push({
      id: `G-across${i + 1}`,
      level: 'word',
      label: `Across run ${i + 1}`,
      cellIds: ids,
    }),
  );
  b.groups.push({
    id: 'G',
    level: 'section',
    label: 'Grid',
    cellIds: b.cells.map(c => c.id),
  });
  b.box(b.r(gridLeft, gridTop, n * cell, n * cell), 6);

  // Quality strip: line weights, clue-number sizes, grey levels.
  const stripTop = 2010;
  b.text(120, stripTop - 12, 'Lines', 24, {weight: 600});
  [1, 2, 3, 4, 6].forEach((w, i) => {
    const y = stripTop + 20 + i * 36;
    b.line(120, y, 320, y, w);
    b.text(340, y + 9, `${w} px`, 24, {grey: TEXT_GREY});
  });
  b.text(470, stripTop - 12, 'Clue numbers', 24, {weight: 600});
  [18, 22, 26, 30].forEach((sz, i) => {
    const left = 470 + i * cell;
    b.box(b.r(left, stripTop, cell, cell), 2);
    b.text(left + 7, stripTop + sz + 4, '17', sz, {weight: 600});
    b.text(left + cell / 2, stripTop + cell + 30, `${sz}`, 22, {
      anchor: 'middle',
      grey: TEXT_GREY,
    });
  });
  b.text(960, stripTop - 12, 'Greys', 24, {weight: 600});
  [0x9d, 0xc9].forEach((g, i) => {
    const left = 960 + i * (cell + 20);
    b.fill(b.r(left, stripTop, cell, cell), g);
    b.text(left + cell / 2, stripTop + cell + 30, `#${g.toString(16)}`, 22, {
      anchor: 'middle',
      grey: TEXT_GREY,
    });
  });

  // P2 target: draw one straight line across it with the pen.
  const target = b.r(1380, stripTop, 420, 200);
  b.box(target, 3);
  b.line(1380 + 210, stripTop, 1380 + 210, stripTop + 200, 1, LABEL_GREY);
  b.line(1380, stripTop + 100, 1800, stripTop + 100, 1, LABEL_GREY);
  b.text(1590, stripTop - 12, 'P2 target', 24, {weight: 600, anchor: 'middle'});
  b.areas.p2 = target;

  return b.build('p3-crossword', 'P3 · Crossword template');
}

export function probePages(size: Size = MANTA_PAGE): PageLayout[] {
  return [lettersPage(size), wordsPage(size), crosswordPage(size)];
}

/** Layout for a 0-based page index of a probe note, or null. */
export function probeLayoutForPage(
  page: number,
  size: Size = MANTA_PAGE,
): PageLayout | null {
  const pages = probePages(size);
  return page >= 0 && page < pages.length ? pages[page] : null;
}

/** The TAP/READ zones are at the same place on every probe page. */
export function probeZones(size: Size = MANTA_PAGE): Zone[] {
  return probePages(size)[0].zones;
}
