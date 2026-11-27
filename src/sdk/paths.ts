/** Where the plugin keeps things on the device. */

export const EXTERNAL_ROOT = '/storage/emulated/0';

export const FOLDER = 'SupernotePuzzles';

export function templateDir(root = EXTERNAL_ROOT): string {
  return `${root}/MyStyle/${FOLDER}`;
}

export function noteDir(root = EXTERNAL_ROOT): string {
  return `${root}/Note/${FOLDER}`;
}

export function logDir(root = EXTERNAL_ROOT): string {
  return `${root}/Document/${FOLDER}`;
}

export function logFile(root = EXTERNAL_ROOT): string {
  return `${logDir(root)}/log.txt`;
}

export function templatePath(
  id: string,
  sha: string,
  root = EXTERNAL_ROOT,
): string {
  return `${templateDir(root)}/${id}-${sha}.png`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function probeNoteName(d: Date): string {
  return `Probe ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.note`;
}

export function probeNotePath(d: Date, root = EXTERNAL_ROOT): string {
  return `${noteDir(root)}/${probeNoteName(d)}`;
}

/** True for notes made by "Create probe note" (any storage root). */
export function isProbeNotePath(path: string | null | undefined): boolean {
  return !!path && /\/Note\/SupernotePuzzles\/Probe [^/]*\.note$/i.test(path);
}

/** Local date as YYYY-MM-DD (puzzle feeds are keyed by the solver's date). */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
