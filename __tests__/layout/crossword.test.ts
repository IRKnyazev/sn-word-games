import {
  isSymmetric,
  numberGrid,
  parseGrid,
  runLengths,
} from '../../src/layout/crossword';

describe('parseGrid', () => {
  it("maps '#' to black (true) and anything else to white (false)", () => {
    expect(parseGrid(['.#', '#a', ' x'])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ]);
  });

  it('throws on an empty grid', () => {
    expect(() => parseGrid([])).toThrow('empty grid');
  });

  it('throws on ragged rows, naming the row', () => {
    expect(() => parseGrid(['...', '..', '...'])).toThrow(
      'row 1 has 2 cells, expected 3',
    );
    expect(() => parseGrid(['..', '..', '...'])).toThrow(
      'row 2 has 3 cells, expected 2',
    );
  });

  it('accepts non-square grids', () => {
    const g = parseGrid(['....', '#..#']);
    expect(g).toHaveLength(2);
    expect(g[0]).toHaveLength(4);
  });
});

describe('numberGrid', () => {
  it('numbers a 3×3 all-white grid 1,2,3 across the top then 4,5 down the left', () => {
    expect(numberGrid(parseGrid(['...', '...', '...']))).toEqual([
      [1, 2, 3],
      [4, 0, 0],
      [5, 0, 0],
    ]);
  });

  it('numbers a grid with blocks (hand-checked)', () => {
    // 1 2 #
    // 3 . 4
    // # 5 .
    expect(numberGrid(parseGrid(['..#', '...', '#..']))).toEqual([
      [1, 2, 0],
      [3, 0, 4],
      [0, 5, 0],
    ]);
  });

  it('numbers a NYT-Mini-shaped 5×5 grid', () => {
    expect(
      numberGrid(parseGrid(['#....', '.....', '.....', '.....', '....#'])),
    ).toEqual([
      [0, 1, 2, 3, 4],
      [5, 0, 0, 0, 0],
      [6, 0, 0, 0, 0],
      [7, 0, 0, 0, 0],
      [8, 0, 0, 0, 0],
    ]);
  });

  it('gives a cell that starts both an across and a down word a single number', () => {
    const n = numberGrid(parseGrid(['..', '..']));
    expect(n).toEqual([
      [1, 2],
      [3, 0],
    ]);
  });

  it('leaves black squares and isolated white squares unnumbered', () => {
    expect(numberGrid(parseGrid(['.#', '##']))).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('numbers a white cell that starts only a down word', () => {
    // Middle column: '.' between blocks across, but a 3-long down word.
    expect(numberGrid(parseGrid(['#.#', '#.#', '#.#']))).toEqual([
      [0, 1, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('numbers increase strictly in reading order', () => {
    const n = numberGrid(
      parseGrid(['....#', '.....', '..#..', '.....', '#....']),
    ).flat();
    const nonZero = n.filter(v => v > 0);
    expect(nonZero).toEqual(nonZero.map((_, i) => i + 1));
  });

  it('returns an empty grid for an empty block grid', () => {
    expect(numberGrid([])).toEqual([]);
  });
});

describe('isSymmetric (180° rotation)', () => {
  it('is true for a 180°-symmetric grid', () => {
    expect(isSymmetric(parseGrid(['#..', '...', '..#']))).toBe(true);
    expect(isSymmetric(parseGrid(['#.', '.#']))).toBe(true);
  });

  it('is false for a grid that is only mirror-symmetric', () => {
    // Left/right mirror image of itself, but not after a half turn.
    expect(isSymmetric(parseGrid(['#.#', '...', '...']))).toBe(false);
    expect(isSymmetric(parseGrid(['#.', '#.']))).toBe(false);
  });

  it('is true for an all-white grid and for an empty grid', () => {
    expect(isSymmetric(parseGrid(['...', '...']))).toBe(true);
    expect(isSymmetric([])).toBe(true);
  });

  it('works on non-square grids', () => {
    expect(isSymmetric(parseGrid(['#...', '...#']))).toBe(true);
    expect(isSymmetric(parseGrid(['#...', '#...']))).toBe(false);
  });
});

describe('runLengths', () => {
  it('lists across runs (rows top to bottom) then down runs (columns left to right)', () => {
    // across: 2 | 3 | 2   down: 2 | 3 | 2
    expect(runLengths(parseGrid(['..#', '...', '#..']))).toEqual([
      2, 3, 2, 2, 3, 2,
    ]);
  });

  it('counts every row and column of an all-white grid', () => {
    expect(runLengths(parseGrid(['...', '...', '...']))).toEqual([
      3, 3, 3, 3, 3, 3,
    ]);
  });

  it('includes runs of length 1 (so callers can reject them)', () => {
    expect(runLengths(parseGrid(['.#.']))).toEqual([1, 1, 1, 1]);
  });

  it('splits a row at every block', () => {
    expect(runLengths(parseGrid(['..#...#.']))).toEqual([
      2, 3, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it('returns nothing for an all-black grid', () => {
    expect(runLengths(parseGrid(['##', '##']))).toEqual([]);
  });

  it('handles non-square grids', () => {
    expect(runLengths(parseGrid(['....']))).toEqual([4, 1, 1, 1, 1]);
  });

  it('returns nothing for an empty block grid', () => {
    expect(runLengths([])).toEqual([]);
  });
});
