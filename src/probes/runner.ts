import {describeError} from '../diag/logger';
import {
  MANTA_PAGE,
  probeLayoutForPage,
  probePageIdFromTemplate,
  probePages,
} from '../layout/probe';
import type {Size} from '../layout/geometry';
import type {PageLayout} from '../layout/types';
import {isProbeNotePath} from '../sdk/paths';
import {ensurePermission} from '../sdk/permissions';
import {describe} from '../sdk/result';
import {PERMISSION, type Permission} from '../sdk/types';
import type {ProbeContext} from './context';

export interface RunResult {
  ok: boolean;
  summary: string;
}

const WHY: Record<Permission, string> = {
  [PERMISSION.read]:
    'Read the strokes on the puzzle page to recognise your letters.',
  [PERMISSION.write]: 'Write puzzle templates and the diagnostic log file.',
  [PERMISSION.internet]: "Download today's puzzle.",
};

/**
 * Runs one probe: one at a time, with a log section, the permissions it
 * needs (write is always needed for the log), and a flush at the end.
 */
export async function runProbe(
  ctx: ProbeContext,
  name: string,
  needs: Permission[],
  fn: () => Promise<string>,
): Promise<RunResult> {
  const token = ctx.state.tryBegin(name, ctx.now());
  if (token === null) {
    return {
      ok: false,
      summary: `Busy with ${ctx.state.busy?.name}. Try again in a moment.`,
    };
  }
  ctx.log.section(name);
  try {
    if (!(await ensureLogFile(ctx))) {
      return {ok: false, summary: `Permission refused: ${PERMISSION.write}`};
    }
    for (const p of needs.filter(n => n !== PERMISSION.write)) {
      if (!(await ensurePermission(ctx.sdk, p, WHY[p], ctx.log))) {
        return {ok: false, summary: `Permission refused: ${p}`};
      }
    }
    const summary = await fn();
    ctx.log.info(name, 'done', {summary});
    return {ok: true, summary};
  } catch (e) {
    ctx.log.error(name, `failed: ${describeError(e)}`);
    return {ok: false, summary: `Failed: ${describeError(e)}`};
  } finally {
    ctx.state.end(token);
    const flushed = await ctx.log.flush();
    if (!flushed) {
      ctx.log.warn(
        'log',
        'could not write the log file yet; lines kept in memory',
      );
    }
  }
}

/**
 * Asks for FILE:WRITE (Document/ is a gated folder) and only then attaches
 * the log file. Until then log lines wait in memory.
 */
export async function ensureLogFile(ctx: ProbeContext): Promise<boolean> {
  const granted = await ensurePermission(
    ctx.sdk,
    PERMISSION.write,
    WHY[PERMISSION.write],
    ctx.log,
  );
  if (granted && !ctx.log.hasSink()) {
    ctx.log.setSink(ctx.makeLogSink());
  }
  return granted;
}

export interface ProbePage {
  path: string;
  page: number;
  size: Size;
  layout: PageLayout;
}

/** The open probe note page, or a message saying why there isn't one. */
export async function currentProbePage(
  ctx: ProbeContext,
  tag: string,
): Promise<ProbePage | string> {
  const pathRes = await ctx.sdk.getCurrentFilePath();
  const pageRes = await ctx.sdk.getCurrentPageNum();
  ctx.log.info(tag, 'context', {
    path: pathRes.ok ? pathRes.value : describe(pathRes),
    page: pageRes.ok ? pageRes.value : describe(pageRes),
  });
  if (!pathRes.ok || !isProbeNotePath(pathRes.value)) {
    return 'Open a probe note first (Create probe note).';
  }
  if (!pageRes.ok) {
    return `Could not read the page number: ${describe(pageRes)}`;
  }
  const path = pathRes.value;
  const page = pageRes.value;
  const sizeRes = await ctx.sdk.getPageSize(path, page);
  let size: Size = MANTA_PAGE;
  if (sizeRes.ok && sizeRes.value?.width > 0 && sizeRes.value?.height > 0) {
    size = {width: sizeRes.value.width, height: sizeRes.value.height};
  } else {
    ctx.log.warn(tag, `getPageSize ${describe(sizeRes)}; assuming 1920×2560`);
  }
  // Prefer the page's own template name; fall back to the page index.
  const tpl = await ctx.sdk.getNotePageTemplate(path, page);
  const tplName = tpl.ok
    ? (tpl.value as {name?: unknown} | null)?.name
    : undefined;
  const byName = probePageIdFromTemplate(tplName);
  const layout = byName
    ? probePages(size).find(l => l.id === byName) ?? null
    : probeLayoutForPage(page, size);
  if (byName && byName !== probeLayoutForPage(page, size)?.id) {
    ctx.log.warn(
      tag,
      `page ${page + 1} has template ${byName}: pages are out of order`,
    );
  }
  if (!byName) {
    ctx.log.info(
      tag,
      `template name not recognised (${
        tpl.ok ? JSON.stringify(tplName) : describe(tpl)
      }); using page index`,
    );
  }
  if (!layout) {
    return `Page ${page + 1} is not a probe page.`;
  }
  return {path, page, size, layout};
}
