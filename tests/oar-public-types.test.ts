import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const consumer = `
import { grokRuntime, promptAndWait, type Session, type SessionOptions, type Event } from '@botiverse/oar';
async function consume(options: SessionOptions): Promise<void> {
  const installation = await grokRuntime.installation();
  if (installation.kind !== 'available') throw new Error('installation unavailable');
  const session: Session = await grokRuntime.session(installation, options);
  const stop = session.events((event: Event) => { void event.kind; }, {
    cursor: { sessionId: session.id, afterSeq: -1 },
  });
  try {
    const run = await promptAndWait(session, 'compile-only', { timeoutMs: 1000 });
    if (run.kind !== 'rejected') void run.outcome.kind;
  } finally {
    stop();
    await session.dispose();
  }
}
void consume;
`;

// Compile real published declarations. These fixtures never execute a Session
// or provider; the actual root policy supplies D4 and strict source checking.
function compile(types: 'bun' | 'node', invalidSource = false) {
  const runs = join(root, '.ai/harness/runs');
  mkdirSync(runs, { recursive: true });
  const dir = mkdtempSync(join(runs, 'oar-public-types-'));
  try {
    const source = invalidSource
      ? `${consumer}\nconst invalid: SessionOptions = { cwd: undefined };\nvoid invalid;\n`
      : consumer;
    writeFileSync(join(dir, 'consumer.ts'), source);
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      extends: join(root, 'tsconfig.json'),
      compilerOptions: { types: [types] },
      include: ['consumer.ts'],
    }));
    return spawnSync('node', [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--project', join(dir, 'tsconfig.json'),
    ], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('OAR public declarations under the approved D4 policy', () => {
  for (const types of ['bun', 'node'] as const) {
    test(`the real Session API compiles with ${types} ambient types`, () => {
      const result = compile(types);
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }, 40_000);
  }

  test('incorrect application source is still rejected', () => {
    const result = compile('bun', true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('consumer.ts');
    expect(result.stdout + result.stderr).toContain('TS2322');
  }, 40_000);
});
