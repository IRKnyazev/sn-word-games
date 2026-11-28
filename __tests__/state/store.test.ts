import {judgePuzzle} from '../../src/games/mini';
import {cellKey, whiteCells} from '../../src/model/grid';
import {SAMPLE_MINI} from '../../src/puzzles/sample';
import type {Files} from '../../src/sdk/types';
import {
  emptyState,
  fileStateStore,
  stateFileName,
  type PuzzleState,
} from '../../src/state/store';

/** In-memory Files: a map of path → text, and a set of folders. */
class MemoryFiles implements Files {
  readonly externalRoot = '/storage/emulated/0';
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();
  readFails = false;

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }
  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }
  /** Not used by the state store; kept as the raw base64 text. */
  async writeBase64(path: string, base64: string): Promise<void> {
    this.files.set(path, base64);
  }
  async writeUtf8(path: string, text: string): Promise<void> {
    const folder = path.slice(0, path.lastIndexOf('/'));
    if (!this.dirs.has(folder)) {
      throw new Error(`ENOENT: no folder ${folder}`);
    }
    this.files.set(path, text);
  }
  async appendUtf8(path: string, text: string): Promise<void> {
    this.files.set(path, (this.files.get(path) ?? '') + text);
  }
  async readUtf8(path: string): Promise<string> {
    const text = this.files.get(path);
    if (this.readFails || text === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return text;
  }
  async size(path: string): Promise<number> {
    return (this.files.get(path) ?? '').length;
  }
  async move(from: string, to: string): Promise<void> {
    const text = this.files.get(from);
    if (text === undefined) {
      throw new Error(`ENOENT: ${from}`);
    }
    this.files.delete(from);
    this.files.set(to, text);
  }
}

const PLUGIN_DIR = '/data/plugins/puzzles';
const NOTE = '/storage/emulated/0/Note/SupernotePuzzles/Mini - sample-1.note';
const STATE_FILE = `${PLUGIN_DIR}/state/Mini_-_sample-1.json`;

const setup = (dir: string | null = PLUGIN_DIR) => {
  const files = new MemoryFiles();
  const store = fileStateStore(files, async () => dir);
  return {files, store};
};

describe('emptyState', () => {
  it('starts with nothing revealed, no checks and not solved', () => {
    expect(emptyState('sample-1', NOTE)).toEqual({
      version: 1,
      puzzleId: 'sample-1',
      notePath: NOTE,
      revealed: [],
      lastCheck: null,
      checks: 0,
      solvedAt: null,
    });
  });

  it('returns a fresh object each time', () => {
    const a = emptyState('x', 'y');
    a.revealed.push('0-0');
    expect(emptyState('x', 'y').revealed).toEqual([]);
  });
});

describe('stateFileName', () => {
  it('uses the note file name without its folder or .note', () => {
    expect(stateFileName('/Note/Puzzles/today.note')).toBe('today.json');
    expect(stateFileName('today.note')).toBe('today.json');
  });

  it('strips .note in any case', () => {
    expect(stateFileName('/Note/TODAY.NOTE')).toBe('TODAY.json');
    expect(stateFileName('/Note/a.Note')).toBe('a.json');
  });

  it('only strips .note at the end', () => {
    expect(stateFileName('/Note/a.note.bak')).toBe('a.note.bak.json');
    expect(stateFileName('/Note/notes')).toBe('notes.json');
  });

  it('replaces runs of unsafe characters with one underscore', () => {
    expect(stateFileName(NOTE)).toBe('Mini_-_sample-1.json');
    expect(stateFileName('/Note/My Puzzle (1).note')).toBe('My_Puzzle_1_.json');
    expect(stateFileName('/Note/a:b*c?d"e<f>g|h.note')).toBe(
      'a_b_c_d_e_f_g_h.json',
    );
    expect(stateFileName('/Note/Café №5.note')).toBe('Caf_5.json');
  });

  it('keeps letters, digits, dots, underscores and hyphens', () => {
    expect(stateFileName('/x/Ab9._-z.note')).toBe('Ab9._-z.json');
  });

  it.each([
    NOTE,
    '/Note/My Puzzle (1).note',
    '/Note/über/ß ✓ 日本.note',
    'C:\\Notes\\win.note',
    '/Note/..note',
  ])('always gives a safe file name for %s', path => {
    expect(stateFileName(path)).toMatch(/^[A-Za-z0-9._-]*\.json$/);
    expect(stateFileName(path)).not.toContain('/');
  });
});

