/** Normalising and scoring recognised text against what was asked for. */

/** Upper-case A–Z only (drops spaces, punctuation, digits). */
export function lettersOnly(text: string | null | undefined): string {
  return (text ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

export interface Score {
  expected: string;
  got: string;
  exact: boolean;
  distance: number;
}

/** Case-insensitive comparison on letters only. */
export function score(expected: string, raw: string | null | undefined): Score {
  const e = lettersOnly(expected);
  const g = lettersOnly(raw);
  return {expected: e, got: g, exact: e === g, distance: editDistance(e, g)};
}

export interface Tally {
  total: number;
  exact: number;
}

export function tally(scores: readonly Score[]): Tally {
  return {total: scores.length, exact: scores.filter(s => s.exact).length};
}

export function percent(t: Tally): string {
  return t.total === 0 ? '—' : `${Math.round((100 * t.exact) / t.total)}%`;
}

/** recognizeElements usually answers a string; log anything else as JSON. */
export function recognisedText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as {text: unknown}).text ?? '');
  }
  return value === null || value === undefined ? '' : JSON.stringify(value);
}
