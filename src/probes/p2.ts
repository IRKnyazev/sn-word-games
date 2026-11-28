/**
 * P2 coordinates probe. While armed (10 minutes), pen-up events are captured
 * and pen down/up motion events are kept. "Report" compares every source
 * against the printed P2 target box on page 3, whose position is known.
 */
import {
  centre,
  contains,
  formatRect,
  intersects,
  type Rect,
  type Size,
} from '../layout/geometry';
import {MANTA_PAGE, probeLayoutForPage} from '../layout/probe';
import {detectFrame, toPagePx} from '../ink/frame';
import {describe} from '../sdk/result';
import {ELEMENT_TYPE, INK_PEN_TYPES, type ElementLike} from '../sdk/types';
import type {ProbeContext, Unsubscribe} from './context';
import {describeAll, describeElement, fmtPoint} from './elements';
import {currentProbePage} from './runner';

const TAG = 'P2';

let penUpSub: Unsubscribe | null = null;

export function armP2(ctx: ProbeContext): string {
  ctx.state.arm('p2', ctx.now());
  if (!penUpSub) {
    penUpSub = ctx.listenPenUp(els => {
      onPenUp(ctx, els).catch(e =>
        ctx.log.error(TAG, `pen-up handler: ${String(e)}`),
      );
    });
  }
  ctx.log.info(TAG, 'armed for 10 minutes; pen-up listener registered');
  return 'P2 armed for 10 minutes. Go to page 3 and draw one straight line across the P2 target box, then run "P2 report".';
}

export function disarmP2(ctx: ProbeContext): void {
  ctx.state.disarm('p2');
  penUpSub?.remove();
  penUpSub = null;
}

export async function onPenUp(
  ctx: ProbeContext,
  elements: ElementLike[],
): Promise<void> {
  try {
    if (!ctx.state.isArmed('p2', ctx.now())) {
      disarmP2(ctx);
      return;
    }
    for (const el of elements.slice(0, 3)) {
      const penType = el.stroke?.penType;
      if (
        el.type !== ELEMENT_TYPE.stroke ||
        !INK_PEN_TYPES.includes(penType ?? -1)
      ) {
        // Lasso paths arrive here too (penType 4 on a Manta): not ink.
        ctx.log.info(
          TAG,
          `pen-up skipped: type=${el.type} penType=${penType} (not ink)`,
        );
        continue;
      }
      const info = await describeElement(el, 0, 2000);
      ctx.state.addPenUp({
        at: ctx.now(),
        type: info.type,
        penType: info.penType,
        numInPage: info.numInPage,
        maxX: info.maxX,
        maxY: info.maxY,
        nPoints: info.nPoints,
        bounds: info.bounds,
        first: info.first,
        last: info.last,
      });
      ctx.log.info(
        TAG,
        `pen-up type=${info.type} pen=${info.penType} num=${info.numInPage} n=${
          info.nPoints
        } bounds=${
          info.bounds ? formatRect(info.bounds) : '-'
        } first=${fmtPoint(info.first)} last=${fmtPoint(info.last)} maxX=${
          info.maxX
        } maxY=${info.maxY}`,
      );
    }
    await ctx.log.flush();
  } finally {
    ctx.sdk.recycle(elements);
  }
}

function verdict(bounds: Rect | null, target: Rect, size: Size): string {
  if (!bounds) {
    return 'no points';
  }
  const frame = detectFrame(bounds, size);
  const px = toPagePx(bounds, frame, size);
  const hit = contains(target, centre(px))
    ? 'centre in target'
    : intersects(px, target)
    ? 'touches target'
    : 'misses target';
  return `${frame}${frame === 'emr' ? ` → px ${formatRect(px)}` : ''}, ${hit}`;
}

export async function reportP2(ctx: ProbeContext): Promise<string> {
  const sizes = {
    pageDisplaySize: await ctx.sdk.getPageDisplaySize(),
    deviceType: await ctx.sdk.getDeviceType(),
  };
  ctx.log.info(TAG, 'device', {
    pageDisplaySize: sizes.pageDisplaySize.ok
      ? sizes.pageDisplaySize.value
      : describe(sizes.pageDisplaySize),
    deviceType: sizes.deviceType.ok
      ? sizes.deviceType.value
      : describe(sizes.deviceType),
    window: ctx.sdk.windowInfo(),
  });

  const where = await currentProbePage(ctx, TAG);
  const size = typeof where === 'string' ? MANTA_PAGE : where.size;
  const target = probeLayoutForPage(2, size)?.areas.p2;
  if (!target) {
    return 'No P2 target in the layout.';
  }
  ctx.log.info(
    TAG,
    `target ${formatRect(target)} on page 3, page size ${size.width}×${
      size.height
    }`,
  );
  const lines: string[] = [];

  if (typeof where !== 'string' && where.page === 2) {
    const elRes = await ctx.sdk.getElements(where.page, where.path);
    if (elRes.ok) {
      try {
        const infos = await describeAll(elRes.value);
        const strokes = infos.filter(i => i.type === ELEMENT_TYPE.stroke);
        let near = 0;
        for (const s of strokes) {
          const v = verdict(s.bounds, target, size);
          if (!v.includes('misses')) {
            near++;
            ctx.log.info(
              TAG,
              `getElements stroke #${s.index} pen=${s.penType} layer=${
                s.layer
              } num=${s.numInPage} bounds=${
                s.bounds ? formatRect(s.bounds) : '-'
              } → ${v}`,
            );
          }
        }
        lines.push(
          `getElements: ${strokes.length} strokes, ${near} at the target`,
        );
      } finally {
        ctx.sdk.recycle(elRes.value);
      }
    } else {
      lines.push(`getElements failed: ${describe(elRes)}`);
    }
    const last = await ctx.sdk.getLastElement();
    if (last.ok && last.value) {
      const lastEl = last.value;
      try {
        const info = await describeElement(lastEl, 0);
        ctx.log.info(
          TAG,
          `getLastElement type=${info.type} bounds=${
            info.bounds ? formatRect(info.bounds) : '-'
          } → ${verdict(info.bounds, target, size)}${
            info.readError ? ` (points unreadable: ${info.readError})` : ''
          }`,
        );
      } finally {
        ctx.sdk.recycle([lastEl]);
      }
    } else {
      ctx.log.info(TAG, `getLastElement ${last.ok ? 'null' : describe(last)}`);
    }
  } else {
    lines.push('Open page 3 of the probe note for the getElements comparison.');
  }

  const ups = ctx.state.penUps.slice(-5);
  for (const u of ups) {
    ctx.log.info(
      TAG,
      `pen-up sample pen=${u.penType} bounds=${
        u.bounds ? formatRect(u.bounds) : '-'
      } → ${verdict(u.bounds, target, size)}`,
    );
  }
  lines.push(
    ups.length > 0
      ? `pen-up: ${ups.length} recent strokes, last → ${verdict(
          ups[ups.length - 1].bounds,
          target,
          size,
        )}`
      : 'pen-up: nothing captured (arm P2 first, then draw)',
  );

  const pens = ctx.state.motions.filter(m => m.toolType === 2).slice(-6);
  for (const m of pens) {
    ctx.log.info(
      TAG,
      `motion pen action=${m.action} at (${Math.round(m.x)},${Math.round(
        m.y,
      )}) ${contains(target, m) ? 'inside target' : 'outside target'}`,
    );
  }
  lines.push(`motion: ${pens.length} pen down/up events logged`);
  ctx.log.info(TAG, 'summary', lines);
  return lines.join('\n');
}
