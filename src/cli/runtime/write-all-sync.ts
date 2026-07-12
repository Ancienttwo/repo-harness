import { writeSync } from 'fs';

export type SyncWriter = (
  fd: number,
  buffer: Uint8Array,
  offset: number,
  length: number,
) => number;

export function writeAllSync(
  fd: number,
  value: string | Uint8Array,
  writer: SyncWriter = writeSync,
): void {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value;
  let offset = 0;

  while (offset < buffer.byteLength) {
    const remaining = buffer.byteLength - offset;
    const written = writer(fd, buffer, offset, remaining);
    if (!Number.isInteger(written) || written <= 0 || written > remaining) {
      throw new Error(`invalid synchronous write progress ${written} at byte ${offset}`);
    }
    offset += written;
  }
}
