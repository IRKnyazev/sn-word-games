import {fileSink} from '../../src/diag/fileSink';
import {fakeFiles} from '../helpers/fakes';

describe('fileSink', () => {
  it('creates the folder once and appends', async () => {
    const files = fakeFiles();
    const sink = fileSink(files, '/root/Document/X/log.txt');
    await sink.append('a\n');
    await sink.append('b\n');
    expect(files.mkdir).toHaveBeenCalledTimes(1);
    expect(files.mkdir).toHaveBeenCalledWith('/root/Document/X');
    expect(files.written.get('/root/Document/X/log.txt')).toBe('a\nb\n');
  });

  it('rotates a log that grew past the limit', async () => {
    const files = fakeFiles();
    const sink = fileSink(files, '/r/log.txt', 5);
    await sink.append('123456\n');
    await sink.append('next\n');
    expect(files.written.get('/r/log.prev.txt')).toBe('123456\n');
    expect(files.written.get('/r/log.txt')).toBe('next\n');
  });

  it('keeps appending when rotation fails', async () => {
    const files = fakeFiles();
    (files.move as jest.Mock).mockRejectedValue(
      new Error('no delete permission'),
    );
    const sink = fileSink(files, '/r/log.txt', 5);
    await sink.append('123456\n');
    await sink.append('next\n');
    expect(files.written.get('/r/log.txt')).toBe('123456\nnext\n');
  });

  it('propagates write errors so the logger keeps the lines', async () => {
    const files = fakeFiles();
    (files.appendUtf8 as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));
    const sink = fileSink(files, '/r/log.txt');
    await expect(sink.append('x')).rejects.toThrow('EACCES');
  });
});
