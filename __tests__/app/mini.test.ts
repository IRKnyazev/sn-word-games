import {
  checkPuzzle,
  currentPuzzlePage,
  isPuzzleNotePath,
  openReveal,
  puzzleIdFromPath,
  puzzleIdFromTemplate,
  puzzleNotePath,
  recordReveal,
  revealSquares,
  startPuzzle,
} from '../../src/app/mini';
import {inMarkZone} from '../../src/games/mini';
import {miniLayout} from '../../src/layout/mini';
import {cellKey} from '../../src/model/grid';
import {SAMPLE_MINI} from '../../src/puzzles/sample';
import type {ElementLike} from '../../src/sdk/types';
import {getRoute, setRoute} from '../../src/ui/route';
import {
  fail,
  fakeSdk,
  geometryEl,
  memoryStore,
  ok,
  strokeIn,
  testContext,
} from '../helpers/fakes';

type Tagged = ElementLike & {tag?: string};

const NOTE = '/storage/emulated/0/Note/SupernotePuzzles/Mini - sample-1.note';
const layout = miniLayout(SAMPLE_MINI);
const onPuzzle = {
  getCurrentFilePath: async () => ok(NOTE),
  getNotePageTemplate: async () =>
    ok({name: 'user_mini-sample-1-0123456789', md5: 'x'}),
};

/** One stroke per square carrying the letter the fake recogniser will read. */
function grid(letters: Record<string, string> = {}): Tagged[] {
  return layout.page.cells
    .filter(c => letters[c.id] !== '')
    .map(c => strokeIn(c.rect, {tag: letters[c.id] ?? c.expected}));
}

const byTags = async (els: Tagged[]) => ok(els.map(e => e.tag ?? '?').join(''));

function setup(
  strokes: Tagged[],
  extra: Record<string, (...a: any[]) => unknown> = {},
) {
  const sdk = fakeSdk({
    ...onPuzzle,
    getElements: async () => ok(strokes),
    recognize: byTags,
    ...extra,
  });
  const ctx = testContext(sdk);
  return {sdk, ctx, store: ctx.store as ReturnType<typeof memoryStore>};
}

describe('puzzle note paths', () => {
  it('names and recognises puzzle notes', () => {
    expect(puzzleNotePath(SAMPLE_MINI, '/storage/emulated/0')).toBe(NOTE);
    expect(puzzleIdFromPath(NOTE)).toBe('sample-1');
    expect(isPuzzleNotePath(NOTE)).toBe(true);
    expect(isPuzzleNotePath('/storage/emulated/0/Note/Diary.note')).toBe(false);
    expect(
      isPuzzleNotePath(
        '/storage/emulated/0/Note/SupernotePuzzles/Probe x.note',
      ),
    ).toBe(false);
    expect(puzzleIdFromTemplate('user_mini-sample-1-0123456789')).toBe(
      'sample-1',
    );
    expect(puzzleIdFromTemplate('user_p1-letters-8733f9fd31')).toBeNull();
    expect(puzzleIdFromTemplate(undefined)).toBeNull();
  });
});

describe('startPuzzle', () => {
  it('writes the template, creates the note and opens it', async () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    const msg = await startPuzzle(ctx, 'sample-1');
    const [params] = sdk.createNote.mock.calls[0];
    expect(params.notePath).toBe(NOTE);
    expect(params.template).toMatch(
      /MyStyle\/SupernotePuzzles\/mini-sample-1-\w{10}\.png$/,
    );
    expect(sdk.openNote).toHaveBeenCalledWith(NOTE, 0);
    expect(msg).toMatch(/tap CHECK/);
  });

  it('reopens an existing note instead of creating it again', async () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    await ctx.files.writeUtf8(NOTE, '');
    await startPuzzle(ctx, 'sample-1');
    expect(sdk.createNote).not.toHaveBeenCalled();
    expect(sdk.openNote).toHaveBeenCalledWith(NOTE, 0);
  });

  it('explains 102 and unknown puzzles', async () => {
    const sdk = fakeSdk({createNote: async () => fail(102, 'not allowed')});
    expect(await startPuzzle(testContext(sdk), 'sample-1')).toMatch(
      /Open any note first/,
    );
    expect(await startPuzzle(testContext(), 'nope')).toMatch(/Unknown puzzle/);
  });
});

