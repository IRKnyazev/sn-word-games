/** Test doubles for the SDK, files and network. */
import {Logger} from '../../src/diag/logger';
import type {Point, Rect} from '../../src/layout/geometry';
import type {ProbeContext} from '../../src/probes/context';
import {ProbeState} from '../../src/probes/state';
import type {Res} from '../../src/sdk/result';
import type {
  ElementLike,
  Fetcher,
  Files,
  PointsAccessor,
  Sdk,
} from '../../src/sdk/types';

export function ok<T>(value: T): Res<T> {
  return {ok: true, value, ms: 1};
}

export function fail(code: number, message = 'failed'): Res<never> {
  return {ok: false, code, message, ms: 1};
}

export function accessor<T>(items: T[]): PointsAccessor<T> {
  return {
    size: async () => (items.length === 0 ? -1 : items.length),
    getRange: async (start: number, count: number) =>
      start + count > items.length ? [] : items.slice(start, start + count),
  };
}

let uuidSeq = 0;

/** A stroke element whose points trace the rect's diagonal. */
export function strokeIn(
  r: Rect,
  extra: Partial<ElementLike> & {tag?: string} = {},
): ElementLike & {tag?: string} {
  const pts: Point[] = [
    {
      x: r.left + 0.25 * (r.right - r.left),
      y: r.top + 0.25 * (r.bottom - r.top),
    },
    {
      x: r.left + 0.75 * (r.right - r.left),
      y: r.top + 0.75 * (r.bottom - r.top),
    },
  ];
  return strokeWithPoints(pts, extra);
}

export function strokeWithPoints(
  pts: Point[],
  extra: Partial<ElementLike> & {tag?: string} = {},
): ElementLike & {tag?: string} {
  return {
    uuid: `u${++uuidSeq}`,
    type: 0,
    layerNum: 0,
    numInPage: uuidSeq,
    stroke: {penType: 10, penColor: 0, points: accessor(pts)},
    ...extra,
  };
}

export function geometryEl(points: Point[], numInPage: number): ElementLike {
  return {
    uuid: `g${++uuidSeq}`,
    type: 700,
    layerNum: 0,
    numInPage,
    geometry: {type: 'GEO_polygon', points},
  };
}

export function pictureEl(rect: Rect, numInPage: number): ElementLike {
  return {
    uuid: `p${++uuidSeq}`,
    type: 200,
    layerNum: 0,
    numInPage,
    picture: {picturePath: '/x.png', rect},
  };
}

export type FakeSdk = {[K in keyof Sdk]: jest.Mock};

export function fakeSdk(
  overrides: Partial<Record<keyof Sdk, (...args: any[]) => unknown>> = {},
): FakeSdk {
  const base: Record<keyof Sdk, (...args: any[]) => unknown> = {
    getCurrentFilePath: async () =>
      ok(
        '/storage/emulated/0/Note/SupernotePuzzles/Probe 2026-11-27 101500.note',
      ),
    getCurrentPageNum: async () => ok(0),
    getPageSize: async () => ok({width: 1920, height: 2560}),
    getPageDisplaySize: async () => ok({width: 1920, height: 2560}),
    getDeviceType: async () => ok(5),
    canHandwrite: async () => ok(true),
    getNoteTotalPageNum: async () => ok(3),
    getNotePageTemplate: async () => ok({name: 't', md5: 'm'}),
    getPenInfo: async () => ok({type: 10}),
    getPluginDirPath: async () => ok('/plugin'),
    windowInfo: () => ({width: 1024, height: 1365, scale: 1.875}),
    createNote: async () => ok(true),
    insertNotePage: async () => ok(true),
    openNote: async () => ok(true),
    closePluginView: async () => ok(true),
    saveCurrentNote: async () => ok(true),
    getElements: async () => ok([]),
    getLastElement: async () => ok(null),
    recycle: () => undefined,
    recognize: async () => ok(''),
    insertGeometry: async () => ok(0),
    insertImage: async () => ok(true),
    createGeometryElement: async () => ok({uuid: 'new-geo', type: 700}),
    createPictureElement: async () => ok({uuid: 'new-pic', type: 200}),
    insertPageElements: async () => ok(true),
    batchUpdatePageElements: async () => ok(true),
    lassoElements: async () => ok(true),
    getLassoElements: async () => ok([]),
    deleteLassoElements: async () => ok(true),
    setLassoBoxState: async () => ok(true),
    hasPermission: async () => ok(2),
    requestPermission: async () => ok(2),
    showDialog: async () => ok(true),
  };
  const out = {} as FakeSdk;
  for (const key of Object.keys(base) as (keyof Sdk)[]) {
    out[key] = jest.fn(overrides[key] ?? base[key]);
  }
  return out;
}

export function fakeFiles(
  existing: string[] = [],
): Files & {written: Map<string, string>; appended: string[]} {
  const written = new Map<string, string>(existing.map(p => [p, '']));
  const appended: string[] = [];
  return {
    externalRoot: '/storage/emulated/0',
    written,
    appended,
    exists: jest.fn(async (p: string) => written.has(p)),
    mkdir: jest.fn(async () => undefined),
    writeBase64: jest.fn(async (p: string, d: string) => {
      written.set(p, d);
    }),
    writeUtf8: jest.fn(async (p: string, d: string) => {
      written.set(p, d);
    }),
    appendUtf8: jest.fn(async (p: string, d: string) => {
      appended.push(d);
      written.set(p, (written.get(p) ?? '') + d);
    }),
    readUtf8: jest.fn(async (p: string) => written.get(p) ?? ''),
    size: jest.fn(async (p: string) => (written.get(p) ?? '').length),
    move: jest.fn(async (a: string, b: string) => {
      written.set(b, written.get(a) ?? '');
      written.delete(a);
    }),
  };
}

export interface TestContext extends ProbeContext {
  sdk: Sdk & FakeSdk;
  lines: () => string[];
}

export function testContext(
  sdk: FakeSdk = fakeSdk(),
  opts: {fetch?: Fetcher; now?: () => number} = {},
): TestContext {
  const log = new Logger({
    echo: null,
    now: () => new Date(2026, 10, 27, 10, 15, 0),
  });
  let t = 1_000_000;
  return {
    sdk: sdk as unknown as Sdk & FakeSdk,
    files: fakeFiles(),
    log,
    fetch:
      opts.fetch ??
      (async () => ({
        status: 200,
        contentType: 'application/json',
        text: async () => '{}',
      })),
    state: new ProbeState(),
    now: opts.now ?? (() => (t += 10)),
    date: () => new Date(2026, 10, 27, 10, 15, 0),
    listenPenUp: jest.fn(() => ({remove: jest.fn()})),
    lines: () => log.tail(1000),
  };
}
