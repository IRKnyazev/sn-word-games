/**
 * Crossword grid helpers: parse a pattern, number it the standard way.
 * Pure; used by the P3 probe page now and by the Mini/crossword later.
 */

/** true = black square. */
export type BlockGrid = boolean[][];

/** Rows of '#' (black) and any other character (white). */
export function parseGrid(rows: readonly string[]): BlockGrid {
  if (rows.length === 0) {
    throw new Error('empty grid');
  }
  const w = rows[0].length;
  return rows.map((row, i) => {
    if (row.length !== w) {
      throw new Error(`row ${i} has ${row.length} cells, expected ${w}`);
    }
    return [...row].map(ch => ch === '#');
  });
}

/**
 * Standard numbering: a white cell gets the next number if it starts an
 * across word (left is edge/black, right is white) or a down word.
 * Returns 0 for unnumbered cells.
 */
export function numberGrid(blocks: BlockGrid): number[][] {
  const h = blocks.length;
  const w = blocks[0]?.length ?? 0;
  const white = (r: number, c: number) =>
    r >= 0 && r < h && c >= 0 && c < w && !blocks[r][c];
  let next = 1;
  return blocks.map((row, r) =>
    row.map((_, c) => {
      if (!white(r, c)) {
        return 0;
      }
      const across = !white(r, c - 1) && white(r, c + 1);
      const down = !white(r - 1, c) && white(r + 1, c);
      return across || down ? next++ : 0;
    }),
  );
}

/** 180° rotational symmetry, as in NYT grids. */
export function isSymmetric(blocks: BlockGrid): boolean {
  const h = blocks.length;
  const w = blocks[0]?.length ?? 0;
  return blocks.every((row, r) =>
    row.every((b, c) => b === blocks[h - 1 - r][w - 1 - c]),
  );
}

/** Lengths of every across and down run of white cells. */
export function runLengths(blocks: BlockGrid): number[] {
  const h = blocks.length;
  const w = blocks[0]?.length ?? 0;
  const runs: number[] = [];
  const scan = (
    get: (i: number, j: number) => boolean,
    n: number,
    m: number,
  ) => {
    for (let i = 0; i < n; i++) {
      let len = 0;
      for (let j = 0; j <= m; j++) {
        if (j < m && !get(i, j)) {
          len++;
        } else {
          if (len > 0) {
            runs.push(len);
          }
          len = 0;
        }
      }
    }
  };
  scan((r, c) => blocks[r][c], h, w);
  scan((c, r) => blocks[r][c], w, h);
  return runs;
}
