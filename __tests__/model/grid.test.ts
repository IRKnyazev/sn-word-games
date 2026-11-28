import {
  buildGridPuzzle,
  cellKey,
  entryId,
  whiteCells,
  type CellRef,
  type GridPuzzle,
  type GridPuzzleDef,
} from '../../src/model/grid';

/** The sample Mini's grid and clues, rebuilt here so each test can tweak it. */
const sampleDef = (): GridPuzzleDef => ({
  id: 'sample-1',
  title: 'Sample Mini',
  byline: 'Supernote Puzzles',
  rows: ['SPAS#', 'TILES', 'ALIVE', 'TOKEN', '#TENT'],
  across: {
    1: 'Places for a mud bath and a massage',
    5: 'Squares on a bathroom wall',
    7: '___ and kicking',
    8: 'Coin for an arcade game',
    9: "Camper's shelter",
  },
  down: {
    1: 'Right away, in the ER',
    2: 'Voice of cockpit announcements',
    3: 'Like two peas in a pod',
    4: 'Days in a week',
    6: 'Like a posted letter',
  },
});

const keys = (cells: CellRef[]): string[] => cells.map(cellKey);

const entry = (p: GridPuzzle, id: string) => {
  const e = p.entries.find(x => x.id === id);
  if (!e) {
    throw new Error(`no entry ${id}`);
  }
  return e;
};

describe('cellKey', () => {
  it('joins row and column with a dash', () => {
    expect(cellKey({row: 0, col: 0})).toBe('0-0');
    expect(cellKey({row: 2, col: 3})).toBe('2-3');
    expect(cellKey({row: 12, col: 4})).toBe('12-4');
  });
});

describe('entryId', () => {
  it('is the number followed by A for across or D for down', () => {
    expect(entryId(1, 'across')).toBe('1A');
    expect(entryId(6, 'down')).toBe('6D');
    expect(entryId(23, 'across')).toBe('23A');
  });
});

describe('buildGridPuzzle on the sample', () => {
  const p = buildGridPuzzle(sampleDef());

  it('keeps the id, title and byline and marks it as a mini', () => {
    expect(p.id).toBe('sample-1');
    expect(p.kind).toBe('mini');
    expect(p.title).toBe('Sample Mini');
    expect(p.byline).toBe('Supernote Puzzles');
  });

  it('is 5×5 with blocks at top-right and bottom-left', () => {
    expect(p.width).toBe(5);
    expect(p.height).toBe(5);
    const blocks = p.blocks.flatMap((row, r) =>
      row.flatMap((b, c) => (b ? [cellKey({row: r, col: c})] : [])),
    );
    expect(blocks).toEqual(['0-4', '4-0']);
  });

  it('has the answer letter in each white square and "" for blocks', () => {
    expect(p.solution).toEqual([
      ['S', 'P', 'A', 'S', ''],
      ['T', 'I', 'L', 'E', 'S'],
      ['A', 'L', 'I', 'V', 'E'],
      ['T', 'O', 'K', 'E', 'N'],
      ['', 'T', 'E', 'N', 'T'],
    ]);
  });

  it('numbers the squares the standard way', () => {
    expect(p.numbers).toEqual([
      [1, 2, 3, 4, 0],
      [5, 0, 0, 0, 6],
      [7, 0, 0, 0, 0],
      [8, 0, 0, 0, 0],
      [0, 9, 0, 0, 0],
    ]);
  });

  it('lists the across entries first, then the down entries, each in number order', () => {
    expect(p.entries.map(e => e.id)).toEqual([
      '1A',
      '5A',
      '7A',
      '8A',
      '9A',
      '1D',
      '2D',
      '3D',
      '4D',
      '6D',
    ]);
  });

  it.each([
    ['1A', 1, 'across', 'SPAS'],
    ['5A', 5, 'across', 'TILES'],
    ['7A', 7, 'across', 'ALIVE'],
    ['8A', 8, 'across', 'TOKEN'],
    ['9A', 9, 'across', 'TENT'],
    ['1D', 1, 'down', 'STAT'],
    ['2D', 2, 'down', 'PILOT'],
    ['3D', 3, 'down', 'ALIKE'],
    ['4D', 4, 'down', 'SEVEN'],
    ['6D', 6, 'down', 'SENT'],
  ] as const)('%s is %i %s with answer %s', (id, number, direction, answer) => {
    const e = entry(p, id);
    expect(e.number).toBe(number);
    expect(e.direction).toBe(direction);
    expect(e.answer).toBe(answer);
    expect(e.cells).toHaveLength(answer.length);
  });

  it.each([
    ['1A', ['0-0', '0-1', '0-2', '0-3']],
    ['5A', ['1-0', '1-1', '1-2', '1-3', '1-4']],
    ['7A', ['2-0', '2-1', '2-2', '2-3', '2-4']],
    ['8A', ['3-0', '3-1', '3-2', '3-3', '3-4']],
    ['9A', ['4-1', '4-2', '4-3', '4-4']],
    ['1D', ['0-0', '1-0', '2-0', '3-0']],
    ['2D', ['0-1', '1-1', '2-1', '3-1', '4-1']],
    ['3D', ['0-2', '1-2', '2-2', '3-2', '4-2']],
    ['4D', ['0-3', '1-3', '2-3', '3-3', '4-3']],
    ['6D', ['1-4', '2-4', '3-4', '4-4']],
  ])('%s covers squares %j in order', (id, expected) => {
    expect(keys(entry(p, id).cells)).toEqual(expected);
  });

  it('spells each answer from the solution letters of its cells', () => {
    for (const e of p.entries) {
      expect(e.cells.map(c => p.solution[c.row][c.col]).join('')).toBe(
        e.answer,
      );
    }
  });

  it('gives each entry its own clue', () => {
    expect(entry(p, '5A').clue).toBe('Squares on a bathroom wall');
    expect(entry(p, '6D').clue).toBe('Like a posted letter');
    expect(entry(p, '1A').clue).not.toBe(entry(p, '1D').clue);
  });

  it('starts every entry at its numbered square', () => {
    for (const e of p.entries) {
      const first = e.cells[0];
      expect(p.numbers[first.row][first.col]).toBe(e.number);
    }
  });
});

