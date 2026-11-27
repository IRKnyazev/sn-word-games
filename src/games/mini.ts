/**
 * Mini rules: judge every square and entry from the readings, describe the
 * result for the owner, and lay out the feedback marks. Pure.
 */
import {containsRect, outset, type Rect} from '../layout/geometry';
import type {MiniLayout} from '../layout/mini';
import {cellKey, whiteCells, type GridPuzzle} from '../model/grid';
import {
  judgeCell,
  type CellReadings,
  type CellVerdict,
} from '../recognise/entries';
import type {GeometrySpec} from '../sdk/types';

export type EntryStatus = 'right' | 'wrong' | 'incomplete';

export interface CheckResult {
  at: number;
  cells: Record<string, CellVerdict>;
  entries: Record<string, EntryStatus>;
  /** What was read for each entry: letters, '·' for empty, '?' for unread. */
  readings: Record<string, string>;
  solved: boolean;
}

export function judgePuzzle(
  p: GridPuzzle,
  readings: Readonly<Record<string, CellReadings>>,
  at: number,
): CheckResult {
  const cells: Record<string, CellVerdict> = {};
  for (const c of whiteCells(p)) {
    const key = cellKey(c);
    cells[key] = judgeCell(
      readings[key] ?? {hasInk: false},
      p.solution[c.row][c.col],
    );
  }
  const entries: Record<string, EntryStatus> = {};
  const shown: Record<string, string> = {};
  for (const e of p.entries) {
    const verdicts = e.cells.map(c => cells[cellKey(c)]);
    entries[e.id] = verdicts.some(v => v.status === 'wrong')
      ? 'wrong'
      : verdicts.every(v => v.status === 'right')
      ? 'right'
      : 'incomplete';
    shown[e.id] = verdicts
      .map(v =>
        v.status === 'empty' ? '·' : v.status === 'unread' ? '?' : v.read,
      )
      .join('');
  }
  const solved = Object.values(cells).every(v => v.status === 'right');
  return {at, cells, entries, readings: shown, solved};
}

/** The dialog text after CHECK. */
export function checkSummary(
  p: GridPuzzle,
  r: CheckResult,
  revealed: ReadonlySet<string>,
): string {
  const lines: string[] = [];
  const reveals = revealed.size;
  if (r.solved) {
    lines.push(
      `Solved! Every square is right${
        reveals > 0 ? ` (${reveals} revealed)` : ''
      }.`,
    );
    return lines.join('\n');
  }
  const total = p.entries.length;
  const right = p.entries.filter(e => r.entries[e.id] === 'right').length;
  lines.push(`${right} of ${total} entries right.`);
  const wrong = p.entries.filter(e => r.entries[e.id] === 'wrong');
  if (wrong.length > 0) {
    lines.push(
      `Wrong: ${wrong
        .map(e => `${e.id} read ${r.readings[e.id]}`)
        .join(' · ')}`,
    );
  }
  const unread = Object.entries(r.cells).filter(
    ([, v]) => v.status === 'unread',
  );
  if (unread.length > 0) {
    const where = unread
      .slice(0, 4)
      .map(([k]) => {
        const [row, col] = k.split('-').map(Number);
        return `row ${row + 1} col ${col + 1}`;
      })
      .join(', ');
    lines.push(
      `Couldn't read: ${where}${
        unread.length > 4 ? '…' : ''
      }. Try writing it again.`,
    );
  }
  const empty = Object.values(r.cells).filter(v => v.status === 'empty').length;
  if (empty > 0) {
    lines.push(`${empty} empty square${empty === 1 ? '' : 's'}.`);
  }
  return lines.join('\n');
}

const INK = {penColor: 0x00, penType: 10, penWidth: 400} as const;
const GREY = {penColor: 0x9d, penType: 10, penWidth: 400} as const;

function line(
  a: [number, number],
  b: [number, number],
  style: typeof INK | typeof GREY,
): GeometrySpec {
  return {
    type: 'straightLine',
    points: [
      {x: a[0], y: a[1]},
      {x: b[0], y: b[1]},
    ],
    ...style,
  };
}

export function tickMarks(b: Rect): GeometrySpec[] {
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  const p = (fx: number, fy: number): [number, number] => [
    Math.round(b.left + fx * w),
    Math.round(b.top + fy * h),
  ];
  return [
    line(p(0.18, 0.55), p(0.42, 0.8), INK),
    line(p(0.42, 0.8), p(0.85, 0.2), INK),
  ];
}

export function crossMarks(b: Rect): GeometrySpec[] {
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  const p = (fx: number, fy: number): [number, number] => [
    Math.round(b.left + fx * w),
    Math.round(b.top + fy * h),
  ];
  return [
    line(p(0.22, 0.22), p(0.78, 0.78), INK),
    line(p(0.78, 0.22), p(0.22, 0.78), INK),
  ];
}

/** A slash across the top-right corner of a wrong square. */
export function wrongMark(z: Rect): GeometrySpec[] {
  const w = z.right - z.left;
  return [
    line(
      [z.left + Math.round(w * 0.15), z.top + Math.round(w * 0.15)],
      [z.right - Math.round(w * 0.15), z.bottom - Math.round(w * 0.15)],
      INK,
    ),
  ];
}

/** A grey triangle in the bottom-right corner of a revealed square. */
export function revealMark(z: Rect): GeometrySpec[] {
  const w = z.right - z.left;
  const m = Math.round(w * 0.15);
  const a: [number, number] = [z.right - m, z.top + m];
  const b: [number, number] = [z.right - m, z.bottom - m];
  const c: [number, number] = [z.left + m, z.bottom - m];
  return [line(a, b, GREY), line(b, c, GREY), line(c, a, GREY)];
}

/** White hairline: keeps a batch update non-empty (an empty insert list is refused). */
export function anchorMark(z: Rect): GeometrySpec[] {
  const y = Math.round((z.top + z.bottom) / 2);
  return [
    {
      type: 'straightLine',
      points: [
        {x: z.left + 4, y},
        {x: z.right - 4, y},
      ],
      penColor: 0xfe,
      penType: 10,
      penWidth: 100,
    },
  ];
}

/** Every mark for the current state: check result (if any) and revealed squares. */
export function marksFor(
  p: GridPuzzle,
  layout: MiniLayout,
  result: CheckResult | null,
  revealed: ReadonlySet<string>,
): GeometrySpec[] {
  const out: GeometrySpec[] = [...anchorMark(layout.anchorZone)];
  if (result) {
    for (const e of p.entries) {
      const b = layout.clueBoxes[e.id];
      if (!b) {
        continue;
      }
      if (result.entries[e.id] === 'right') {
        out.push(...tickMarks(b));
      } else if (result.entries[e.id] === 'wrong') {
        out.push(...crossMarks(b));
      }
    }
    for (const [key, v] of Object.entries(result.cells)) {
      if (v.status === 'wrong' && layout.wrongZones[key]) {
        out.push(...wrongMark(layout.wrongZones[key]));
      }
    }
  }
  for (const key of revealed) {
    if (layout.revealZones[key]) {
      out.push(...revealMark(layout.revealZones[key]));
    }
  }
  return out;
}

/** Is an element with these bounds one of our marks (inside a mark zone)? */
export function inMarkZone(layout: MiniLayout, bounds: Rect): boolean {
  const zones = [
    layout.anchorZone,
    ...Object.values(layout.clueBoxes),
    ...Object.values(layout.wrongZones),
    ...Object.values(layout.revealZones),
  ];
  return zones.some(z => containsRect(outset(z, 4), bounds));
}
