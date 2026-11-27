/**
 * P4 page buttons. Every motion event comes through here, so the hot path
 * (pen moves while writing) returns immediately and SDK calls only happen
 * after a completed tap inside a TAP/READ zone. Taps act only on a probe
 * note and when canHandwrite() isn't false (taps through the top menu).
 * Silent on other notes unless P4 logging is armed.
 */
import {MANTA_PAGE, probeZones} from '../layout/probe';
import {isProbeNotePath} from '../sdk/paths';
import {describe} from '../sdk/result';
import type {ProbeContext} from './context';
import type {RunResult} from './runner';
import {BUSY_STALE_MS, TAP_DEBOUNCE_MS} from './state';
import {ACTION, TapDetector, toolName, type MotionLike, type Tap} from './tap';

const TAG = 'P4';

export interface TapActions {
  read: () => Promise<RunResult>;
}

export function armP4(ctx: ProbeContext): string {
  ctx.state.arm('p4', ctx.now());
  ctx.log.info(
    TAG,
    'armed for 10 minutes: logging every pen/finger down and up',
  );
  return 'P4 logging on for 10 minutes. Tap TAP with a finger, then with the pen; then open another note and tap the same spot; then tap TAP while the top menu is open over it.';
}

export function createMotionHandler(
  ctx: ProbeContext,
  actions: TapActions,
): (ev: MotionLike) => void {
  const detector = new TapDetector(probeZones(MANTA_PAGE));
  return ev => {
    if (ev.action === ACTION.move) {
      return;
    }
    const now = ctx.now();
    const p4 = ctx.state.isArmed('p4', now);
    if (p4 || ctx.state.isArmed('p2', now)) {
      ctx.state.addMotion({
        at: now,
        action: ev.action,
        toolType: ev.toolType ?? 0,
        x: ev.x,
        y: ev.y,
        pointerCount: ev.pointerCount ?? 1,
      });
    }
    if (p4) {
      ctx.log.info(
        TAG,
        `motion action=${ev.action} tool=${toolName(
          ev.toolType,
        )} at (${Math.round(ev.x)},${Math.round(ev.y)}) pointers=${
          ev.pointerCount ?? 1
        }`,
      );
    }
    const tap = detector.feed(ev);
    if (tap) {
      handleTap(ctx, tap, p4, actions).catch(e =>
        ctx.log.error(TAG, `tap handler: ${String(e)}`),
      );
    }
  };
}

export async function handleTap(
  ctx: ProbeContext,
  tap: Tap,
  armed: boolean,
  actions: TapActions,
): Promise<void> {
  const path = await ctx.sdk.getCurrentFilePath();
  const hw = await ctx.sdk.canHandwrite();
  const isProbe = path.ok && isProbeNotePath(path.value);
  const overMenu = hw.ok && hw.value === false;
  const now = ctx.now();
  const debounced = now - ctx.state.lastFireAt < TAP_DEBOUNCE_MS;
  const busy =
    ctx.state.busy !== null && now - ctx.state.busy.since < BUSY_STALE_MS;
  const fire = isProbe && !overMenu && !debounced && !busy;
  const loud = armed || isProbe;
  if (loud) {
    ctx.log.info(
      TAG,
      `tap ${tap.zone.id} by ${tap.tool} at (${Math.round(
        tap.at.x,
      )},${Math.round(tap.at.y)}) moved=${Math.round(tap.moved)} → ${
        fire ? 'FIRE' : 'ignored'
      }`,
      {
        path: path.ok ? path.value : describe(path),
        canHandwrite: hw.ok ? hw.value : describe(hw),
        probeNote: isProbe,
        debounced,
        busy,
      },
    );
  }
  if (!fire) {
    if (loud) {
      await ctx.log.flush();
    }
    return;
  }
  ctx.state.lastFireAt = now;
  if (tap.zone.id === 'READ') {
    const res = await actions.read();
    ctx.state.lastFireAt = ctx.now();
    await ctx.sdk.showDialog(res.summary);
    return;
  }
  const shown = await ctx.sdk.showDialog(`TAP received (${tap.tool}).`);
  ctx.log.info(TAG, `dialog ${describe(shown)}`);
  await ctx.log.flush();
}
