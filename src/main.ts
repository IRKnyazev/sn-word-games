/**
 * Plugin start-up: one context for the plugin's lifetime, the toolbar
 * button, and the global motion listener for page buttons. Pen-up is only
 * subscribed while P2 is armed.
 */
import {PluginManager} from 'sn-plugin-lib';
import {fileSink} from './diag/fileSink';
import {Logger, describeError} from './diag/logger';
import type {ProbeContext} from './probes/context';
import {checkPuzzle, openReveal} from './app/mini';
import {startupLine} from './probes/env';
import {readProbePage} from './probes/p1';
import {createMotionHandler} from './probes/p4';
import {runProbe} from './probes/runner';
import {ProbeState} from './probes/state';
import type {MotionLike} from './probes/tap';
import {deviceFetch, deviceFiles, deviceSdk, iconUri} from './sdk/device';
import {logFile} from './sdk/paths';
import {isGranted} from './sdk/permissions';
import {fileStateStore} from './state/store';
import {setRoute} from './ui/route';
import {PERMISSION, type ElementLike} from './sdk/types';

export const SDK_VERSION: string = (() => {
  try {
    return require('sn-plugin-lib/package.json').version as string;
  } catch {
    return 'unknown';
  }
})();

let context: ProbeContext | null = null;

export function getContext(): ProbeContext | null {
  return context;
}

export function start(): void {
  PluginManager.init();
  // No log file yet: Document/ is gated by FILE:WRITE. Lines wait in memory.
  const log = new Logger();
  const makeLogSink = () =>
    fileSink(deviceFiles, logFile(deviceFiles.externalRoot));
  const ctx: ProbeContext = {
    sdk: deviceSdk,
    files: deviceFiles,
    log,
    fetch: deviceFetch,
    state: new ProbeState(),
    now: () => Date.now(),
    date: () => new Date(),
    makeLogSink,
    store: fileStateStore(deviceFiles, async () => {
      const r = await deviceSdk.getPluginDirPath();
      return r.ok ? r.value ?? null : null;
    }),
    listenPenUp: onElements =>
      PluginManager.registerEventListener('event_pen_up', 1, {
        onMsg: (msg: unknown) =>
          onElements(Array.isArray(msg) ? (msg as ElementLike[]) : []),
      }),
  };
  context = ctx;

  log.section('plugin start');
  // Always printed, even in release builds (they hide __DEV__ logs).
  log.info('start', startupLine(SDK_VERSION));

  try {
    Promise.resolve(
      PluginManager.registerButton(1, ['NOTE'], {
        id: 100,
        name: 'Puzzles',
        icon: iconUri(),
        showType: 1,
      }),
    )
      .then(r => log.info('start', `registerButton → ${String(r)}`))
      .catch(e => log.error('start', `registerButton: ${describeError(e)}`));
  } catch (e) {
    log.error('start', `registerButton: ${describeError(e)}`);
  }
  PluginManager.registerButtonListener({
    onButtonPress: (e: unknown) => {
      log.info('button', 'press', e);
      // The toolbar button always opens the menu, never a stale screen.
      setRoute({screen: 'menu'});
    },
  });
  PluginManager.registerPluginLifeListener({
    onMsg: (msg: unknown) => {
      const state = (msg as {state?: number} | null)?.state;
      // 3 = stop, 4 = unmounted: the view was closed (Done, back or gesture).
      if (state === 3 || state === 4) {
        setRoute({screen: 'menu'});
      }
    },
  });

  const onMotion = createMotionHandler(ctx, {
    read: () =>
      runProbe(ctx, 'P1 READ (page button)', [PERMISSION.read], () =>
        readProbePage(ctx, 'button'),
      ),
    check: () =>
      runProbe(ctx, 'Mini CHECK', [PERMISSION.read], () => checkPuzzle(ctx)),
    reveal: () => openReveal(ctx),
  });
  PluginManager.registerMotionListener(1, {
    onMsg: (msg: unknown) => {
      try {
        onMotion(msg as MotionLike);
      } catch (e) {
        log.error('motion', describeError(e));
      }
    },
  });
  // If write permission was already granted earlier, start the log file now
  // (checking only; never prompting at start-up).
  deviceSdk
    .hasPermission(PERMISSION.write)
    .then(r => {
      if (r.ok && isGranted(r.value)) {
        log.setSink(makeLogSink());
      }
      return log.flush();
    })
    .catch(() => undefined);
}
