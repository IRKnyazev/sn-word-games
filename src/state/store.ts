/**
 * Per-note puzzle state as JSON in the plugin's private folder (no
 * permission needed there). The page stays the source of truth for the
 * owner's answers (and for reveal marks, which CHECK reads back); this only
 * remembers checks and reveals.
 */
import type {CheckResult} from '../games/mini';
import type {Files} from '../sdk/types';

export interface PuzzleState {
  version: 1;
  puzzleId: string;
  notePath: string;
  /** Cell keys ("row-col") revealed so far. */
  revealed: string[];
  lastCheck: CheckResult | null;
  checks: number;
  solvedAt: number | null;
}

export function emptyState(puzzleId: string, notePath: string): PuzzleState {
  return {
    version: 1,
    puzzleId,
    notePath,
    revealed: [],
    lastCheck: null,
    checks: 0,
    solvedAt: null,
  };
}

/** File name for a note's state: its file name, made safe. */
export function stateFileName(notePath: string): string {
  const base = notePath
    .slice(notePath.lastIndexOf('/') + 1)
    .replace(/\.note$/i, '');
  return `${base.replace(/[^A-Za-z0-9._-]+/g, '_')}.json`;
}

/** Keeps only well-formed fields from a parsed file; anything odd is reset. */
export function sanitiseState(
  raw: unknown,
  puzzleId: string,
  notePath: string,
): PuzzleState {
  const s = emptyState(puzzleId, notePath);
  if (!raw || typeof raw !== 'object') {
    return s;
  }
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || r.puzzleId !== puzzleId) {
    return s;
  }
  if (
    Array.isArray(r.revealed) &&
    r.revealed.every(k => typeof k === 'string')
  ) {
    s.revealed = r.revealed as string[];
  }
  if (typeof r.checks === 'number' && Number.isFinite(r.checks)) {
    s.checks = r.checks;
  }
  if (typeof r.solvedAt === 'number' && Number.isFinite(r.solvedAt)) {
    s.solvedAt = r.solvedAt;
  }
  const lc = r.lastCheck as Record<string, unknown> | null | undefined;
  if (
    lc &&
    typeof lc === 'object' &&
    lc.cells &&
    typeof lc.cells === 'object' &&
    lc.entries &&
    typeof lc.entries === 'object'
  ) {
    s.lastCheck = lc as unknown as CheckResult;
  }
  return s;
}

export interface StateStore {
  load(puzzleId: string, notePath: string): Promise<PuzzleState>;
  save(state: PuzzleState): Promise<void>;
}

export function fileStateStore(
  files: Files,
  dir: () => Promise<string | null>,
): StateStore {
  // One load/save at a time, so CHECK and REVEAL can't interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
  };
  const pathFor = async (notePath: string) => {
    const base = await dir();
    if (!base) {
      throw new Error('no plugin folder for state');
    }
    return {
      folder: `${base}/state`,
      file: `${base}/state/${stateFileName(notePath)}`,
    };
  };
  return {
    load(puzzleId, notePath) {
      return serial(async () => {
        const {file} = await pathFor(notePath);
        if (!(await files.exists(file))) {
          return emptyState(puzzleId, notePath);
        }
        try {
          return sanitiseState(
            JSON.parse(await files.readUtf8(file)),
            puzzleId,
            notePath,
          );
        } catch {
          return emptyState(puzzleId, notePath);
        }
      });
    },
    save(state) {
      return serial(async () => {
        const {folder, file} = await pathFor(state.notePath);
        await files.mkdir(folder);
        // Write a temporary file and move it, so a crash can't leave half a file.
        await files.writeUtf8(`${file}.tmp`, JSON.stringify(state));
        await files.move(`${file}.tmp`, file);
      });
    },
  };
}
