/**
 * One result shape for every SDK call. The SDK mixes styles: most calls
 * resolve {success, result, error}, some resolve plain values, some throw,
 * and a few never resolve in some contexts (e.g. getCurrentFilePath when
 * opened from Settings). `call` normalises all of these and times them.
 */

export type Res<T> =
  | {ok: true; value: T; ms: number}
  | {ok: false; code?: number; message: string; ms: number};

export interface CallOptions {
  /** The call returns a plain value instead of {success, result, error}. */
  plain?: boolean;
  /** Best-effort guard; timers can stall after the plugin view was shown. */
  timeoutMs?: number;
  now?: () => number;
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number | undefined,
): Promise<T> {
  if (!ms || ms <= 0) {
    return promise;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Turn a raw SDK response into a Res (exported for tests). */
export function normalise<T>(raw: unknown, plain: boolean, ms: number): Res<T> {
  if (plain) {
    return {ok: true, value: raw as T, ms};
  }
  if (!isRecord(raw) || !('success' in raw)) {
    if (raw === null || raw === undefined) {
      return {ok: false, message: 'no response', ms};
    }
    // Some calls (e.g. getPageDisplaySize) may answer with a bare value.
    return {ok: true, value: raw as T, ms};
  }
  if (raw.success === true) {
    return {ok: true, value: raw.result as T, ms};
  }
  const err = isRecord(raw.error) ? raw.error : {};
  const code = typeof err.code === 'number' ? err.code : undefined;
  const message = typeof err.message === 'string' ? err.message : 'failed';
  return {ok: false, code, message, ms};
}

export async function call<T>(
  fn: () => unknown,
  opts: CallOptions = {},
): Promise<Res<T>> {
  const now = opts.now ?? Date.now;
  const start = now();
  try {
    const raw = await withTimeout(
      Promise.resolve().then(fn),
      opts.timeoutMs ?? 15000,
    );
    return normalise<T>(raw, opts.plain ?? false, now() - start);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      ms: now() - start,
    };
  }
}

/** Short text for logs: "ok 12ms" or "ERR 117 Recognition failed 340ms". */
export function describe(res: Res<unknown>): string {
  return res.ok
    ? `ok ${res.ms}ms`
    : `ERR ${res.code ?? '-'} ${res.message} ${res.ms}ms`;
}

/** insertGeometry answers 0 (Tables) or a truthy value (Snap) on success. */
export function insertSucceeded(res: Res<unknown>): boolean {
  return (
    res.ok && res.value !== false && res.value !== -1 && res.value !== null
  );
}
