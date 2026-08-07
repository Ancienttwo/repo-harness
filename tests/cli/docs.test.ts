import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { listRuntimeDocs, resolveRuntimeDoc } from '../../src/cli/commands/docs';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function runDocs(args: string[]) {
  return spawnSync('bun', [CLI, 'docs', ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
}

describe('docs command', () => {
  test('lists bundled runtime docs as text and JSON', () => {
    const text = runDocs(['list']);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain('harness-overview');
    expect(text.stdout).toContain('Harness Overview');
    expect(text.stdout).not.toContain('AGENTS');
    expect(text.stdout).not.toContain('CLAUDE');

    const json = runDocs(['list', '--json']);
    expect(json.status).toBe(0);
    const parsed = JSON.parse(json.stdout);
    expect(parsed.docs.some((entry: { id: string }) => entry.id === 'harness-overview')).toBe(true);
    expect(parsed.docs.some((entry: { fileName: string }) => entry.fileName === 'AGENTS.md')).toBe(false);
    expect(parsed.docs.find((entry: { id: string }) => entry.id === 'harness-overview').path).toContain(
      'assets/reference-configs/harness-overview.md',
    );
  }, 30_000);

  test('resolves and prints bundled runtime docs', () => {
    const pathResult = runDocs(['path', 'harness-overview']);
    expect(pathResult.status).toBe(0);
    const docPath = pathResult.stdout.trim();
    expect(docPath.endsWith('assets/reference-configs/harness-overview.md')).toBe(true);
    expect(existsSync(docPath)).toBe(true);
    expect(readFileSync(docPath, 'utf-8')).toContain('# Harness Overview');

    const showResult = runDocs(['show', 'harness-overview']);
    expect(showResult.status).toBe(0);
    expect(showResult.stdout).toContain('# Harness Overview');
  }, 30_000);

  test('returns exit code 2 for unknown docs', () => {
    const result = runDocs(['path', 'missing-doc']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown doc "missing-doc"');
  }, 30_000);

  test('exports reusable doc resolution helpers', () => {
    expect(listRuntimeDocs().map((entry) => entry.id)).toContain('harness-overview');
    expect(resolveRuntimeDoc('harness-overview.md')?.title).toBe('Harness Overview');
  });
});
