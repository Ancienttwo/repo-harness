import { describe, expect, test } from 'bun:test';
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { listHelperFiles, resolveHelper } from '../../src/effects/runtime/helper-runner';
import { renderWorkflowContractMarker } from '../../src/core/adoption/workflow-contract-asset';
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
});
