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
import {
  boundsOfPoints,
  containsRect,
  outset,
  type Rect,
  type Size,
} from '../layout/geometry';
import {miniLayout, type MiniLayout} from '../layout/mini';
import {MANTA_PAGE} from '../layout/probe';
import {assignStrokes, type StrokeBox} from '../ink/assign';
import {detectFrameFromMany, toPagePx} from '../ink/frame';
import {cellKey, type GridPuzzle} from '../model/grid';
import {PUZZLES} from '../puzzles/sample';
import {setRoute} from '../ui/route';
import {
  conflicting,
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
import {describeAll, type ElementInfo} from '../probes/elements';
import {ensurePng} from '../probes/note';
import {recognisedText} from '../recognise/text';
import {emptyState, type PuzzleState} from '../state/store';

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
    if (created.ok) {
      // A new note starts with no checks or reveals, whatever was saved before.
      await saveState(ctx, emptyState(p.id, notePath));
    }
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
  /** Raw text read per entry (the owner's ink). Logged only for entries that end up wrong. */
  entryText: Record<string, string>;
  strokes: number;
  dots: number;
  unassigned: number;
  calls: number;
  /** Recognition calls that failed, by error code. */
  failures: Record<string, number>;
  ms: number;
}

/** Strokes smaller than this in both directions are dots (e.g. a stray pen tap). */
export const DOT_PX = 15;

/**
 * Reads the squares: one recognition per entry, mapped back to the squares.
 * A square is read on its own when its entry's letter count doesn't match,
 * the entry reading was partial (split after a failure), or the across and
 * down readings disagree.
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
    let dots = 0;
    for (const i of strokeIdx) {
      const b = infos[i].bounds;
      if (!b) {
        continue;
      }
      const px = toPagePx(b, frame, w.size);
      if (px.right - px.left < DOT_PX && px.bottom - px.top < DOT_PX) {
        dots++;
        continue;
      }
      boxes.push({index: i, bounds: px});
    }
    const assignment = assignStrokes(boxes, w.layout.page.cells);
    ctx.log.info(TAG, `read ${strokeIdx.length} strokes (frame ${frame})`, {
      cellsWithInk: assignment.byCell.size,
      dotsIgnored: dots,
      unassigned: assignment.unassigned.length,
      ambiguous: assignment.ambiguous.length,
    });

    let calls = 0;
    const failures: Record<string, number> = {};
    const recognise = async (
      part: ElementLike[],
    ): Promise<RecogniseOutcome> => {
      ctx.state.heartbeat(ctx.now());
      const r = await ctx.sdk.recognize(part, w.size);
      return r.ok
        ? {ok: true, text: recognisedText(r.value)}
        : {ok: false, code: r.code, message: r.message};
    };
    const run = async (part: ElementLike[]) => {
      const r = await recogniseResilient(recognise, part, {now: ctx.now});
      calls += r.calls;
      for (const f of r.failures) {
        const k = String(f.code ?? 'error');
        failures[k] = (failures[k] ?? 0) + 1;
      }
      return r;
    };
    const strokesOf = (key: string) =>
      (assignment.byCell.get(key) ?? []).map(i => elements[i]);
    const readings: Record<string, CellReadings> = {};
    for (const cell of w.layout.page.cells) {
      readings[cell.id] = {hasInk: assignment.byCell.has(cell.id)};
    }

    const entryText: Record<string, string> = {};
    const needSingle = new Set<string>();
    for (const e of w.puzzle.entries) {
      const keys = e.cells.map(cellKey);
      const hasInk = keys.map(k => readings[k].hasInk);
      if (!hasInk.some(Boolean)) {
        continue;
      }
      const r = await run(keys.flatMap(strokesOf));
      entryText[e.id] = r.text;
      const tokens = letterTokens(r.text);
      // A partial reading (part of it failed) may be misaligned: don't map it.
      const mapped = r.partial ? null : mapEntryToCells(tokens, hasInk, r.text);
      ctx.log.info(TAG, `${e.id}: ${mapped ? 'mapped' : 'not mapped'}`, {
        letters: tokens.length,
        inked: hasInk.filter(Boolean).length,
        partial: r.partial || undefined,
        ms: r.ms,
      });
      keys.forEach((k, i) => {
        if (!hasInk[i]) {
          return;
        }
        if (mapped) {
          readings[k][e.direction] = mapped[i] ?? undefined;
        }
      });
    }
    // Read a square on its own only when no word gave it a reading, or the
    // across and down words disagree. A weak single reading never overrides
    // an agreeing word reading (M1: I read as "T" alone, right in ALIVE).
    for (const [k, r] of Object.entries(readings)) {
      if (r.hasInk && ((!r.across && !r.down) || conflicting(r))) {
        needSingle.add(k);
      }
    }
    for (const k of needSingle) {
      const r = await run(strokesOf(k));
      const t = letterTokens(r.text);
      readings[k].single = t.length === 1 ? t[0] : undefined;
      ctx.log.info(TAG, `square ${k} read on its own`, {
        letters: t.length,
        ms: r.ms,
      });
    }
    return {
      readings,
      entryText,
      strokes: strokeIdx.length,
      dots,
      unassigned: assignment.unassigned.length,
      calls,
      failures,
      ms: ctx.now() - t0,
    };
  } finally {
    ctx.sdk.recycle(elements);
  }
}

type MarkSpec = Parameters<ProbeContext['sdk']['insertGeometry']>[0];

const MARK_COLOURS = new Set([0x00, 0x9d, 0xfe]);

/** Our marks: straight fineliner lines in our colours, inside a mark zone. */
export function isOurMark(w: PuzzlePage, i: ElementInfo): boolean {
  return (
    i.type === ELEMENT_TYPE.geometry &&
    i.geometryType === 'straightLine' &&
    i.penType === 10 &&
    MARK_COLOURS.has(i.penColor ?? -1) &&
    (i.layer === undefined || i.layer === 0) &&
    i.bounds !== null &&
    (i.numInPage ?? 0) >= 1 &&
    inMarkZone(w.layout, i.bounds)
  );
}

