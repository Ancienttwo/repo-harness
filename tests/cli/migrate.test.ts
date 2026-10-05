import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { formatMigratePlan, runMigrate } from '../../src/cli/commands/migrate';

function withTempRepo(fn: (repo: string) => void): void {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-migrate-')));
  try {
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const LEGACY_CODEX = `${JSON.stringify(
  {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: [
            { type: 'command', command: 'bash $repo/.ai/hooks/run-hook.sh worktree-guard.sh' },
          ],
        },
      ],
      SessionStart: [
        {
          hooks: [
            { type: 'command', command: 'bash $repo/.ai/hooks/run-hook.sh session-start-context.sh' },
          ],
        },
      ],
    },
  },
  null,
  2,
)}\n`;

const LEGACY_WITH_SIBLING = `${JSON.stringify(
  {
    theme: 'dark',
    hooks: {
      PreToolUse: [
        { hooks: [{ type: 'command', command: 'rtk hook claude' }] },
        {
          matcher: 'Edit|Write',
          hooks: [
            { type: 'command', command: 'bash $repo/.ai/hooks/run-hook.sh pre-edit-guard.sh' },
          ],
        },
      ],
    },
  },
  null,
  2,
)}\n`;

describe('migrate command (Phase 1C)', () => {
  test('--dry-run identifies legacy entries but does not mutate', () => {
    withTempRepo((repo) => {
      const codexPath = path.join(repo, '.codex/hooks.json');
      fs.mkdirSync(path.dirname(codexPath), { recursive: true });
      fs.writeFileSync(codexPath, LEGACY_CODEX);
      const before = fs.readFileSync(codexPath, 'utf-8');
      const plan = runMigrate({ cwd: repo, apply: false });
      const after = fs.readFileSync(codexPath, 'utf-8');
      const codexPlan = plan.files.find((f) => f.path === codexPath)!;
      expect(codexPlan.legacyEntriesFound).toBe(2);
      expect(after).toBe(before);
    });
  });

  test('--apply removes legacy entries + creates backup', () => {
    withTempRepo((repo) => {
      const codexPath = path.join(repo, '.codex/hooks.json');
      fs.mkdirSync(path.dirname(codexPath), { recursive: true });
      fs.writeFileSync(codexPath, LEGACY_CODEX);
      runMigrate({ cwd: repo, apply: true });
      const backupPath = `${codexPath}.repo-harness-migrate-backup`;
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.readFileSync(backupPath, 'utf-8')).toBe(LEGACY_CODEX);
      const data = JSON.parse(fs.readFileSync(codexPath, 'utf-8'));
      expect(data.hooks).toBeUndefined();
    });
  });

  test('--apply preserves sibling user hooks + non-hooks settings', () => {
    withTempRepo((repo) => {
      const claudePath = path.join(repo, '.claude/settings.json');
      fs.mkdirSync(path.dirname(claudePath), { recursive: true });
      fs.writeFileSync(claudePath, LEGACY_WITH_SIBLING);
      runMigrate({ cwd: repo, apply: true });
      const data = JSON.parse(fs.readFileSync(claudePath, 'utf-8'));
      expect(data.theme).toBe('dark');
      expect(data.hooks.PreToolUse.length).toBe(1);
      expect(data.hooks.PreToolUse[0].hooks[0].command).toBe('rtk hook claude');
    });
  });

  test('--apply keeps a private settings file mode under a 0022 umask', () => {
    withTempRepo((repo) => {
      const claudePath = path.join(repo, '.claude/settings.json');
      fs.mkdirSync(path.dirname(claudePath), { recursive: true });
      fs.writeFileSync(claudePath, LEGACY_WITH_SIBLING, { mode: 0o600 });
      fs.chmodSync(claudePath, 0o600);
      const previousUmask = process.umask(0o022);
      try {
        runMigrate({ cwd: repo, apply: true });
      } finally {
        process.umask(previousUmask);
      }
      expect(JSON.parse(fs.readFileSync(claudePath, 'utf-8')).hooks.PreToolUse.length).toBe(1);
      expect(fs.statSync(claudePath).mode & 0o777).toBe(0o600);
    });
  });

  test('no-op when no legacy entries match', () => {
    withTempRepo((repo) => {
      const codexPath = path.join(repo, '.codex/hooks.json');
      fs.mkdirSync(path.dirname(codexPath), { recursive: true });
      fs.writeFileSync(
        codexPath,
        '{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"rtk hook"}]}]}}\n',
      );
      const plan = runMigrate({ cwd: repo, apply: false });
      const codexPlan = plan.files.find((f) => f.path === codexPath)!;
      expect(codexPlan.legacyEntriesFound).toBe(0);
      expect(codexPlan.action).toBe('no-op');
    });
  });

  test('missing legacy files yield empty plan.files', () => {
    withTempRepo((repo) => {
      const plan = runMigrate({ cwd: repo, apply: false });
      expect(plan.files.length).toBe(0);
    });
  });

  test('formatMigratePlan dry-run output mentions --apply remediation', () => {
    withTempRepo((repo) => {
      const codexPath = path.join(repo, '.codex/hooks.json');
      fs.mkdirSync(path.dirname(codexPath), { recursive: true });
      fs.writeFileSync(codexPath, LEGACY_CODEX);
      const plan = runMigrate({ cwd: repo, apply: false });
      const text = formatMigratePlan(plan, false);
      expect(text).toContain('Re-run with --apply');
      expect(text).toContain('2 legacy entries');
    });
  });

  test('formatMigratePlan --json produces parseable output', () => {
    withTempRepo((repo) => {
      const codexPath = path.join(repo, '.codex/hooks.json');
      fs.mkdirSync(path.dirname(codexPath), { recursive: true });
      fs.writeFileSync(codexPath, LEGACY_CODEX);
      const plan = runMigrate({ cwd: repo, apply: false });
      const json = formatMigratePlan(plan, true);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});
