/**
 * Only the pure helpers of the REVEAL screen; the component is not rendered.
 * The app and runner modules are stubbed so this file doesn't depend on
 * their internals.
 */
import {buildGridPuzzle, cellKey, whiteCells} from '../../src/model/grid';
import {SAMPLE_MINI} from '../../src/puzzles/sample';
import {answerText, describePick, keysFor} from '../../src/ui/RevealScreen';

jest.mock('../../src/app/mini', () => ({
  recordReveal: jest.fn(),
  revealSquares: jest.fn(),
}));
jest.mock('../../src/probes/runner', () => ({runProbe: jest.fn()}));

type Pick = Parameters<typeof keysFor>[1];

const p = SAMPLE_MINI;
const square = (key: string): Pick => ({kind: 'square', key});
const entry = (id: string): Pick => ({kind: 'entry', id});
const WRONG: Pick = {kind: 'wrong'};
const ALL: Pick = {kind: 'all'};

/**
 * A grid with two squares that are in a down entry only:
 *   A B #
 *   C # D
 *   E F G
 */
const UNCHECKED = buildGridPuzzle({
  id: 'unchecked',
  title: 'Unchecked',
  byline: 'Test',
  rows: ['AB#', 'C#D', 'EFG'],
  across: {1: 'ab', 3: 'efg'},
  down: {1: 'ace', 2: 'dg'},
});

describe('keysFor', () => {
  it('covers just the picked square', () => {
    expect(keysFor(p, square('2-3'), [])).toEqual(['2-3']);
  });

  it('covers the squares of the picked entry in order', () => {
    expect(keysFor(p, entry('5A'), [])).toEqual([
      '1-0',
      '1-1',
      '1-2',
      '1-3',
      '1-4',
    ]);
    expect(keysFor(p, entry('6D'), [])).toEqual(['1-4', '2-4', '3-4', '4-4']);
  });

  it('covers nothing for an entry that does not exist', () => {
    expect(keysFor(p, entry('42A'), [])).toEqual([]);
  });

  it('covers the wrong squares from the last check, as given', () => {
    expect(keysFor(p, WRONG, ['3-1', '0-0'])).toEqual(['3-1', '0-0']);
    expect(keysFor(p, WRONG, [])).toEqual([]);
  });

  it('ignores the wrong squares for other kinds of pick', () => {
    expect(keysFor(p, square('0-0'), ['3-1'])).toEqual(['0-0']);
    expect(keysFor(p, entry('9A'), ['0-0'])).toEqual([
      '4-1',
      '4-2',
      '4-3',
      '4-4',
    ]);
  });

  it('covers every white square of the sample, row by row, for the whole puzzle', () => {
    const keys = keysFor(p, ALL, []);
    expect(keys).toEqual(whiteCells(p).map(cellKey));
    expect(new Set(keys).size).toBe(keys.length);
  });

  // A square in a down entry only still belongs to the whole puzzle.
  it('covers squares that are only in a down entry for the whole puzzle', () => {
    expect(keysFor(UNCHECKED, ALL, [])).toEqual(
      whiteCells(UNCHECKED).map(cellKey),
    );
  });
});

describe('describePick', () => {
  it('names a square by 1-based row and column', () => {
    expect(describePick(p, square('0-0'))).toBe(
      'the square in row 1, column 1',
    );
    expect(describePick(p, square('2-3'))).toBe(
      'the square in row 3, column 4',
    );
  });

  it('names an entry by number and direction', () => {
    expect(describePick(p, entry('5A'))).toBe('5 Across');
    expect(describePick(p, entry('6D'))).toBe('6 Down');
    expect(describePick(p, entry('1D'))).toBe('1 Down');
  });

  it('falls back to the id for an unknown entry', () => {
    expect(describePick(p, entry('42A'))).toBe('42A');
  });

  it('describes the wrong squares and the whole puzzle', () => {
    expect(describePick(p, WRONG)).toBe(
      'the wrong squares from the last CHECK',
    );
    expect(describePick(p, ALL)).toBe('the whole puzzle');
  });
});

describe('answerText', () => {
  it('gives an entry its answer word', () => {
    expect(answerText(p, entry('5A'), keysFor(p, entry('5A'), []))).toBe(
      '5 Across: TILES',
    );
    expect(answerText(p, entry('3D'), [])).toBe('3 Down: ALIKE');
  });

  it('is empty for an unknown entry', () => {
    expect(answerText(p, entry('42A'), [])).toBe('');
  });

  it('gives a square its letter with 1-based row and column', () => {
    expect(answerText(p, square('1-1'), ['1-1'])).toBe('Row 2, column 2: I');
  });

  it('lists each wrong square on its own line, in the order given', () => {
    expect(answerText(p, WRONG, ['3-1', '0-0'])).toBe(
      ['Row 4, column 2: O', 'Row 1, column 1: S'].join('\n'),
    );
  });

  it('is empty when there are no wrong squares', () => {
    expect(answerText(p, WRONG, [])).toBe('');
  });

  it('prints the whole grid with ■ for blocks', () => {
    expect(answerText(p, ALL, keysFor(p, ALL, []))).toBe(
      ['S P A S ■', 'T I L E S', 'A L I V E', 'T O K E N', '■ T E N T'].join(
        '\n',
      ),
    );
  });

  it('prints the whole grid, unchecked squares included', () => {
    expect(answerText(UNCHECKED, ALL, [])).toBe(
      ['A B ■', 'C ■ D', 'E F G'].join('\n'),
    );
  });
});
