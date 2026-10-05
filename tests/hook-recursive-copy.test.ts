import { readUpgradeFixture } from './helpers/upgrade-fixtures';
import { spawnSync } from 'child_process';
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { planAdoption } from "../src/core/adoption/plan";
import { applyAdoptionPlan } from "../src/effects/fs-transaction";

describe("adoption hook projection", () => {
  test("standard adoption does not project operator libraries", () => {
    const repo = mkdtempSync(join(tmpdir(), "hook-recursive-adoption-"));
    try {
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/lib/session-state.sh"))).toBe(false);

      for (const retired of [
        ".ai/hooks/anti-simplification.sh",
        ".ai/hooks/changelog-guard.sh",
        ".ai/hooks/codex-delegation-advisor.sh",
        ".ai/hooks/first-principles-guard.sh",
        ".ai/hooks/hook-input.sh",
        ".ai/hooks/post-bash.sh",
        ".ai/hooks/post-tool-observer.sh",
        ".ai/hooks/prompt-guard.sh",
        ".ai/hooks/run-hook.sh",
        ".ai/hooks/subagent-return-channel-guard.sh",
        ".ai/hooks/subagent-start-context.sh",
        ".ai/hooks/subagent-stop-quality.sh",
        ".ai/hooks/lib/minimal-change.sh",
        ".ai/hooks/lib/session-state.sh",
        "scripts/hook-shim.sh",
        "scripts/repo-harness.sh",
      ]) {
        expect(existsSync(join(repo, retired))).toBe(false);
      }
      expect(existsSync(join(repo, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/run-hook.sh"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

for (const mode of ['minimal', 'standard'] as const) {
  test(`${mode} adoption omits the library write and keeps a legacy library callable`, () => {
    const repo = mkdtempSync(join(tmpdir(), 'workflow-state-legacy-adoption-'));
    try {
      const legacy = readUpgradeFixture('upgrade-v0.10-project', '.ai/hooks/lib/workflow-state.sh').toString('utf8');
      mkdirSync(join(repo, '.ai/hooks/lib'), { recursive: true });
      writeFileSync(join(repo, '.ai/hooks/lib/workflow-state.sh'), legacy);
      const plan = planAdoption({ repoRoot: repo, mode, apply: true });
      expect(plan.operations.some((op) => op.path === '.ai/hooks/lib/workflow-state.sh')).toBe(false);
      expect(applyAdoptionPlan(plan).ok).toBe(true);
      expect(readFileSync(join(repo, '.ai/hooks/lib/workflow-state.sh'), 'utf8')).toBe(legacy);
      const result = spawnSync('bash', ['-c', 'source .ai/hooks/lib/workflow-state.sh; workflow_failure_log_file'], { cwd: repo, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('.ai/harness/failures/latest.jsonl');
      mkdirSync(join(repo, 'scripts'), { recursive: true });
      writeFileSync(join(repo, 'scripts/prepare-handoff.sh'), readUpgradeFixture('upgrade-v0.10-project', 'scripts/prepare-handoff.sh'));
      const oldCaller = spawnSync('bash', ['scripts/prepare-handoff.sh', '--status'], { cwd: repo, encoding: 'utf8' });
      expect(oldCaller.status, oldCaller.stderr).toBe(0);
      expect(oldCaller.stdout).toContain('Active plan:');
      expect(oldCaller.stdout).toContain('Handoff:');
      const edited = legacy + '\n# Local operator edit\n';
      writeFileSync(join(repo, '.ai/hooks/lib/workflow-state.sh'), edited);
      expect(applyAdoptionPlan(planAdoption({ repoRoot: repo, mode, apply: true })).ok).toBe(true);
      expect(readFileSync(join(repo, '.ai/hooks/lib/workflow-state.sh'), 'utf8')).toBe(edited);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
}

test('shell scaffold and shared shell init keep legacy bytes and stop library copies', () => {
  const repo = mkdtempSync(join(tmpdir(), 'workflow-state-shell-init-'));
  const root = join(import.meta.dir, '..');
  try {
    const run = () => spawnSync('bash', [join(root, 'scripts/create-project-dirs.sh')], { cwd: repo, encoding: 'utf8' });
    const fresh = run();
    expect(fresh.status, fresh.stderr).toBe(0);
    const library = join(repo, '.ai/hooks/lib/workflow-state.sh');
    expect(existsSync(library)).toBe(false);
    expect(readFileSync(join(repo, '.ai/hooks/README.md'), 'utf8')).toContain('repo-harness hook-lib path');
    const legacy = readUpgradeFixture('upgrade-v0.10-project', '.ai/hooks/lib/workflow-state.sh').toString('utf8') + '\n# Local changes\n';
    mkdirSync(join(repo, '.ai/hooks/lib'), { recursive: true });
    writeFileSync(library, legacy);
    const repeated = run();
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(readFileSync(library, 'utf8')).toBe(legacy);
    const shared = spawnSync('bash', ['-c', 'source "$1"; pi_install_hook_assets "$2" apply', 'bash', join(root, 'scripts/lib/project-init-lib.sh'), repo], { cwd: repo, encoding: 'utf8' });
    expect(shared.status, shared.stderr).toBe(0);
    expect(readFileSync(library, 'utf8')).toBe(legacy);
    const dry = spawnSync('bash', ['-c', 'source "$1"; pi_install_hook_assets "$2" dry-run', 'bash', join(root, 'scripts/lib/project-init-lib.sh'), join(repo, 'dry')], { cwd: repo, encoding: 'utf8' });
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).not.toContain('cp ');
    expect(existsSync(join(repo, 'dry'))).toBe(false);
  } finally { rmSync(repo, { recursive: true, force: true }); }
}, 30_000);
