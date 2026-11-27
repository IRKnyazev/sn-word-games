import {
  call,
  describe as describeRes,
  insertSucceeded,
  normalise,
  withTimeout,
} from '../../src/sdk/result';

describe('normalise', () => {
  it('unwraps a successful API response', () => {
    expect(normalise({success: true, result: 42}, false, 5)).toEqual({
      ok: true,
      value: 42,
      ms: 5,
    });
  });

  it('keeps the error code and message of a failure', () => {
    expect(
      normalise(
        {success: false, error: {code: 117, message: 'Recognition failed'}},
        false,
        3,
      ),
    ).toEqual({
      ok: false,
      code: 117,
      message: 'Recognition failed',
      ms: 3,
    });
  });

  it('copes with a failure without an error object', () => {
    expect(normalise({success: false}, false, 1)).toEqual({
      ok: false,
      code: undefined,
      message: 'failed',
      ms: 1,
    });
  });

  it('passes plain values through', () => {
    expect(normalise(5, true, 1)).toEqual({ok: true, value: 5, ms: 1});
  });

  it('treats null as no response and bare values as success', () => {
    expect(normalise(null, false, 1).ok).toBe(false);
    expect(normalise({width: 1, height: 2}, false, 1)).toEqual({
      ok: true,
      value: {width: 1, height: 2},
      ms: 1,
    });
  });
});

describe('call', () => {
  it('turns a throw into a failure', async () => {
    const r = await call(() => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain('boom');
  });

  it('times calls with the injected clock', async () => {
    let t = 100;
    const r = await call(async () => ({success: true, result: 'x'}), {
      now: () => (t += 7),
    });
    expect(r).toEqual({ok: true, value: 'x', ms: 7});
  });

  it('fails a call that never answers', async () => {
    const r = await call(() => new Promise(() => undefined), {timeoutMs: 20});
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/timed out/);
  });

  it('no timeout when timeoutMs is 0', async () => {
    await expect(withTimeout(Promise.resolve(1), 0)).resolves.toBe(1);
  });
});

describe('describe / insertSucceeded', () => {
  it('formats results for logs', () => {
    expect(describeRes({ok: true, value: 1, ms: 4})).toBe('ok 4ms');
    expect(describeRes({ok: false, code: 117, message: 'nope', ms: 9})).toBe(
      'ERR 117 nope 9ms',
    );
  });

  it('accepts 0 and truthy insertGeometry results', () => {
    expect(insertSucceeded({ok: true, value: 0, ms: 1})).toBe(true);
    expect(insertSucceeded({ok: true, value: true, ms: 1})).toBe(true);
    expect(insertSucceeded({ok: true, value: -1, ms: 1})).toBe(false);
    expect(insertSucceeded({ok: true, value: false, ms: 1})).toBe(false);
    expect(insertSucceeded({ok: false, message: 'x', ms: 1})).toBe(false);
  });
});
