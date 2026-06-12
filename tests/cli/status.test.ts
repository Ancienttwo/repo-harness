import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { runStatus, formatStatus } from '../../src/cli/commands/status';
import { runInstall } from '../../src/cli/commands/install';

function withTempHome(fn: (home: string) => void): void {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-status-')));
  const prev = process.env.HOME;
  process.env.HOME = tmp;
  try {
    fn(tmp);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('status command (Phase 1C)', () => {
  test('reports CLI version + 8 routes with correct per-event breakdown', () => {
    withTempHome(() => {
      const r = runStatus();
      expect(r.cli.version).toBeTruthy();
      expect(r.routes.total).toBe(8);
      expect(r.routes.byEvent.PreToolUse).toBe(2);
      expect(r.routes.byEvent.PostToolUse).toBe(3);
      expect(r.routes.byEvent.SessionStart).toBe(1);
      expect(r.routes.byEvent.UserPromptSubmit).toBe(1);
      expect(r.routes.byEvent.Stop).toBe(1);
    });
  });

  test('before install: every host reports alreadyConfigured=false', () => {
    withTempHome(() => {
      const r = runStatus();
      expect(r.targets.length).toBeGreaterThan(0);
      for (const t of r.targets) {
        expect(t.alreadyConfigured).toBe(false);
        expect(t.managedEntryCount).toBe(0);
      }
    });
  });

  test('after install: managedEntryCount equals expectedEntryCount per host', () => {
    withTempHome(() => {
      runInstall({ target: 'both', location: 'global' });
      const r = runStatus();
      const codex = r.targets.find((t) => t.id === 'codex')!;
      expect(codex.alreadyConfigured).toBe(true);
      expect(codex.managedEntryCount).toBe(codex.expectedEntryCount);
      expect(codex.managedEntryCount).toBe(8);
      const claude = r.targets.find((t) => t.id === 'claude')!;
      expect(claude.managedEntryCount).toBe(8);
    });
  });

  test('detects opt-in repo via .ai/harness/workflow-contract.json marker', () => {
    withTempHome(() => {
      const repo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-status-repo-')),
      );
      try {
        execSync('git init', { cwd: repo, stdio: 'ignore' });
        fs.mkdirSync(path.join(repo, '.ai/harness'), { recursive: true });
        fs.writeFileSync(path.join(repo, '.ai/harness/workflow-contract.json'), '{}');
        const r = runStatus(repo);
        expect(r.repo.inGitRepo).toBe(true);
        expect(r.repo.optIn).toBe(true);
        expect(r.repo.repoRoot).toBe(repo);
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  });

  test('non-git-repo cwd reports inGitRepo=false and optIn=false', () => {
    withTempHome(() => {
      const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-')));
      try {
        const r = runStatus(tmp);
        expect(r.repo.inGitRepo).toBe(false);
        expect(r.repo.optIn).toBe(false);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  test('formatStatus produces human-readable text', () => {
    withTempHome(() => {
      const text = formatStatus(runStatus(), false);
      expect(text).toContain('repo-harness');
      expect(text).toContain('Hosts:');
      expect(text).toContain('Routes:');
      expect(text).toContain('Current repo:');
    });
  });

  test('formatStatus --json produces parseable JSON', () => {
    withTempHome(() => {
      const json = formatStatus(runStatus(), true);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.cli).toBeDefined();
      expect(parsed.routes.total).toBe(8);
    });
  });
});
