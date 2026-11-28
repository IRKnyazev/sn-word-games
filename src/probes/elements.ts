/** Reading element data through the SDK's lazy accessors, for logs and mapping. */
import {boundsOfPoints, type Point, type Rect} from '../layout/geometry';
import {
  ELEMENT_TYPE,
  type ElementLike,
  type PointsAccessor,
} from '../sdk/types';

export interface ElementInfo {
  index: number;
  type: number;
  penType?: number;
  penColor?: number;
  layer?: number;
  numInPage?: number;
  maxX?: number;
  maxY?: number;
  nPoints: number;
  bounds: Rect | null;
  first?: Point;
  last?: Point;
  geometryType?: string;
  picturePath?: string;
  /** Set when the stroke's points couldn't be read (bounds is then null). */
  readError?: string;
}

/** Reads up to `max` points. Tolerates size() = -1 and missing accessors. */
export async function readPoints(
  acc: PointsAccessor | undefined,
  max = 5000,
): Promise<Point[]> {
  if (!acc || typeof acc.size !== 'function') {
    return [];
  }
  const n = await acc.size();
  if (!(n > 0)) {
    return [];
  }
  // getRange is all-or-nothing, so ask for exactly what exists.
  return acc.getRange(0, Math.min(n, max));
}

function geometryBounds(el: ElementLike): Rect | null {
  const g = el.geometry;
  if (!g) {
    return null;
  }
  if (g.points && g.points.length > 0) {
    return boundsOfPoints(g.points);
  }
  if (g.ellipseCenterPoint) {
    const {x, y} = g.ellipseCenterPoint;
    const rx = g.ellipseMajorAxisRadius ?? 0;
    const ry = g.ellipseMinorAxisRadius ?? rx;
    return {left: x - rx, top: y - ry, right: x + rx, bottom: y + ry};
  }
  return null;
}

export async function describeElement(
  el: ElementLike,
  index: number,
  maxPoints = 5000,
): Promise<ElementInfo> {
  const info: ElementInfo = {
    index,
    type: el.type,
    layer: el.layerNum,
    numInPage: el.numInPage,
    maxX: el.maxX,
    maxY: el.maxY,
    nPoints: 0,
    bounds: null,
  };
  if (el.type === ELEMENT_TYPE.stroke && el.stroke) {
    info.penType = el.stroke.penType;
    info.penColor = el.stroke.penColor;
    let pts: Point[] = [];
    try {
      pts = await readPoints(el.stroke.points, maxPoints);
    } catch (e) {
      // One unreadable stroke must not stop the rest of the page being read.
      info.readError = e instanceof Error ? e.message : String(e);
    }
    info.nPoints = pts.length;
    info.bounds = boundsOfPoints(pts);
    if (pts.length > 0) {
      info.first = pts[0];
      info.last = pts[pts.length - 1];
    }
  } else if (el.type === ELEMENT_TYPE.geometry) {
    info.geometryType = el.geometry?.type;
    info.penType = el.geometry?.penType;
    info.penColor = el.geometry?.penColor;
    info.nPoints = el.geometry?.points?.length ?? 0;
    info.bounds = geometryBounds(el);
  } else if (el.type === ELEMENT_TYPE.picture) {
    info.picturePath = el.picture?.picturePath;
    info.bounds = el.picture?.rect ?? null;
  }
  return info;
}

export async function describeAll(
  elements: readonly ElementLike[],
  maxPoints = 5000,
): Promise<ElementInfo[]> {
  const out: ElementInfo[] = [];
  // One at a time: each accessor call is a native round trip.
  for (let i = 0; i < elements.length; i++) {
    out.push(await describeElement(elements[i], i, maxPoints));
  }
  return out;
}

/** "type0×12 type700×2" and "pen10×12" style counts for logs. */
export function census(infos: readonly ElementInfo[]): {
  byType: Record<string, number>;
  byPen: Record<string, number>;
  byLayer: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byPen: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  for (const i of infos) {
    byType[i.type] = (byType[i.type] ?? 0) + 1;
    if (i.penType !== undefined) {
      byPen[i.penType] = (byPen[i.penType] ?? 0) + 1;
    }
    byLayer[i.layer ?? '?'] = (byLayer[i.layer ?? '?'] ?? 0) + 1;
  }
  return {byType, byPen, byLayer};
}

export function fmtPoint(p: Point | undefined): string {
  return p ? `(${Math.round(p.x)},${Math.round(p.y)})` : '-';
}
