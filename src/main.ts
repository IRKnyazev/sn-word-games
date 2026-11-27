/**
 * Plugin start-up: one context for the plugin's lifetime, the toolbar
 * button, and the global motion listener for page buttons. Pen-up is only
 * subscribed while P2 is armed.
 */
import {PluginManager} from 'sn-plugin-lib';
import {fileSink} from './diag/fileSink';
import {Logger, describeError} from './diag/logger';
import type {ProbeContext} from './probes/context';
import {startupLine} from './probes/env';
import {readProbePage} from './probes/p1';
import {createMotionHandler} from './probes/p4';
import {runProbe} from './probes/runner';
import {ProbeState} from './probes/state';
import type {MotionLike} from './probes/tap';
import {deviceFetch, deviceFiles, deviceSdk, iconUri} from './sdk/device';
import {logFile} from './sdk/paths';
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
  const log = new Logger();
  log.setSink(fileSink(deviceFiles, logFile(deviceFiles.externalRoot)));
  const ctx: ProbeContext = {
    sdk: deviceSdk,
    files: deviceFiles,
    log,
    fetch: deviceFetch,
    state: new ProbeState(),
    now: () => Date.now(),
    date: () => new Date(),
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
    PluginManager.registerButton(1, ['NOTE'], {
      id: 100,
      name: 'Puzzles',
      icon: iconUri(),
      showType: 1,
    });
  } catch (e) {
    log.error('start', `registerButton: ${describeError(e)}`);
  }
  PluginManager.registerButtonListener({
    onButtonPress: (e: unknown) => log.info('button', 'press', e),
  });

  const onMotion = createMotionHandler(ctx, {
    read: () =>
      runProbe(ctx, 'P1 READ (page button)', [PERMISSION.read], () =>
        readProbePage(ctx, 'button'),
      ),
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
  log.flush().catch(() => undefined);
}
