import {Logger} from '../../src/diag/logger';
import {ensurePermission, isGranted} from '../../src/sdk/permissions';
import {PERMISSION} from '../../src/sdk/types';
import {fail, fakeSdk, ok} from '../helpers/fakes';

const log = () => new Logger({echo: null});

describe('ensurePermission', () => {
  it('treats 1 (this time) and 2 (always) as granted', () => {
    expect([-1, 0, 1, 2].map(isGranted)).toEqual([false, false, true, true]);
  });

  it("doesn't ask when already granted", async () => {
    const sdk = fakeSdk();
    expect(
      await ensurePermission(sdk as never, PERMISSION.read, 'why', log()),
    ).toBe(true);
    expect(sdk.requestPermission).not.toHaveBeenCalled();
  });

  it('asks when not granted and reports the answer', async () => {
    const sdk = fakeSdk({
      hasPermission: async () => ok(0),
      requestPermission: async () => ok(0),
    });
    expect(
      await ensurePermission(sdk as never, PERMISSION.internet, 'why', log()),
    ).toBe(false);
    expect(sdk.requestPermission).toHaveBeenCalledWith(
      PERMISSION.internet,
      'why',
    );
  });

  it('carries on when the firmware has no permission API', async () => {
    const sdk = fakeSdk({
      hasPermission: async () => fail(100, 'not a function'),
    });
    expect(
      await ensurePermission(sdk as never, PERMISSION.write, 'why', log()),
    ).toBe(true);
  });
});
