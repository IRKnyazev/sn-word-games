import {
  Logger,
  describeError,
  safeJson,
  timestamp,
  type LogSink,
} from '../../src/diag/logger';
import {probePages} from '../../src/layout/probe';

/** A fixed local time, so the expected strings do not depend on the TZ. */
const FIXED = new Date(2026, 0, 2, 3, 4, 5, 6);
const TS = '2026-01-02 03:04:05.006';
const now = () => FIXED;

/** Lets queued promise callbacks run (no timers involved). */
async function settle(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

/** A sink that records writes and can be told to fail. */
class MemorySink implements LogSink {
  writes: string[] = [];
  failNext = 0;
  async append(text: string): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('disk full');
    }
    this.writes.push(text);
  }
  get text(): string {
    return this.writes.join('');
  }
}

/** A sink whose writes complete only when the test says so. */
class ManualSink implements LogSink {
  readonly written: string[] = [];
  private queue: {
    text: string;
    resolve: () => void;
    reject: (e: Error) => void;
  }[] = [];
  inFlight = 0;
  maxInFlight = 0;

  append(text: string): Promise<void> {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    return new Promise((resolve, reject) => {
      this.queue.push({
        text,
        resolve: () => {
          this.inFlight--;
          this.written.push(text);
          resolve();
        },
        reject: e => {
          this.inFlight--;
          reject(e);
        },
      });
    });
  }

  get waiting(): string[] {
    return this.queue.map(q => q.text);
  }

  complete(): void {
    const next = this.queue.shift();
    if (!next) {
      throw new Error('no write waiting');
    }
    next.resolve();
  }

  fail(): void {
    const next = this.queue.shift();
    if (!next) {
      throw new Error('no write waiting');
    }
    next.reject(new Error('io error'));
  }
}

const quietLogger = (opts: ConstructorParameters<typeof Logger>[0] = {}) =>
  new Logger({now, echo: null, ...opts});

/** The message part of each line written (drops timestamp/level/tag). */
const messages = (text: string) =>
  text
    .split('\n')
    .filter(l => l.length > 0)
    .map(l => l.replace(/^.* \[t\] /, ''));

describe('timestamp', () => {
  it('formats local time as YYYY-MM-DD HH:MM:SS.mmm', () => {
    expect(timestamp(FIXED)).toBe(TS);
  });

  it('zero-pads every field', () => {
    expect(timestamp(new Date(2026, 8, 9, 0, 0, 0, 0))).toBe(
      '2026-09-09 00:00:00.000',
    );
    expect(timestamp(new Date(2026, 11, 31, 23, 59, 59, 999))).toBe(
      '2026-12-31 23:59:59.999',
    );
    expect(timestamp(new Date(2026, 0, 1, 1, 2, 3, 45))).toBe(
      '2026-01-01 01:02:03.045',
    );
  });
});

describe('safeJson', () => {
  it('serialises plain values like JSON.stringify', () => {
    expect(safeJson({a: 1, b: [true, null, 'x']})).toBe(
      '{"a":1,"b":[true,null,"x"]}',
    );
    expect(safeJson('a"b')).toBe('"a\\"b"');
    expect(safeJson(42)).toBe('42');
    expect(safeJson(null)).toBe('null');
  });

  it('marks circular references', () => {
    const a: Record<string, unknown> = {name: 'a'};
    a.self = a;
    a.list = [a];
    expect(safeJson(a)).toBe(
      '{"name":"a","self":"[circular]","list":["[circular]"]}',
    );
  });

  it('replaces functions', () => {
    expect(safeJson({f: () => 1, n: 1})).toBe('{"f":"[function]","n":1}');
    expect(safeJson(() => 1)).toBe('"[function]"');
  });

  it('describes errors instead of serialising them as {}', () => {
    expect(safeJson({e: new TypeError('bad input')})).toBe(
      '{"e":"TypeError: bad input"}',
    );
    expect(safeJson(new Error('boom'))).toBe('"Error: boom"');
  });

  it('returns "undefined" for undefined', () => {
    expect(safeJson(undefined)).toBe('undefined');
  });

  it('reports values JSON.stringify cannot handle', () => {
    const evil = {
      toJSON() {
        throw new Error('nope');
      },
    };
    expect(safeJson(evil)).toBe('[unserialisable: nope]');
    const worse = {
      toJSON() {
        throw 'not an Error';
      },
    };
    expect(safeJson(worse)).toBe('[unserialisable: not an Error]');
  });

  it('truncates long output with a marker giving the dropped length', () => {
    const json = safeJson({text: 'x'.repeat(100)});
    expect(json.length).toBe(111);
    expect(safeJson({text: 'x'.repeat(100)}, 20)).toBe(
      `${json.slice(0, 20)}…(+91 chars)`,
    );
  });

  it('does not truncate output exactly at the limit', () => {
    expect(safeJson('abc', 5)).toBe('"abc"');
    expect(safeJson('abcd', 5)).toBe('"abcd…(+1 chars)');
  });

  // BUG (src/diag/logger.ts:53-60): the WeakSet marks every object seen
  // before, not just ancestors, so a value that is merely shared (not
  // circular) is replaced with "[circular]". Probe layouts share rect
  // objects between shapes, cells, zones and areas, so logging a layout loses
  // every cell rect.
  it('keeps shared (non-circular) references', () => {
    const r = {left: 0, top: 0, right: 1, bottom: 1};
    expect(safeJson({a: r, b: r})).toBe(
      '{"a":{"left":0,"top":0,"right":1,"bottom":1},"b":{"left":0,"top":0,"right":1,"bottom":1}}',
    );
  });

  it('serialises a probe layout without spurious [circular]', () => {
    const json = safeJson(probePages()[0], 1e7);
    expect(json.split('"[circular]"').length - 1).toBe(0);
  });
});

