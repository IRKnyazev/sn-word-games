import {menuActions, runAction} from '../../src/probes/actions';
import {runEnvProbe, startupLine} from '../../src/probes/env';
import {fakeSdk, testContext} from '../helpers/fakes';

describe('menu actions', () => {
  const actions = menuActions('0.2.3');

  it('has unique ids and covers every probe', () => {
    const ids = actions.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ['P1', 'P2', 'P4', 'P5', 'P6']) {
      expect(actions.some(a => a.section.startsWith(p))).toBe(true);
    }
  });

  it('closes the view first and reports by dialog for page-visible probes', async () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    const save = actions.find(a => a.id === 'p6save')!;
    const r = await runAction(ctx, save);
    expect(r.ok).toBe(true);
    expect(sdk.closePluginView.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.saveCurrentNote.mock.invocationCallOrder[0],
    );
    expect(sdk.showDialog).toHaveBeenCalledWith(r.summary);
  });

  it('keeps the view open for menu probes', async () => {
    const sdk = fakeSdk();
    await runAction(testContext(sdk), actions.find(a => a.id === 'p4arm')!);
    expect(sdk.closePluginView).not.toHaveBeenCalled();
    expect(sdk.showDialog).not.toHaveBeenCalled();
  });
});

describe('environment probe', () => {
  it('logs the startup line with SDK and firmware', async () => {
    const ctx = testContext();
    const summary = await runEnvProbe(ctx, '0.2.3');
    expect(summary).toContain(startupLine('0.2.3'));
    expect(startupLine('0.2.3')).toMatch(
      /sn-plugin-lib 0\.2\.3 · firmware Chauvet 3\.31\.45 \(user-reported\)/,
    );
    expect(ctx.lines().some(l => l.includes('"deviceType":5'))).toBe(true);
    expect(summary).toContain(
      '/storage/emulated/0/Document/SupernotePuzzles/log.txt',
    );
  });
});
