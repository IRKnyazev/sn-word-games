/**
 * Per-note puzzle state as JSON in the plugin's private folder (no
 * permission needed there). What's on the page stays the source of truth
 * for the owner's answers; this only remembers checks and reveals.
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

export interface StateStore {
  load(puzzleId: string, notePath: string): Promise<PuzzleState>;
  save(state: PuzzleState): Promise<void>;
}

export function fileStateStore(
  files: Files,
  dir: () => Promise<string | null>,
): StateStore {
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
    async load(puzzleId, notePath) {
      const {file} = await pathFor(notePath);
      if (!(await files.exists(file))) {
        return emptyState(puzzleId, notePath);
      }
      try {
        const parsed = JSON.parse(await files.readUtf8(file)) as PuzzleState;
        if (parsed?.version !== 1 || parsed.puzzleId !== puzzleId) {
          return emptyState(puzzleId, notePath);
        }
        return {...emptyState(puzzleId, notePath), ...parsed};
      } catch {
        return emptyState(puzzleId, notePath);
      }
    },
    async save(state) {
      const {folder, file} = await pathFor(state.notePath);
      await files.mkdir(folder);
      await files.writeUtf8(file, JSON.stringify(state));
    },
  };
}
