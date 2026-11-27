import {
  editDistance,
  lettersOnly,
  percent,
  score,
  tally,
  type Score,
} from '../../src/recognise/text';

describe('lettersOnly', () => {
  it('upper-cases and keeps only A–Z', () => {
    expect(lettersOnly('Hello, World!')).toBe('HELLOWORLD');
    expect(lettersOnly('a b-c\t1 2_3')).toBe('ABC');
  });

  it('returns an empty string for null, undefined and empty input', () => {
    expect(lettersOnly(null)).toBe('');
    expect(lettersOnly(undefined)).toBe('');
    expect(lettersOnly('')).toBe('');
  });

  it('drops digits and non-ASCII letters', () => {
    expect(lettersOnly('0O1l')).toBe('OL');
    expect(lettersOnly('café')).toBe('CAF');
  });
});

describe('editDistance', () => {
  it.each([
    ['', '', 0],
    ['abc', 'abc', 0],
    ['', 'abc', 3],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
    ['flaw', 'lawn', 2],
    ['GLOVE', 'GLOVES', 1], // insertion
    ['WHARF', 'WARF', 1], // deletion
    ['QUIRK', 'QUIRT', 1], // substitution
    ['ABCD', 'BADC', 3],
    ['SCENT', 'XXXXX', 5],
  ])('%j vs %j → %i', (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });

  it('is symmetric', () => {
    const pairs: [string, string][] = [
      ['kitten', 'sitting'],
      ['JUKEBOX', 'JUKBEOX'],
      ['', 'Z'],
    ];
    for (const [a, b] of pairs) {
      expect(editDistance(a, b)).toBe(editDistance(b, a));
    }
  });

  it('is case-sensitive (callers normalise first)', () => {
    expect(editDistance('a', 'A')).toBe(1);
  });
});

describe('score', () => {
  it('is exact for the same letters, ignoring case, spaces and punctuation', () => {
    expect(score('PUZZLE', 'puzzle')).toEqual({
      expected: 'PUZZLE',
      got: 'PUZZLE',
      exact: true,
      distance: 0,
    });
    expect(score('lantern', ' L-A N.T E R N ')).toMatchObject({
      exact: true,
      distance: 0,
    });
  });

  it('reports a near miss with its distance', () => {
    expect(score('WHISKY', 'whiskey')).toEqual({
      expected: 'WHISKY',
      got: 'WHISKEY',
      exact: false,
      distance: 1,
    });
  });

  it('treats a missing result as empty', () => {
    expect(score('QUIRK', null)).toEqual({
      expected: 'QUIRK',
      got: '',
      exact: false,
      distance: 5,
    });
    expect(score('QUIRK', undefined).got).toBe('');
  });

  it('normalises the expected text too', () => {
    expect(score("don't", 'DONT').exact).toBe(true);
  });
});

describe('tally and percent', () => {
  const s = (exact: boolean): Score => ({
    expected: 'A',
    got: exact ? 'A' : 'B',
    exact,
    distance: exact ? 0 : 1,
  });

  it('counts total and exact scores', () => {
    expect(tally([s(true), s(false), s(true)])).toEqual({total: 3, exact: 2});
    expect(tally([])).toEqual({total: 0, exact: 0});
  });

  it("shows '—' for an empty tally", () => {
    expect(percent({total: 0, exact: 0})).toBe('—');
  });

  it.each([
    [{total: 3, exact: 2}, '67%'],
    [{total: 3, exact: 1}, '33%'],
    [{total: 2, exact: 1}, '50%'],
    [{total: 4, exact: 4}, '100%'],
    [{total: 5, exact: 0}, '0%'],
    [{total: 200, exact: 1}, '1%'], // 0.5 rounds up
  ])('%j → %s', (t, out) => {
    expect(percent(t)).toBe(out);
  });
});
