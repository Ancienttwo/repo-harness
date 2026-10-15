import * as fs from 'fs';
import { join } from 'path';
import { mock } from 'bun:test';

// The lock module binds named `fs` imports. Only mock.module before the
// dynamic import reaches them, so this worker can die at the exact write.
const [root, relativeLockPath] = process.argv.slice(2);
if (!root || !relativeLockPath) {
  throw new Error('owner-crash worker arguments are incomplete');
}

const realWriteFileSync = fs.writeFileSync;
const realWriteSync = fs.writeSync;

function killOnOwnerRecordWrite(target: unknown, data: unknown): void {
  if (typeof target !== 'number') return;
  const text = typeof data === 'string'
    ? data
    : ArrayBuffer.isView(data) ? new TextDecoder().decode(data) : '';
  if (!text.includes('"token"')) return;
  process.kill(process.pid, 'SIGKILL');
  for (;;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
}

const mocked: Record<string, unknown> = {
  ...fs,
  writeFileSync(target: unknown, data: unknown, ...rest: unknown[]) {
    killOnOwnerRecordWrite(target, data);
    return Reflect.apply(realWriteFileSync, fs, [target, data, ...rest]);
  },
  writeSync(target: unknown, data: unknown, ...rest: unknown[]) {
    killOnOwnerRecordWrite(target, data);
    return Reflect.apply(realWriteSync, fs, [target, data, ...rest]);
  },
};
mock.module('fs', () => ({ ...mocked, default: mocked }));

const lock = await import(join(import.meta.dir, '../../src/effects/locking/exclusive-directory-lock.ts'));
lock.acquireExclusiveDirectoryLock(root, relativeLockPath);
process.stderr.write('the owner record write was never intercepted\n');
process.exit(3);
