import {
  isProbeNotePath,
  localDate,
  logFile,
  probeNoteName,
  probeNotePath,
  templatePath,
} from '../../src/sdk/paths';

describe('paths', () => {
  const d = new Date(2026, 10, 7, 9, 5, 3);

  it('names probe notes by local time', () => {
    expect(probeNoteName(d)).toBe('Probe 2026-11-07 090503.note');
    expect(probeNotePath(d)).toBe(
      '/storage/emulated/0/Note/SupernotePuzzles/Probe 2026-11-07 090503.note',
    );
  });

  it('recognises probe notes only in our folder', () => {
    expect(isProbeNotePath(probeNotePath(d))).toBe(true);
    expect(isProbeNotePath('/sdcard/Note/SupernotePuzzles/Probe x.note')).toBe(
      true,
    );
    expect(isProbeNotePath('/storage/emulated/0/Note/Other/Probe x.note')).toBe(
      false,
    );
    expect(
      isProbeNotePath('/storage/emulated/0/Note/SupernotePuzzles/Mini.note'),
    ).toBe(false);
    expect(
      isProbeNotePath('/storage/emulated/0/Note/SupernotePuzzles/Probe x.pdf'),
    ).toBe(false);
    expect(isProbeNotePath(null)).toBe(false);
    expect(isProbeNotePath('')).toBe(false);
  });

  it('puts templates under MyStyle and the log under Document', () => {
    expect(templatePath('p1-letters', 'abc')).toBe(
      '/storage/emulated/0/MyStyle/SupernotePuzzles/p1-letters-abc.png',
    );
    expect(logFile()).toBe(
      '/storage/emulated/0/Document/SupernotePuzzles/log.txt',
    );
  });

  it('formats the local date for feed URLs', () => {
    expect(localDate(d)).toBe('2026-11-07');
  });
});
