import {cellKey, whiteCells} from '../../src/model/grid';
import {PUZZLES, SAMPLE_MINI} from '../../src/puzzles/sample';

const p = SAMPLE_MINI;

describe('SAMPLE_MINI', () => {
  it('is registered in PUZZLES under its id', () => {
    expect(p.id).toBe('sample-1');
    expect(PUZZLES[p.id]).toBe(p);
  });

  it('has a title and byline to print', () => {
    expect(p.title.trim()).not.toBe('');
    expect(p.byline.trim()).not.toBe('');
  });

  it('has ten entries, five each way', () => {
    expect(p.entries).toHaveLength(10);
    expect(p.entries.filter(e => e.direction === 'across')).toHaveLength(5);
    expect(p.entries.filter(e => e.direction === 'down')).toHaveLength(5);
  });

  it('has only upper-case A–Z answers', () => {
    for (const e of p.entries) {
      expect(e.answer).toMatch(/^[A-Z]+$/);
    }
  });

  it('has ten distinct answer words', () => {
    const answers = p.entries.map(e => e.answer);
    expect(new Set(answers).size).toBe(answers.length);
  });

  it('puts every white square in exactly one across and one down entry', () => {
    for (const c of whiteCells(p)) {
      const key = cellKey(c);
      const covering = p.entries.filter(e =>
        e.cells.some(x => cellKey(x) === key),
      );
      expect({
        key,
        across: covering.filter(e => e.direction === 'across').length,
        down: covering.filter(e => e.direction === 'down').length,
      }).toEqual({key, across: 1, down: 1});
    }
  });

  it('has a non-empty clue for every entry', () => {
    for (const e of p.entries) {
      expect(e.clue.trim().length).toBeGreaterThan(0);
    }
  });

  // Guards against giving answers away on the printed page.
  it.each(SAMPLE_MINI.entries.map(e => [e.id, e.clue] as const))(
    'clue %s (%s) contains no answer word',
    (_id, clue) => {
      for (const e of p.entries) {
        expect(clue.toLowerCase()).not.toContain(e.answer.toLowerCase());
      }
    },
  );
});
