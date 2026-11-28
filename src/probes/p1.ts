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
import {
  detectFrameFromMany,
  emrMaxFor,
  toPagePx,
  type Frame,
} from '../ink/frame';
import {
  recogniseResilient,
  type RecogniseOutcome,
} from '../recognise/resilient';
import {
  letterTokens,
  mapEntryToCells,
  matchesLetter,
} from '../recognise/entries';
import {
  percent,
  recognisedText,
  score,
  tally,
  type Score,
} from '../recognise/text';

export {recognisedText};
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
    if (frame === 'emr' && !emrMaxFor(size)) {
      ctx.log.warn(
        TAG,
        `EMR points but no conversion for page ${size.width}×${size.height}`,
      );
    }

    const boxes: StrokeBox[] = [];
    for (const i of strokeIdx) {
      const b = infos[i].bounds;
      if (!b) {
        continue;
      }
      boxes.push({
        index: i,
        bounds: toPagePx(b, frame, size),
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
      ctx.state.heartbeat(ctx.now());
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

    const texts = new Map<string, string>();
    const run = async (
      label: string,
      part: ElementLike[],
      expected: string | undefined,
      stats: LevelStats,
    ) => {
      const r = await recogniseResilient(recognise, part, {now: ctx.now});
      texts.set(label, r.text);
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

    // (a2) the same single squares, look-alikes forgiven (M1 rule)
    const letterCells = layout.cells.filter(
      c => c.kind === 'letter' && strokesOf([c.id]).length > 0,
    );
    const forgiven = (text: string | undefined, expected: string) => {
      const t = letterTokens(text);
      return t.length === 1 && matchesLetter(t[0], expected);
    };
    const scored = letterCells.filter(c => c.expected !== undefined);
    const cellForgiven = scored.filter(c =>
      forgiven(texts.get(`cell ${c.id}`), c.expected!),
    ).length;

    // (a3) single squares again, strokes set to the fineliner pen type (10)
    let fineExact = 0;
    let fineDiffers = 0;
    let fineForgiven = 0;
    let fineCalls = 0;
    const fineStart = ctx.now();
    for (const c of letterCells) {
      const part = strokesOf([c.id]).map(el => ({
        ...el,
        stroke: el.stroke ? {...el.stroke, penType: 10} : el.stroke,
      }));
      const r = await recogniseResilient(recognise, part, {now: ctx.now});
      fineCalls += r.calls;
      if (r.text !== texts.get(`cell ${c.id}`)) {
        fineDiffers++;
      }
      if (c.expected !== undefined) {
        const exact =
          letterTokens(r.text).join('').toUpperCase() === c.expected;
        fineExact += exact ? 1 : 0;
        fineForgiven += forgiven(r.text, c.expected) ? 1 : 0;
        ctx.log.info(
          TAG,
          `${exact ? 'OK ' : 'BAD'} fineliner ${c.id} expected=${
            c.expected
          } got=${JSON.stringify(r.text)}`,
        );
      } else {
        ctx.log.info(
          TAG,
          `--- fineliner ${c.id} got=${JSON.stringify(r.text)}`,
        );
      }
    }
    const fineMs = ctx.now() - fineStart;

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

    // (b2) words/rows mapped back to squares (M1 rule)
    let mappedRight = 0;
    let mappedTotal = 0;
    let groupsMapped = 0;
    let groupsTried = 0;
    for (const g of layout.groups.filter(x => x.level === 'word')) {
      const cells = g.cellIds.map(id => cellById.get(id)!);
      if (cells.some(c => c.kind !== 'letter')) {
        continue;
      }
      const hasInk = cells.map(c => strokesOf([c.id]).length > 0);
      if (!hasInk.some(Boolean)) {
        continue;
      }
      groupsTried++;
      const mapped = mapEntryToCells(
        letterTokens(texts.get(`word ${g.id}`)),
        hasInk,
      );
      if (mapped) {
        groupsMapped++;
      }
      if (cells.some(c => c.expected === undefined)) {
        // Crossword runs: no printed answer, so only the mapping rate counts.
        continue;
      }
      cells.forEach((c, i) => {
        if (!hasInk[i]) {
          return;
        }
        mappedTotal++;
        const ok = mapped
          ? matchesLetter(mapped[i] ?? '', c.expected!)
          : forgiven(texts.get(`cell ${c.id}`), c.expected!);
        mappedRight += ok ? 1 : 0;
      });
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
    if (scored.length > 0) {
      summary.push(
        `per cell, look-alikes forgiven: ${cellForgiven}/${scored.length}`,
        `fineliner per cell: ${fineExact}/${scored.length} exact, ${fineForgiven}/${scored.length} forgiven, ${fineDiffers}/${letterCells.length} read differently from the ink pen (${fineCalls} calls, ${fineMs} ms)`,
      );
    }
    if (groupsTried > 0) {
      summary.push(
        `rows/words mapped to squares: ${mappedRight}/${mappedTotal} right; ${groupsMapped} of ${groupsTried} rows/words had a matching letter count`,
      );
    }
    if (assignment.unassigned.length > 0) {
      summary.push(`${assignment.unassigned.length} strokes outside any cell`);
    }
    ctx.log.info(TAG, 'summary', summary);
    return summary.join('\n');
  } finally {
    ctx.sdk.recycle(elements);
  }
}
