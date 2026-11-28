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
 * Non-letter characters the recogniser returned for a handwritten capital in
 * M0. A letter reading is always taken at face value (case-insensitive); only
 * these non-letters are read as look-alikes, so a wrong letter is never
 * forgiven (M1 review: I and L both reading "1" must not pass).
 */
export const LOOKALIKES: Readonly<Record<string, readonly string[]>> = {
  B: ['8'],
  D: ['>'],
  G: ['6'],
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
  '>': 'D',
  '✓': 'V',
  '√': 'V',
  '✗': 'X',
  '×': 'X',
};

const LOOKALIKE_CHARS = new Set(Object.values(LOOKALIKES).flat());

export function isLetter(ch: string | undefined): ch is string {
  return !!ch && /^[a-z]$/i.test(ch);
}

/** Does a recognised character stand for `answer` (A–Z)? Letters must match exactly. */
export function matchesLetter(read: string, answer: string): boolean {
  if (!read) {
    return false;
  }
  const a = answer.toUpperCase();
  if (isLetter(read)) {
    return read.toUpperCase() === a;
  }
  return (LOOKALIKES[a] ?? []).includes(read);
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
    ch => isLetter(ch) || LOOKALIKE_CHARS.has(ch),
  );
}

/**
 * Characters the recogniser returns for a letter it couldn't make out (M1:
 * the E of ALIKE came back as "-"). They hold a square's place in an entry
 * but give it no reading.
 */
export const PLACEHOLDERS: ReadonlySet<string> = new Set(['-', '_', '?']);

/**
 * Splits an entry's reading over its squares: the tokens go, in order, to the
 * squares that have ink. Returns null when the counts differ (then each
 * square is read on its own). If the letters alone don't fit, placeholder
 * characters in `text` are tried as unreadable squares.
 */
export function mapEntryToCells(
  tokens: readonly string[],
  hasInk: readonly boolean[],
  text?: string | null,
): (string | null)[] | null {
  const filled = hasInk.filter(Boolean).length;
  if (filled === 0) {
    return null;
  }
  const spread = (ts: readonly (string | null)[]) => {
    let t = 0;
    return hasInk.map(ink => (ink ? ts[t++] : null));
  };
  if (tokens.length === filled) {
    return spread(tokens);
  }
  const withGaps = [...(text ?? '')]
    .filter(
      ch => isLetter(ch) || LOOKALIKE_CHARS.has(ch) || PLACEHOLDERS.has(ch),
    )
    .map(ch => (PLACEHOLDERS.has(ch) ? null : ch));
  return text && withGaps.length === filled ? spread(withGaps) : null;
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
 * Judges one square from its readings. Word readings (across, down) are much
 * more reliable than a square read on its own (M0/M1: ~96% vs ~80%), so:
 *
 * - Letters are taken literally. If the word readings agree on a letter, it
 *   decides; a single reading never overrides it.
 * - If across and down read different letters, the single reading picks
 *   between them; if it matches neither, the square counts as unread.
 * - With no word reading, a single letter reading decides.
 * - Only when no letter was read at all is a non-letter look-alike of the
 *   answer (0 for O, 2 for Z, ...) forgiven.
 * - `read` is what the ink was read as, never the answer itself (unless the
 *   ink was read as exactly that letter).
 */
export function judgeCell(r: CellReadings, answer: string): CellVerdict {
  if (!r.hasInk) {
    return {status: 'empty', read: ''};
  }
  const a = answer.toUpperCase();
  const verdict = (letter: string): CellVerdict => ({
    status: letter === a ? 'right' : 'wrong',
    read: letter,
  });
  const word = [
    ...new Set([r.across, r.down].filter(isLetter).map(c => c.toUpperCase())),
  ];
  const single = isLetter(r.single) ? r.single.toUpperCase() : undefined;
  if (word.length === 1) {
    return verdict(word[0]);
  }
  if (word.length > 1) {
    return single && word.includes(single)
      ? verdict(single)
      : {status: 'unread', read: ''};
  }
  if (single) {
    return verdict(single);
  }
  const candidates = [r.across, r.down, r.single].filter(
    (c): c is string => !!c,
  );
  if (candidates.length === 0) {
    return {status: 'unread', read: ''};
  }
  const lookalike = candidates.find(c => matchesLetter(c, a));
  if (lookalike) {
    return {status: 'right', read: displayChar(lookalike)};
  }
  return {status: 'wrong', read: displayChar(candidates[0])};
}

/** Squares whose across and down readings are different letters (read them alone). */
export function conflicting(r: CellReadings): boolean {
  return (
    isLetter(r.across) &&
    isLetter(r.down) &&
    r.across.toUpperCase() !== r.down.toUpperCase()
  );
}