describe('currentPuzzlePage', () => {
  it('finds the puzzle by template name, or by file name', async () => {
    const byTemplate = await currentPuzzlePage(testContext(fakeSdk(onPuzzle)));
    expect(typeof byTemplate === 'object' && byTemplate.puzzle.id).toBe(
      'sample-1',
    );
    const byPath = await currentPuzzlePage(
      testContext(fakeSdk({getCurrentFilePath: async () => ok(NOTE)})),
    );
    expect(typeof byPath === 'object' && byPath.puzzle.id).toBe('sample-1');
  });

  it('says when the page is not a puzzle', async () => {
    expect(await currentPuzzlePage(testContext())).toMatch(/not a puzzle/);
  });
});

describe('checkPuzzle', () => {
  it('solves a correctly filled grid with one call per entry', async () => {
    const {sdk, ctx, store} = setup(grid());
    const msg = await checkPuzzle(ctx);
    expect(msg).toMatch(/^Solved!/);
    expect(sdk.recognize).toHaveBeenCalledTimes(SAMPLE_MINI.entries.length);
    // No old marks: one plain insert of anchor + a tick (2 lines) per entry.
    const [inserted] = sdk.insertPageElements.mock.calls[0];
    expect(inserted).toHaveLength(1 + 2 * SAMPLE_MINI.entries.length);
    expect(sdk.batchUpdatePageElements).not.toHaveBeenCalled();
    expect(sdk.saveCurrentNote).not.toHaveBeenCalled();
    const s = store.states.get(NOTE)!;
    expect(s.checks).toBe(1);
    expect(s.solvedAt).not.toBeNull();
    expect(s.lastCheck?.solved).toBe(true);
  });

  it('marks a wrong square and both its entries', async () => {
    const {sdk, ctx} = setup(grid({'1-1': 'X'}));
    const msg = await checkPuzzle(ctx);
    expect(msg).toMatch(/8 of 10 entries right/);
    expect(msg).toMatch(/5A read TXLES/);
    expect(msg).toMatch(/2D read PXLOT/);
    const specs = sdk.createGeometryElement.mock.calls.map(([spec]) => spec);
    const zone = layout.wrongZones['1-1'];
    expect(
      specs.some(sp =>
        sp.points.every(
          (p: {x: number; y: number}) =>
            p.x >= zone.left &&
            p.x <= zone.right &&
            p.y >= zone.top &&
            p.y <= zone.bottom,
        ),
      ),
    ).toBe(true);
  });

  it('forgives look-alikes of the right letter', async () => {
    // O in TOKEN and Z/... read as digits; Y absent; X... use measured misreads.
    const {ctx} = setup(grid({'3-1': '0', '2-1': 'l', '1-2': '1'}));
    expect(await checkPuzzle(ctx)).toMatch(/^Solved!/);
  });

  it('reads square by square when an entry comes back with the wrong letter count', async () => {
    const strokes = grid();
    const {sdk, ctx} = setup(strokes, {
      // Entries that include square 0-0 come back with an extra letter.
      recognize: async (els: Tagged[]) =>
        ok(
          els.length > 1 && els[0].tag === 'S' && els.includes(strokes[0])
            ? `${els.map(e => e.tag).join('')}Q`
            : els.map(e => e.tag).join(''),
        ),
    });
    const msg = await checkPuzzle(ctx);
    expect(msg).toMatch(/^Solved!/);
    // 10 entry calls + single reads for the squares of 1A and 1D (7 squares, one shared).
    expect(sdk.recognize.mock.calls.length).toBe(10 + 7);
  });

  it('reports empty and unreadable squares without calling them wrong', async () => {
    const {ctx} = setup(grid({'0-0': '', '4-4': '?'}), {
      recognize: async (els: Tagged[]) =>
        ok(els.map(e => (e.tag === '?' ? '' : e.tag)).join('')),
    });
    const msg = await checkPuzzle(ctx);
    expect(msg).toMatch(/1 empty square\./);
    expect(msg).toMatch(/Couldn't read: row 5 col 5/);
    expect(msg).not.toMatch(/Wrong:/);
  });

  it('replaces only our marks: never strokes, never geometry outside mark zones', async () => {
    const box = layout.clueBoxes['5A'];
    const oldMark = geometryEl(
      [
        {x: box.left + 10, y: box.top + 10},
        {x: box.right - 10, y: box.bottom - 10},
      ],
      70,
    );
    const square = layout.cellRects[2][2]!;
    const usersShape = geometryEl(
      [
        {x: square.left + 60, y: square.top + 60},
        {x: square.right - 60, y: square.bottom - 60},
      ],
      71,
    );
    const strokes = [...grid(), oldMark, usersShape];
    const {sdk, ctx} = setup(strokes);
    await checkPuzzle(ctx);
    const [nums] = sdk.batchUpdatePageElements.mock.calls[0];
    expect(nums).toEqual([70]);
  });

  it('says when it is not on a puzzle page', async () => {
    const sdk = fakeSdk();
    expect(await checkPuzzle(testContext(sdk))).toMatch(/not a puzzle/);
    expect(sdk.getElements).not.toHaveBeenCalled();
  });
});

describe('reveal', () => {
  it('records reveals and draws grey triangles', async () => {
    const {sdk, ctx, store} = setup([]);
    await recordReveal(ctx, 'sample-1', NOTE, ['0-0', '0-1']);
    await recordReveal(ctx, 'sample-1', NOTE, ['0-1']);
    expect(store.states.get(NOTE)!.revealed).toEqual(['0-0', '0-1']);
    await revealSquares(ctx, []);
    const specs = sdk.createGeometryElement.mock.calls.map(([spec]) => spec);
    // anchor + 3 lines per revealed square
    expect(specs).toHaveLength(1 + 3 * 2);
    expect(specs.slice(1).every(s => s.penColor === 0x9d)).toBe(true);
    const marks = specs.slice(1).map(s => ({
      left: Math.min(...s.points.map((p: any) => p.x)),
      top: Math.min(...s.points.map((p: any) => p.y)),
      right: Math.max(...s.points.map((p: any) => p.x)),
      bottom: Math.max(...s.points.map((p: any) => p.y)),
    }));
    expect(marks.every(m => inMarkZone(layout, m))).toBe(true);
  });

  it('REVEAL on the page opens the reveal screen for this note', async () => {
    setRoute({screen: 'menu'});
    const sdk = fakeSdk(onPuzzle);
    await openReveal(testContext(sdk));
    expect(getRoute()).toEqual({
      screen: 'reveal',
      puzzleId: 'sample-1',
      notePath: NOTE,
    });
    expect(sdk.showPluginView).toHaveBeenCalled();
    setRoute({screen: 'menu'});
  });

  it('REVEAL off a puzzle page does nothing', async () => {
    setRoute({screen: 'menu'});
    const sdk = fakeSdk();
    await openReveal(testContext(sdk));
    expect(getRoute()).toEqual({screen: 'menu'});
    expect(sdk.showPluginView).not.toHaveBeenCalled();
  });
});

it('every square of the sample is covered by the layout', () => {
  const ids = new Set(layout.page.cells.map(c => c.id));
  for (const e of SAMPLE_MINI.entries) {
    for (const c of e.cells) {
      expect(ids.has(cellKey(c))).toBe(true);
    }
  }
});