interface PageMarks {
  /** Element numbers to delete: our marks and tap dots on the buttons. */
  nums: number[];
  /** Squares that already carry a grey reveal triangle. */
  revealed: string[];
  dots: number;
}

/** Strokes with this many points or fewer may be tap dots. */
const DOT_MAX_POINTS = 40;

/**
 * Bounds of a stroke if it is short enough to be a dot (cheap: the point
 * count is checked before any points are read).
 */
async function dotBounds(el: ElementLike): Promise<Rect | null> {
  const acc = el.stroke?.points;
  if (!acc) {
    return null;
  }
  const n = await acc.size();
  if (!(n > 0) || n > DOT_MAX_POINTS) {
    return null;
  }
  return boundsOfPoints(await acc.getRange(0, n));
}

/**
 * Finds our marks on the page, plus pen-tap dots inside the printed buttons
 * (owner's decision of 2026-11-28: tidy them). Never reads or touches any
 * other stroke.
 */
async function scanMarks(
  ctx: ProbeContext,
  w: PuzzlePage,
): Promise<PageMarks | null> {
  const elRes = await ctx.sdk.getElements(w.page, w.path);
  if (!elRes.ok) {
    ctx.log.warn(TAG, `marks: getElements ${describe(elRes)}`);
    return null;
  }
  try {
    const geometry = elRes.value.filter(
      el => el.type === ELEMENT_TYPE.geometry,
    );
    const infos = await describeAll(geometry, 10);
    const ours = infos.filter(i => isOurMark(w, i));
    const revealed = Object.entries(w.layout.revealZones)
      .filter(([, z]) =>
        ours.some(
          i =>
            i.penColor === 0x9d &&
            i.bounds !== null &&
            i.bounds.left >= z.left - 4 &&
            i.bounds.right <= z.right + 4 &&
            i.bounds.top >= z.top - 4 &&
            i.bounds.bottom <= z.bottom + 4,
        ),
      )
      .map(([k]) => k);
    const buttons = w.layout.page.zones.map(z => outset(z.rect, 4));
    const dots: number[] = [];
    for (const el of elRes.value) {
      if (
        el.type !== ELEMENT_TYPE.stroke ||
        (el.layerNum !== undefined && el.layerNum !== 0) ||
        (el.numInPage ?? 0) < 1
      ) {
        continue;
      }
      const b = await dotBounds(el);
      if (
        b &&
        b.right - b.left < DOT_PX &&
        b.bottom - b.top < DOT_PX &&
        buttons.some(z => containsRect(z, b))
      ) {
        dots.push(el.numInPage as number);
      }
    }
    return {
      nums: [...ours.map(i => i.numInPage as number), ...dots],
      revealed,
      dots: dots.length,
    };
  } finally {
    ctx.sdk.recycle(elRes.value);
  }
}

