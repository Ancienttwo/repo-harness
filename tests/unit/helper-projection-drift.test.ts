import { describe, expect, test } from 'bun:test';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { listHelperFiles, resolveHelper } from '../../src/effects/runtime/helper-runner';
import { renderWorkflowContractMarker } from '../../src/core/adoption/workflow-contract-asset';
import { collectProjectionFiles, readProjectionFile, writeProjectionFileAtomic } from '../../src/core/source-projection';
const ROOT = join(import.meta.dir, '..', '..');
describe('single executable helper authority', () => {
  test('every packaged helper resolves the exact canonical script, including protected helpers', () => {
    const files = listHelperFiles({});
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const actual = resolveHelper(file, ROOT, {});
      expect(actual?.source).toBe('package');
      expect(actual?.path).toBe(join(ROOT, 'scripts', file));
      expect(lstatSync(actual!.path).isFile()).toBe(true);
      expect(lstatSync(actual!.path).isSymbolicLink()).toBe(false);
    }
  });
  test('the package defines the runtime location and the repo holds the opt-in marker', () => {
    const packed = JSON.parse(readFileSync(join(ROOT, 'assets/workflow-contract.v1.json'), 'utf8'));
    const local = readFileSync(join(ROOT, '.ai/harness/workflow-contract.json'), 'utf8');
    expect(packed.helpers.runtimeDirectory).toBe('package:scripts');
    expect(local).toBe(renderWorkflowContractMarker());
  });
  test('check rejects byte and mode drift; write repairs only the disposable projection', () => {
    const root = mkdtempSync(join(tmpdir(), 'helper-projection-'));
    try {
      for (const dir of ['scripts', 'src/core', 'assets/templates/helpers', 'assets/herdr/webhook-notify']) mkdirSync(join(root, dir), { recursive: true });
      for (const path of ['scripts/sync-helper-sources.ts', 'scripts/workflow-contract.ts', 'src/core/source-projection.ts', 'src/core/worktree-location.mjs']) {
        copyFileSync(join(ROOT, path), join(root, path));
      }
      copyFileSync(join(ROOT, 'src/core/worktree-location.mjs'), join(root, 'assets/herdr/webhook-notify/worktree-location.mjs'));
      const contract = JSON.parse(readFileSync(join(ROOT, 'assets/workflow-contract.v1.json'), 'utf8'));
      contract.helpers.scripts = ['fixture.sh'];
      writeFileSync(join(root, 'assets/workflow-contract.v1.json'), JSON.stringify(contract));
      const source = join(root, 'scripts/fixture.sh');
      const target = join(root, 'assets/templates/helpers/fixture.sh');
      writeFileSync(source, '#!/bin/bash\necho canonical\n', { mode: 0o755 });
      writeFileSync(target, '#!/bin/bash\necho stale\n', { mode: 0o755 });
      const invoke = (mode: string) => spawnSync(process.execPath, [join(root, 'scripts/sync-helper-sources.ts'), mode], {
        cwd: root, encoding: 'utf8', timeout: 10_000,
      });
      const drift = invoke('--check');
      expect(drift.status, drift.stderr).toBe(1);
      expect(drift.stderr).toContain('content drift');
      expect(readFileSync(target, 'utf8')).toContain('stale');
      expect(invoke('--write').status).toBe(0);
      expect(invoke('--check').status).toBe(0);
      chmodSync(target, 0o644);
      const modeDrift = invoke('--check');
      expect(modeDrift.status).toBe(1);
      expect(modeDrift.stderr).toContain('mode drift');
      expect(invoke('--write').status).toBe(0);
      expect(invoke('--check').status).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('projection reads reject symlinked roots and ancestor directories', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'source-projection-read-'));
    const sourceRoot = join(tmp, 'source');
    const sourceLink = join(tmp, 'source-link');
    const outside = join(tmp, 'outside');
    try {
      mkdirSync(sourceRoot);
      mkdirSync(outside);
      writeFileSync(join(sourceRoot, 'local.sh'), '#!/bin/bash\n');
      writeFileSync(join(outside, 'escaped.sh'), '#!/bin/bash\n');
      symlinkSync(sourceRoot, sourceLink);

      expect(() => collectProjectionFiles(sourceLink)).toThrow('projection root must not be a symlink');

      symlinkSync(outside, join(sourceRoot, 'nested'));
      expect(() => readProjectionFile(sourceRoot, 'nested/escaped.sh')).toThrow(
        'symlink is not allowed in projection path',
      );
      expect(() => collectProjectionFiles(sourceRoot)).toThrow('symlink is not allowed in source projection');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
  test('projection writes reject symlinked roots, symlinked parents, and repo escapes', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'source-projection-write-'));
    const repoRoot = join(tmp, 'repo');
    const repoLink = join(tmp, 'repo-link');
    const outside = join(tmp, 'outside');
    try {
      mkdirSync(join(repoRoot, '.ai'), { recursive: true });
      mkdirSync(outside);
      symlinkSync(repoRoot, repoLink);

      expect(() =>
        writeProjectionFileAtomic(repoLink, join(repoLink, '.ai', 'hooks', 'test.sh'), 'safe\n', '100644'),
      ).toThrow('projection root must not be a symlink');

      symlinkSync(outside, join(repoRoot, '.ai', 'hooks'));
      expect(() =>
        writeProjectionFileAtomic(repoRoot, join(repoRoot, '.ai', 'hooks', 'test.sh'), 'safe\n', '100644'),
      ).toThrow('symlink is not allowed in projection parent');
      expect(existsSync(join(outside, 'test.sh'))).toBe(false);

      expect(() =>
        writeProjectionFileAtomic(repoRoot, join(repoRoot, '..', 'escaped.sh'), 'safe\n', '100644'),
      ).toThrow('projection path escapes root');
      expect(existsSync(join(tmp, 'escaped.sh'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
