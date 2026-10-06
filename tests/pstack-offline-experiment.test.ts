import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
// This is a real directory consumer for the affected-test selector. The private
// suite reads its fixture evidence and provenance under this exact directory.
const EXPERIMENT = join(ROOT, 'experiments/private/pstack-watch-pr');
const PREFIX = 'PSTACK_EXPERIMENT_RESULT=';

type ChildResult = {
  status: number | null;
  signal: string | null;
  error?: Error;
  stdout: string;
  stderr: string;
};
function requireSuccessfulChild(result: ChildResult): string {
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.error) throw new Error(`Offline suite process error: ${result.error.message}\n${output}`, { cause: result.error });
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(`Offline suite failed: exit=${result.status}; signal=${result.signal}\n${output}`);
  }
  return result.stdout;
}

describe('private pstack experiment CI owner', () => {
  test('runs the bounded offline suite in its own process and checks its recorded result', () => {
    const parentFetch = globalThis.fetch;
    const parentSpawn = Bun.spawn;
    const result = spawnSync(process.execPath, [
      '--no-env-file', 'test', './comparison.test.ts', './vendor/github.test.ts', './vendor/policy.test.ts',
      '--timeout', '45000', '--max-concurrency', '1',
    ], {
      cwd: EXPERIMENT, encoding: 'utf8', timeout: 55_000, maxBuffer: 2 * 1024 * 1024,
    });
    const stdout = requireSuccessfulChild(result);
    console.log(result.stderr.trim());
    const records = stdout.split(/\r?\n/).filter(line => line.startsWith(PREFIX));
    expect(records).toHaveLength(1);
    const actual = JSON.parse(records[0]!.slice(PREFIX.length));
    const { maintenance: _maintenance, decision: _decision, ...expected } = JSON.parse(
      readFileSync(join(EXPERIMENT, 'results.json'), 'utf8'),
    );
    expect(actual).toEqual(expected);
    // The private preload changes globals and module mocks only in its child.
    expect(globalThis.fetch).toBe(parentFetch);
    expect(Bun.spawn).toBe(parentSpawn);
  }, 60_000);

  test('propagates process errors, timeout, signal, and nonzero exit with diagnostics', () => {
    const success: ChildResult = { status: 0, signal: null, stdout: 'stdout evidence', stderr: 'stderr evidence' };
    expect(requireSuccessfulChild(success)).toBe('stdout evidence');
    for (const failure of [
      { ...success, error: new Error('spawn failed') },
      { ...success, status: null, error: new Error('ETIMEDOUT'), signal: 'SIGTERM' },
      { ...success, status: null, signal: 'SIGKILL' },
      { ...success, status: 1 },
      { ...success, signal: 'SIGTERM' },
    ]) {
      expect(() => requireSuccessfulChild(failure)).toThrow('stderr evidence');
    }
  });
});
