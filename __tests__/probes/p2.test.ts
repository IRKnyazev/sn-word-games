import {probePages} from '../../src/layout/probe';
import {armP2, onPenUp, reportP2} from '../../src/probes/p2';
import {fakeSdk, ok, strokeIn, testContext} from '../helpers/fakes';

const target = probePages()[2].areas.p2;

describe('P2 coordinates', () => {
  it('arming subscribes to pen-up once', () => {
    const ctx = testContext();
    armP2(ctx);
    armP2(ctx);
    expect(ctx.listenPenUp).toHaveBeenCalledTimes(1);
  });

  it('records pen-up strokes while armed and frees them', async () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    armP2(ctx);
    const el = strokeIn(target);
    await onPenUp(ctx, [el]);
    expect(ctx.state.penUps).toHaveLength(1);
    expect(sdk.recycle).toHaveBeenCalledWith([el]);
  });

  it('report compares getElements and pen-up with the target', async () => {
    const el = strokeIn(target);
    const sdk = fakeSdk({
      getCurrentPageNum: async () => ok(2),
      getElements: async () => ok([el]),
    });
    const ctx = testContext(sdk);
    armP2(ctx);
    await onPenUp(ctx, [strokeIn(target)]);
    const summary = await reportP2(ctx);
    expect(summary).toMatch(/getElements: 1 strokes, 1 at the target/);
    expect(summary).toMatch(
      /pen-up: 1 recent strokes, last → px, centre in target/,
    );
  });
});