describe('buildGridPuzzle input handling', () => {
  it('upper-cases lower-case answer letters', () => {
    const p = buildGridPuzzle({
      ...sampleDef(),
      rows: ['spas#', 'tiles', 'Alive', 'tOKEN', '#tent'],
    });
    expect(p.solution[0]).toEqual(['S', 'P', 'A', 'S', '']);
    expect(p.entries.map(e => e.answer)).toEqual([
      'SPAS',
      'TILES',
      'ALIVE',
      'TOKEN',
      'TENT',
      'STAT',
      'PILOT',
      'ALIKE',
      'SEVEN',
      'SENT',
    ]);
  });

  it('builds a grid with no blocks', () => {
    const p = buildGridPuzzle({
      id: 'tiny',
      title: 'Tiny',
      byline: 'Test',
      rows: ['AB', 'CD'],
      across: {1: 'a', 3: 'b'},
      down: {1: 'c', 2: 'd'},
    });
    expect(p.entries.map(e => `${e.id}=${e.answer}`)).toEqual([
      '1A=AB',
      '3A=CD',
      '1D=AC',
      '2D=BD',
    ]);
  });

  it.each([
    ['a dot', 'TI.ES', '.'],
    ['a digit', 'TIL3S', '3'],
    ['a space', 'TI ES', ' '],
    ['a hyphen', 'TIL-S', '-'],
    ['an accented letter', 'TILÉS', 'É'],
  ])('rejects %s in a white square', (_name, row, ch) => {
    const def = sampleDef();
    def.rows = [def.rows[0], row, ...def.rows.slice(2)];
    expect(() => buildGridPuzzle(def)).toThrow(
      `square 1,${row.indexOf(ch)} must be a letter A–Z, got "${ch}"`,
    );
  });

  it('reports a missing across clue', () => {
    const def = sampleDef();
    delete def.across[5];
    expect(() => buildGridPuzzle(def)).toThrow('missing clue for 5A');
  });

  it('reports a missing down clue', () => {
    const def = sampleDef();
    delete def.down[6];
    expect(() => buildGridPuzzle(def)).toThrow('missing clue for 6D');
  });

  it('treats an empty clue as missing', () => {
    const def = sampleDef();
    def.down[3] = '';
    expect(() => buildGridPuzzle(def)).toThrow('missing clue for 3D');
  });

  it('reports a clue whose number has no entry at all', () => {
    const def = sampleDef();
    def.across[10] = 'Not in the grid';
    expect(() => buildGridPuzzle(def)).toThrow(
      'clue 10A has no entry in the grid',
    );
  });

  it('reports a clue for a number that only starts an entry the other way', () => {
    // 2 starts PILOT (down) but no across entry.
    const def = sampleDef();
    def.across[2] = 'Wrong direction';
    expect(() => buildGridPuzzle(def)).toThrow(
      'clue 2A has no entry in the grid',
    );
  });

  it('reports a down clue with no entry', () => {
    const def = sampleDef();
    def.down[5] = 'Only across';
    expect(() => buildGridPuzzle(def)).toThrow(
      'clue 5D has no entry in the grid',
    );
  });

  it('rejects ragged rows', () => {
    const def = sampleDef();
    def.rows = ['SPAS#', 'TILE', 'ALIVE', 'TOKEN', '#TENT'];
    expect(() => buildGridPuzzle(def)).toThrow(
      'row 1 has 4 cells, expected 5',
    );
  });

  it('rejects an empty grid', () => {
    expect(() => buildGridPuzzle({...sampleDef(), rows: []})).toThrow(
      'empty grid',
    );
  });
});

describe('whiteCells', () => {
  const p = buildGridPuzzle(sampleDef());

  it('lists every white square row by row, skipping blocks', () => {
    const all = keys(whiteCells(p));
    expect(all).toHaveLength(23);
    expect(all.slice(0, 6)).toEqual(['0-0', '0-1', '0-2', '0-3', '1-0', '1-1']);
    expect(all).not.toContain('0-4');
    expect(all).not.toContain('4-0');
    expect(all[all.length - 1]).toBe('4-4');
  });

  it('matches exactly the squares that have a solution letter', () => {
    const withLetter: string[] = [];
    p.solution.forEach((row, r) =>
      row.forEach((ch, c) => {
        if (ch) {
          withLetter.push(cellKey({row: r, col: c}));
        }
      }),
    );
    expect(keys(whiteCells(p))).toEqual(withLetter);
  });
});
