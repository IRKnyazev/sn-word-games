import type {Point, Rect, Size} from './geometry';

/** Grey level for printing: 0 = black, 255 = white. */
export type Grey = number;

export type Shape =
  | {kind: 'rect'; rect: Rect; strokeWidth?: number; stroke?: Grey; fill?: Grey}
  | {kind: 'line'; from: Point; to: Point; width: number; grey?: Grey}
  | {
      kind: 'text';
      at: Point;
      text: string;
      size: number;
      weight?: 400 | 600 | 700;
      anchor?: 'start' | 'middle' | 'end';
      grey?: Grey;
    };

/**
 * A place where the user writes and the plugin reads.
 * `letter` = one character in a box; `line` = a word on a ruled line.
 */
export interface Cell {
  id: string;
  kind: 'letter' | 'line';
  rect: Rect;
  /** What the probe asks the user to write here (ground truth), if known. */
  expected?: string;
}

/** Cells read together (a row, a word, a section). */
export interface Group {
  id: string;
  level: 'word' | 'section';
  label: string;
  cellIds: string[];
}

/** A printed button tapped with the finger (or pen). */
export interface Zone {
  id: string;
  label: string;
  rect: Rect;
}

export interface PageLayout {
  id: string;
  title: string;
  size: Size;
  /** Everything printed on the template, in drawing order. */
  shapes: Shape[];
  cells: Cell[];
  groups: Group[];
  zones: Zone[];
  /** Named areas the probes use (P2 target, P6 marks area). */
  areas: Record<string, Rect>;
}
