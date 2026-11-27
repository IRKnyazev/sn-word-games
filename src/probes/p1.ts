/**
 * P1 recognition probe: read the open probe page, map strokes to cells with
 * the same layout that printed the template, and recognise them
 * (a) one cell at a time, (b) one word/row at a time, (c) one section at a
 * time. Logs every result with timing and scores against the printed words.
 * Never saves the note (saving resets undo).
 */
import {formatRect} from '../layout/geometry';
import type {Cell, Group} from '../layout/types';
import {assignStrokes, type StrokeBox} from '../ink/assign';
import {detectFrameFromMany, emrRectToPx, type Frame} from '../ink/frame';
import {
  recogniseResilient,
  type RecogniseOutcome,
} from '../recognise/resilient';
import {percent, score, tally, type Score} from '../recognise/text';
import {describe} from '../sdk/result';
import {ELEMENT_TYPE, type ElementLike} from '../sdk/types';
import type {ProbeContext} from './context';
import {census, describeAll} from './elements';
import {currentProbePage} from './runner';

const TAG = 'P1';

interface LevelStats {
  scores: Score[];
  calls: number;
  ms: number;
  failures: Record<string, number>;
}

function newStats(): LevelStats {
  return {scores: [], calls: 0, ms: 0, failures: {}};
}

/** recognizeElements usually answers a string; log anything else as JSON. */
export function recognisedText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as {text: unknown}).text ?? '');
  }
  return value === null || value === undefined ? '' : JSON.stringify(value);
}

export async function readProbePage(
  ctx: ProbeContext,
  origin: 'menu' | 'button',
): Promise<string> {
  const where = await currentProbePage(ctx, TAG);
  if (typeof where === 'string') {
    return where;
  }
  const {path, page, size, layout} = where;
  ctx.log.info(TAG, `reading ${layout.id} (page ${page + 1}) from ${origin}`, {
    size,
  });

  const t0 = ctx.now();
  const elRes = await ctx.sdk.getElements(page, path);
  ctx.log.info(TAG, `getElements ${describe(elRes)}`, {
    count: elRes.ok ? elRes.value.length : 0,
  });
  if (!elRes.ok) {
    return `Couldn't read the page: ${describe(elRes)}`;
  }
  const elements = elRes.value;
  try {
    const infos = await describeAll(elements);
    ctx.log.info(
      TAG,
      `element census (read in ${ctx.now() - t0} ms)`,
      census(infos),
    );

    // Handwriting only: strokes on the main layer.
    const strokeIdx = infos
      .filter(
        i =>
          i.type === ELEMENT_TYPE.stroke &&
          (i.layer === undefined || i.layer === 0),
      )
      .map(i => i.index);
    const frame: Frame = detectFrameFromMany(
      strokeIdx.map(i => infos[i].bounds),
      size,
    );
    ctx.log.info(TAG, `strokes=${strokeIdx.length} coordinate frame=${frame}`);

    const boxes: StrokeBox[] = [];
    for (const i of strokeIdx) {
      const b = infos[i].bounds;
      if (!b) {
        continue;
      }
      boxes.push({
        index: i,
        bounds: frame === 'emr' ? emrRectToPx(b, size) : b,
      });
    }
    const assignment = assignStrokes(boxes, layout.cells);
    ctx.log.info(TAG, 'assignment', {
      cellsWithInk: assignment.byCell.size,
      unassigned: assignment.unassigned.length,
      ambiguous: assignment.ambiguous.length,
    });
    for (const i of assignment.unassigned.slice(0, 20)) {
      const b = boxes.find(x => x.index === i)?.bounds;
      ctx.log.info(TAG, `unassigned stroke #${i} ${b ? formatRect(b) : '-'}`);
    }
    for (const a of assignment.ambiguous.slice(0, 20)) {
      ctx.log.info(
        TAG,
        `ambiguous stroke #${a.index} overlaps ${a.cellIds.join(', ')}`,
      );
    }

    const recognise = async (
      part: ElementLike[],
    ): Promise<RecogniseOutcome> => {
      const r = await ctx.sdk.recognize(part, size);
      return r.ok
        ? {ok: true, text: recognisedText(r.value)}
        : {ok: false, code: r.code, message: r.message};
    };
    const cellById = new Map<string, Cell>(layout.cells.map(c => [c.id, c]));
    const strokesOf = (cellIds: string[]): ElementLike[] =>
      cellIds.flatMap(id =>
        (assignment.byCell.get(id) ?? []).map(i => elements[i]),
      );

    const run = async (
      label: string,
      part: ElementLike[],
      expected: string | undefined,
      stats: LevelStats,
    ) => {
      const r = await recogniseResilient(recognise, part, {now: ctx.now});
      stats.calls += r.calls;
      stats.ms += r.ms;
      for (const f of r.failures) {
        const k = String(f.code ?? 'throw');
        stats.failures[k] = (stats.failures[k] ?? 0) + 1;
      }
      const extra = {
        strokes: part.length,
        calls: r.calls,
        ms: r.ms,
        partial: r.partial || undefined,
      };
      if (expected !== undefined) {
        const s = score(expected, r.text);
        stats.scores.push(s);
        ctx.log.info(
          TAG,
          `${s.exact ? 'OK ' : 'BAD'} ${label} expected=${
            s.expected
          } got=${JSON.stringify(r.text)}`,
          extra,
        );
      } else {
        ctx.log.info(TAG, `--- ${label} got=${JSON.stringify(r.text)}`, extra);
      }
    };

    // (a) one cell at a time
    const perCell = newStats();
    for (const cell of layout.cells) {
      const part = strokesOf([cell.id]);
      if (part.length > 0) {
        await run(`cell ${cell.id}`, part, cell.expected, perCell);
      }
    }

    // (b) words/rows and (c) sections
    const expectedOf = (g: Group): string | undefined => {
      const cells = g.cellIds.map(id => cellById.get(id));
      return cells.every(c => c?.expected !== undefined)
        ? cells.map(c => c!.expected).join('')
        : undefined;
    };
    const perWord = newStats();
    const perSection = newStats();
    for (const g of layout.groups) {
      const part = strokesOf(g.cellIds);
      if (part.length === 0) {
        continue;
      }
      // A one-cell word (a ruled line) was already read at cell level.
      if (
        g.level === 'word' &&
        g.cellIds.length === 1 &&
        cellById.get(g.cellIds[0])?.kind === 'line'
      ) {
        continue;
      }
      await run(
        `${g.level} ${g.id}`,
        part,
        expectedOf(g),
        g.level === 'word' ? perWord : perSection,
      );
    }

    const line = (name: string, s: LevelStats) => {
      const t = tally(s.scores);
      const fails = Object.entries(s.failures)
        .map(([k, v]) => `${k}×${v}`)
        .join(' ');
      return `${name}: ${t.exact}/${t.total} (${percent(t)}), ${
        s.calls
      } calls, ${s.ms} ms${fails ? `, failures ${fails}` : ''}`;
    };
    const summary = [
      `${layout.title}: ${strokeIdx.length} strokes in ${assignment.byCell.size} cells (frame ${frame})`,
      line('per cell', perCell),
      line('per word/row', perWord),
      line('per section', perSection),
    ];
    if (assignment.unassigned.length > 0) {
      summary.push(`${assignment.unassigned.length} strokes outside any cell`);
    }
    ctx.log.info(TAG, 'summary', summary);
    return summary.join('\n');
  } finally {
    ctx.sdk.recycle(elements);
  }
}
