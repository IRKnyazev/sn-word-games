/**
 * Playing a Mini on the device: start the note, CHECK, reveal. Uses the SDK
 * only through the interfaces in ../sdk/types, so it runs against fakes in
 * tests.
 *
 * CHECK never saves the note and never touches the owner's ink: it reads
 * strokes, recognises each entry, then replaces our own marks (geometry in
 * our mark zones) in one batch update (decision of 2026-11-27).
 */
import {PUZZLE_TEMPLATES} from '../assets/templates.generated';
import {
  checkSummary,
  inMarkZone,
  judgePuzzle,
  marksFor,
  type CheckResult,
} from '../games/mini';
import type {Size} from '../layout/geometry';
import {miniLayout, type MiniLayout} from '../layout/mini';
import {MANTA_PAGE} from '../layout/probe';
import {assignStrokes, type StrokeBox} from '../ink/assign';
import {detectFrameFromMany, toPagePx} from '../ink/frame';
import {cellKey, type GridPuzzle} from '../model/grid';
import {PUZZLES} from '../puzzles/sample';
import {setRoute} from '../ui/route';
import {
  letterTokens,
  mapEntryToCells,
  type CellReadings,
} from '../recognise/entries';
import {
  recogniseResilient,
  type RecogniseOutcome,
} from '../recognise/resilient';
import {noteDir} from '../sdk/paths';
import {describe} from '../sdk/result';
import {ELEMENT_TYPE, type ElementLike} from '../sdk/types';
import type {ProbeContext} from '../probes/context';
import {describeAll} from '../probes/elements';
import {ensurePng} from '../probes/note';
import {recognisedText} from '../probes/p1';

const TAG = 'mini';

export function puzzleNotePath(p: GridPuzzle, root: string): string {
  return `${noteDir(root)}/Mini - ${p.id}.note`;
}

/** The puzzle id a note path belongs to, or null. */
export function puzzleIdFromPath(
  path: string | null | undefined,
): string | null {
  const m = /\/Note\/SupernotePuzzles\/Mini - ([A-Za-z0-9_-]+)\.note$/i.exec(
    path ?? '',
  );
  return m ? m[1] : null;
}

/** The puzzle a page template name belongs to ("user_mini-sample-1-<sha>"). */
export function puzzleIdFromTemplate(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  const m = /mini-([A-Za-z0-9_-]+?)-[0-9a-f]{10}$/.exec(name);
  return m ? m[1] : null;
}

export function isPuzzleNotePath(path: string | null | undefined): boolean {
  return puzzleIdFromPath(path) !== null;
}

/** "Start sample Mini": write the template, create the note (or reuse it), open it. */
export async function startPuzzle(
  ctx: ProbeContext,
  puzzleId: string,
): Promise<string> {
  const p = PUZZLES[puzzleId];
  const tpl = p ? PUZZLE_TEMPLATES[`mini-${p.id}`] : undefined;
  if (!p || !tpl) {
    return `Unknown puzzle ${puzzleId}.`;
  }
  const template = await ensurePng(ctx, tpl);
  const root = ctx.files.externalRoot;
  const notePath = puzzleNotePath(p, root);
  await ctx.files.mkdir(noteDir(root));
  if (await ctx.files.exists(notePath)) {
    ctx.log.info(TAG, `note exists, reopening ${notePath}`);
  } else {
    const created = await ctx.sdk.createNote({
      notePath,
      template,
      mode: 0,
      isPortrait: true,
    });
    ctx.log.info(TAG, `createNote ${describe(created)}`, {notePath, template});
    if (!created.ok) {
      return created.code === 102
        ? 'Open any note first, then use the Puzzles button from that note.'
        : `Couldn't create the note: ${describe(created)}`;
    }
  }
  await ctx.sdk.closePluginView();
  const opened = await ctx.sdk.openNote(notePath, 0);
  ctx.log.info(TAG, `openNote ${describe(opened)}`);
  return opened.ok
    ? `${p.title}: write your answers, then tap CHECK.`
    : `Created "${notePath.slice(
        notePath.lastIndexOf('/') + 1,
      )}"; open it from Note/SupernotePuzzles.`;
}

export interface PuzzlePage {
  path: string;
  page: number;
  size: Size;
  puzzle: GridPuzzle;
  layout: MiniLayout;
}

