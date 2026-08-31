import { existsSync, writeFileSync } from 'fs';

import { guardedWriteFile } from '../../src/cli/mcp/guarded-write';

const [absolutePath, relativePath, encodedContent, expected, readyPath, releasePath] = process.argv.slice(2);
if (!absolutePath || !relativePath || !encodedContent || !expected || !readyPath || !releasePath) {
  throw new Error('guarded-write worker arguments are incomplete');
}

writeFileSync(readyPath, `${process.pid}\n`, { flag: 'wx' });
while (!existsSync(releasePath)) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
}

const outcome = guardedWriteFile(
  absolutePath,
  relativePath,
  Buffer.from(encodedContent, 'base64').toString('utf-8'),
  expected === '-' ? undefined : expected,
);
process.stdout.write(`${JSON.stringify(outcome)}\n`);
