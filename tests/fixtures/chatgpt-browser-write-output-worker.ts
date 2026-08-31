import { existsSync, writeFileSync } from 'fs';

import { writeBrowserSession } from '../../src/cli/chatgpt-browser/session-store';

const [repoRoot, outputPath, output, readyPath, releasePath] = process.argv.slice(2);
if (!repoRoot || !outputPath || output === undefined || !readyPath || !releasePath) {
  throw new Error('chatgpt browser write-output worker arguments are incomplete');
}

writeFileSync(readyPath, `${process.pid}\n`, { flag: 'wx' });
while (!existsSync(releasePath)) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
}

const bundle = {
  prompt: 'Write the worker output.',
  rendered: 'Write the worker output.\n',
  files: [],
  followups: [],
  totalChars: 'Write the worker output.'.length,
};

try {
  const result = writeBrowserSession({
    input: {
      repoRoot,
      title: `atomic output ${process.pid}`,
      prompt: 'Write the worker output.',
      dryRun: true,
      writeOutput: outputPath,
    },
    provider: 'oracle',
    status: 'dry_run',
    bundle,
    output,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, output, sessionId: result.sessionId })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
}
