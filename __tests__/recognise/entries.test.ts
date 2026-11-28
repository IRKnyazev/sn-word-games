import {
  LOOKALIKES,
  displayChar,
  judgeCell,
  letterTokens,
  mapEntryToCells,
  matchesLetter,
} from '../../src/recognise/entries';

/**
 * What the firmware recogniser returned for a single handwritten capital in
 * M0 (device results of 2026-11-27): [letter written, what was read].
 */
const M0_MISREADS: [string, string][] = [
  ['O', '0'],
  ['Z', '2'],
  ['Y', '1'],
  ['X', '/'],
  ['X', '✗'],
  ['D', '>'],
  ['V', '✓'],
];

/** M0 misreads that are other letters: taken literally, never forgiven. */
const LETTER_MISREADS: [string, string][] = [['K', 'v']];

/** Letters the recogniser left blank when written on their own in M0. */
const M0_BLANKS = ['I', 'L', 'O', 'U', 'J'];

describe('LOOKALIKES table', () => {
  it('is keyed by single upper-case letters', () => {
    for (const letter of Object.keys(LOOKALIKES)) {
      expect(letter).toMatch(/^[A-Z]$/);
    }
  });

  it('never lists an upper-case letter as a look-alike (that would forgive a different letter)', () => {
    for (const chars of Object.values(LOOKALIKES)) {
      for (const ch of chars) {
        expect(ch).not.toMatch(/^[A-Z]$/);
        expect([...ch]).toHaveLength(1);
      }
    }
  });

  it.each(M0_MISREADS)('covers the M0 misread %s → "%s"', (letter, read) => {
    expect(LOOKALIKES[letter]).toContain(read);
  });
});

describe('matchesLetter', () => {
  it('accepts the exact letter', () => {
    expect(matchesLetter('A', 'A')).toBe(true);
    expect(matchesLetter('Q', 'Q')).toBe(true);
  });

  it('ignores case on both sides', () => {
    expect(matchesLetter('a', 'A')).toBe(true);
    expect(matchesLetter('A', 'a')).toBe(true);
    expect(matchesLetter('e', 'e')).toBe(true);
  });

  it('accepts a look-alike when the answer is given in lower case', () => {
    expect(matchesLetter('0', 'o')).toBe(true);
    expect(matchesLetter('2', 'z')).toBe(true);
  });

  const lookalikePairs = Object.entries(LOOKALIKES).flatMap(([letter, chars]) =>
    chars.map(ch => [letter, ch] as const),
  );
  it.each(lookalikePairs)('accepts look-alike "%s" ← "%s"', (letter, ch) => {
    expect(matchesLetter(ch, letter)).toBe(true);
  });

  it('rejects an empty reading', () => {
    expect(matchesLetter('', 'A')).toBe(false);
    expect(matchesLetter('', 'I')).toBe(false);
  });

  it.each([
    ['B', 'A'],
    ['E', 'F'],
    ['3', 'E'],
    ['7', 'T'],
    ['.', 'I'],
    ['-', 'I'],
    ['?', 'O'],
    [' ', 'A'],
    ['AB', 'A'],
  ])('rejects "%s" for %s', (read, answer) => {
    expect(matchesLetter(read, answer)).toBe(false);
  });

  it.each([
    ['2', 'O', 'Z'],
    ['0', 'Z', 'O'],
    ['>', 'V', 'D'],
    ['✓', 'X', 'V'],
    ['✗', 'V', 'X'],
    ['8', 'S', 'B'],
    ['5', 'B', 'S'],
    ['6', 'O', 'G'],
    ['1', 'O', 'I/L/Y'],
    ['/', 'I', 'X/Y'],
    ['$', 'Z', 'S'],
    ['|', 'Y', 'I/L'],
  ])(
    'rejects "%s" for %s (it is a look-alike of %s)',
    (read, answer, _other) => {
      expect(matchesLetter(read, answer)).toBe(false);
    },
  );

  it('takes every letter literally, in either case', () => {
    // K was once read as "v": that is the letter V, never forgiven as K.
    expect(matchesLetter('v', 'K')).toBe(false);
    expect(matchesLetter('V', 'K')).toBe(false);
    // "l" is the letter L, so it never stands for I.
    expect(matchesLetter('l', 'I')).toBe(false);
    expect(matchesLetter('l', 'L')).toBe(true);
  });
});

describe('displayChar', () => {
  it('upper-cases letters', () => {
    expect(displayChar('a')).toBe('A');
    expect(displayChar('Z')).toBe('Z');
    expect(displayChar('l')).toBe('L');
    expect(displayChar('v')).toBe('V');
  });

  it.each([
    ['0', 'O'],
    ['2', 'Z'],
    ['5', 'S'],
    ['6', 'G'],
    ['8', 'B'],
    ['$', 'S'],
    ['✓', 'V'],
    ['√', 'V'],
    ['✗', 'X'],
    ['×', 'X'],
  ])('shows the clear look-alike "%s" as %s', (read, shown) => {
    expect(displayChar(read)).toBe(shown);
    // ...and that letter really does accept it.
    expect(matchesLetter(read, shown)).toBe(true);
  });

  it.each(['1', '/', '|', '!', '7', '?', '.'])(
    'leaves "%s" as it is (ambiguous or not a look-alike)',
    read => {
      expect(displayChar(read)).toBe(read);
    },
  );

  it('leaves an empty reading empty', () => {
    expect(displayChar('')).toBe('');
  });
});