/** The open puzzle page, or a message saying why there isn't one. */
export async function currentPuzzlePage(
  ctx: ProbeContext,
): Promise<PuzzlePage | string> {
  const pathRes = await ctx.sdk.getCurrentFilePath();
  const pageRes = await ctx.sdk.getCurrentPageNum();
  if (!pathRes.ok || !pageRes.ok) {
    return `Couldn't tell which note is open (${describe(
      pathRes.ok ? pageRes : pathRes,
    )}).`;
  }
  const path = pathRes.value;
  const page = pageRes.value;
  const tpl = await ctx.sdk.getNotePageTemplate(path, page);
  const id =
    puzzleIdFromTemplate(
      tpl.ok ? (tpl.value as {name?: unknown} | null)?.name : undefined,
    ) ?? puzzleIdFromPath(path);
  const puzzle = id ? PUZZLES[id] : undefined;
  if (!puzzle) {
    return 'This page is not a puzzle.';
  }
  const sizeRes = await ctx.sdk.getPageSize(path, page);
  const size: Size =
    sizeRes.ok && sizeRes.value?.width > 0
      ? {width: sizeRes.value.width, height: sizeRes.value.height}
      : MANTA_PAGE;
  return {path, page, size, puzzle, layout: miniLayout(puzzle, size)};
}

export interface ReadResult {
  readings: Record<string, CellReadings>;
  strokes: number;
  unassigned: number;
  calls: number;
  ms: number;
}

/**
 * Reads the squares: one recognition per entry, mapped back to the squares;
 * single squares only where an entry's letter count doesn't match.
 */
export async function readSquares(
  ctx: ProbeContext,
  w: PuzzlePage,
): Promise<ReadResult | string> {
  const t0 = ctx.now();
  const elRes = await ctx.sdk.getElements(w.page, w.path);
  if (!elRes.ok) {
    return `Couldn't read the page: ${describe(elRes)}`;
  }
  const elements = elRes.value;
  try {
    const infos = await describeAll(elements);
    const strokeIdx = infos
      .filter(
        i =>
          i.type === ELEMENT_TYPE.stroke &&
          (i.layer === undefined || i.layer === 0),
      )
      .map(i => i.index);
    const frame = detectFrameFromMany(
      strokeIdx.map(i => infos[i].bounds),
      w.size,
    );
    const boxes: StrokeBox[] = [];
    for (const i of strokeIdx) {
      const b = infos[i].bounds;
      if (b) {
        boxes.push({index: i, bounds: toPagePx(b, frame, w.size)});
      }
    }
    const assignment = assignStrokes(boxes, w.layout.page.cells);
    ctx.log.info(TAG, `read ${strokeIdx.length} strokes (frame ${frame})`, {
      cellsWithInk: assignment.byCell.size,
      unassigned: assignment.unassigned.length,
      ambiguous: assignment.ambiguous.length,
    });

    let calls = 0;
    const recognise = async (
      part: ElementLike[],
    ): Promise<RecogniseOutcome> => {
      ctx.state.heartbeat(ctx.now());
      const r = await ctx.sdk.recognize(part, w.size);
      return r.ok
        ? {ok: true, text: recognisedText(r.value)}
        : {ok: false, code: r.code, message: r.message};
    };
    const strokesOf = (key: string) =>
      (assignment.byCell.get(key) ?? []).map(i => elements[i]);
    const readings: Record<string, CellReadings> = {};
    for (const cell of w.layout.page.cells) {
      readings[cell.id] = {hasInk: assignment.byCell.has(cell.id)};
    }

    const needSingle = new Set<string>();
    for (const e of w.puzzle.entries) {
      const keys = e.cells.map(cellKey);
      const hasInk = keys.map(k => readings[k].hasInk);
      if (!hasInk.some(Boolean)) {
        continue;
      }
      const r = await recogniseResilient(recognise, keys.flatMap(strokesOf), {
        now: ctx.now,
      });
      calls += r.calls;
      const tokens = letterTokens(r.text);
      const mapped = mapEntryToCells(tokens, hasInk);
      ctx.log.info(
        TAG,
        `${e.id} read ${JSON.stringify(r.text)} → ${
          mapped ? 'mapped' : 'count mismatch'
        }`,
        {
          tokens: tokens.join(''),
          inked: hasInk.filter(Boolean).length,
          ms: r.ms,
        },
      );
      keys.forEach((k, i) => {
        if (!hasInk[i]) {
          return;
        }
        if (mapped) {
          readings[k][e.direction] = mapped[i] ?? undefined;
        } else {
          needSingle.add(k);
        }
      });
    }
    for (const k of needSingle) {
      const r = await recogniseResilient(recognise, strokesOf(k), {
        now: ctx.now,
      });
      calls += r.calls;
      const t = letterTokens(r.text);
      readings[k].single = t.length === 1 ? t[0] : undefined;
      ctx.log.info(TAG, `square ${k} read ${JSON.stringify(r.text)}`, {
        ms: r.ms,
      });
    }
    return {
      readings,
      strokes: strokeIdx.length,
      unassigned: assignment.unassigned.length,
      calls,
      ms: ctx.now() - t0,
    };
  } finally {
    ctx.sdk.recycle(elements);
  }
}

/**
 * Replaces all of our marks on the page with `marks`: geometry in our mark
 * zones is deleted and the new marks inserted in one batch update.
 */
