import {probePages} from '../../src/layout/probe';
import {emrMaxFor} from '../../src/ink/frame';
import type {Point} from '../../src/layout/geometry';
import {readProbePage, recognisedText} from '../../src/probes/p1';
import type {ElementLike} from '../../src/sdk/types';
import {
  fail,
  fakeSdk,
  ok,
  strokeIn,
  strokeWithPoints,
  testContext,
} from '../helpers/fakes';

type Tagged = ElementLike & {tag?: string};

/** Recogniser fake: the text is the tags of the strokes, in order. */
const byTags = async (els: Tagged[]) => ok(els.map(e => e.tag ?? '?').join(''));

function pxToEmr(p: Point): Point {
  const max = emrMaxFor({width: 1920, height: 2560})!;
  return {x: (p.y * max.maxX) / 2559, y: ((1919 - p.x) * max.maxY) / 1919};
}

describe('readProbePage', () => {
  const [letters, words] = probePages();

  it('reads every cell, row and section of page 1 and scores them', async () => {
    const strokes = letters.cells.map(c => strokeIn(c.rect, {tag: c.expected}));
    const sdk = fakeSdk({
      getElements: async () => ok(strokes),
      recognize: byTags,
    });
    const ctx = testContext(sdk);
    const summary = await readProbePage(ctx, 'menu');
    expect(summary).toContain('per cell: 52/52 (100%)');
    expect(summary).toContain('per word/row: 5/5 (100%)');
    expect(summary).toContain('per section: 2/2 (100%)');
    expect(sdk.recycle).toHaveBeenCalledWith(strokes);
    expect(sdk.saveCurrentNote).not.toHaveBeenCalled();
  });

  it('marks misreads and failed recognitions', async () => {
    const strokes = letters.cells.map(c =>
      strokeIn(c.rect, {tag: c.id === 'A-Q' ? 'O' : c.expected}),
    );
    const sdk = fakeSdk({
      getElements: async () => ok(strokes),
      recognize: async (els: Tagged[]) =>
        els.length > 20 ? fail(117, 'Recognition failed') : byTags(els),
    });
    const ctx = testContext(sdk);
    const summary = await readProbePage(ctx, 'button');
    expect(summary).toContain('per cell: 51/52');
    expect(summary).toMatch(/failures 117×\d+/);
    expect(
      ctx.lines().some(l => l.includes('BAD cell A-Q expected=Q got="O"')),
    ).toBe(true);
  });

  it('maps EMR coordinates when the SDK returns them', async () => {
    const strokes = letters.cells.slice(0, 9).map(c => {
      const pts = [
        {x: c.rect.left + 40, y: c.rect.top + 40},
        {x: c.rect.right - 40, y: c.rect.bottom - 40},
      ].map(pxToEmr);
      return strokeWithPoints(pts, {tag: c.expected});
    });
    const sdk = fakeSdk({
      getElements: async () => ok(strokes),
      recognize: byTags,
    });
    const ctx = testContext(sdk);
    const summary = await readProbePage(ctx, 'menu');
    expect(summary).toContain('frame emr');
    expect(summary).toContain('per cell: 9/9');
  });

  it('reads words written on lines on page 2', async () => {
    const lineCells = words.cells.filter(c => c.kind === 'line');
    const strokes = lineCells.map(c => strokeIn(c.rect, {tag: c.expected}));
    const sdk = fakeSdk({
      getCurrentPageNum: async () => ok(1),
      getElements: async () => ok(strokes),
      recognize: byTags,
    });
    const summary = await readProbePage(testContext(sdk), 'menu');
    expect(summary).toContain('per cell: 4/4');
    // Lines are not re-read at word level; the section reads all four.
    expect(summary).toContain('per word/row: 0/0');
    expect(summary).toContain('per section: 1/1');
  });

  it('ignores strokes on other layers and counts margin strokes', async () => {
    const strokes = [
      strokeIn(letters.cells[0].rect, {tag: 'A'}),
      strokeIn(letters.cells[1].rect, {tag: 'B', layerNum: 1}),
      strokeWithPoints(
        [
          {x: 1700, y: 1700},
          {x: 1750, y: 1750},
        ],
        {tag: 'x'},
      ),
    ];
    const sdk = fakeSdk({
      getElements: async () => ok(strokes),
      recognize: byTags,
    });
    const summary = await readProbePage(testContext(sdk), 'menu');
    expect(summary).toContain('2 strokes in 1 cells');
    expect(summary).toContain('1 strokes outside any cell');
  });

  it('refuses to read a note that is not a probe note', async () => {
    const sdk = fakeSdk({
      getCurrentFilePath: async () => ok('/storage/emulated/0/Note/Diary.note'),
    });
    expect(await readProbePage(testContext(sdk), 'button')).toMatch(
      /Open a probe note/,
    );
    expect(sdk.getElements).not.toHaveBeenCalled();
  });

  it('reports a getElements failure', async () => {
    const sdk = fakeSdk({
      getElements: async () => fail(1503, 'no read permission'),
    });
    expect(await readProbePage(testContext(sdk), 'menu')).toMatch(/1503/);
  });

  it('extracts text from odd recogniser results', () => {
    expect(recognisedText('AB')).toBe('AB');
    expect(recognisedText({text: 'C'})).toBe('C');
    expect(recognisedText(null)).toBe('');
    expect(recognisedText(['x'])).toBe('["x"]');
  });
});
