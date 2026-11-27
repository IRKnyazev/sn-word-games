/**
 * P6 feedback marks, on page 2's "P6 marks" box:
 *   insert  — ✓ and ✗ (insertGeometry), a square (geometry element via
 *             insertPageElements), a dark tile (insertImage: host places it)
 *             and a light tile (picture element with a rect).
 *   remove via lasso — lassoElements(box) → getLassoElements →
 *             deleteLassoElements → setLassoBoxState(2).
 *   remove via batch — batchUpdatePageElements(our nums, [white hairline]).
 *   status / save — to check persistence after reopening, and undo after save.
 * Never deletes handwriting: removal aborts if a stroke is in the selection,
 * and the batch route only targets geometry and pictures inside the box.
 * Never calls deletePageElements.
 */
import {
  containsRect,
  formatRect,
  intersects,
  inset,
  outset,
  roundOut,
  clampTo,
  type Rect,
  type Size,
} from '../layout/geometry';
import {MANTA_PAGE} from '../layout/probe';
import {describe, insertSucceeded} from '../sdk/result';
import {ELEMENT_TYPE, type ElementLike, type GeometrySpec} from '../sdk/types';
import type {ProbeContext} from './context';
import {describeAll, type ElementInfo} from './elements';
import {ensureTiles} from './note';
import {currentProbePage} from './runner';

const TAG = 'P6';
const P6_PAGE = 1;

interface P6Where {
  path: string;
  page: number;
  size: Size;
  area: Rect;
}

async function p6Where(ctx: ProbeContext): Promise<P6Where | string> {
  const where = await currentProbePage(ctx, TAG);
  if (typeof where === 'string') {
    return where;
  }
  if (where.page !== P6_PAGE || !where.layout.areas.p6) {
    return 'Go to page 2 of the probe note (the page with the "P6 marks" box) first.';
  }
  return {
    path: where.path,
    page: where.page,
    size: where.size,
    area: where.layout.areas.p6,
  };
}

export interface AreaCount {
  strokes: number;
  geometry: number;
  pictures: number;
  /** Every picture on the page, wherever the host put it. */
  picturesAnywhere: string[];
}

export function countIn(infos: readonly ElementInfo[], area: Rect): AreaCount {
  const inArea = infos.filter(i => i.bounds && intersects(i.bounds, area));
  return {
    strokes: inArea.filter(i => i.type === ELEMENT_TYPE.stroke).length,
    geometry: inArea.filter(i => i.type === ELEMENT_TYPE.geometry).length,
    pictures: inArea.filter(i => i.type === ELEMENT_TYPE.picture).length,
    picturesAnywhere: infos
      .filter(i => i.type === ELEMENT_TYPE.picture)
      .map(i => `#${i.numInPage} ${i.bounds ? formatRect(i.bounds) : '?'}`),
  };
}

/** Our marks: geometry or pictures lying within the P6 box. */
export function ourMarks(
  infos: readonly ElementInfo[],
  area: Rect,
): ElementInfo[] {
  const box = outset(area, 2);
  return infos.filter(
    i =>
      (i.type === ELEMENT_TYPE.geometry || i.type === ELEMENT_TYPE.picture) &&
      i.bounds !== null &&
      containsRect(box, i.bounds) &&
      (i.numInPage ?? 0) >= 1 &&
      (i.layer === undefined || i.layer === 0),
  );
}

async function readArea(
  ctx: ProbeContext,
  w: P6Where,
  label: string,
): Promise<{count: AreaCount; infos: ElementInfo[]} | null> {
  const res = await ctx.sdk.getElements(w.page, w.path);
  if (!res.ok) {
    ctx.log.warn(TAG, `${label}: getElements ${describe(res)}`);
    return null;
  }
  try {
    const infos = await describeAll(res.value, 500);
    const count = countIn(infos, w.area);
    ctx.log.info(
      TAG,
      `${label}: page has ${infos.length} elements; in P6 box`,
      count,
    );
    return {count, infos};
  } finally {
    ctx.sdk.recycle(res.value);
  }
}

