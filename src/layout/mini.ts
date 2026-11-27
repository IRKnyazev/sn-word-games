/**
 * Layout of a Mini page: grid, clue list with a mark box per clue, CHECK and
 * REVEAL buttons, and the zones where feedback marks go. The same layout
 * prints the template, maps strokes to squares, places marks and finds them
 * again for replacement.
 *
 * Designed in Manta pixels (1920×2560) and scaled for other page sizes.
 * Owner's M0 choices: 3 px grid lines; small bold clue numbers.
 */
import type {GridPuzzle} from '../model/grid';
import {cellKey} from '../model/grid';
import type {Rect, Size} from './geometry';
import {MANTA_PAGE} from './probe';
import type {Cell, Group, PageLayout, Shape, Zone} from './types';

export interface MiniLayout {
  page: PageLayout;
  /** Square rects, [row][col]; null for blocks. */
  cellRects: (Rect | null)[][];
  /** Mark box in front of each clue, by entry id ("5A"). */
  clueBoxes: Record<string, Rect>;
  /** Where a wrong-square slash goes, by cell key ("2-3"). */
  wrongZones: Record<string, Rect>;
  /** Where a revealed-square triangle goes, by cell key. */
  revealZones: Record<string, Rect>;
  /** A small out-of-the-way area for the hairline that keeps batch updates non-empty. */
  anchorZone: Rect;
}

const TEXT_GREY = 0x60;
const LABEL_GREY = 0x80;
const BUTTON_FILL = 0xe6;

/** Rough text width for Libre Franklin, for wrapping clues (em ≈ 0.52 × size). */
export function wrapText(
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / (size * 0.52)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

export function miniLayout(p: GridPuzzle, size: Size = MANTA_PAGE): MiniLayout {
  const s = size.width / MANTA_PAGE.width;
  const u = (n: number) => Math.round(n * s);
  const R = (left: number, top: number, w: number, h: number): Rect => ({
    left: u(left),
    top: u(top),
    right: u(left + w),
    bottom: u(top + h),
  });
  const shapes: Shape[] = [];
  const text = (
    x: number,
    y: number,
    t: string,
    sz: number,
    opts: {
      weight?: 400 | 600 | 700;
      anchor?: 'start' | 'middle' | 'end';
      grey?: number;
    } = {},
  ) =>
    shapes.push({
      kind: 'text',
      at: {x: u(x), y: u(y)},
      text: t,
      size: u(sz),
      weight: opts.weight ?? 400,
      anchor: opts.anchor ?? 'start',
      grey: opts.grey ?? 0,
    });
  const box = (r: Rect, w: number, fill?: number) =>
    shapes.push({
      kind: 'rect',
      rect: r,
      strokeWidth: Math.max(1, u(w)),
      stroke: 0,
      fill,
    });
  const fill = (r: Rect, grey: number) =>
    shapes.push({kind: 'rect', rect: r, strokeWidth: 0, fill: grey});

  // Header.
  text(120, 150, p.title, 52, {weight: 700});
  text(120, 200, `by ${p.byline}`, 28, {grey: TEXT_GREY});

  // Grid, centred. Writing stays well above 85% of the page height.
  const cell = Math.floor(1300 / Math.max(p.width, p.height));
  const gridW = cell * p.width;
  const gridH = cell * p.height;
  const gridLeft = Math.round((MANTA_PAGE.width - gridW) / 2);
  const gridTop = 250;
  const cells: Cell[] = [];
  const cellRects: (Rect | null)[][] = [];
  const wrongZones: Record<string, Rect> = {};
  const revealZones: Record<string, Rect> = {};
  const corner = Math.round(cell * 0.3);
  for (let r = 0; r < p.height; r++) {
    const row: (Rect | null)[] = [];
    for (let c = 0; c < p.width; c++) {
      const left = gridLeft + c * cell;
      const top = gridTop + r * cell;
      const rect = R(left, top, cell, cell);
      if (p.blocks[r][c]) {
        fill(rect, 0);
        row.push(null);
        continue;
      }
      box(rect, 3);
      if (p.numbers[r][c] > 0) {
        text(left + 10, top + 38, String(p.numbers[r][c]), 32, {weight: 700});
      }
      const key = cellKey({row: r, col: c});
      cells.push({id: key, kind: 'letter', rect, expected: p.solution[r][c]});
      wrongZones[key] = R(left + cell - corner, top, corner, corner);
      revealZones[key] = R(
        left + cell - corner,
        top + cell - corner,
        corner,
        corner,
      );
      row.push(rect);
    }
    cellRects.push(row);
  }
  box(R(gridLeft, gridTop, gridW, gridH), 6);

  // Clues: Across on the left, Down on the right, each with a mark box.
  const clueTop = gridTop + gridH + 90;
  const columns: [string, 'across' | 'down', number, number][] = [
    ['Across', 'across', 120, 820],
    ['Down', 'down', 1000, 800],
  ];
  const clueBoxes: Record<string, Rect> = {};
  for (const [title, direction, x, width] of columns) {
    text(x, clueTop, title, 38, {weight: 700});
    let y = clueTop + 70;
    for (const e of p.entries.filter(en => en.direction === direction)) {
      const b = R(x, y - 40, 48, 48);
      box(b, 2);
      clueBoxes[e.id] = b;
      text(x + 70, y, String(e.number), 32, {weight: 700});
      const lines = wrapText(e.clue, 32, width - 130);
      lines.forEach((line, i) => text(x + 120, y + i * 42, line, 32));
      y += 42 * lines.length + 24;
    }
  }

  // Buttons and footer.
  const zones: Zone[] = [];
  const button = (id: string, label: string, left: number) => {
    const r = R(left, 2280, 320, 130);
    box(r, 4, BUTTON_FILL);
    text(left + 160, 2360, label, 44, {weight: 700, anchor: 'middle'});
    zones.push({id, label, rect: r});
  };
  button('REVEAL', 'REVEAL', 120);
  button('CHECK', 'CHECK', 1480);
  text(960, 2490, `Supernote Puzzles · ${p.title}`, 26, {
    anchor: 'middle',
    grey: LABEL_GREY,
  });

  const groups: Group[] = p.entries.map(e => ({
    id: e.id,
    level: 'word',
    label: `${e.id} ${e.clue}`,
    cellIds: e.cells.map(cellKey),
  }));

  return {
    page: {
      id: `mini-${p.id}`,
      title: p.title,
      size,
      shapes,
      cells,
      groups,
      zones,
      areas: {},
    },
    cellRects,
    clueBoxes,
    wrongZones,
    revealZones,
    anchorZone: R(24, 1600, 40, 40),
  };
}
