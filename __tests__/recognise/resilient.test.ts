import {
  recogniseResilient,
  type RecogniseOutcome,
  type Recogniser,
} from '../../src/recognise/resilient';

/**
 * A fake firmware recogniser over string "strokes". A group fails with code
 * 117 if it contains any stroke in `bad`; otherwise the text is the strokes
 * joined. Records every call and checks that calls never overlap.
 */
function fakeRecogniser(opts: {bad?: string[]; throwOn?: string[]} = {}) {
  const bad = new Set(opts.bad ?? []);
  const throwOn = new Set(opts.throwOn ?? []);
  const calls: string[][] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const recognise: Recogniser<string> = async strokes => {
    calls.push([...strokes]);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      // Yield a few times so overlapping calls would be visible.
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
      }
      if (strokes.some(s => throwOn.has(s))) {
        throw new Error('service died');
      }
      const outcome: RecogniseOutcome = strokes.some(s => bad.has(s))
        ? {ok: false, code: 117, message: 'recognition failed'}
        : {ok: true, text: strokes.join('')};
      return outcome;
    } finally {
      inFlight--;
    }
  };
  return {
    recognise,
    calls,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}

const fixedNow = () => 0;

describe('recogniseResilient', () => {
  it('recognises a good group in one call', async () => {
    const fake = fakeRecogniser();
    const r = await recogniseResilient(fake.recognise, ['Q', 'U', 'I'], {
      now: fixedNow,
    });
    expect(r).toEqual({
      text: 'QUI',
      calls: 1,
      failures: [],
      partial: false,
      ms: 0,
    });
    expect(fake.calls).toEqual([['Q', 'U', 'I']]);
  });

  it('makes no calls for empty input', async () => {
    const fake = fakeRecogniser();
    const r = await recogniseResilient(fake.recognise, [], {now: fixedNow});
    expect(r).toEqual({
      text: '',
      calls: 0,
      failures: [],
      partial: false,
      ms: 0,
    });
    expect(fake.calls).toEqual([]);
  });

  it('treats an ok outcome without text as empty text', async () => {
    const r = await recogniseResilient(async () => ({ok: true}), ['a'], {
      now: fixedNow,
    });
    expect(r.text).toBe('');
    expect(r.partial).toBe(false);
  });

  it('splits a failing group until the bad stroke is isolated', async () => {
    const fake = fakeRecogniser({bad: ['X']});
    const strokes = ['A', 'B', 'C', 'X', 'E', 'F', 'G', 'H'];
    const r = await recogniseResilient(fake.recognise, strokes, {
      now: fixedNow,
    });

    expect(fake.calls).toEqual([
      ['A', 'B', 'C', 'X', 'E', 'F', 'G', 'H'], // fails
      ['A', 'B', 'C', 'X'], // fails
      ['A', 'B'], // ok
      ['C', 'X'], // fails
      ['C'], // ok
      ['X'], // fails, cannot split further
      ['E', 'F', 'G', 'H'], // ok
    ]);
    expect(r.text).toBe('ABCEFGH');
    expect(r.calls).toBe(7);
    expect(r.failures).toEqual([
      {code: 117, size: 8},
      {code: 117, size: 4},
      {code: 117, size: 2},
      {code: 117, size: 1},
    ]);
    expect(r.partial).toBe(true);
  });

  it('concatenates the recovered halves in stroke order', async () => {
    // Fails as a whole only; each half recognises fine.
    let first = true;
    const recognise: Recogniser<string> = async strokes => {
      if (first) {
        first = false;
        return {ok: false, code: 117};
      }
      return {ok: true, text: strokes.join('')};
    };
    const r = await recogniseResilient(recognise, ['J', 'U', 'M', 'P', 'Y'], {
      now: fixedNow,
    });
    // ceil(5/2) = 3 strokes go left.
    expect(r.text).toBe('JUMPY');
    expect(r.calls).toBe(3);
    expect(r.failures).toEqual([{code: 117, size: 5}]);
    expect(r.partial).toBe(false);
  });

  it('isolates several bad strokes independently', async () => {
    const fake = fakeRecogniser({bad: ['x', 'y']});
    const r = await recogniseResilient(
      fake.recognise,
      ['x', 'a', 'b', 'c', 'd', 'e', 'f', 'y'],
      {now: fixedNow},
    );
    expect(r.text).toBe('abcdef');
    expect(r.partial).toBe(true);
    expect(r.failures.filter(f => f.size === 1)).toHaveLength(2);
  });

  it('respects maxDepth', async () => {
    const fake = fakeRecogniser({bad: ['X']});
    const strokes = ['A', 'B', 'C', 'X', 'E', 'F', 'G', 'H'];
    const r = await recogniseResilient(fake.recognise, strokes, {
      maxDepth: 1,
      now: fixedNow,
    });
    // Depth 0 splits once; depth-1 halves are not split again.
    expect(fake.calls).toEqual([
      ['A', 'B', 'C', 'X', 'E', 'F', 'G', 'H'],
      ['A', 'B', 'C', 'X'],
      ['E', 'F', 'G', 'H'],
    ]);
    expect(r.text).toBe('EFGH');
    expect(r.failures).toEqual([
      {code: 117, size: 8},
      {code: 117, size: 4},
    ]);
    expect(r.partial).toBe(true);
  });

  it('does not split at all with maxDepth 0', async () => {
    const fake = fakeRecogniser({bad: ['X']});
    const r = await recogniseResilient(fake.recognise, ['A', 'X'], {
      maxDepth: 0,
      now: fixedNow,
    });
    expect(r.calls).toBe(1);
    expect(r.text).toBe('');
    expect(r.partial).toBe(true);
  });

  it('defaults to a maxDepth of 4', async () => {
    const fake = fakeRecogniser({bad: ['X']});
    // 32 strokes: 32 → 16 → 8 → 4 → 2 at depth 4, which is not split.
    const strokes = Array.from({length: 32}, (_, i) =>
      i === 0 ? 'X' : String.fromCharCode(97 + (i % 26)),
    );
    const r = await recogniseResilient(fake.recognise, strokes, {
      now: fixedNow,
    });
    expect(r.failures.map(f => f.size)).toEqual([32, 16, 8, 4, 2]);
    expect(Math.max(...fake.calls.map(c => c.length))).toBe(32);
    expect(Math.min(...fake.calls.map(c => c.length))).toBe(2);
    expect(r.partial).toBe(true);
  });

  it('treats thrown exceptions as failures without a code', async () => {
    const fake = fakeRecogniser({throwOn: ['!']});
    const r = await recogniseResilient(fake.recognise, ['a', 'b', '!', 'c'], {
      now: fixedNow,
    });
    expect(r.text).toBe('abc');
    expect(r.failures).toEqual([
      {code: undefined, size: 4},
      {code: undefined, size: 2},
      {code: undefined, size: 1},
    ]);
    expect(r.failures[0]).toHaveProperty('code', undefined);
    expect(r.partial).toBe(true);
  });

  it('survives non-Error throws and synchronous throws', async () => {
    const r1 = await recogniseResilient<string>(
      async () => {
        throw 'plain string';
      },
      ['a'],
      {now: fixedNow},
    );
    expect(r1).toMatchObject({text: '', calls: 1, partial: true});

    const r2 = await recogniseResilient<string>(
      (() => {
        throw new Error('sync');
      }) as Recogniser<string>,
      ['a'],
      {now: fixedNow},
    );
    expect(r2).toMatchObject({text: '', calls: 1, partial: true});
  });

  it('never has two calls in flight', async () => {
    const fake = fakeRecogniser({bad: ['X', 'Y']});
    await recogniseResilient(
      fake.recognise,
      ['a', 'X', 'b', 'c', 'd', 'Y', 'e', 'f', 'g', 'h'],
      {now: fixedNow},
    );
    expect(fake.calls.length).toBeGreaterThan(3);
    expect(fake.maxInFlight).toBe(1);
  });

  it('measures ms with the injected clock', async () => {
    const now = jest
      .fn<number, []>()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1234);
    const r = await recogniseResilient(fakeRecogniser().recognise, ['a'], {
      now,
    });
    expect(r.ms).toBe(234);
    expect(now).toHaveBeenCalledTimes(2);
  });

  it('measures ms even when nothing is recognised', async () => {
    let t = 50;
    const r = await recogniseResilient(fakeRecogniser().recognise, [], {
      now: () => (t += 7),
    });
    expect(r.ms).toBe(7);
  });

  it('works without options (real clock, default depth)', async () => {
    const r = await recogniseResilient(fakeRecogniser().recognise, ['o', 'k']);
    expect(r.text).toBe('ok');
    expect(r.calls).toBe(1);
    expect(Number.isFinite(r.ms)).toBe(true);
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it('does not mutate the input', async () => {
    const strokes = ['a', 'X', 'b'];
    await recogniseResilient(fakeRecogniser({bad: ['X']}).recognise, strokes, {
      now: fixedNow,
    });
    expect(strokes).toEqual(['a', 'X', 'b']);
  });
});