export async function replaceMarks(
  ctx: ProbeContext,
  w: PuzzlePage,
  marks: Parameters<ProbeContext['sdk']['insertGeometry']>[0][],
): Promise<boolean> {
  const elRes = await ctx.sdk.getElements(w.page, w.path);
  if (!elRes.ok) {
    ctx.log.warn(TAG, `marks: getElements ${describe(elRes)}`);
    return false;
  }
  let old: number[];
  try {
    const infos = await describeAll(elRes.value, 50);
    old = infos
      .filter(
        i =>
          i.type === ELEMENT_TYPE.geometry &&
          (i.layer === undefined || i.layer === 0) &&
          i.bounds !== null &&
          (i.numInPage ?? 0) >= 1 &&
          inMarkZone(w.layout, i.bounds),
      )
      .map(i => i.numInPage as number);
  } finally {
    ctx.sdk.recycle(elRes.value);
  }
  const created: ElementLike[] = [];
  try {
    for (const spec of marks) {
      const el = await ctx.sdk.createGeometryElement(spec, w.page);
      if (el.ok) {
        created.push(el.value);
      } else {
        ctx.log.warn(TAG, `createElement ${describe(el)}`);
      }
    }
    if (created.length === 0) {
      return false;
    }
    const res =
      old.length > 0
        ? await ctx.sdk.batchUpdatePageElements(old, created, w.page)
        : await ctx.sdk.insertPageElements(created, w.page);
    ctx.log.info(
      TAG,
      `marks: removed ${old.length}, added ${created.length}: ${describe(res)}`,
    );
    return res.ok;
  } finally {
    ctx.sdk.recycle(created);
  }
}

/** CHECK: read, judge, mark, remember. Returns the text for the dialog. */
export async function checkPuzzle(ctx: ProbeContext): Promise<string> {
  const w = await currentPuzzlePage(ctx);
  if (typeof w === 'string') {
    return w;
  }
  const read = await readSquares(ctx, w);
  if (typeof read === 'string') {
    return read;
  }
  const result: CheckResult = judgePuzzle(
    w.puzzle,
    read.readings,
    ctx.date().getTime(),
  );
  const state = await ctx.store.load(w.puzzle.id, w.path);
  const revealed = new Set(state.revealed);
  for (const [k, v] of Object.entries(result.cells)) {
    ctx.log.info(
      TAG,
      `square ${k}: ${v.status}${v.read ? ` (${v.read})` : ''}`,
    );
  }
  const marked = await replaceMarks(
    ctx,
    w,
    marksFor(w.puzzle, w.layout, result, revealed),
  );
  state.lastCheck = result;
  state.checks += 1;
  if (result.solved && state.solvedAt === null) {
    state.solvedAt = result.at;
  }
  await ctx.store.save(state);
  const summary = checkSummary(w.puzzle, result, revealed);
  ctx.log.info(TAG, 'check done', {
    summary,
    calls: read.calls,
    ms: read.ms,
    strokes: read.strokes,
    unassigned: read.unassigned,
    marked,
  });
  return marked
    ? summary
    : `${summary}\n(Couldn't update the marks on the page.)`;
}

/** Records revealed squares and redraws the marks. Returns a short message. */
export async function revealSquares(
  ctx: ProbeContext,
  keys: string[],
): Promise<string> {
  const w = await currentPuzzlePage(ctx);
  if (typeof w === 'string') {
    return w;
  }
  const state = await ctx.store.load(w.puzzle.id, w.path);
  const revealed = new Set([...state.revealed, ...keys]);
  state.revealed = [...revealed];
  await ctx.store.save(state);
  ctx.log.info(TAG, `revealed ${keys.join(', ')}`, {total: revealed.size});
  const ok = await replaceMarks(
    ctx,
    w,
    marksFor(w.puzzle, w.layout, state.lastCheck, revealed),
  );
  return ok
    ? 'Revealed squares are marked with a grey triangle.'
    : "Couldn't update the marks on the page.";
}

/** REVEAL on the page: open the Puzzles view on this puzzle's reveal screen. */
export async function openReveal(ctx: ProbeContext): Promise<void> {
  const w = await currentPuzzlePage(ctx);
  if (typeof w === 'string') {
    ctx.log.warn(TAG, `reveal: ${w}`);
    return;
  }
  setRoute({screen: 'reveal', puzzleId: w.puzzle.id, notePath: w.path});
  const shown = await ctx.sdk.showPluginView();
  ctx.log.info(
    TAG,
    `reveal screen for ${w.puzzle.id}: showPluginView ${describe(shown)}`,
  );
}

/** Remembers revealed squares (before the marks are drawn). */
export async function recordReveal(
  ctx: ProbeContext,
  puzzleId: string,
  notePath: string,
  keys: string[],
): Promise<void> {
  const state = await ctx.store.load(puzzleId, notePath);
  state.revealed = [...new Set([...state.revealed, ...keys])];
  await ctx.store.save(state);
  ctx.log.info(TAG, `reveal recorded: ${keys.join(', ')}`, {
    total: state.revealed.length,
  });
}
