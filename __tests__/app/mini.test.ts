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
  strokeWithPoints,
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

  it('forgives non-letter look-alikes of the right letter', async () => {
    // Measured misreads: O as "0", S as "5", V as "✓"; lower case is fine.
    const {ctx} = setup(grid({'3-1': '0', '0-3': '5', '2-3': '✓', '2-1': 'l'}));
    expect(await checkPuzzle(ctx)).toMatch(/^Solved!/);
  });

  it('never forgives a different letter (I written where L belongs)', async () => {
    const {ctx} = setup(grid({'1-2': 'I'}));
    const msg = await checkPuzzle(ctx);
    expect(msg).toMatch(/5A read TIIES/);
    expect(msg).toMatch(/3D read AIIKE/);
  });

  it('logs no answers: right squares by status only', async () => {
    const {ctx} = setup(grid({'1-1': 'X'}));
    await checkPuzzle(ctx);
    const log = ctx.lines().join('\n');
    expect(log).toMatch(/square 1-1: wrong \(read X\)/);
    expect(log).toMatch(/square 0-0: right(?! \()/);
    expect(log).not.toMatch(/TOKEN|ALIVE|SPAS|TENT|STAT|SEVEN|SENT/);
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
    // 10 entry calls + one single read: only square 0-0 (in both broken
    // entries) has no word reading; the others are read by their crossing words.
    expect(sdk.recognize.mock.calls.length).toBe(10 + 1);
  });

  it('M1 device case: a weak single reading never overrides the word (I as T, K as V)', async () => {
    // 3D came back "A L I K -" (E as "-"); squares read alone gave T and V.
    const strokes = grid({'4-4': 'I', '1-4': 'S'});
    const {ctx} = setup(strokes, {
      recognize: async (els: Tagged[]) => {
        const text = els.map(e => e.tag).join('');
        if (els.length === 1) {
          return ok({I: 'T', K: 'V'}[text] ?? text);
        }
        return ok(text === 'ALIKE' ? 'A\nL\nI\nK\n-' : text);
      },
    });
    const msg = await checkPuzzle(ctx);
    // Only the deliberate mistake (TENI / SENI) is wrong.
    expect(msg).toMatch(/8 of 10 entries right/);
    expect(msg).toMatch(/9A read TENI/);
    expect(msg).toMatch(/6D read SENI/);
    expect(msg).not.toMatch(/7A|8A|3D/);
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
    const oldMark: ElementLike = {
      ...geometryEl(
        [
          {x: box.left + 10, y: box.top + 10},
          {x: box.right - 10, y: box.bottom - 10},
        ],
        70,
      ),
      geometry: {
        type: 'straightLine',
        penType: 10,
        penColor: 0,
        points: [
          {x: box.left + 10, y: box.top + 10},
          {x: box.right - 10, y: box.bottom - 10},
        ],
      },
    };
    // A shape the owner drew in a clue box with their own pen settings.
    const ownersShapeInBox: ElementLike = {
      ...geometryEl([{x: box.left + 5, y: box.top + 5}], 72),
      geometry: {
        type: 'GEO_polygon',
        penType: 16,
        penColor: 0,
        points: [
          {x: box.left + 5, y: box.top + 5},
          {x: box.right - 5, y: box.bottom - 5},
        ],
      },
    };
    const square = layout.cellRects[2][2]!;
    const usersShape = geometryEl(
      [
        {x: square.left + 60, y: square.top + 60},
        {x: square.right - 60, y: square.bottom - 60},
      ],
      71,
    );
    const strokes = [...grid(), oldMark, usersShape, ownersShapeInBox];
    const {sdk, ctx} = setup(strokes);
    await checkPuzzle(ctx);
    const [nums] = sdk.batchUpdatePageElements.mock.calls[0];
    expect(nums).toEqual([70]);
  });

  it('tidies pen-tap dots on the printed buttons, and nothing else', async () => {
    const check = layout.page.zones.find(z => z.id === 'CHECK')!.rect;
    const square = layout.cellRects[1][1]!;
    const dotOnButton = strokeWithPoints(
      [
        {x: check.left + 100, y: check.top + 60},
        {x: check.left + 103, y: check.top + 62},
      ],
      {numInPage: 80},
    );
    const dotInSquare = strokeWithPoints(
      [
        {x: square.left + 100, y: square.top + 100},
        {x: square.left + 102, y: square.top + 101},
      ],
      {numInPage: 81},
    );
    const lineOverButton = strokeWithPoints(
      [
        {x: check.left + 10, y: check.top + 60},
        {x: check.right - 10, y: check.top + 60},
      ],
      {numInPage: 82},
    );
    const {sdk, ctx} = setup([
      ...grid(),
      dotOnButton,
      dotInSquare,
      lineOverButton,
    ]);
    await checkPuzzle(ctx);
    const [nums] = sdk.batchUpdatePageElements.mock.calls[0];
    expect(nums).toEqual([80]);
  });

  describe('tap-dot tidying edge cases', () => {
    const check = layout.page.zones.find(z => z.id === 'CHECK')!.rect;
    const dotAt = (x: number, y: number, extra = {}) =>
      strokeWithPoints(
        [
          {x, y},
          {x: x + 3, y: y + 2},
        ],
        extra,
      );

    it('keeps dots on another layer, unnumbered strokes, and dense or straddling strokes', async () => {
      const dense = strokeWithPoints(
        Array.from({length: 60}, (_, i) => ({
          x: check.left + 50 + (i % 3),
          y: check.top + 50,
        })),
        {numInPage: 90},
      );
      const straddling = dotAt(check.left - 10, check.top + 40, {
        numInPage: 91,
      });
      const otherLayer = dotAt(check.left + 60, check.top + 60, {
        numInPage: 92,
        layerNum: 1,
      });
      const unnumbered = dotAt(check.left + 80, check.top + 60, {numInPage: 0});
      const {sdk, ctx} = setup([
        ...grid(),
        dense,
        straddling,
        otherLayer,
        unnumbered,
      ]);
      await checkPuzzle(ctx);
      expect(sdk.insertPageElements).toHaveBeenCalled(); // no old marks, nothing deleted
      expect(sdk.batchUpdatePageElements).not.toHaveBeenCalled();
    });

    it("a stroke whose points can't be read is never a dot, and CHECK still works", async () => {
      const broken: ElementLike = {
        uuid: 'broken',
        type: 0,
        layerNum: 0,
        numInPage: 93,
        stroke: {
          penType: 10,
          points: {
            size: async () => {
              throw new Error('206 cache full');
            },
            getRange: async () => [],
          },
        },
      };
      const {sdk, ctx} = setup([...grid(), broken]);
      expect(await checkPuzzle(ctx)).toMatch(/^Solved!/);
      expect(sdk.batchUpdatePageElements).not.toHaveBeenCalled();
    });

    const withDotAndOldMark = () => {
      const box = layout.clueBoxes['1A'];
      const oldMark: ElementLike = {
        ...geometryEl([], 70),
        geometry: {
          type: 'straightLine',
          penType: 10,
          penColor: 0,
          points: [
            {x: box.left + 10, y: box.top + 10},
            {x: box.right - 10, y: box.bottom - 10},
          ],
        },
      };
      return [
        ...grid(),
        oldMark,
        dotAt(check.left + 100, check.top + 60, {numInPage: 80}),
      ];
    };

    it('element list numbered differently but stable: marks replaced, dots left alone', async () => {
      const {sdk, ctx} = setup(withDotAndOldMark(), {
        getElementNumList: async () => ok([1, 2, 3]),
      });
      await checkPuzzle(ctx);
      const [nums] = sdk.batchUpdatePageElements.mock.calls[0];
      expect(nums).toEqual([70]);
    });

    it('element list unavailable: marks replaced, dots left alone', async () => {
      const {sdk, ctx} = setup(withDotAndOldMark(), {
        getElementNumList: async () => fail(100, 'no such API'),
      });
      await checkPuzzle(ctx);
      const [nums] = sdk.batchUpdatePageElements.mock.calls[0];
      expect(nums).toEqual([70]);
    });

    it('page still changing (owner writing): nothing is deleted or inserted', async () => {
      let n = 0;
      const {sdk, ctx} = setup(withDotAndOldMark(), {
        getElementNumList: async () => ok([1000 + n++]),
      });
      const msg = await checkPuzzle(ctx);
      expect(msg).toMatch(/Couldn't update the marks/);
      expect(sdk.batchUpdatePageElements).not.toHaveBeenCalled();
      expect(sdk.insertPageElements).not.toHaveBeenCalled();
    });
  });

  it("doesn't touch the page if the note changed while checking", async () => {
    let calls = 0;
    const {sdk, ctx} = setup(grid(), {
      getCurrentFilePath: async () =>
        ok(++calls > 1 ? '/storage/emulated/0/Note/Diary.note' : NOTE),
    });
    const msg = await checkPuzzle(ctx);
    expect(msg).toMatch(/Couldn't update the marks/);
    expect(sdk.insertPageElements).not.toHaveBeenCalled();
    expect(sdk.batchUpdatePageElements).not.toHaveBeenCalled();
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
    expect(getRoute()).toMatchObject({
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