describe('letterTokens', () => {
  it('splits a word into its letters, keeping case', () => {
    expect(letterTokens('TILES')).toEqual(['T', 'I', 'L', 'E', 'S']);
    expect(letterTokens('tOkEn')).toEqual(['t', 'O', 'k', 'E', 'n']);
  });

  it('keeps look-alike symbols', () => {
    expect(letterTokens('T0KEN')).toEqual(['T', '0', 'K', 'E', 'N']);
    expect(letterTokens('2✗✓')).toEqual(['2', '✗', '✓']);
    expect(letterTokens('>1/$568√×')).toEqual([...'>1/$568√×']);
    // | and ! are not look-alikes (M0 saw blanks, not symbols, for I and L)
    expect(letterTokens('|!')).toEqual([]);
  });

  it('keeps every character in the LOOKALIKES table', () => {
    const all = Object.values(LOOKALIKES).flat();
    expect(letterTokens(all.join(''))).toEqual(all);
  });

  it('drops spaces, line breaks and tabs', () => {
    expect(letterTokens('T I\nL\tE  S')).toEqual(['T', 'I', 'L', 'E', 'S']);
    expect(letterTokens('\r\nAB\r\n')).toEqual(['A', 'B']);
  });

  it('drops dots, commas and other punctuation that is not a look-alike', () => {
    expect(letterTokens('T.I,L;E:S')).toEqual(['T', 'I', 'L', 'E', 'S']);
    expect(letterTokens('A-B_C?D"E\'F(G)H#')).toEqual([...'ABCDEFGH']);
  });

  it('drops digits that are not look-alikes', () => {
    expect(letterTokens('A3B4C7D9')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns no tokens for empty, null or undefined', () => {
    expect(letterTokens('')).toEqual([]);
    expect(letterTokens(null)).toEqual([]);
    expect(letterTokens(undefined)).toEqual([]);
    expect(letterTokens('  . , \n')).toEqual([]);
  });
});

describe('mapEntryToCells', () => {
  it('gives one token to each inked square in order', () => {
    expect(
      mapEntryToCells(['T', 'E', 'N', 'T'], [true, true, true, true]),
    ).toEqual(['T', 'E', 'N', 'T']);
  });

  it('skips squares without ink', () => {
    expect(
      mapEntryToCells(['T', 'L', 'S'], [true, false, true, false, true]),
    ).toEqual(['T', null, 'L', null, 'S']);
    expect(mapEntryToCells(['N'], [false, false, false, true])).toEqual([
      null,
      null,
      null,
      'N',
    ]);
  });

  it('returns null when there are more tokens than inked squares', () => {
    expect(mapEntryToCells(['T', 'E', 'N', 'T'], [true, true, true])).toBe(
      null,
    );
    expect(mapEntryToCells(['A', 'B'], [true, false])).toBe(null);
  });

  it('returns null when there are fewer tokens than inked squares', () => {
    expect(mapEntryToCells(['T', 'N'], [true, true, true])).toBe(null);
    expect(mapEntryToCells([], [true, true])).toBe(null);
  });

  it('returns null when no square has ink', () => {
    expect(mapEntryToCells([], [false, false, false])).toBe(null);
    expect(mapEntryToCells([], [])).toBe(null);
    expect(mapEntryToCells(['A'], [false])).toBe(null);
  });
});

describe('judgeCell', () => {
  it('is empty when the square has no ink, whatever was read', () => {
    expect(judgeCell({hasInk: false}, 'A')).toEqual({
      status: 'empty',
      read: '',
    });
    expect(judgeCell({hasInk: false, across: 'A', single: 'A'}, 'A')).toEqual({
      status: 'empty',
      read: '',
    });
  });

  it('is unread when there is ink but no reading', () => {
    expect(judgeCell({hasInk: true}, 'A')).toEqual({
      status: 'unread',
      read: '',
    });
    expect(
      judgeCell({hasInk: true, across: '', down: '', single: ''}, 'A'),
    ).toEqual({status: 'unread', read: ''});
  });

  it.each(['across', 'down', 'single'] as const)(
    'is right when only the %s reading has the answer',
    source => {
      expect(judgeCell({hasInk: true, [source]: 'K'}, 'K')).toEqual({
        status: 'right',
        read: 'K',
      });
    },
  );

  it('lets the single reading decide when across and down disagree', () => {
    expect(
      judgeCell({hasInk: true, across: 'X', down: 'Y', single: 'K'}, 'K'),
    ).toEqual({status: 'right', read: 'K'});
    // Across and down disagree and there is no single reading: unread.
    expect(judgeCell({hasInk: true, across: 'X', down: 'k'}, 'K')).toEqual({
      status: 'unread',
      read: '',
    });
  });

  it('is right via a look-alike and shows what was read, never the answer', () => {
    expect(judgeCell({hasInk: true, single: '0'}, 'O')).toEqual({
      status: 'right',
      read: 'O', // "0" is shown as O
    });
    expect(judgeCell({hasInk: true, across: '1'}, 'y')).toEqual({
      status: 'right',
      read: '1',
    });
  });

  it('never forgives a different letter, even next to a look-alike', () => {
    // I written where L belongs.
    expect(judgeCell({hasInk: true, across: 'I'}, 'L')).toEqual({
      status: 'wrong',
      read: 'I',
    });
    expect(judgeCell({hasInk: true, across: '0', down: 'Q'}, 'O')).toEqual({
      status: 'wrong',
      read: 'Q',
    });
  });

  it('is wrong when no reading matches, showing the first reading', () => {
    // Conflicting letters: the single reading is what's shown.
    expect(
      judgeCell({hasInk: true, across: 'b', down: 'C', single: 'D'}, 'A'),
    ).toEqual({status: 'wrong', read: 'D'});
    expect(judgeCell({hasInk: true, down: 'C', single: 'D'}, 'A')).toEqual({
      status: 'wrong',
      read: 'D',
    });
    expect(judgeCell({hasInk: true, across: 'b', down: 'b'}, 'A')).toEqual({
      status: 'wrong',
      read: 'B',
    });
    expect(judgeCell({hasInk: true, single: 'D'}, 'A')).toEqual({
      status: 'wrong',
      read: 'D',
    });
  });

  it('shows a wrong look-alike as the letter it stands for', () => {
    // "2" stands for Z, so a 2 where the answer is O shows as Z.
    expect(judgeCell({hasInk: true, single: '2'}, 'O')).toEqual({
      status: 'wrong',
      read: 'Z',
    });
    expect(judgeCell({hasInk: true, across: '1'}, 'O')).toEqual({
      status: 'wrong',
      read: '1',
    });
  });

  it('skips blank readings when picking what to show', () => {
    expect(judgeCell({hasInk: true, across: '', down: 'x'}, 'A')).toEqual({
      status: 'wrong',
      read: 'X',
    });
  });
});

describe('M0 misreads of the right letter count as right', () => {
  it.each(M0_MISREADS)('%s read alone as "%s"', (letter, read) => {
    expect(matchesLetter(read, letter)).toBe(true);
    expect(judgeCell({hasInk: true, single: read}, letter)).toEqual({
      status: 'right',
      read: displayChar(read), // what was read, not the answer
    });
  });

  it.each(LETTER_MISREADS)(
    '%s read as the letter "%s" is not forgiven',
    (letter, read) => {
      expect(matchesLetter(read, letter)).toBe(false);
      expect(judgeCell({hasInk: true, single: read}, letter).status).toBe(
        'wrong',
      );
    },
  );

  it.each(M0_MISREADS)(
    '%s read as "%s" inside a whole entry',
    (letter, read) => {
      const answer = `A${letter}E`;
      const tokens = letterTokens(`A${read}E`);
      const mapped = mapEntryToCells(tokens, [true, true, true]);
      expect(mapped).not.toBeNull();
      const verdicts = (mapped ?? []).map((t, i) =>
        judgeCell({hasInk: true, across: t ?? undefined}, answer[i]),
      );
      expect(verdicts.map(v => v.status)).toEqual(['right', 'right', 'right']);
      expect(verdicts.map(v => v.read).join('')).toBe(`A${displayChar(read)}E`);
    },
  );

  it.each(M0_BLANKS)(
    '%s left blank alone is unread, but the entry reading makes it right',
    letter => {
      expect(judgeCell({hasInk: true, single: ''}, letter)).toEqual({
        status: 'unread',
        read: '',
      });
      const tokens = letterTokens(`T${letter}N`);
      const mapped = mapEntryToCells(tokens, [true, true, true]);
      expect(
        judgeCell(
          {hasInk: true, across: mapped?.[1] ?? '', single: ''},
          letter,
        ),
      ).toEqual({status: 'right', read: letter});
    },
  );

  it('reads whole misread entries: TOKEN as "T0KEN", ZOO as "200"', () => {
    const judge = (answer: string, reading: string) => {
      const mapped = mapEntryToCells(
        letterTokens(reading),
        [...answer].map(() => true),
      );
      return (mapped ?? []).map(
        (t, i) => judgeCell({hasInk: true, across: t ?? ''}, answer[i]).status,
      );
    };
    expect(judge('TOKEN', 'T0KEN')).toEqual(Array(5).fill('right'));
    expect(judge('ZOO', '200')).toEqual(Array(3).fill('right'));
    expect(judge('VOX', '✓0✗')).toEqual(Array(3).fill('right'));
    // "v" is the letter V and "1" is not a look-alike of I: both wrong.
    expect(judge('KID', 'v1>')).toEqual(['wrong', 'wrong', 'right']);
  });
});
