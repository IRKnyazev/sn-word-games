/**
 * Strokes → cells. A stroke belongs to the cell containing the centre of its
 * bounding box (cells padded a little, so letters that poke out of the box
 * still count). Falling back to overlap handles a centre that lands just
 * outside. Strokes that overlap a second cell a lot are flagged so a
 * misread can be explained.
 */
import {
  centre,
  contains,
  intersection,
  outset,
  type Rect,
  type Point,
} from '../layout/geometry';
import type {Cell} from '../layout/types';

export interface StrokeBox {
  /** Index into the caller's stroke list. */
  index: number;
  bounds: Rect;
}

export interface Assignment {
  /** cell id → stroke indexes, in input order. */
  byCell: Map<string, number[]>;
  /** Strokes that belong to no cell (margin doodles, button taps). */
  unassigned: number[];
  /** Strokes assigned to one cell but overlapping another by ≥ ambiguousOverlap. */
  ambiguous: {index: number; cellIds: string[]}[];
}

export interface AssignOptions {
  /** Pixels added around each cell when testing the centre. */
  pad?: number;
  /** Fraction of the stroke box that must overlap a cell for the fallback. */
  minOverlap?: number;
  /** Fraction overlapping a second cell that marks the stroke as ambiguous. */
  ambiguousOverlap?: number;
}

/** Overlap of a stroke box with a cell as a fraction of the stroke box. */
export function overlapFraction(stroke: Rect, cell: Rect): number {
  // A dot or a perfectly straight stroke has zero area: treat it as 1 px thick.
  const s: Rect = {
    left: stroke.left,
    top: stroke.top,
    right: Math.max(stroke.right, stroke.left + 1),
    bottom: Math.max(stroke.bottom, stroke.top + 1),
  };
  const i = intersection(s, cell);
  if (!i) {
    return 0;
  }
  const area = (s.right - s.left) * (s.bottom - s.top);
  return Math.min(1, ((i.right - i.left) * (i.bottom - i.top)) / area);
}

/** Distance from a point to a rect (0 inside). */
export function distanceToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.left - p.x, 0, p.x - r.right);
  const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
  return Math.hypot(dx, dy);
}

export function assignStrokes(
  strokes: readonly StrokeBox[],
  cells: readonly Cell[],
  opts: AssignOptions = {},
): Assignment {
  const pad = opts.pad ?? 12;
  const minOverlap = opts.minOverlap ?? 0.5;
  const ambiguousOverlap = opts.ambiguousOverlap ?? 0.3;
  const byCell = new Map<string, number[]>();
  const unassigned: number[] = [];
  const ambiguous: Assignment['ambiguous'] = [];

  for (const s of strokes) {
    const c = centre(s.bounds);
    // Prefer the cell whose padded rect holds the centre; if several (padding
    // overlaps between touching cells), take the one whose real rect is closest.
    const holders = cells.filter(cell => contains(outset(cell.rect, pad), c));
    let chosen: Cell | undefined;
    if (holders.length === 1) {
      chosen = holders[0];
    } else if (holders.length > 1) {
      // A cell that really holds the centre wins; otherwise the nearest one.
      chosen =
        holders.find(cell => contains(cell.rect, c)) ??
        holders.reduce((best, cell) =>
          distanceToRect(c, cell.rect) < distanceToRect(c, best.rect)
            ? cell
            : best,
        );
    } else {
      let best = 0;
      for (const cell of cells) {
        const f = overlapFraction(s.bounds, cell.rect);
        if (f > best) {
          best = f;
          chosen = cell;
        }
      }
      if (best < minOverlap) {
        chosen = undefined;
      }
    }
    if (!chosen) {
      unassigned.push(s.index);
      continue;
    }
    const list = byCell.get(chosen.id) ?? [];
    list.push(s.index);
    byCell.set(chosen.id, list);

    const chosenId = chosen.id;
    const others = cells.filter(
      cell =>
        cell.id !== chosenId &&
        overlapFraction(s.bounds, cell.rect) >= ambiguousOverlap,
    );
    if (others.length > 0) {
      ambiguous.push({
        index: s.index,
        cellIds: [chosenId, ...others.map(o => o.id)],
      });
    }
  }
  return {byCell, unassigned, ambiguous};
}