describe('fileStateStore', () => {
  it('loads an empty state when there is no file yet', async () => {
    const {store, files} = setup();
    await expect(store.load('sample-1', NOTE)).resolves.toEqual(
      emptyState('sample-1', NOTE),
    );
    expect(files.files.size).toBe(0);
  });

  it('saves into a state folder in the plugin folder', async () => {
    const {store, files} = setup();
    await store.save(emptyState('sample-1', NOTE));
    expect(files.dirs.has(`${PLUGIN_DIR}/state`)).toBe(true);
    expect([...files.files.keys()]).toEqual([STATE_FILE]);
    expect(JSON.parse(files.files.get(STATE_FILE) ?? '')).toEqual(
      emptyState('sample-1', NOTE),
    );
  });

  it('round-trips a saved state, check result included', async () => {
    const {store} = setup();
    const readings = Object.fromEntries(
      whiteCells(SAMPLE_MINI).map(c => [
        cellKey(c),
        {hasInk: true, across: 'Q'},
      ]),
    );
    const state: PuzzleState = {
      ...emptyState('sample-1', NOTE),
      revealed: ['0-0', '2-2'],
      lastCheck: judgePuzzle(SAMPLE_MINI, readings, 1_700_000_000_000),
      checks: 3,
      solvedAt: 1_700_000_100_000,
    };
    await store.save(state);
    await expect(store.load('sample-1', NOTE)).resolves.toEqual(state);
  });

  it('overwrites the previous save', async () => {
    const {store} = setup();
    await store.save({...emptyState('sample-1', NOTE), checks: 1});
    await store.save({...emptyState('sample-1', NOTE), checks: 2});
    expect((await store.load('sample-1', NOTE)).checks).toBe(2);
  });

  it('keeps notes with different names apart', async () => {
    const {store} = setup();
    const other =
      '/storage/emulated/0/Note/SupernotePuzzles/Mini - sample-2.note';
    await store.save({...emptyState('sample-1', NOTE), checks: 5});
    await expect(store.load('sample-1', other)).resolves.toEqual(
      emptyState('sample-1', other),
    );
  });

  it('loads an empty state from a corrupt file', async () => {
    const {store, files} = setup();
    await files.mkdir(`${PLUGIN_DIR}/state`);
    for (const junk of ['{not json', '', 'null', '42', '"text"', '[]']) {
      files.files.set(STATE_FILE, junk);
      await expect(store.load('sample-1', NOTE)).resolves.toEqual(
        emptyState('sample-1', NOTE),
      );
    }
  });

  it('loads an empty state when the file cannot be read', async () => {
    const {store, files} = setup();
    await store.save({...emptyState('sample-1', NOTE), checks: 4});
    files.readFails = true;
    await expect(store.load('sample-1', NOTE)).resolves.toEqual(
      emptyState('sample-1', NOTE),
    );
  });

  it('loads an empty state when the file is for another puzzle', async () => {
    const {store} = setup();
    await store.save({
      ...emptyState('sample-2', NOTE),
      revealed: ['1-1'],
      checks: 2,
    });
    await expect(store.load('sample-1', NOTE)).resolves.toEqual(
      emptyState('sample-1', NOTE),
    );
  });

  it('loads an empty state from a file of another version', async () => {
    const {store, files} = setup();
    await files.mkdir(`${PLUGIN_DIR}/state`);
    files.files.set(
      STATE_FILE,
      JSON.stringify({
        ...emptyState('sample-1', NOTE),
        version: 2,
        checks: 9,
      }),
    );
    await expect(store.load('sample-1', NOTE)).resolves.toEqual(
      emptyState('sample-1', NOTE),
    );
  });

  it.each([
    ['revealed is not a list', {revealed: 'oops'}],
    ['revealed is null', {revealed: null}],
    ['checks is not a number', {checks: 'three'}],
    ['solvedAt is not a number', {solvedAt: 'yesterday'}],
    ['lastCheck is not an object', {lastCheck: 'none'}],
  ])('never hands back a field of the wrong type (%s)', async (_name, bad) => {
    const {store, files} = setup();
    await files.mkdir(`${PLUGIN_DIR}/state`);
    files.files.set(
      STATE_FILE,
      JSON.stringify({...emptyState('sample-1', NOTE), checks: 2, ...bad}),
    );
    const s = await store.load('sample-1', NOTE);
    expect(s.version).toBe(1);
    expect(s.puzzleId).toBe('sample-1');
    expect(s.notePath).toBe(NOTE);
    expect(Array.isArray(s.revealed)).toBe(true);
    expect(typeof s.checks).toBe('number');
    expect(s.solvedAt === null || typeof s.solvedAt === 'number').toBe(true);
    expect(s.lastCheck === null || typeof s.lastCheck === 'object').toBe(true);
  });

  it('rejects load when there is no plugin folder', async () => {
    const {store} = setup(null);
    await expect(store.load('sample-1', NOTE)).rejects.toThrow(
      'no plugin folder for state',
    );
  });

  it('rejects save when there is no plugin folder, writing nothing', async () => {
    const {store, files} = setup(null);
    await expect(store.save(emptyState('sample-1', NOTE))).rejects.toThrow(
      'no plugin folder for state',
    );
    expect(files.files.size).toBe(0);
    expect(files.dirs.size).toBe(0);
  });

  it('treats an empty plugin folder path as missing', async () => {
    const {store} = setup('');
    await expect(store.load('sample-1', NOTE)).rejects.toThrow(
      'no plugin folder for state',
    );
  });
});
