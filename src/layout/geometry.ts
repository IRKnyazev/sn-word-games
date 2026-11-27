/** Page-pixel geometry shared by layout, rendering, ink mapping and taps. */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Same shape as the SDK's Rect: edges in page pixels, right/bottom exclusive. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function rect(left: number, top: number, w: number, h: number): Rect {
  return {left, top, right: left + w, bottom: top + h};
}

export function width(r: Rect): number {
  return r.right - r.left;
}

export function height(r: Rect): number {
  return r.bottom - r.top;
}

export function area(r: Rect): number {
  return Math.max(0, width(r)) * Math.max(0, height(r));
}

export function centre(r: Rect): Point {
  return {x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2};
}

/** Grow (positive) or shrink (negative) a rect on every side. */
export function inset(r: Rect, by: number): Rect {
  return {
    left: r.left + by,
    top: r.top + by,
    right: r.right - by,
    bottom: r.bottom - by,
  };
}

export function outset(r: Rect, by: number): Rect {
  return inset(r, -by);
}

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  );
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const r = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return r.left < r.right && r.top < r.bottom ? r : null;
}

export function intersects(a: Rect, b: Rect): boolean {
  return intersection(a, b) !== null;
}

/** Smallest rect containing all points; null for no points. */
export function boundsOfPoints(points: readonly Point[]): Rect | null {
  if (points.length === 0) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of points) {
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  return {left, top, right, bottom};
}

export function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) {
    return null;
  }
  return rects.reduce((u, r) => ({
    left: Math.min(u.left, r.left),
    top: Math.min(u.top, r.top),
    right: Math.max(u.right, r.right),
    bottom: Math.max(u.bottom, r.bottom),
  }));
}

/** Integer rect that covers `r` (for SDK calls that reject fractions). */
export function roundOut(r: Rect): Rect {
  return {
    left: Math.floor(r.left),
    top: Math.floor(r.top),
    right: Math.ceil(r.right),
    bottom: Math.ceil(r.bottom),
  };
}

export function clampTo(r: Rect, page: Size): Rect {
  return {
    left: Math.max(0, Math.min(r.left, page.width)),
    top: Math.max(0, Math.min(r.top, page.height)),
    right: Math.max(0, Math.min(r.right, page.width)),
    bottom: Math.max(0, Math.min(r.bottom, page.height)),
  };
}

export function formatRect(r: Rect): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return `[${n(r.left)},${n(r.top)} → ${n(r.right)},${n(r.bottom)}]`;
}
