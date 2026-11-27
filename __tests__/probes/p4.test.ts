import {probeZones} from '../../src/layout/probe';
import {armP4, createMotionHandler} from '../../src/probes/p4';
import {fakeSdk, ok, testContext} from '../helpers/fakes';

const zone = (id: string) => probeZones().find(z => z.id === id)!.rect;
const centreOf = (id: string) => {
  const r = zone(id);
  return {x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2};
};
const noActions = () => ({
  read: jest.fn(),
  check: jest.fn(),
  reveal: jest.fn(async () => undefined),
});
const flush = () => new Promise<void>(r => setImmediate(() => r()));

function tapAt(
  handler: (ev: any) => void,
  p: {x: number; y: number},
  toolType = 1,
) {
  handler({action: 0, ...p, toolType, pointerCount: 1});
  handler({action: 1, ...p, toolType, pointerCount: 1});
}

describe('page buttons', () => {
  it('ignores pen moves without touching the SDK', () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    const handler = createMotionHandler(ctx, noActions());
    for (let i = 0; i < 100; i++) {
      handler({action: 2, x: 100 + i, y: 100, toolType: 2});
    }
    expect(sdk.getCurrentFilePath).not.toHaveBeenCalled();
    expect(ctx.lines()).toHaveLength(0);
  });

  it('TAP on a probe note shows a dialog', async () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    const handler = createMotionHandler(ctx, noActions());
    tapAt(handler, centreOf('TAP'), 2);
    await flush();
    expect(sdk.showDialog).toHaveBeenCalledWith('TAP received (pen).');
    expect(
      ctx.lines().some(l => l.includes('tap TAP by pen') && l.includes('FIRE')),
    ).toBe(true);
  });

  it('READ runs the read action and shows its summary', async () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    const read = jest.fn(async () => ({ok: true, summary: 'read 3 cells'}));
    const handler = createMotionHandler(ctx, {...noActions(), read});
    tapAt(handler, centreOf('READ'));
    await flush();
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
    expect(sdk.showDialog).toHaveBeenCalledWith('read 3 cells', true);
  });

  it('ignores hover and other non-tap actions even when armed', () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    armP4(ctx);
    const handler = createMotionHandler(ctx, noActions());
    for (const action of [2, 7, 9, 10]) {
      handler({action, ...centreOf('TAP'), toolType: 2});
    }
    expect(ctx.state.motions).toHaveLength(0);
    expect(ctx.lines().filter(l => l.includes('motion'))).toHaveLength(0);
  });

  it('two quick taps fire once', async () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    const handler = createMotionHandler(ctx, noActions());
    tapAt(handler, centreOf('TAP'));
    tapAt(handler, centreOf('TAP'));
    await flush();
    await flush();
    expect(sdk.showDialog).toHaveBeenCalledTimes(1);
    expect(ctx.state.tapSince).toBe(0);
  });

  it('stays silent on other notes unless armed', async () => {
    const sdk = fakeSdk({
      getCurrentFilePath: async () => ok('/storage/emulated/0/Note/Diary.note'),
    });
    const ctx = testContext(sdk);
    const handler = createMotionHandler(ctx, noActions());
    tapAt(handler, centreOf('TAP'));
    await flush();
    expect(sdk.showDialog).not.toHaveBeenCalled();
    expect(ctx.lines()).toHaveLength(0);

    armP4(ctx);
    tapAt(handler, centreOf('TAP'));
    await flush();
    expect(sdk.showDialog).not.toHaveBeenCalled();
    expect(ctx.lines().some(l => l.includes('ignored'))).toBe(true);
    expect(ctx.lines().some(l => l.includes('motion action=0'))).toBe(true);
  });

  it('ignores taps that pass through the top menu (canHandwrite false)', async () => {
    const sdk = fakeSdk({canHandwrite: async () => ok(false)});
    const ctx = testContext(sdk);
    const handler = createMotionHandler(ctx, noActions());
    tapAt(handler, centreOf('TAP'));
    await flush();
    expect(sdk.showDialog).not.toHaveBeenCalled();
  });

  it('debounces a second tap within 2 s', async () => {
    let t = 0;
    const sdk = fakeSdk();
    const ctx = testContext(sdk, {now: () => t});
    const handler = createMotionHandler(ctx, noActions());
    t = 10_000;
    tapAt(handler, centreOf('TAP'));
    await flush();
    t = 11_000;
    tapAt(handler, centreOf('TAP'));
    await flush();
    t = 13_000;
    tapAt(handler, centreOf('TAP'));
    await flush();
    expect(sdk.showDialog).toHaveBeenCalledTimes(2);
  });
});
