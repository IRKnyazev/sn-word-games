import {PROBE_TEMPLATES} from '../../src/assets/templates.generated';
import {createProbeNote} from '../../src/probes/note';
import {fail, fakeSdk, ok, testContext} from '../helpers/fakes';

describe('createProbeNote', () => {
  it('writes the templates, creates a 3-page note and opens it', async () => {
    let pages = 1;
    const sdk = fakeSdk({
      getNoteTotalPageNum: async () => ok(pages),
      insertNotePage: async () => {
        pages++;
        return ok(true);
      },
    });
    const ctx = testContext(sdk);
    const summary = await createProbeNote(ctx);
    expect(ctx.files.writeBase64).toHaveBeenCalledTimes(PROBE_TEMPLATES.length);
    const [params] = sdk.createNote.mock.calls[0];
    expect(params).toEqual({
      notePath:
        '/storage/emulated/0/Note/SupernotePuzzles/Probe 2026-11-27 101500.note',
      template: expect.stringMatching(
        /^\/storage\/emulated\/0\/MyStyle\/SupernotePuzzles\/p1-letters-\w+\.png$/,
      ),
      mode: 0,
      isPortrait: true,
    });
    expect(sdk.insertNotePage.mock.calls.map(c => c[0].page)).toEqual([1, 2]);
    expect(sdk.closePluginView).toHaveBeenCalled();
    expect(sdk.openNote).toHaveBeenCalledWith(params.notePath, 0);
    expect(summary).toMatch(/Created and opened/);
  });

  it('warns when the pages come out in the wrong order', async () => {
    const names = ['p1-letters-a.png', 'p3-crossword-b.png', 'p1-words-c.png'];
    const sdk = fakeSdk({
      getNotePageTemplate: async (_p: string, page: number) =>
        ok({name: names[page]}),
    });
    expect(await createProbeNote(testContext(sdk))).toMatch(/out of order/);
  });

  it("doesn't rewrite templates that are already there", async () => {
    const sdk = fakeSdk();
    const ctx = testContext(sdk);
    await createProbeNote(ctx);
    (ctx.files.writeBase64 as jest.Mock).mockClear();
    await createProbeNote(ctx);
    expect(ctx.files.writeBase64).not.toHaveBeenCalled();
  });

  it('explains error 102 (no note open)', async () => {
    const sdk = fakeSdk({createNote: async () => fail(102, 'not allowed')});
    expect(await createProbeNote(testContext(sdk))).toMatch(
      /open any note first/,
    );
    expect(sdk.insertNotePage).not.toHaveBeenCalled();
  });

  it('retries insertNotePage at the previous index', async () => {
    const sdk = fakeSdk({
      getNoteTotalPageNum: async () => ok(1),
      insertNotePage: async (p: {page: number}) =>
        p.page === 1 ? fail(1209, 'bad page') : ok(true),
    });
    await createProbeNote(testContext(sdk));
    expect(sdk.insertNotePage.mock.calls.map(c => c[0].page)).toEqual([
      1, 0, 1, 0,
    ]);
  });
});
