import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { runStatus, formatStatus } from '../../src/cli/commands/status';
import { runInstall } from '../../src/cli/commands/install';
import { installProfileStatePath } from '../../src/cli/installer/install-profile';

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
  test('reports CLI version + 11 routes with correct per-event breakdown', () => {
    withTempHome(() => {
      const r = runStatus();
      expect(r.cli.version).toBeTruthy();
      expect(r.routes.total).toBe(11);
      expect(r.routes.byEvent.PreToolUse).toBe(2);
      expect(r.routes.byEvent.PostToolUse).toBe(3);
      expect(r.routes.byEvent.SessionStart).toBe(1);
      expect(r.routes.byEvent.UserPromptSubmit).toBe(2);
      expect(r.routes.byEvent.SubagentStart).toBe(1);
      expect(r.routes.byEvent.SubagentStop).toBe(1);
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
      expect(codex.managedEntryCount).toBe(11);
      const claude = r.targets.find((t) => t.id === 'claude')!;
      expect(claude.managedEntryCount).toBe(claude.expectedEntryCount);
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
      expect(parsed.routes.total).toBe(11);
    });
  });

  test('installedProfile reports not recorded when install-state.json is absent', () => {
    withTempHome(() => {
      const r = runStatus();
      expect(r.installedProfile).toEqual({ recorded: false });
      const text = formatStatus(r, false);
      expect(text).toContain('Installed profile:');
      expect(text).toContain('(not recorded)');
    });
  });

  test('installedProfile reads back profile + components from install-state.json', () => {
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({
        protocol: 1,
        profile: 'standard',
        components: ['cli', 'effective-state', 'host-adapters', 'adaptive-workflow'],
        transaction_id: 'test-txn',
        applied_at: '2026-01-01T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }));

      const r = runStatus();
      expect(r.installedProfile).toEqual({
        recorded: true,
        profile: 'standard',
        components: ['cli', 'effective-state', 'host-adapters', 'adaptive-workflow'],
      });

      const text = formatStatus(r, false);
      expect(text).toContain('profile: standard');
      expect(text).toContain('components: cli, effective-state, host-adapters, adaptive-workflow');
    });
  });

  test('installedProfile reports invalid (not not-recorded) when install-state.json is corrupt JSON', () => {
    // A corrupt install is a materially different diagnostic signal than
    // "never installed" -- conflating them (as this test used to assert)
    // hides a broken host install behind text that reads as "just run
    // install", when actually something needs repairing.
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, '{not valid json');

      const r = runStatus();
      expect(r.installedProfile.recorded).toBe('invalid');
      expect(r.installedProfile).not.toEqual({ recorded: false });
      const text = formatStatus(r, false);
      expect(text).toContain('(invalid)');
      expect(text).not.toContain('(not recorded)');
    });
  });

  test('installedProfile reports invalid when protocol/profile/ownership_manifest fails readInstalledProfile validation', () => {
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({
        protocol: 1,
        profile: 'not-a-real-profile',
        components: [],
        transaction_id: 'test-txn',
        applied_at: '2026-01-01T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }));

      const r = runStatus();
      expect(r.installedProfile.recorded).toBe('invalid');
    });
  });

  test('installedProfile reports invalid instead of crashing when a syntactically valid install-state.json is missing components', () => {
    // readInstalledProfile validates protocol/profile/ownership_manifest but
    // not components -- formatStatus's `.components.join(', ')` used to throw
    // a TypeError on this input instead of reporting a diagnosable state.
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({
        protocol: 1,
        profile: 'standard',
        transaction_id: 'test-txn',
        applied_at: '2026-01-01T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }));

      const r = runStatus();
      expect(r.installedProfile.recorded).toBe('invalid');
      if (r.installedProfile.recorded === 'invalid') {
        expect(r.installedProfile.error).toContain('components');
      }
      expect(() => formatStatus(r, false)).not.toThrow();
    });
  });

  test('installedProfile reports invalid instead of crashing when components is a non-array value', () => {
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({
        protocol: 1,
        profile: 'standard',
        components: 'cli,effective-state',
        transaction_id: 'test-txn',
        applied_at: '2026-01-01T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }));

      const r = runStatus();
      expect(r.installedProfile.recorded).toBe('invalid');
      expect(() => formatStatus(r, false)).not.toThrow();
    });
  });
});