describe('describeError', () => {
  it('uses name and message for errors', () => {
    expect(describeError(new Error('boom'))).toBe('Error: boom');
    expect(describeError(new RangeError('too big'))).toBe(
      'RangeError: too big',
    );
    class SdkError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'SdkError';
      }
    }
    expect(describeError(new SdkError('117'))).toBe('SdkError: 117');
  });

  it('returns strings as they are', () => {
    expect(describeError('plain')).toBe('plain');
  });

  it('serialises anything else', () => {
    expect(describeError({code: 117})).toBe('{"code":117}');
    expect(describeError(42)).toBe('42');
    expect(describeError(null)).toBe('null');
    expect(describeError(undefined)).toBe('undefined');
  });

  it('caps the serialised size at 500 chars', () => {
    const out = describeError({big: 'y'.repeat(1000)});
    expect(out.startsWith('{"big":"yyy')).toBe(true);
    expect(out).toMatch(/…\(\+\d+ chars\)$/);
    expect(out.length).toBeLessThan(520);
  });
});

describe('Logger', () => {
  describe('writing lines', () => {
    it('formats lines as "<timestamp> <LEVEL> [tag] message"', () => {
      const log = quietLogger();
      log.info('probe', 'started');
      log.warn('ink', 'odd frame');
      log.error('sdk', 'failed');
      expect(log.tail()).toEqual([
        `${TS} INFO [probe] started`,
        `${TS} WARN [ink] odd frame`,
        `${TS} ERROR [sdk] failed`,
      ]);
    });

    it('appends serialised data after the message', () => {
      const log = quietLogger();
      log.info('t', 'with data', {a: 1, s: 'x'});
      log.info('t', 'falsy data', 0);
      log.info('t', 'null data', null);
      log.info('t', 'no data');
      expect(log.tail()).toEqual([
        `${TS} INFO [t] with data {"a":1,"s":"x"}`,
        `${TS} INFO [t] falsy data 0`,
        `${TS} INFO [t] null data null`,
        `${TS} INFO [t] no data`,
      ]);
    });

    it('truncates data at maxDataChars', () => {
      const log = quietLogger({maxDataChars: 10});
      log.info('t', 'm', {text: 'abcdefghijklmnop'});
      expect(log.tail()[0]).toBe(`${TS} INFO [t] m {"text":"a…(+17 chars)`);
    });

    it('describes errors in data', () => {
      const log = quietLogger();
      log.error('t', 'oops', {error: new Error('bad')});
      expect(log.tail()[0]).toBe(`${TS} ERROR [t] oops {"error":"Error: bad"}`);
    });

    it('uses the real clock by default', () => {
      const log = new Logger({echo: null});
      log.info('t', 'now');
      expect(log.tail()[0]).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} INFO \[t\] now$/,
      );
    });

    it('reads the clock for every line', () => {
      const times = [
        new Date(2026, 0, 1, 10, 0, 0, 0),
        new Date(2026, 0, 1, 10, 0, 1, 500),
      ];
      let i = 0;
      const log = new Logger({echo: null, now: () => times[i++]});
      log.info('t', 'a');
      log.info('t', 'b');
      expect(log.tail()).toEqual([
        '2026-01-01 10:00:00.000 INFO [t] a',
        '2026-01-01 10:00:01.500 INFO [t] b',
      ]);
    });

    it('section() writes a divider with the title and time', () => {
      const log = quietLogger();
      log.section('P1 letters');
      expect(log.tail()).toEqual([`\n===== P1 letters — ${TS} =====`]);
      expect(log.pendingCount()).toBe(1);
    });
  });

  describe('memory tail', () => {
    it('returns the last n lines, oldest first', () => {
      const log = quietLogger();
      for (let i = 1; i <= 5; i++) {
        log.info('t', `line ${i}`);
      }
      expect(messages(log.tail(2).join('\n'))).toEqual(['line 4', 'line 5']);
      expect(log.tail(100)).toHaveLength(5);
    });

    it('defaults to 40 lines', () => {
      const log = quietLogger();
      for (let i = 1; i <= 50; i++) {
        log.info('t', `line ${i}`);
      }
      expect(log.tail()).toHaveLength(40);
      expect(log.tail()[0]).toContain('line 11');
    });

    it('keeps at most memoryLines lines', () => {
      const log = quietLogger({memoryLines: 3});
      for (let i = 1; i <= 5; i++) {
        log.info('t', `line ${i}`);
      }
      expect(messages(log.tail(10).join('\n'))).toEqual([
        'line 3',
        'line 4',
        'line 5',
      ]);
    });

    it('is not affected by flushing', async () => {
      const sink = new MemorySink();
      const log = quietLogger({sink});
      log.info('t', 'a');
      await log.flush();
      expect(log.tail()).toHaveLength(1);
    });

    it('returns a copy', () => {
      const log = quietLogger();
      log.info('t', 'a');
      log.tail().push('junk');
      expect(log.tail()).toHaveLength(1);
    });
  });

  describe('flush', () => {
    it('appends pending lines joined with newlines plus a trailing newline', async () => {
      const sink = new MemorySink();
      const log = quietLogger({sink});
      log.info('t', 'a');
      log.warn('t', 'b');
      expect(log.pendingCount()).toBe(2);
      await expect(log.flush()).resolves.toBe(true);
      expect(sink.writes).toEqual([`${TS} INFO [t] a\n${TS} WARN [t] b\n`]);
      expect(log.pendingCount()).toBe(0);
    });

    it('only writes new lines on the next flush', async () => {
      const sink = new MemorySink();
      const log = quietLogger({sink});
      log.info('t', 'a');
      await log.flush();
      log.info('t', 'b');
      await log.flush();
      expect(sink.writes.map(messages)).toEqual([['a'], ['b']]);
    });

    it('does not call the sink when nothing is pending', async () => {
      const sink = new MemorySink();
      const append = jest.spyOn(sink, 'append');
      const log = quietLogger({sink});
      await expect(log.flush()).resolves.toBe(true);
      expect(append).not.toHaveBeenCalled();
    });

    it('returns false and keeps the lines when there is no sink', async () => {
      const log = quietLogger();
      expect(log.hasSink()).toBe(false);
      log.info('t', 'a');
      await expect(log.flush()).resolves.toBe(false);
      expect(log.pendingCount()).toBe(1);
    });

    it('returns true with no sink and nothing pending', async () => {
      await expect(quietLogger().flush()).resolves.toBe(true);
    });

    it('writes lines logged before the sink was attached', async () => {
      const log = quietLogger();
      log.info('t', 'early 1');
      log.info('t', 'early 2');
      await log.flush();
      const sink = new MemorySink();
      log.setSink(sink);
      expect(log.hasSink()).toBe(true);
      log.info('t', 'late');
      await expect(log.flush()).resolves.toBe(true);
      expect(messages(sink.text)).toEqual(['early 1', 'early 2', 'late']);
    });

    it('stops writing after setSink(null)', async () => {
      const sink = new MemorySink();
      const log = quietLogger({sink});
      log.setSink(null);
      expect(log.hasSink()).toBe(false);
      log.info('t', 'a');
      await expect(log.flush()).resolves.toBe(false);
      expect(sink.writes).toEqual([]);
    });

    it('keeps the lines when the sink fails and retries them in order', async () => {
      const sink = new MemorySink();
      sink.failNext = 1;
      const log = quietLogger({sink});
      log.info('t', 'a');
      log.info('t', 'b');
      await expect(log.flush()).resolves.toBe(false);
      expect(log.pendingCount()).toBe(2);
      expect(sink.writes).toEqual([]);
      log.info('t', 'c');
      await expect(log.flush()).resolves.toBe(true);
      expect(sink.writes).toHaveLength(1);
      expect(messages(sink.text)).toEqual(['a', 'b', 'c']);
      expect(log.pendingCount()).toBe(0);
    });

    it('keeps lines logged during a failed write after the failed batch', async () => {
      const sink = new ManualSink();
      const log = quietLogger({sink});
      log.info('t', 'a');
      const first = log.flush();
      await settle();
      log.info('t', 'b');
      sink.fail();
      await expect(first).resolves.toBe(false);
      const second = log.flush();
      await settle();
      sink.complete();
      await expect(second).resolves.toBe(true);
      expect(messages(sink.written.join(''))).toEqual(['a', 'b']);
    });

    it('survives a sink that throws synchronously', async () => {
      const log = quietLogger({
        sink: {
          append() {
            throw new Error('sync failure');
          },
        },
      });
      log.info('t', 'a');
      await expect(log.flush()).resolves.toBe(false);
      expect(log.pendingCount()).toBe(1);
    });

    it('echoes a note when a write fails, without logging it to the file', async () => {
      const echoed: string[] = [];
      const sink = new MemorySink();
      sink.failNext = 1;
      const log = new Logger({sink, now, echo: l => echoed.push(l)});
      log.info('t', 'a');
      await log.flush();
      expect(echoed).toEqual([
        `${TS} INFO [t] a`,
        '[log] write failed: Error: disk full',
      ]);
      expect(log.pendingCount()).toBe(1);
      await log.flush();
      expect(sink.text).not.toContain('write failed');
    });
  });

  describe('pending cap', () => {
    it('drops the oldest pending lines beyond pendingLines', () => {
      const log = quietLogger({pendingLines: 3});
      for (let i = 1; i <= 5; i++) {
        log.info('t', `${i}`);
      }
      expect(log.pendingCount()).toBe(3);
      // The memory tail is separate and still has everything.
      expect(log.tail()).toHaveLength(5);
    });

    it('prefixes the next successful flush with a dropped-lines note', async () => {
      const log = quietLogger({pendingLines: 3});
      for (let i = 1; i <= 5; i++) {
        log.info('t', `${i}`);
      }
      const sink = new MemorySink();
      log.setSink(sink);
      await expect(log.flush()).resolves.toBe(true);
      const lines = sink.text.split('\n');
      expect(lines[0]).toBe(
        '[2 earlier lines dropped before the log file was available]',
      );
      expect(messages(lines.slice(1).join('\n'))).toEqual(['3', '4', '5']);
      expect(sink.text.endsWith('\n')).toBe(true);
    });

    it('writes the note only once', async () => {
      const log = quietLogger({pendingLines: 1});
      log.info('t', '1');
      log.info('t', '2');
      const sink = new MemorySink();
      log.setSink(sink);
      await log.flush();
      log.info('t', '3');
      await log.flush();
      expect(sink.writes[0]).toMatch(/^\[1 earlier lines dropped/);
      expect(sink.writes[1]).not.toContain('dropped');
    });

    it('keeps the note (and its count) across a failed write', async () => {
      const sink = new MemorySink();
      const log = quietLogger({pendingLines: 2});
      log.info('t', '1');
      log.info('t', '2');
      log.info('t', '3');
      sink.failNext = 1;
      log.setSink(sink);
      await expect(log.flush()).resolves.toBe(false);
      await expect(log.flush()).resolves.toBe(true);
      expect(sink.writes).toHaveLength(1);
      expect(sink.writes[0]).toMatch(/^\[1 earlier lines dropped/);
      expect(messages(sink.writes[0].split('\n').slice(1).join('\n'))).toEqual([
        '2',
        '3',
      ]);
    });

    it('applies the cap when a failed batch is put back', async () => {
      const sink = new ManualSink();
      const log = quietLogger({sink, pendingLines: 3});
      log.info('t', '1');
      log.info('t', '2');
      log.info('t', '3');
      const first = log.flush();
      await settle();
      log.info('t', '4');
      log.info('t', '5');
      sink.fail();
      await first;
      // 1..5 put back, then trimmed to the newest 3.
      expect(log.pendingCount()).toBe(3);
      const second = log.flush();
      await settle();
      sink.complete();
      await second;
      const [note, ...rest] = sink.written[0].split('\n');
      expect(note).toBe(
        '[2 earlier lines dropped before the log file was available]',
      );
      expect(messages(rest.join('\n'))).toEqual(['3', '4', '5']);
    });

    // BUG (src/diag/logger.ts:162): after a successful append, `dropped` is
    // reset to 0 even if more lines were dropped *while* that append was in
    // flight. Those drops are then never reported. Fix: remember the count
    // that went into the note and subtract it, instead of zeroing.
    it('reports lines dropped while a write was in flight', async () => {
      const sink = new ManualSink();
      const log = quietLogger({sink, pendingLines: 2});
      log.info('t', '1');
      log.info('t', '2');
      const first = log.flush();
      await settle();
      log.info('t', '3');
      log.info('t', '4');
      log.info('t', '5'); // '3' is dropped while '1','2' are being written
      sink.complete();
      await first;
      const second = log.flush();
      await settle();
      sink.complete();
      await second;
      expect(sink.written[1]).toMatch(/^\[1 earlier lines dropped/);
    });
  });

  describe('concurrent flushes', () => {
    it('do not duplicate or lose lines, and never overlap writes', async () => {
      const sink = new ManualSink();
      const log = quietLogger({sink});
      log.info('t', 'a');
      log.info('t', 'b');
      const p1 = log.flush();
      log.info('t', 'c');
      const p2 = log.flush();
      const p3 = log.flush();
      await settle();
      expect(sink.waiting).toHaveLength(1);
      log.info('t', 'd');
      sink.complete();
      await settle();
      // The chained flush picks up everything logged meanwhile.
      expect(sink.waiting).toHaveLength(1);
      sink.complete();
      await expect(Promise.all([p1, p2, p3])).resolves.toEqual([
        true,
        true,
        true,
      ]);
      expect(sink.written.map(messages)).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
      expect(sink.maxInFlight).toBe(1);
      expect(log.pendingCount()).toBe(0);
    });

    it('many overlapping flushes write each line exactly once, in order', async () => {
      const sink = new ManualSink();
      const log = quietLogger({sink});
      const flushes: Promise<boolean>[] = [];
      for (let i = 0; i < 10; i++) {
        log.info('t', `${i}`);
        flushes.push(log.flush());
        if (i % 3 === 2) {
          await settle();
          while (sink.waiting.length > 0) {
            sink.complete();
            await settle();
          }
        }
      }
      for (let i = 0; i < 20; i++) {
        await settle();
        while (sink.waiting.length > 0) {
          sink.complete();
          await settle();
        }
      }
      await Promise.all(flushes);
      expect(messages(sink.written.join(''))).toEqual(
        Array.from({length: 10}, (_, i) => `${i}`),
      );
      expect(sink.maxInFlight).toBe(1);
    });

    it('a flush queued behind a failed one retries the lines', async () => {
      const sink = new ManualSink();
      const log = quietLogger({sink});
      log.info('t', 'a');
      const p1 = log.flush();
      const p2 = log.flush();
      await settle();
      sink.fail();
      await expect(p1).resolves.toBe(false);
      await settle();
      sink.complete();
      await expect(p2).resolves.toBe(true);
      expect(sink.written.map(messages)).toEqual([['a']]);
    });
  });

  describe('echo', () => {
    it('receives each line as it is logged', () => {
      const echoed: string[] = [];
      const log = new Logger({now, echo: l => echoed.push(l)});
      log.info('t', 'a');
      log.section('S');
      log.error('t', 'b', {x: 1});
      expect(echoed).toEqual(log.tail());
      expect(echoed).toHaveLength(3);
    });

    it('a throwing echo does not break logging', async () => {
      const sink = new MemorySink();
      const log = new Logger({
        sink,
        now,
        echo: () => {
          throw new Error('console gone');
        },
      });
      expect(() => log.info('t', 'a')).not.toThrow();
      expect(log.tail()).toHaveLength(1);
      await expect(log.flush()).resolves.toBe(true);
      expect(messages(sink.text)).toEqual(['a']);
    });

    it('defaults to console.log, and null turns it off', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        new Logger({now}).info('t', 'to console');
        expect(spy).toHaveBeenCalledWith(`${TS} INFO [t] to console`);
        spy.mockClear();
        new Logger({now, echo: null}).info('t', 'silent');
        expect(spy).not.toHaveBeenCalled();
        new Logger().info('t', 'all defaults');
        expect(spy).toHaveBeenCalledWith(
          expect.stringMatching(/ INFO \[t\] all defaults$/),
        );
      } finally {
        spy.mockRestore();
      }
    });
  });
});
