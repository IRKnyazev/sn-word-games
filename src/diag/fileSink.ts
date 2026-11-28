import type {Files} from '../sdk/types';
import type {LogSink} from './logger';

/**
 * Appends to a log file, creating its folder. When the file passes
 * `maxBytes` it is moved to `<name>.prev.txt` (one generation kept).
 */
export function fileSink(
  files: Files,
  path: string,
  maxBytes = 2_000_000,
): LogSink {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const prev = path.replace(/\.txt$/, '') + '.prev.txt';
  let ready = false;
  return {
    async append(text: string): Promise<void> {
      if (!ready) {
        await files.mkdir(dir);
        ready = true;
      }
      try {
        if ((await files.exists(path)) && (await files.size(path)) > maxBytes) {
          await files.move(path, prev);
        }
      } catch {
        // Rotation is best-effort; never stop logging because of it.
      }
      try {
        await files.appendUtf8(path, text);
      } catch {
        // The folder may have been deleted since: make it again, retry once.
        await files.mkdir(dir);
        await files.appendUtf8(path, text);
      }
    },
  };
}
