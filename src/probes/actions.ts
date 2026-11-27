/** The Probes menu: what each button does and the permissions it needs. */
import {PERMISSION, type Permission} from '../sdk/types';
import type {ProbeContext} from './context';
import {runEnvProbe} from './env';
import {createProbeNote} from './note';
import {readProbePage} from './p1';
import {armP2, reportP2} from './p2';
import {armP4} from './p4';
import {runNetworkProbe} from './p5';
import {
  insertMarks,
  p6Status,
  removeViaBatch,
  removeViaLasso,
  saveNote,
} from './p6';
import {runProbe, type RunResult} from './runner';

export interface MenuAction {
  id: string;
  section: string;
  label: string;
  /** Close the plugin view before running (the page must be visible / like the real flow). */
  closesView?: boolean;
  needs: Permission[];
  run: (ctx: ProbeContext) => Promise<string>;
}

export function menuActions(sdkVersion: string): MenuAction[] {
  const R = PERMISSION.read;
  return [
    {
      id: 'env',
      section: 'Setup',
      label: 'Environment info',
      needs: [R],
      run: ctx => runEnvProbe(ctx, sdkVersion),
    },
    {
      id: 'note',
      section: 'Setup',
      label: 'Create probe note',
      needs: [R],
      run: createProbeNote,
    },
    {
      id: 'p1',
      section: 'P1 Recognition',
      label: 'Read this page',
      needs: [R],
      run: ctx => readProbePage(ctx, 'menu'),
    },
    {
      id: 'p2arm',
      section: 'P2 Coordinates',
      label: 'Arm (10 min)',
      needs: [],
      run: async ctx => armP2(ctx),
    },
    {
      id: 'p2report',
      section: 'P2 Coordinates',
      label: 'Report',
      needs: [R],
      run: reportP2,
    },
    {
      id: 'p4arm',
      section: 'P4 Page buttons',
      label: 'Log taps (10 min)',
      needs: [],
      run: async ctx => armP4(ctx),
    },
    {
      id: 'p5',
      section: 'P5 Network',
      label: "Fetch today's feeds",
      needs: [PERMISSION.internet],
      run: runNetworkProbe,
    },
    {
      id: 'p6insert',
      section: 'P6 Feedback',
      label: 'Insert marks',
      closesView: true,
      needs: [R],
      run: insertMarks,
    },
    {
      id: 'p6lasso',
      section: 'P6 Feedback',
      label: 'Remove via lasso',
      closesView: true,
      needs: [R],
      run: removeViaLasso,
    },
    {
      id: 'p6batch',
      section: 'P6 Feedback',
      label: 'Remove via batch',
      closesView: true,
      needs: [R],
      run: removeViaBatch,
    },
    {
      id: 'p6status',
      section: 'P6 Feedback',
      label: 'Status',
      needs: [R],
      run: p6Status,
    },
    {
      id: 'p6save',
      section: 'P6 Feedback',
      label: 'Save note',
      closesView: true,
      needs: [],
      run: saveNote,
    },
  ];
}

/** Runs a menu action; closes the view first and reports by dialog if asked. */
export async function runAction(
  ctx: ProbeContext,
  action: MenuAction,
): Promise<RunResult> {
  if (action.closesView) {
    await ctx.sdk.closePluginView();
  }
  const result = await runProbe(
    ctx,
    `${action.section}: ${action.label}`,
    action.needs,
    () => action.run(ctx),
  );
  if (action.closesView) {
    await ctx.sdk.showDialog(result.summary);
  }
  return result;
}
