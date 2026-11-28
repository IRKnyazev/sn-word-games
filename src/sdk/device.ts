/**
 * The only module that imports sn-plugin-lib and react-native-fs. It adapts
 * them to the interfaces in ./types.ts, normalising every call through
 * `call()` (one result shape, timing, best-effort timeout).
 *
 * Rules enforced here (docs/SDK-NOTES.md): no deletePageElements; no layer
 * argument on page writes; elements freed with recycleElement(uuid).
 */
import {Dimensions, Image, PixelRatio} from 'react-native';
import RNFS from 'react-native-fs';
import {
  FileUtils,
  NativeUIUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import type {Rect, Size} from '../layout/geometry';
import {call, type Res} from './result';
import type {
  CreateNoteParams,
  ElementLike,
  Fetcher,
  Files,
  GeometrySpec,
  Permission,
  Sdk,
} from './types';
import {ELEMENT_TYPE} from './types';
import {EXTERNAL_ROOT} from './paths';

const SHORT = 5000;
const NORMAL = 15000;
const LONG = 45000;

async function makeElement(type: number): Promise<Res<ElementLike>> {
  return call<ElementLike>(() => PluginCommAPI.createElement(type), {
    timeoutMs: NORMAL,
  });
}

export const deviceSdk: Sdk = {
  getCurrentFilePath: () =>
    call(() => PluginCommAPI.getCurrentFilePath(), {timeoutMs: SHORT}),
  getCurrentPageNum: () =>
    call(() => PluginCommAPI.getCurrentPageNum(), {timeoutMs: SHORT}),
  getPageSize: (path, page) =>
    call(() => PluginFileAPI.getPageSize(path, page), {timeoutMs: SHORT}),
  getPageDisplaySize: () =>
    call(() => PluginCommAPI.getPageDisplaySize(), {timeoutMs: SHORT}),
  getDeviceType: () =>
    call(() => PluginManager.getDeviceType(), {plain: true, timeoutMs: SHORT}),
  canHandwrite: () =>
    call(() => PluginCommAPI.canHandwrite(), {timeoutMs: SHORT}),
  getNoteTotalPageNum: path =>
    call(() => PluginFileAPI.getNoteTotalPageNum(path), {timeoutMs: SHORT}),
  getNotePageTemplate: (path, page) =>
    call(() => PluginFileAPI.getNotePageTemplate(path, page), {
      timeoutMs: SHORT,
    }),
  getPenInfo: () => call(() => PluginCommAPI.getPenInfo(), {timeoutMs: SHORT}),
  getPluginDirPath: () =>
    call(() => PluginManager.getPluginDirPath(), {
      plain: true,
      timeoutMs: SHORT,
    }),
  windowInfo: () => {
    const w = Dimensions.get('window');
    return {width: w.width, height: w.height, scale: PixelRatio.get()};
  },

  createNote: (params: CreateNoteParams) =>
    call(() => PluginFileAPI.createNote(params), {timeoutMs: LONG}),
  insertNotePage: params =>
    call(() => PluginFileAPI.insertNotePage(params), {timeoutMs: LONG}),
  // Answers the route that worked ('openFile' or 'openFilePath'). A call that
  // succeeds but reports false counts as not opened.
  openNote: async (path, page) => {
    const first = await call(() => PluginFileAPI.openFile(path, page), {
      timeoutMs: NORMAL,
    });
    if (first.ok && first.value !== false) {
      return {ok: true, value: 'openFile', ms: first.ms};
    }
    // Ink2Task opens notes this way.
    const second = await call(() => FileUtils.openFilePath(path), {
      plain: true,
      timeoutMs: NORMAL,
    });
    if (second.ok && second.value !== false) {
      return {ok: true, value: 'openFilePath', ms: first.ms + second.ms};
    }
    const why = (r: Res<unknown>) => (r.ok ? 'returned false' : r.message);
    return {
      ok: false,
      code: first.ok ? undefined : first.code,
      message: `openFile: ${why(first)}; openFilePath: ${why(second)}`,
      ms: first.ms + second.ms,
    };
  },
  showPluginView: () =>
    call(() => PluginManager.showPluginView(), {
      plain: true,
      timeoutMs: SHORT,
    }),
  closePluginView: () =>
    call(() => PluginManager.closePluginView(), {
      plain: true,
      timeoutMs: SHORT,
    }),
  saveCurrentNote: () =>
    call(() => PluginNoteAPI.saveCurrentNote(), {timeoutMs: NORMAL}),

  getElements: (page, path) =>
    call<ElementLike[]>(() => PluginFileAPI.getElements(page, path), {
      timeoutMs: LONG,
    }).then(r => (r.ok ? {...r, value: r.value ?? []} : r)),
  getElementNumList: (path, page) =>
    call<number[]>(() => PluginFileAPI.getElementNumList(path, page), {
      timeoutMs: SHORT,
    }),
  getLastElement: () =>
    call(() => PluginFileAPI.getLastElement(), {timeoutMs: SHORT}),
  recycle: (elements: readonly ElementLike[]) => {
    for (const el of elements) {
      try {
        if (el?.uuid) {
          PluginCommAPI.recycleElement(el.uuid);
        }
      } catch {
        // Freeing is best-effort.
      }
    }
  },
  recognize: (elements, size: Size) =>
    call<string>(
      () => PluginCommAPI.recognizeElements(elements as object[], size),
      {timeoutMs: LONG},
    ),

  insertGeometry: (spec: GeometrySpec) =>
    call(
      () =>
        PluginCommAPI.insertGeometry({...spec, showLassoAfterInsert: false}),
      {timeoutMs: NORMAL},
    ),
  insertImage: path =>
    call(() => PluginNoteAPI.insertImage(path), {timeoutMs: NORMAL}),
  createGeometryElement: async (spec, page) => {
    const res = await makeElement(ELEMENT_TYPE.geometry);
    if (!res.ok) {
      return res;
    }
    const el = res.value as ElementLike & Record<string, unknown>;
    el.pageNum = page;
    // The SDK refuses widths under 100 (error 303).
    const penWidth = Math.max(100, spec.penWidth);
    el.thickness = penWidth;
    el.geometry = {
      penColor: spec.penColor,
      penType: spec.penType,
      penWidth,
      type: spec.type,
      points: spec.points,
      ellipseCenterPoint: spec.ellipseCenterPoint ?? null,
      ellipseMajorAxisRadius: spec.ellipseMajorAxisRadius ?? 0,
      ellipseMinorAxisRadius: spec.ellipseMinorAxisRadius ?? 0,
      ...(spec.ellipseAngle !== undefined
        ? {ellipseAngle: spec.ellipseAngle}
        : {}),
    };
    return {ok: true, value: el, ms: res.ms};
  },
  createPictureElement: async (path, rect: Rect, page) => {
    const res = await makeElement(ELEMENT_TYPE.picture);
    if (!res.ok) {
      return res;
    }
    const el = res.value;
    el.pageNum = page;
    el.picture = {picturePath: path, rect};
    return {ok: true, value: el, ms: res.ms};
  },
  // Never pass a layer: an explicit layer is refused with 813 (Tables).
  insertPageElements: (elements, page) =>
    call(() => PluginCommAPI.insertPageElements(elements as object[], page), {
      timeoutMs: NORMAL,
    }),
  batchUpdatePageElements: (deleteNums, elements, page) =>
    call(
      () =>
        PluginCommAPI.batchUpdatePageElements(
          deleteNums,
          elements as object[],
          page,
        ),
      {
        timeoutMs: NORMAL,
      },
    ),
  lassoElements: rect =>
    call(() => PluginCommAPI.lassoElements(rect), {timeoutMs: NORMAL}),
  getLassoElements: () =>
    call<ElementLike[]>(() => PluginCommAPI.getLassoElements(), {
      timeoutMs: NORMAL,
    }).then(r => (r.ok ? {...r, value: r.value ?? []} : r)),
  deleteLassoElements: () =>
    call(() => PluginCommAPI.deleteLassoElements(), {timeoutMs: NORMAL}),
  setLassoBoxState: state =>
    call(() => PluginCommAPI.setLassoBoxState(state), {timeoutMs: SHORT}),

  hasPermission: (p: Permission) =>
    call(() => PluginManager.hasPermission(p), {plain: true, timeoutMs: SHORT}),
  // No timeout: this waits for the user to answer the system dialog.
  requestPermission: (p: Permission, desc: string) =>
    call(() => PluginManager.requestPermission(p, desc), {
      plain: true,
      timeoutMs: 0,
    }),
  showDialog: (text, success = true) =>
    call(() => NativeUIUtils.showRattaDialog(text, 'OK', '', success), {
      plain: true,
      timeoutMs: 0,
    }),
};

export const deviceFiles: Files = {
  externalRoot: RNFS.ExternalStorageDirectoryPath || EXTERNAL_ROOT,
  exists: path => RNFS.exists(path),
  mkdir: path => RNFS.mkdir(path),
  writeBase64: (path, data) => RNFS.writeFile(path, data, 'base64'),
  writeUtf8: (path, text) => RNFS.writeFile(path, text, 'utf8'),
  appendUtf8: (path, text) => RNFS.appendFile(path, text, 'utf8'),
  readUtf8: path => RNFS.readFile(path, 'utf8'),
  size: async path => Number((await RNFS.stat(path)).size),
  move: async (from, to) => {
    if (await RNFS.exists(to)) {
      await RNFS.unlink(to);
    }
    await RNFS.moveFile(from, to);
  },
};

export const deviceFetch: Fetcher = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {Accept: 'application/json'},
    });
    // Read the body while the abort timer still runs.
    const body = await res.text();
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      text: async () => body,
    };
  } finally {
    clearTimeout(timer);
  }
};

/** Toolbar icon URI for registerButton. */
export function iconUri(): string {
  return Image.resolveAssetSource(require('../../assets/icon.png')).uri;
}
