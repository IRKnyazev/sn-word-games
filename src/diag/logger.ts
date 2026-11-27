/**
 * Log lines kept in memory and appended to a file the owner sends back.
 * The sink is attached once file permission is granted; lines logged before
 * that wait in `pending`. Every line is also echoed (console.log), which
 * still prints in release builds.
 */

export interface LogSink {
  append(text: string): Promise<void>;
}

export type Level = 'INFO' | 'WARN' | 'ERROR';

export interface LoggerOptions {
  sink?: LogSink | null;
  now?: () => Date;
  echo?: ((line: string) => void) | null;
  /** Lines kept for the on-screen tail. */
  memoryLines?: number;
  /** Unflushed lines kept while there is no working sink. */
  pendingLines?: number;
  /** Longest JSON payload per line. */
  maxDataChars?: number;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function timestamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
      d.getMilliseconds(),
      3,
    )}`
  );
}

export function describeError(e: unknown): string {
  if (e instanceof Error) {
    return `${e.name}: ${e.message}`;
  }
  if (typeof e === 'string') {
    return e;
  }
  return safeJson(e, 500);
}

/** Plain-data copy for JSON: marks real cycles (not shared references). */
function toPlain(value: unknown, ancestors: object[]): unknown {
  if (value instanceof Error) {
    return describeError(value);
  }
  if (typeof value === 'function') {
    return '[function]';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (ancestors.includes(value)) {
    return '[circular]';
  }
  const toJSON = (value as {toJSON?: unknown}).toJSON;
  if (typeof toJSON === 'function') {
    const replaced: unknown = toJSON.call(value);
    if (replaced !== value) {
      return toPlain(replaced, ancestors);
    }
  }
  ancestors.push(value);
  try {
    if (Array.isArray(value)) {
      return value.map(v => toPlain(v, ancestors));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toPlain(v, ancestors);
    }
    return out;
  } finally {
    ancestors.pop();
  }
}

export function safeJson(value: unknown, maxChars = 4000): string {
  let text: string;
  try {
    text = JSON.stringify(toPlain(value, [])) ?? String(value);
  } catch (e) {
    text = `[unserialisable: ${e instanceof Error ? e.message : String(e)}]`;
  }
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}…(+${text.length - maxChars} chars)`
    : text;
}

export class Logger {
  private sink: LogSink | null;
  private readonly now: () => Date;
  private readonly echo: ((line: string) => void) | null;
  private readonly memoryLines: number;
  private readonly pendingLines: number;
  private readonly maxDataChars: number;
  private readonly memory: string[] = [];
  private pending: string[] = [];
  private dropped = 0;
  private flushing: Promise<boolean> | null = null;

  constructor(opts: LoggerOptions = {}) {
    this.sink = opts.sink ?? null;
    this.now = opts.now ?? (() => new Date());
    this.echo = opts.echo === undefined ? line => console.log(line) : opts.echo;
    this.memoryLines = opts.memoryLines ?? 400;
    this.pendingLines = opts.pendingLines ?? 2000;
    this.maxDataChars = opts.maxDataChars ?? 4000;
  }

  setSink(sink: LogSink | null): void {
    this.sink = sink;
  }

  hasSink(): boolean {
    return this.sink !== null;
  }

  info(tag: string, message: string, data?: unknown): void {
    this.write('INFO', tag, message, data);
  }

  warn(tag: string, message: string, data?: unknown): void {
    this.write('WARN', tag, message, data);
  }

  error(tag: string, message: string, data?: unknown): void {
    this.write('ERROR', tag, message, data);
  }

  /** A visible divider, e.g. at the start of each probe run. */
  section(title: string): void {
    this.raw(`\n===== ${title} — ${timestamp(this.now())} =====`);
  }

  /** The most recent lines, oldest first. */
  tail(n = 40): string[] {
    return this.memory.slice(-n);
  }

  pendingCount(): number {
    return this.pending.length;
  }

  /**
   * Appends pending lines to the sink. Never throws; returns false (and keeps
   * the lines) if there is no sink or the write fails.
   */
  flush(): Promise<boolean> {
    if (this.flushing) {
      // Chain so lines logged during a flush are written by the next one.
      return this.flushing.then(() => this.flush());
    }
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<boolean> {
    if (!this.sink || this.pending.length === 0) {
      return this.pending.length === 0;
    }
    const batch = this.pending;
    this.pending = [];
    // Lines dropped while this write is in flight are reported next time.
    const reported = this.dropped;
    let text = batch.join('\n') + '\n';
    if (reported > 0) {
      text =
        `[${reported} earlier lines dropped before the log file was available]\n` +
        text;
    }
    try {
      await this.sink.append(text);
      this.dropped -= reported;
      return true;
    } catch (e) {
      this.pending = batch.concat(this.pending);
      this.trimPending();
      this.echoLine(`[log] write failed: ${describeError(e)}`);
      return false;
    }
  }

  private write(
    level: Level,
    tag: string,
    message: string,
    data?: unknown,
  ): void {
    const json =
      data === undefined ? '' : ` ${safeJson(data, this.maxDataChars)}`;
    this.raw(`${timestamp(this.now())} ${level} [${tag}] ${message}${json}`);
  }

  private raw(line: string): void {
    this.memory.push(line);
    if (this.memory.length > this.memoryLines) {
      this.memory.splice(0, this.memory.length - this.memoryLines);
    }
    this.pending.push(line);
    this.trimPending();
    this.echoLine(line);
  }

  private trimPending(): void {
    if (this.pending.length > this.pendingLines) {
      const extra = this.pending.length - this.pendingLines;
      this.pending.splice(0, extra);
      this.dropped += extra;
    }
  }

  private echoLine(line: string): void {
    try {
      this.echo?.(line);
    } catch {
      // Echo is best-effort.
    }
  }
}
