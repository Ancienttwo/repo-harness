import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { decodeRuntimeCaptureSnapshot, RUNTIME_CAPTURE_MAX_BYTES, type NativeRuntimeProvider, type RuntimeCaptureSnapshot } from '../../core/operator/runtime-capture';

export interface NativeRuntimeSourceConfig {
  source_id: string; provider: NativeRuntimeProvider; snapshot_path: string;
}

/** Read only a bounded regular file. Atomic replacements are allowed between reads. */
export async function readNativeRuntimeSnapshot(config: NativeRuntimeSourceConfig): Promise<RuntimeCaptureSnapshot> {
  if (!isAbsolute(config.snapshot_path)) throw new Error('runtime_native_path');
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error('runtime_native_nofollow');
  const maximum = BigInt(RUNTIME_CAPTURE_MAX_BYTES);
  const before = await lstat(config.snapshot_path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) throw new Error('runtime_native_file');
  const handle = await open(config.snapshot_path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > maximum) throw new Error('runtime_native_file');
    const buffer = Buffer.alloc(RUNTIME_CAPTURE_MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > RUNTIME_CAPTURE_MAX_BYTES) throw new Error('runtime_native_file');
    const after = await handle.stat({ bigint: true }), pathAfter = await lstat(config.snapshot_path, { bigint: true });
    if (!pathAfter.isFile() || pathAfter.isSymbolicLink() || pathAfter.dev !== opened.dev || pathAfter.ino !== opened.ino || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs || BigInt(length) !== after.size || pathAfter.size !== after.size || pathAfter.mtimeNs !== after.mtimeNs || pathAfter.ctimeNs !== after.ctimeNs) throw new Error('runtime_native_file_changed');
    const snapshot = decodeRuntimeCaptureSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))));
    if (snapshot.source_id !== config.source_id || snapshot.provider !== config.provider) throw new Error('runtime_native_identity');
    return snapshot;
  } finally { await handle.close(); }
}
