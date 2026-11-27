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
      if (await files.exists(path)) {
        const size = await files.size(path);
        if (size > maxBytes) {
          await files.move(path, prev);
        }
      }
      await files.appendUtf8(path, text);
    },
  };
}
