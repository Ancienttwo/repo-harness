import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { mcpOAuthTokenStorePath } from '../../src/cli/mcp/auth';
import { McpOAuthTokenStore } from '../../src/cli/mcp/oauth';

const cli = resolve(process.cwd(), 'src/cli/index.ts');
const sourceRoot = process.cwd();
const tempRoots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const previousRepoHarnessHome = process.env.REPO_HARNESS_HOME;

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-engineer-cli-'));
  tempRoots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  execFileSync('git', ['add', '.archcontext', 'agents/engineers'], { cwd: root });
  return root;
}

function run(root: string, args: string[]): { readonly exitCode: number; readonly stdout: string; readonly stderr: string } {
  const result = Bun.spawnSync([process.execPath, cli, ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env } });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

afterEach(() => {
  if (previousRepoHarnessHome === undefined) delete process.env.REPO_HARNESS_HOME;
  else process.env.REPO_HARNESS_HOME = previousRepoHarnessHome;
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe('repo-harness engineer CLI', () => {
  test('lists and shows capability-backed tracked Profiles', () => {
    const root = fixture();
    const listed = run(root, ['engineer', 'profile', 'list', '--json']);
    expect(listed.exitCode).toBe(0);
    const profiles = JSON.parse(listed.stdout) as Array<{ engineer_id: string; engineer_contract_revision: string }>;
    expect(profiles).toHaveLength(2);
    expect(profiles[0].engineer_id).toBe(engineerId);
    expect(profiles[0].engineer_contract_revision).toMatch(/^sha256:[0-9a-f]{64}$/u);

    const shown = run(root, ['engineer', 'profile', 'show', '--engineer-id', engineerId, '--json']);
    expect(shown.exitCode).toBe(0);
    const result = JSON.parse(shown.stdout) as { profile: { capability_id: string }; capability: { prefixes: string[] } };
    expect(result.profile.capability_id).toBe('capability.verification.evals-checks');
    expect(result.capability.prefixes).toContain('tests');
  });

  test('binds, reports status, retries, retires, and renders a bounded read-only capsule', () => {
    const root = fixture();
    const profiles = JSON.parse(run(root, ['engineer', 'profile', 'list', '--json']).stdout) as Array<{
      engineer_id: string;
      engineer_contract_revision: string;
    }>;
    const revision = profiles.find((item) => item.engineer_id === engineerId)!.engineer_contract_revision;
    const bindArgs = [
      'engineer', 'binding', 'bind', '--engineer-id', engineerId,
      '--idempotency-key', 'cli-bind-1', '--provider', 'codex',
      '--provider-thread-id', 'thread-cli', '--host-id', 'local',
      '--expected-current-digest', 'null', '--expected-binding-generation', '0',
      '--expected-binding-id', 'null', '--expected-engineer-contract-revision', revision,
      '--json',
    ];
    const first = run(root, bindArgs);
    expect(first.exitCode).toBe(0);
    const active = JSON.parse(first.stdout) as {
      state: string;
      current_digest: string;
      current_binding_id: string;
      binding_generation: number;
    };
    expect(active.state).toBe('active');
    expect(run(root, bindArgs).stdout).toBe(first.stdout);

    const status = run(root, ['engineer', 'binding', 'status', '--engineer-id', engineerId, '--json']);
    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout).current.current_digest).toBe(active.current_digest);

    const capsuleResult = run(root, ['engineer', 'bootstrap-prompt', '--engineer-id', engineerId, '--json']);
    expect(capsuleResult.exitCode).toBe(0);
    const capsule = JSON.parse(capsuleResult.stdout) as { prompt: string; estimated_tokens: number };
    expect(capsule.estimated_tokens).toBeLessThanOrEqual(400);
    expect(capsule.prompt).toContain('authority=read-only bootstrap');
    expect(capsule.prompt).not.toContain('claim_id=');
    expect(capsule.prompt).not.toContain('lease_generation=');
    expect(capsule.prompt).not.toContain('bearer');

    appendFileSync(join(root, 'agents/engineers/sops/verification-evals-checks.md'), '\nContract revision change.\n');
    const staleCapsule = run(root, ['engineer', 'bootstrap-prompt', '--engineer-id', engineerId, '--json']);
    expect(staleCapsule.exitCode).toBe(1);
    expect(staleCapsule.stderr).toContain('binding current Engineer contract revision is stale');

    const retired = run(root, [
      'engineer', 'binding', 'retire', '--engineer-id', engineerId,
      '--idempotency-key', 'cli-retire-1', '--expected-current-digest', active.current_digest,
      '--expected-binding-generation', String(active.binding_generation),
      '--expected-binding-id', active.current_binding_id,
      '--expected-engineer-contract-revision', revision, '--json',
    ]);
    expect(retired.exitCode).toBe(0);
    expect(JSON.parse(retired.stdout).state).toBe('retired');
  });

  test('exposes operator principal mapping but no CLI Engineer acquire route', () => {
    const root = fixture();
    const help = run(root, ['engineer', '--help']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('local Human-operator binding transitions');
    expect(help.stdout).not.toContain('session-bind');
    expect(help.stdout).toContain('principal');
    expect(help.stdout).not.toContain('claim');
    expect(help.stdout).not.toContain('acquire');
    const principalHelp = run(root, ['engineer', 'principal', '--help']);
    expect(principalHelp.stdout).toContain('list');
    expect(principalHelp.stdout).toContain('enroll');
    expect(principalHelp.stdout).toContain('revoke');
    expect(principalHelp.stdout).toContain('status');
    expect(principalHelp.stdout).not.toContain('acquire');
  });

  test('lists, enrolls, reads, and revokes an issued Engineer authorization without exposing bearer tokens', () => {
    const root = fixture();
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-engineer-cli-home-')));
    tempRoots.push(home);
    process.env.REPO_HARNESS_HOME = home;
    const profiles = JSON.parse(run(root, ['engineer', 'profile', 'list', '--json']).stdout) as Array<{
      engineer_id: string;
      engineer_contract_revision: string;
    }>;
    const revision = profiles.find((item) => item.engineer_id === engineerId)!.engineer_contract_revision;
    const bound = run(root, [
      'engineer', 'binding', 'bind', '--engineer-id', engineerId,
      '--idempotency-key', 'principal-bind-1', '--provider', 'codex',
      '--provider-thread-id', 'thread-principal', '--host-id', 'local',
      '--expected-current-digest', 'null', '--expected-binding-generation', '0',
      '--expected-binding-id', 'null', '--expected-engineer-contract-revision', revision, '--json',
    ]);
    expect(bound.exitCode).toBe(0);
    const current = JSON.parse(bound.stdout) as { current_binding_id: string; binding_generation: number };
    const authorizationId = '22222222-2222-4222-8222-222222222222';
    const bearer = 'must-never-appear-in-operator-output';
    const tokenStore = new McpOAuthTokenStore(mcpOAuthTokenStorePath());
    tokenStore.setAccessToken(bearer, {
      token: bearer,
      clientId: 'client-engineer-cli-test',
      scopes: ['repo-harness', 'repo-harness.engineer', 'offline_access'],
      profile: 'engineer',
      authorizationRevision: 1,
      authorizationId,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const listed = run(root, ['engineer', 'principal', 'list', '--json']);
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toContain(authorizationId);
    expect(listed.stdout).toContain('"mapping": null');
    expect(listed.stdout).not.toContain(bearer);
    const enrolled = run(root, [
      'engineer', 'principal', 'enroll', '--authorization-id', authorizationId,
      '--engineer-id', engineerId,
      '--expected-binding-id', current.current_binding_id,
      '--expected-binding-generation', String(current.binding_generation),
      '--expected-engineer-contract-revision', revision, '--json',
    ]);
    expect(enrolled.exitCode).toBe(0);
    expect(JSON.parse(enrolled.stdout)).toMatchObject({ authorization_id: authorizationId, state: 'active', engineer_id: engineerId });
    expect(enrolled.stdout).not.toContain(bearer);
    const status = run(root, ['engineer', 'principal', 'status', '--authorization-id', authorizationId, '--json']);
    expect(JSON.parse(status.stdout)).toMatchObject({ mapping: { state: 'active', binding_id: current.current_binding_id } });
    const revoked = run(root, ['engineer', 'principal', 'revoke', '--authorization-id', authorizationId, '--json']);
    expect(JSON.parse(revoked.stdout)).toMatchObject({ state: 'revoked', authorization_id: authorizationId });
  });
});
