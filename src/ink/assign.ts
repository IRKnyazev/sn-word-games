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
  const i = intersection(stroke, cell);
  if (!i) {
    return 0;
  }
  // A dot or a perfectly straight stroke has zero area: treat as 1 px thick.
  const sw = Math.max(1, stroke.right - stroke.left);
  const sh = Math.max(1, stroke.bottom - stroke.top);
  const iw = Math.max(1, i.right - i.left);
  const ih = Math.max(1, i.bottom - i.top);
  return Math.min(1, (iw * ih) / (sw * sh));
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
      chosen = holders.find(cell => contains(cell.rect, c)) ?? holders[0];
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
