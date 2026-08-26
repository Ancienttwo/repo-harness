import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { bindEngineer } from '../../src/effects/engineers/binding-store';

const sourceRoot = process.cwd();
const roots: string[] = [];
const D = (char: string) => `sha256:${char.repeat(64)}`;

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-me2c-cli-'));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  mkdirSync(join(root, 'tasks/contracts'), { recursive: true });
  writeFileSync(join(root, 'tasks/contracts/fixture.contract.md'), `# Task Contract: fixture

## Semantic Constraint Catalog

\`\`\`json
{"protocol":1,"constraints":[{"constraint_id":"constraint-a","statement":"A is exact."}]}
\`\`\`
`);
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  bindEngineer(root, {
    engineer_id: 'engineer:capability.verification.evals-checks',
    idempotency_key: 'fixture-binding',
    provider: 'codex',
    provider_thread_id: 'thread-fixture',
    host_id: 'host-fixture',
    engineer_contract_revision: D('c'),
    expected_current_digest: null,
    expected_binding_generation: 0,
    expected_binding_id: null,
    expected_engineer_contract_revision: D('c'),
    binding_id: () => '33333333-3333-4333-8333-333333333333',
    now: () => '2026-08-26T00:00:00.000Z',
  });
  return root;
}

function cli(root: string, ...args: string[]) {
  return spawnSync('bun', [join(sourceRoot, 'src/cli/index.ts'), 'verified-context', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env } });
}

describe('verified-context CLI', () => {
  test('exposes only bounded evidence verbs and projects an exact Contract revision', () => {
    const root = fixture();
    const help = cli(root, '--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('contract');
    expect(help.stdout).toContain('persist');
    expect(help.stdout).toContain('compile');
    expect(help.stdout).toContain('decision');
    expect(help.stdout).toContain('read');
    expect(help.stdout).not.toContain('dispatch');
    expect(help.stdout).not.toContain('resume');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const result = cli(root, 'contract', '--ref', 'tasks/contracts/fixture.contract.md', '--revision', revision, '--format', 'json');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'repo-harness-semantic-contract-projection', contract_revision: revision, constraints: [{ constraint_id: 'constraint-a', statement: 'A is exact.' }] });
  });

  test('persists and reads a Human-fenced DecisionRequest current without authority verbs', () => {
    const root = fixture();
    const decisionId = '11111111-1111-4111-8111-111111111111';
    writeFileSync(join(root, 'decision.json'), `${JSON.stringify({
      request: {
        decision_id: decisionId,
        task_fence: { task_id: 'a'.repeat(64), task_revision: 'b'.repeat(64), claim_id: '22222222-2222-4222-8222-222222222222', lease_generation: 1 },
        binding_fence: { engineer_id: 'engineer:capability.verification.evals-checks', binding_id: '33333333-3333-4333-8333-333333333333', binding_generation: 1, engineer_contract_revision: D('c') },
        previous_assertion_sha256: null,
        question: 'Choose A or B.',
      },
      transition: { idempotency_key: 'open-once', transition: 'open', expected_current_digest: null, actor: { kind: 'engineer', principal_ref: 'engineer-principal', binding_generation: 1 }, answer: null },
    })}\n`);
    const opened = cli(root, 'decision', '--input', 'decision.json', '--format', 'json');
    expect(opened.status).toBe(0);
    const value = JSON.parse(opened.stdout) as { current: { state: string; current_digest: string } };
    expect(value.current.state).toBe('open');
    const read = cli(root, 'read', '--kind', 'decision', '--id', decisionId, '--format', 'json');
    expect(read.status).toBe(0);
    expect(JSON.parse(read.stdout).current.current_digest).toBe(value.current.current_digest);
    expect(cli(root, 'read', '--kind', 'task', '--id', decisionId).status).toBe(1);
  });
});