/**
 * Replaces all of our marks with `marks` in one batch update. The new marks
 * are created first; the old ones are found right before the update, and
 * only if the same note is still open.
 */
export async function replaceMarks(
  ctx: ProbeContext,
  w: PuzzlePage,
  marks: MarkSpec[],
): Promise<boolean> {
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
    const found = await scanMarks(ctx, w);
    if (!found) {
      return false;
    }
    const path = await ctx.sdk.getCurrentFilePath();
    const page = await ctx.sdk.getCurrentPageNum();
    if (
      !path.ok ||
      path.value !== w.path ||
      !page.ok ||
      page.value !== w.page
    ) {
      ctx.log.warn(TAG, 'marks: the note or page changed; not touching it');
      return false;
    }
    const res =
      found.nums.length > 0
        ? await ctx.sdk.batchUpdatePageElements(found.nums, created, w.page)
        : await ctx.sdk.insertPageElements(created, w.page);
    ctx.log.info(
      TAG,
      `marks: removed ${found.nums.length} (${found.dots} tap dots), added ${
        created.length
      }: ${describe(res)}`,
    );
    return res.ok;
  } finally {
    ctx.sdk.recycle(created);
  }
}

async function loadState(ctx: ProbeContext, w: PuzzlePage) {
  try {
    return await ctx.store.load(w.puzzle.id, w.path);
  } catch (e) {
    ctx.log.warn(TAG, `state: load failed: ${String(e)}`);
    return emptyState(w.puzzle.id, w.path);
  }
}

async function saveState(ctx: ProbeContext, state: PuzzleState) {
  try {
    await ctx.store.save(state);
  } catch (e) {
    ctx.log.warn(TAG, `state: save failed: ${String(e)}`);
  }
}

/** A message for when every recognition call failed (then nothing changes). */
export function recognitionFailedMessage(
  failures: Record<string, number>,
): string {
  if (failures['116']) {
    return 'Handwriting recognition needs Wi-Fi the first time it is used. Connect to Wi-Fi and tap CHECK again.';
  }
  const codes = Object.keys(failures).join(', ');
  return `Handwriting recognition failed (${codes}). Nothing was changed; try CHECK again.`;
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
  const failed = Object.values(read.failures).reduce((a, b) => a + b, 0);
  if (read.calls > 0 && failed >= read.calls) {
    ctx.log.warn(TAG, 'every recognition call failed', read.failures);
    return recognitionFailedMessage(read.failures);
  }
  const result: CheckResult = judgePuzzle(
    w.puzzle,
    read.readings,
    ctx.date().getTime(),
  );
  const state = await loadState(ctx, w);
  const onPage = await scanMarks(ctx, w);
  const revealed = new Set([...state.revealed, ...(onPage?.revealed ?? [])]);
  // Log statuses; what was read only where it differs from the answer (the
  // owner's own wrong ink), never the answer itself.
  for (const [k, v] of Object.entries(result.cells)) {
    ctx.log.info(
      TAG,
      `square ${k}: ${v.status}${
        v.status === 'wrong' ? ` (read ${v.read})` : ''
      }`,
    );
  }
  for (const e of w.puzzle.entries) {
    if (result.entries[e.id] === 'wrong') {
      ctx.log.info(
        TAG,
        `${e.id} raw reading ${JSON.stringify(read.entryText[e.id] ?? '')}`,
      );
    }
  }
  const marked = await replaceMarks(
    ctx,
    w,
    marksFor(w.puzzle, w.layout, result, revealed),
  );
  state.revealed = [...revealed];
  state.lastCheck = result;
  state.checks += 1;
  if (result.solved && state.solvedAt === null) {
    state.solvedAt = result.at;
  }
  await saveState(ctx, state);
  const summary = checkSummary(w.puzzle, result, revealed);
  ctx.log.info(TAG, 'check done', {
    solved: result.solved,
    calls: read.calls,
    failures: read.failures,
    ms: read.ms,
    strokes: read.strokes,
    dots: read.dots,
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
  const state = await loadState(ctx, w);
  const revealed = new Set([...state.revealed, ...keys]);
  state.revealed = [...revealed];
  await saveState(ctx, state);
  ctx.log.info(TAG, `revealed ${keys.length} squares`, {total: revealed.size});
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
  setRoute({
    screen: 'reveal',
    puzzleId: w.puzzle.id,
    notePath: w.path,
    nonce: ctx.now(),
  });
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