function marks(w: P6Where): {
  tick: GeometrySpec;
  cross: GeometrySpec[];
  square: GeometrySpec;
  lightTile: Rect;
} {
  const s = w.size.width / MANTA_PAGE.width;
  const u = (n: number) => Math.round(n * s);
  const L = w.area.left;
  const T = w.area.top;
  const ink = {penColor: 0x00, penType: 10, penWidth: 400};
  return {
    tick: {
      ...ink,
      type: 'GEO_polygon',
      points: [
        {x: L + u(40), y: T + u(190)},
        {x: L + u(90), y: T + u(240)},
        {x: L + u(170), y: T + u(140)},
      ],
    },
    cross: [
      {
        ...ink,
        type: 'straightLine',
        points: [
          {x: L + u(190), y: T + u(140)},
          {x: L + u(270), y: T + u(240)},
        ],
      },
      {
        ...ink,
        type: 'straightLine',
        points: [
          {x: L + u(270), y: T + u(140)},
          {x: L + u(190), y: T + u(240)},
        ],
      },
    ],
    square: {
      ...ink,
      penWidth: 100,
      type: 'GEO_polygon',
      points: [
        {x: L + u(170), y: T + u(290)},
        {x: L + u(270), y: T + u(290)},
        {x: L + u(270), y: T + u(390)},
        {x: L + u(170), y: T + u(390)},
        {x: L + u(170), y: T + u(290)},
      ],
    },
    lightTile: {
      left: L + u(40),
      top: T + u(290),
      right: L + u(140),
      bottom: T + u(390),
    },
  };
}

export async function insertMarks(ctx: ProbeContext): Promise<string> {
  const w = await p6Where(ctx);
  if (typeof w === 'string') {
    return w;
  }
  const tiles = await ensureTiles(ctx);
  const before = await readArea(ctx, w, 'before');
  const m = marks(w);
  const lines: string[] = [];
  const step = (name: string, ok: boolean, detail: string) => {
    lines.push(`${ok ? 'ok ' : 'ERR'} ${name}`);
    ctx.log.info(TAG, `${name}: ${detail}`);
  };

  const tick = await ctx.sdk.insertGeometry(m.tick);
  step(
    '✓ insertGeometry',
    insertSucceeded(tick),
    `${describe(tick)} result=${JSON.stringify(tick.ok ? tick.value : null)}`,
  );
  for (const [i, line] of m.cross.entries()) {
    const r = await ctx.sdk.insertGeometry(line);
    step(
      `✗ line ${i + 1} insertGeometry`,
      insertSucceeded(r),
      `${describe(r)} result=${JSON.stringify(r.ok ? r.value : null)}`,
    );
  }

  const created: ElementLike[] = [];
  try {
    const sq = await ctx.sdk.createGeometryElement(m.square, w.page);
    if (sq.ok) {
      created.push(sq.value);
      const r = await ctx.sdk.insertPageElements([sq.value], w.page);
      step('□ geometry element insertPageElements', r.ok, describe(r));
    } else {
      step('□ createElement(geometry)', false, describe(sq));
    }

    const img = await ctx.sdk.insertImage(tiles.dark);
    step(
      'dark tile insertImage (host places it)',
      img.ok,
      `${describe(img)} path=${tiles.dark}`,
    );

    const pic = await ctx.sdk.createPictureElement(
      tiles.light,
      m.lightTile,
      w.page,
    );
    if (pic.ok) {
      created.push(pic.value);
      const r = await ctx.sdk.insertPageElements([pic.value], w.page);
      step(
        'light tile picture element insertPageElements',
        r.ok,
        `${describe(r)} rect=${formatRect(m.lightTile)}`,
      );
    } else {
      step('light tile createElement(picture)', false, describe(pic));
    }
  } finally {
    ctx.sdk.recycle(created);
  }

  const after = await readArea(ctx, w, 'after');
  if (before && after) {
    const dg = after.count.geometry - before.count.geometry;
    const dp = after.count.pictures - before.count.pictures;
    ctx.log.info(
      TAG,
      `landed: +${dg} geometry in box (expected 4), +${dp} pictures in box`,
      {
        picturesAnywhere: after.count.picturesAnywhere,
      },
    );
    lines.push(`landed in box: +${dg} geometry (of 4), +${dp} pictures`);
    lines.push(
      `pictures on page: ${after.count.picturesAnywhere.join('; ') || 'none'}`,
    );
  }
  lines.push(
    'Now close this screen and look at the box. Try Undo once: what disappears?',
  );
  return lines.join('\n');
}

