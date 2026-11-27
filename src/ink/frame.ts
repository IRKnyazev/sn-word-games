/**
 * Coordinate frames. SDK 0.2.x gives page pixels; 0.1.x (and pen-up on some
 * firmware) gave EMR digitizer units: rotated 90° and ~8.45× larger on a
 * Manta. P2 measures which one we get; this module detects and converts.
 */
import type {Point, Rect, Size} from '../layout/geometry';

export type Frame = 'px' | 'emr' | 'unknown';

/** Portrait EMR maxima per page size (from the SDK's PointUtils table). */
const EMR_MAX: Record<string, {maxX: number; maxY: number}> = {
  '1920x2560': {maxX: 21632, maxY: 16224},
  '1404x1872': {maxX: 15819, maxY: 11864},
};

export function emrMaxFor(page: Size): {maxX: number; maxY: number} | null {
  return EMR_MAX[`${page.width}x${page.height}`] ?? null;
}

/**
 * Guess the frame from a bounding box. Anything clearly beyond the page is
 * EMR; anything inside it is assumed px (EMR strokes near the origin would
 * look like px, so callers should prefer evidence from several strokes).
 */
export function detectFrame(
  bounds: Rect | null,
  page: Size,
  slack = 1.05,
): Frame {
  if (!bounds) {
    return 'unknown';
  }
  if (bounds.left < -page.width * 0.05 || bounds.top < -page.height * 0.05) {
    return 'unknown';
  }
  if (
    bounds.right > page.width * slack ||
    bounds.bottom > page.height * slack
  ) {
    return 'emr';
  }
  return 'px';
}

/** Most common verdict among several strokes ('emr' wins ties). */
export function detectFrameFromMany(
  boundsList: (Rect | null)[],
  page: Size,
): Frame {
  let px = 0;
  let emr = 0;
  for (const b of boundsList) {
    const f = detectFrame(b, page);
    if (f === 'px') {
      px++;
    } else if (f === 'emr') {
      emr++;
    }
  }
  if (px === 0 && emr === 0) {
    return 'unknown';
  }
  return emr >= px ? 'emr' : 'px';
}

/**
 * EMR → page px for a portrait page (the conversion Ink2Task and Scribble
 * use on 0.1.65): x_px = (W-1) - y_emr·(W-1)/maxY, y_px = x_emr·(H-1)/maxX.
 */
export function emrToPx(p: Point, page: Size, max = emrMaxFor(page)): Point {
  if (!max) {
    throw new Error(`no EMR maxima for page ${page.width}x${page.height}`);
  }
  const W = page.width - 1;
  const H = page.height - 1;
  return {x: W - (p.y * W) / max.maxY, y: (p.x * H) / max.maxX};
}

export function emrRectToPx(r: Rect, page: Size): Rect {
  const a = emrToPx({x: r.left, y: r.top}, page);
  const b = emrToPx({x: r.right, y: r.bottom}, page);
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}
