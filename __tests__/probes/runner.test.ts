import {runProbe} from '../../src/probes/runner';
import {PERMISSION} from '../../src/sdk/types';
import {fakeSdk, ok, testContext} from '../helpers/fakes';

describe('runProbe', () => {
  it('runs, logs a section and flushes', async () => {
    const ctx = testContext();
    const sink = {append: jest.fn(async () => undefined)};
    ctx.log.setSink(sink);
    const r = await runProbe(ctx, 'X', [], async () => 'done!');
    expect(r).toEqual({ok: true, summary: 'done!'});
    expect(sink.append).toHaveBeenCalled();
    expect(ctx.state.busy).toBeNull();
  });

  it('attaches the log file only after write permission is granted', async () => {
    const sdk = fakeSdk({
      hasPermission: async () => ok(0),
      requestPermission: async () => ok(0),
    });
    const ctx = testContext(sdk);
    const r = await runProbe(ctx, 'X', [], async () => 'x');
    expect(r.ok).toBe(false);
    expect(ctx.log.hasSink()).toBe(false);

    const granted = testContext();
    await runProbe(granted, 'Y', [], async () => 'y');
    expect(granted.log.hasSink()).toBe(true);
  });

  it("a stale run's end() doesn't release a newer claim", () => {
    const ctx = testContext();
    const old = ctx.state.tryBegin('old', 0)!;
    const fresh = ctx.state.tryBegin('new', 10 * 60 * 1000)!;
    ctx.state.end(old);
    expect(ctx.state.busy?.token).toBe(fresh);
  });

  it('refuses a second run while one is in progress', async () => {
    const ctx = testContext();
    let release!: () => void;
    const first = runProbe(
      ctx,
      'slow',
      [],
      () => new Promise(res => (release = () => res('ok'))),
    );
    await new Promise<void>(r => setImmediate(() => r()));
    const second = await runProbe(ctx, 'other', [], async () => 'never');
    expect(second.ok).toBe(false);
    expect(second.summary).toMatch(/Busy with slow/);
    release();
    await first;
  });

  it('stops when a permission is refused', async () => {
    const sdk = fakeSdk({
      hasPermission: async () => ok(0),
      requestPermission: async () => ok(-1),
    });
    const fn = jest.fn(async () => 'x');
    const r = await runProbe(testContext(sdk), 'P5', [PERMISSION.internet], fn);
    expect(r.ok).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('reports exceptions and frees the busy flag', async () => {
    const ctx = testContext();
    const r = await runProbe(ctx, 'X', [], async () => {
      throw new Error('kaput');
    });
    expect(r).toEqual({ok: false, summary: 'Failed: Error: kaput'});
    expect(ctx.state.busy).toBeNull();
  });
});
