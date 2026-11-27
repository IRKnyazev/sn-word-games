/**
 * Recognition with the split-on-failure fallback. The firmware sometimes
 * fails a group of strokes deterministically (error 117); recognising each
 * half separately often recovers the text (Ink2Task). Calls run one at a
 * time: the firmware handles one recognition at a time.
 */

export interface RecogniseOutcome {
  ok: boolean;
  text?: string;
  code?: number;
  message?: string;
}

/** Recognises a list of strokes in one firmware call. */
export type Recogniser<S> = (strokes: S[]) => Promise<RecogniseOutcome>;

export interface ResilientResult {
  text: string;
  /** Firmware calls made, including retries. */
  calls: number;
  /** Calls that failed, with their error codes. */
  failures: {code?: number; size: number}[];
  /** True if any part could not be recognised even after splitting. */
  partial: boolean;
  ms: number;
}

export interface ResilientOptions {
  maxDepth?: number;
  now?: () => number;
}

export async function recogniseResilient<S>(
  recognise: Recogniser<S>,
  strokes: S[],
  opts: ResilientOptions = {},
): Promise<ResilientResult> {
  const maxDepth = opts.maxDepth ?? 4;
  const now = opts.now ?? Date.now;
  const start = now();
  const result: ResilientResult = {
    text: '',
    calls: 0,
    failures: [],
    partial: false,
    ms: 0,
  };

  const run = async (part: S[], depth: number): Promise<string> => {
    if (part.length === 0) {
      return '';
    }
    result.calls++;
    let outcome: RecogniseOutcome;
    try {
      outcome = await recognise(part);
    } catch (e) {
      outcome = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
    if (outcome.ok) {
      return outcome.text ?? '';
    }
    result.failures.push({code: outcome.code, size: part.length});
    if (part.length < 2 || depth >= maxDepth) {
      result.partial = true;
      return '';
    }
    const mid = Math.ceil(part.length / 2);
    const left = await run(part.slice(0, mid), depth + 1);
    const right = await run(part.slice(mid), depth + 1);
    return left + right;
  };

  result.text = await run(strokes, 0);
  result.ms = now() - start;
  return result;
}
