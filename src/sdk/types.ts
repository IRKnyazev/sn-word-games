/**
 * The SDK surface the probes (and later the games) use, as interfaces. Only
 * src/sdk/device.ts implements them with the real sn-plugin-lib; tests use
 * fakes. Shapes follow sn-plugin-lib 0.2.3 (see docs/SDK-NOTES.md).
 */
import type {Point, Rect, Size} from '../layout/geometry';
import type {Res} from './result';

export interface PointsAccessor<T = Point> {
  /** -1 when empty (SDK quirk). */
  size(): Promise<number>;
  /** All-or-nothing: asking past the end returns []. */
  getRange(start: number, count: number): Promise<T[]>;
}

export interface ElementLike {
  uuid: string;
  type: number;
  pageNum?: number;
  layerNum?: number;
  numInPage?: number;
  thickness?: number;
  maxX?: number;
  maxY?: number;
  stroke?: {
    penType?: number;
    penColor?: number;
    points?: PointsAccessor;
    recognPoints?: PointsAccessor<{X: number; Y: number; Flag?: number}>;
  } | null;
  geometry?: {
    type?: string;
    points?: Point[];
    penWidth?: number;
    penColor?: number;
    penType?: number;
    ellipseCenterPoint?: Point | null;
    ellipseMajorAxisRadius?: number;
    ellipseMinorAxisRadius?: number;
  } | null;
  picture?: {picturePath?: string; rect?: Rect} | null;
}

export const ELEMENT_TYPE = {
  stroke: 0,
  title: 100,
  picture: 200,
  text: 500,
  link: 600,
  geometry: 700,
  fiveStar: 800,
} as const;

/** Pen types that are handwriting (SDK list); lasso strokes arrive as 4. */
export const INK_PEN_TYPES: readonly number[] = [1, 10, 11, 12, 14, 15, 16];

export interface GeometrySpec {
  type: 'straightLine' | 'GEO_polygon' | 'GEO_circle' | 'GEO_ellipse';
  points: Point[];
  penColor: number;
  penType: number;
  penWidth: number;
  ellipseCenterPoint?: Point | null;
  ellipseMajorAxisRadius?: number;
  ellipseMinorAxisRadius?: number;
  ellipseAngle?: number;
}

export interface CreateNoteParams {
  notePath: string;
  template: string;
  mode: 0 | 1;
  isPortrait: boolean;
}

export const PERMISSION = {
  read: 'plugin.permission.FILE:READ',
  write: 'plugin.permission.FILE:WRITE',
  internet: 'plugin.permission.INTERNET',
} as const;
export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export interface Sdk {
  // Where are we?
  getCurrentFilePath(): Promise<Res<string>>;
  getCurrentPageNum(): Promise<Res<number>>;
  getPageSize(path: string, page: number): Promise<Res<Size>>;
  getPageDisplaySize(): Promise<Res<Size>>;
  getDeviceType(): Promise<Res<number>>;
  canHandwrite(): Promise<Res<boolean>>;
  getNoteTotalPageNum(path: string): Promise<Res<number>>;
  getNotePageTemplate(path: string, page: number): Promise<Res<unknown>>;
  getPenInfo(): Promise<Res<unknown>>;
  getPluginDirPath(): Promise<Res<string | null>>;
  /** Window size in dp and the pixel ratio, from React Native. */
  windowInfo(): {width: number; height: number; scale: number};

  // Notes
  createNote(params: CreateNoteParams): Promise<Res<boolean>>;
  insertNotePage(params: {
    notePath: string;
    page: number;
    template: string;
  }): Promise<Res<boolean>>;
  openNote(path: string, page: number): Promise<Res<unknown>>;
  closePluginView(): Promise<Res<unknown>>;
  saveCurrentNote(): Promise<Res<unknown>>;

  // Reading
  getElements(page: number, path: string): Promise<Res<ElementLike[]>>;
  getLastElement(): Promise<Res<ElementLike | null>>;
  recycle(elements: readonly ElementLike[]): void;
  recognize(elements: readonly ElementLike[], size: Size): Promise<Res<string>>;

  // Writing (current page of the open note)
  insertGeometry(spec: GeometrySpec): Promise<Res<unknown>>;
  insertImage(path: string): Promise<Res<unknown>>;
  createGeometryElement(
    spec: GeometrySpec,
    page: number,
  ): Promise<Res<ElementLike>>;
  createPictureElement(
    path: string,
    rect: Rect,
    page: number,
  ): Promise<Res<ElementLike>>;
  insertPageElements(
    elements: readonly ElementLike[],
    page: number,
  ): Promise<Res<unknown>>;
  batchUpdatePageElements(
    deleteNums: number[],
    elements: readonly ElementLike[],
    page: number,
  ): Promise<Res<unknown>>;
  lassoElements(rect: Rect): Promise<Res<unknown>>;
  getLassoElements(): Promise<Res<ElementLike[]>>;
  deleteLassoElements(): Promise<Res<unknown>>;
  setLassoBoxState(state: 0 | 1 | 2): Promise<Res<unknown>>;

  // Permissions and UI
  hasPermission(p: Permission): Promise<Res<number>>;
  requestPermission(p: Permission, desc: string): Promise<Res<number>>;
  /** `success` picks the dialog's success or failure styling. */
  showDialog(text: string, success?: boolean): Promise<Res<unknown>>;
}

/** File access through react-native-fs (the SDK can't write files). */
export interface Files {
  readonly externalRoot: string;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  writeBase64(path: string, base64: string): Promise<void>;
  writeUtf8(path: string, text: string): Promise<void>;
  appendUtf8(path: string, text: string): Promise<void>;
  readUtf8(path: string): Promise<string>;
  size(path: string): Promise<number>;
  move(from: string, to: string): Promise<void>;
}

export interface HttpResponse {
  status: number;
  contentType: string | null;
  text(): Promise<string>;
}

export type Fetcher = (url: string, timeoutMs: number) => Promise<HttpResponse>;
