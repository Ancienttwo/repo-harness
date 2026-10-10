import { describe, expect, test } from 'bun:test';
import { writeAllSync, type SyncWriter } from '../src/cli/runtime/write-all-sync';

describe('writeAllSync', () => {
  test('continues until every byte is written', () => {
    const chunks: Uint8Array[] = [];
    const writer: SyncWriter = (_fd, buffer, offset, length) => {
      const written = Math.min(3, length);
      chunks.push(buffer.slice(offset, offset + written));
      return written;
    };

    writeAllSync(1, 'A界B界C', writer);

    expect(Buffer.concat(chunks).toString('utf8')).toBe('A界B界C');
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('fails instead of looping when the writer makes no progress', () => {
    expect(() => writeAllSync(1, 'payload', () => 0)).toThrow(
      'invalid synchronous write progress 0 at byte 0',
    );
  });

  test('rejects a writer that reports more bytes than requested', () => {
    expect(() => writeAllSync(1, 'payload', (_fd, _buffer, _offset, length) => length + 1)).toThrow(
      'invalid synchronous write progress 8 at byte 0',
    );
  });
});
