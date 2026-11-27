/**
 * Reading whole entries and judging squares (decision of 2026-11-27, from the
 * M0 results). Pure.
 *
 * The firmware recogniser reads words well but single letters badly: blanks
 * for simple shapes and look-alike characters for others. So an entry is read
 * in one go and its letters mapped back to the squares, and a look-alike of
 * the right letter counts as right.
 */

/**
 * Characters the recogniser returned for a handwritten capital in M0 (plus
 * the lower-case letter). Used only when comparing with a known answer.
 */
export const LOOKALIKES: Readonly<Record<string, readonly string[]>> = {
  B: ['8'],
  D: ['>'],
  G: ['6'],
  I: ['1', 'l', '|', '!'],
  K: ['v'],
  L: ['1', '|'],
  O: ['0'],
  S: ['5', '$'],
  V: ['✓', '√'],
  X: ['✗', '×', '/'],
  Y: ['1', '/'],
  Z: ['2'],
};

/** Unambiguous look-alikes shown as the letter they stand for. */
const DISPLAY: Readonly<Record<string, string>> = {
  '0': 'O',
  '2': 'Z',
  '5': 'S',
  '6': 'G',
  '8': 'B',
  $: 'S',
  '✓': 'V',
  '√': 'V',
  '✗': 'X',
  '×': 'X',
};

const LOOKALIKE_CHARS = new Set(Object.values(LOOKALIKES).flat());

/** Does a recognised character stand for `answer` (A–Z)? */
export function matchesLetter(read: string, answer: string): boolean {
  if (!read) {
    return false;
  }
  const a = answer.toUpperCase();
  return read.toUpperCase() === a || (LOOKALIKES[a] ?? []).includes(read);
}

/** How to show a recognised character: letters upper-cased, clear look-alikes mapped. */
export function displayChar(read: string): string {
  if (/^[a-z]$/i.test(read)) {
    return read.toUpperCase();
  }
  return DISPLAY[read] ?? read;
}

/**
 * The characters of a recognised string that could be letters: A–Z in either
 * case and known look-alikes. Spaces, line breaks and other punctuation
 * (e.g. a stray dot) are dropped.
 */
export function letterTokens(text: string | null | undefined): string[] {
  return [...(text ?? '')].filter(
    ch => /^[a-z]$/i.test(ch) || LOOKALIKE_CHARS.has(ch),
  );
}

/**
 * Splits an entry's reading over its squares: the tokens go, in order, to the
 * squares that have ink. Returns null when the counts differ (then each
 * square is read on its own).
 */
export function mapEntryToCells(
  tokens: readonly string[],
  hasInk: readonly boolean[],
): (string | null)[] | null {
  const filled = hasInk.filter(Boolean).length;
  if (filled === 0 || tokens.length !== filled) {
    return null;
  }
  let t = 0;
  return hasInk.map(ink => (ink ? tokens[t++] : null));
}

export type CellStatus = 'right' | 'wrong' | 'empty' | 'unread';

export interface CellReadings {
  hasInk: boolean;
  across?: string;
  down?: string;
  single?: string;
}

export interface CellVerdict {
  status: CellStatus;
  /** What the plugin read, as shown to the owner ('' if nothing). */
  read: string;
}

/**
 * Judges one square from its readings. Any reading that is the answer or a
 * look-alike of it makes the square right; otherwise the first reading is
 * shown as what was read.
 */
export function judgeCell(r: CellReadings, answer: string): CellVerdict {
  if (!r.hasInk) {
    return {status: 'empty', read: ''};
  }
  const candidates = [r.across, r.down, r.single].filter(
    (c): c is string => !!c,
  );
  if (candidates.length === 0) {
    return {status: 'unread', read: ''};
  }
  if (candidates.some(c => matchesLetter(c, answer))) {
    return {status: 'right', read: answer.toUpperCase()};
  }
  return {status: 'wrong', read: displayChar(candidates[0])};
}
