/**
 * Normalised crossword-style puzzle (the Mini now, the full crossword later).
 * Pure data and helpers; no SDK.
 */
import {numberGrid, parseGrid, type BlockGrid} from '../layout/crossword';

export type Direction = 'across' | 'down';

export interface CellRef {
  row: number;
  col: number;
}

export interface Entry {
  /** e.g. "5A", "6D". */
  id: string;
  number: number;
  direction: Direction;
  clue: string;
  cells: CellRef[];
  answer: string;
}

export interface GridPuzzle {
  id: string;
  kind: 'mini';
  title: string;
  /** Who made it (shown on the page). */
  byline: string;
  width: number;
  height: number;
  blocks: BlockGrid;
  /** Upper-case answer letter per square; '' for blocks. */
  solution: string[][];
  numbers: number[][];
  entries: Entry[];
}

export interface GridPuzzleDef {
  id: string;
  title: string;
  byline: string;
  /** Rows of answer letters, '#' for blocks. */
  rows: string[];
  across: Record<number, string>;
  down: Record<number, string>;
}

export function cellKey(c: CellRef): string {
  return `${c.row}-${c.col}`;
}

export function entryId(number: number, direction: Direction): string {
  return `${number}${direction === 'across' ? 'A' : 'D'}`;
}

/** Builds and validates a puzzle: every entry needs a clue and vice versa. */
export function buildGridPuzzle(def: GridPuzzleDef): GridPuzzle {
  const rows = def.rows.map(r => r.toUpperCase());
  const blocks = parseGrid(rows);
  const height = blocks.length;
  const width = blocks[0].length;
  for (const [r, row] of rows.entries()) {
    for (const [c, ch] of [...row].entries()) {
      if (!blocks[r][c] && !/^[A-Z]$/.test(ch)) {
        throw new Error(`square ${r},${c} must be a letter A–Z, got "${ch}"`);
      }
    }
  }
  const solution = rows.map((row, r) =>
    [...row].map((ch, c) => (blocks[r][c] ? '' : ch)),
  );
  const numbers = numberGrid(blocks);
  const white = (r: number, c: number) =>
    r >= 0 && r < height && c >= 0 && c < width && !blocks[r][c];

  const entries: Entry[] = [];
  const used = {across: new Set<number>(), down: new Set<number>()};
  for (const direction of ['across', 'down'] as const) {
    const [dr, dc] = direction === 'across' ? [0, 1] : [1, 0];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const starts =
          white(r, c) && !white(r - dr, c - dc) && white(r + dr, c + dc);
        if (!starts) {
          continue;
        }
        const cells: CellRef[] = [];
        for (let rr = r, cc = c; white(rr, cc); rr += dr, cc += dc) {
          cells.push({row: rr, col: cc});
        }
        const number = numbers[r][c];
        const clue = def[direction][number];
        if (!clue) {
          throw new Error(`missing clue for ${entryId(number, direction)}`);
        }
        used[direction].add(number);
        entries.push({
          id: entryId(number, direction),
          number,
          direction,
          clue,
          cells,
          answer: cells.map(x => solution[x.row][x.col]).join(''),
        });
      }
    }
  }
  for (const direction of ['across', 'down'] as const) {
    for (const n of Object.keys(def[direction]).map(Number)) {
      if (!used[direction].has(n)) {
        throw new Error(
          `clue ${entryId(n, direction)} has no entry in the grid`,
        );
      }
    }
  }
  return {
    id: def.id,
    kind: 'mini',
    title: def.title,
    byline: def.byline,
    width,
    height,
    blocks,
    solution,
    numbers,
    entries,
  };
}

/** Every white square, row by row. */
export function whiteCells(p: GridPuzzle): CellRef[] {
  const out: CellRef[] = [];
  for (let r = 0; r < p.height; r++) {
    for (let c = 0; c < p.width; c++) {
      if (!p.blocks[r][c]) {
        out.push({row: r, col: c});
      }
    }
  }
  return out;
}