export async function removeViaLasso(ctx: ProbeContext): Promise<string> {
  const w = await p6Where(ctx);
  if (typeof w === 'string') {
    return w;
  }
  const rect = clampTo(roundOut(inset(w.area, 4)), w.size);
  const lasso = await ctx.sdk.lassoElements(rect);
  ctx.log.info(TAG, `lassoElements ${formatRect(rect)} ${describe(lasso)}`);
  if (!lasso.ok) {
    return `lassoElements failed: ${describe(lasso)}`;
  }
  const sel = await ctx.sdk.getLassoElements();
  ctx.log.info(TAG, `getLassoElements ${describe(sel)}`);
  if (!sel.ok) {
    await ctx.sdk.setLassoBoxState(2);
    return `getLassoElements failed: ${describe(sel)}`;
  }
  let summary: string;
  try {
    const infos = await describeAll(sel.value, 500);
    for (const i of infos) {
      ctx.log.info(
        TAG,
        `selected type=${i.type} num=${i.numInPage} bounds=${
          i.bounds ? formatRect(i.bounds) : '-'
        }`,
      );
    }
    if (infos.some(i => i.type === ELEMENT_TYPE.stroke)) {
      const st = await ctx.sdk.setLassoBoxState(2);
      ctx.log.warn(
        TAG,
        `handwriting found in the P6 box: not deleting (setLassoBoxState ${describe(
          st,
        )})`,
      );
      return 'Found handwriting in the P6 box, so nothing was deleted. Erase it by hand and try again.';
    }
    if (infos.length === 0) {
      const st = await ctx.sdk.setLassoBoxState(2);
      ctx.log.info(TAG, `nothing selected (setLassoBoxState ${describe(st)})`);
      return 'The lasso selected nothing.';
    }
    const del = await ctx.sdk.deleteLassoElements();
    ctx.log.info(TAG, `deleteLassoElements ${describe(del)}`);
    const st = await ctx.sdk.setLassoBoxState(2);
    ctx.log.info(TAG, `setLassoBoxState(2) ${describe(st)}`);
    summary = `Lasso selected ${infos.length}; delete ${describe(del)}`;
  } finally {
    ctx.sdk.recycle(sel.value);
  }
  const after = await readArea(ctx, w, 'after lasso delete');
  return [
    summary,
    after
      ? `left in box: ${after.count.geometry} geometry, ${after.count.pictures} pictures`
      : '',
    'Now: does Undo bring them back? Then close and reopen the note and run "P6 status".',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function removeViaBatch(ctx: ProbeContext): Promise<string> {
  const w = await p6Where(ctx);
  if (typeof w === 'string') {
    return w;
  }
  const res = await ctx.sdk.getElements(w.page, w.path);
  if (!res.ok) {
    return `getElements failed: ${describe(res)}`;
  }
  let nums: number[];
  try {
    const infos = await describeAll(res.value, 500);
    nums = ourMarks(infos, w.area).map(i => i.numInPage as number);
  } finally {
    ctx.sdk.recycle(res.value);
  }
  ctx.log.info(TAG, `marks in box to delete: ${nums.join(', ') || 'none'}`);
  if (nums.length === 0) {
    return 'No marks in the P6 box. Run "P6 insert marks" first.';
  }
  // batchUpdatePageElements can't delete without inserting (empty → 106),
  // so it inserts a white hairline in the box's corner.
  const y = w.area.bottom - 12;
  const repl = await ctx.sdk.createGeometryElement(
    {
      type: 'straightLine',
      points: [
        {x: w.area.left + 10, y},
        {x: w.area.left + 30, y},
      ],
      penColor: 0xfe,
      penType: 10,
      penWidth: 100,
    },
    w.page,
  );
  if (!repl.ok) {
    return `createElement for the replacement failed: ${describe(repl)}`;
  }
  let batch;
  try {
    batch = await ctx.sdk.batchUpdatePageElements(nums, [repl.value], w.page);
    ctx.log.info(
      TAG,
      `batchUpdatePageElements(delete ${nums.length}, insert 1) ${describe(
        batch,
      )}`,
    );
  } finally {
    ctx.sdk.recycle([repl.value]);
  }
  const after = await readArea(ctx, w, 'after batch update');
  return [
    `batchUpdatePageElements ${describe(batch)}`,
    after
      ? `left in box: ${after.count.geometry} geometry (1 is the white hairline), ${after.count.pictures} pictures`
      : '',
    'Now: does Undo bring them back? Then close and reopen the note and run "P6 status".',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function p6Status(ctx: ProbeContext): Promise<string> {
  const w = await p6Where(ctx);
  if (typeof w === 'string') {
    return w;
  }
  const r = await readArea(ctx, w, 'status');
  return r
    ? `P6 box: ${r.count.geometry} geometry, ${r.count.pictures} pictures, ${
        r.count.strokes
      } strokes.\nPictures on page: ${
        r.count.picturesAnywhere.join('; ') || 'none'
      }`
    : 'Could not read the page.';
}

export async function saveNote(ctx: ProbeContext): Promise<string> {
  const r = await ctx.sdk.saveCurrentNote();
  ctx.log.info(TAG, `saveCurrentNote ${describe(r)}`);
  return `saveCurrentNote ${describe(
    r,
  )}.\nNow try Undo on something you wrote before saving: does it still undo?`;
}
