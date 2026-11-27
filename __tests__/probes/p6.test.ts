import {probePages} from '../../src/layout/probe';
import {
  insertMarks,
  ourMarks,
  removeViaBatch,
  removeViaLasso,
  saveNote,
} from '../../src/probes/p6';
import {describeAll} from '../../src/probes/elements';
import {
  fail,
  fakeSdk,
  geometryEl,
  ok,
  pictureEl,
  strokeIn,
  testContext,
} from '../helpers/fakes';

const area = probePages()[1].areas.p6;
const onPage2 = {getCurrentPageNum: async () => ok(1)};
const inside = {
  left: area.left + 40,
  top: area.top + 150,
  right: area.left + 140,
  bottom: area.top + 250,
};

describe('P6 feedback marks', () => {
  it('only works on page 2', async () => {
    const sdk = fakeSdk();
    expect(await insertMarks(testContext(sdk))).toMatch(/page 2/);
    expect(sdk.insertGeometry).not.toHaveBeenCalled();
  });

  it('inserts ✓, ✗, a square, an image and a placed picture inside the box', async () => {
    const sdk = fakeSdk(onPage2);
    const ctx = testContext(sdk);
    const summary = await insertMarks(ctx);
    expect(sdk.insertGeometry).toHaveBeenCalledTimes(4);
    expect(
      sdk.insertGeometry.mock.calls.every(([g]) => g.type === 'straightLine'),
    ).toBe(true);
    for (const [spec] of sdk.insertGeometry.mock.calls) {
      expect(spec.penWidth).toBeGreaterThanOrEqual(100);
      for (const p of spec.points) {
        expect(p.x).toBeGreaterThanOrEqual(area.left);
        expect(p.x).toBeLessThanOrEqual(area.right);
        expect(p.y).toBeGreaterThanOrEqual(area.top);
        expect(p.y).toBeLessThanOrEqual(area.bottom);
      }
    }
    expect(sdk.insertImage).toHaveBeenCalledWith(
      expect.stringMatching(/MyStyle\/SupernotePuzzles\/tile-dark-\w+\.png$/),
    );
    const [, rect] = sdk.createPictureElement.mock.calls[0];
    expect(rect.left).toBeGreaterThanOrEqual(area.left);
    expect(rect.bottom).toBeLessThanOrEqual(area.bottom);
    expect(sdk.insertPageElements).toHaveBeenCalledTimes(2);
    expect(sdk.recycle).toHaveBeenCalled();
    expect(summary).toMatch(/Undo/);
  });

  it('lasso removal never deletes handwriting', async () => {
    const sdk = fakeSdk({
      ...onPage2,
      getLassoElements: async () =>
        ok([
          geometryEl([{x: inside.left, y: inside.top}], 5),
          strokeIn(inside),
        ]),
    });
    const summary = await removeViaLasso(testContext(sdk));
    expect(summary).toMatch(/nothing was deleted/);
    expect(sdk.deleteLassoElements).not.toHaveBeenCalled();
    expect(sdk.setLassoBoxState).toHaveBeenCalledWith(2);
  });

  it('lasso removal never deletes text boxes or other content', async () => {
    const sdk = fakeSdk({
      ...onPage2,
      getLassoElements: async () =>
        ok([
          geometryEl([{x: inside.left, y: inside.top}], 5),
          {uuid: 't1', type: 500, numInPage: 6},
        ]),
    });
    expect(await removeViaLasso(testContext(sdk))).toMatch(
      /nothing was deleted/,
    );
    expect(sdk.deleteLassoElements).not.toHaveBeenCalled();
  });

  it('lasso removal deletes our marks and clears the lasso', async () => {
    const sdk = fakeSdk({
      ...onPage2,
      getLassoElements: async () =>
        ok([
          geometryEl([{x: inside.left, y: inside.top}], 5),
          pictureEl(inside, 6),
        ]),
    });
    const summary = await removeViaLasso(testContext(sdk));
    expect(sdk.lassoElements).toHaveBeenCalledTimes(1);
    const [rect] = sdk.lassoElements.mock.calls[0];
    for (const v of Object.values(rect)) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(sdk.deleteLassoElements).toHaveBeenCalledTimes(1);
    expect(sdk.setLassoBoxState).toHaveBeenLastCalledWith(2);
    expect(summary).toMatch(/Lasso selected 2/);
  });

  it('lasso removal stops if the lasso fails', async () => {
    const sdk = fakeSdk({
      ...onPage2,
      lassoElements: async () => fail(905, 'bad rect'),
    });
    expect(await removeViaLasso(testContext(sdk))).toMatch(/905/);
    expect(sdk.deleteLassoElements).not.toHaveBeenCalled();
  });

  it('ourMarks picks geometry and pictures inside the box only', async () => {
    const els = [
      geometryEl(
        [
          {x: inside.left, y: inside.top},
          {x: inside.right, y: inside.bottom},
        ],
        3,
      ),
      pictureEl(inside, 4),
      strokeIn(inside),
      geometryEl(
        [
          {x: 10, y: 10},
          {x: 20, y: 20},
        ],
        7,
      ),
      {...geometryEl([{x: inside.left, y: inside.top}], 8), layerNum: 1},
    ];
    const nums = ourMarks(await describeAll(els), area).map(i => i.numInPage);
    expect(nums).toEqual([3, 4]);
  });

  it('batch removal deletes only our marks and inserts a white hairline', async () => {
    const els = [
      geometryEl(
        [
          {x: inside.left, y: inside.top},
          {x: inside.right, y: inside.bottom},
        ],
        3,
      ),
      strokeIn(inside, {numInPage: 9}),
      pictureEl(inside, 4),
    ];
    const sdk = fakeSdk({...onPage2, getElements: async () => ok(els)});
    await removeViaBatch(testContext(sdk));
    const [nums, inserted, page] = sdk.batchUpdatePageElements.mock.calls[0];
    expect(nums).toEqual([3, 4]);
    expect(inserted).toHaveLength(1);
    expect(page).toBe(1);
    const [spec] = sdk.createGeometryElement.mock.calls[0];
    expect(spec.penColor).toBe(0xfe);
    expect(spec.penWidth).toBe(100);
  });

  it('batch removal does nothing when there are no marks', async () => {
    const sdk = fakeSdk({
      ...onPage2,
      getElements: async () => ok([strokeIn(inside)]),
    });
    expect(await removeViaBatch(testContext(sdk))).toMatch(/No marks/);
    expect(sdk.batchUpdatePageElements).not.toHaveBeenCalled();
  });

  it('save is explicit and logged', async () => {
    const sdk = fakeSdk();
    expect(await saveNote(testContext(sdk))).toMatch(/Undo/);
    expect(sdk.saveCurrentNote).toHaveBeenCalledTimes(1);
  });
});
