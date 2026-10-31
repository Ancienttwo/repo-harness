import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { darwinTest } from '../helpers/darwin-test';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';
import {
  parseGeneratedArtifactsBlock,
  resolveMixedFileConflict,
  type GeneratedArtifactsPolicyV1,
} from '../../src/core/publication/generated-artifacts';
import {
  parsePublicationPolicy,
  publicationPolicyBlocksAtRef,
  publicationPolicyChanged,
} from '../../src/core/publication/acceptance-merge-policy';
import { collectPullRequestMergeReadiness, type PullRequestReadinessInput } from '../../src/effects/publication/merge-readiness';
import { observeGeneratedArtifacts, sandboxCommand } from '../../src/effects/publication/generated-artifacts';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

interface Fixture {
  /** The temporary workspace that also holds readiness worktrees. */
  readonly root: string;
  readonly repo: string;
}

function fixture(build: (repo: string, write: (name: string, text: string) => void) => void): Fixture {
  const root = tmpWorkspace('generated-artifacts');
  roots.push(root);
  const repo = join(root, 'repo');
  mkdirSync(repo);
  initGitRepo(repo);
  build(repo, (name, text) => writeFileSync(join(repo, name), text));
  return { root, repo };
}

function git(repo: string, ...args: string[]): string {
  const result = run('git', args, repo);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function write(repo: string, name: string, text: string): void {
  writeFileSync(join(repo, name), text);
}

function policy(overrides: Partial<GeneratedArtifactsPolicyV1> = {}): GeneratedArtifactsPolicyV1 {
  return { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 10_000, mixed: [], ...overrides };
}

/**
 * Base has the generated file `gen.txt`; the PR branch carries a stale
 * generated value. Main moves on with an unrelated file so the base is a
 * distinct commit. The merge tree therefore contains the stale generated file.
 */
function staleGeneratedFixture(options: { prTouchesGenerated?: boolean } = {}): Fixture & { base: string; head: string } {
  const created = fixture((repo, writeFile) => {
    writeFile('input.txt', 'one\n');
    writeFile('gen.txt', 'one\n');
    writeFile('regen.sh', 'cat input.txt > gen.txt\n');
  });
  commitAll(created.repo, 'base');
  git(created.repo, 'checkout', '-q', '-b', 'pr');
  write(created.repo, 'input.txt', 'two\n');
  if (options.prTouchesGenerated !== false) write(created.repo, 'gen.txt', 'stale\n');
  commitAll(created.repo, 'pr changes its inputs');
  const head = git(created.repo, 'rev-parse', 'HEAD');
  git(created.repo, 'checkout', '-q', 'main');
  write(created.repo, 'main-only.txt', 'main\n');
  commitAll(created.repo, 'main moves on');
  return { ...created, base: git(created.repo, 'rev-parse', 'HEAD'), head };
}

/**
 * Base changes input a and regenerates gen.txt; the PR changes input b and
 * leaves gen.txt stale. The PR-changed set must exclude the base-only a.txt
 * and gen.txt changes.
 */
function divergedBaseFixture(): Fixture & { base: string; head: string } {
  const created = fixture((repo, writeFile) => {
    writeFile('a.txt', 'one\n');
    writeFile('b.txt', 'one\n');
    writeFile('gen.txt', 'one+one\n');
    writeFile('regen.sh', 'cat a.txt b.txt > gen.txt\n');
  });
  commitAll(created.repo, 'base');
  git(created.repo, 'checkout', '-q', '-b', 'pr');
  write(created.repo, 'b.txt', 'two\n');
  commitAll(created.repo, 'pr changes b');
  const head = git(created.repo, 'rev-parse', 'HEAD');
  git(created.repo, 'checkout', '-q', 'main');
  write(created.repo, 'a.txt', 'oneX\n');
  write(created.repo, 'gen.txt', 'oneX+one\n');
  commitAll(created.repo, 'main changes a and regenerates');
  return { ...created, base: git(created.repo, 'rev-parse', 'HEAD'), head };
}

describe('generated-artifact policy block', () => {
  function file(value: unknown) {
    return { status: 'present' as const, text: JSON.stringify(value) };
  }

  test('an absent or empty block keeps the current behavior', () => {
    expect(parseGeneratedArtifactsBlock({})).toEqual({ ok: true, policy: null });
    expect(parseGeneratedArtifactsBlock({ paths: [] })).toEqual({ ok: true, policy: null });
    expect(parseGeneratedArtifactsBlock({ paths: [], mixed: [] })).toEqual({ ok: true, policy: null });
    expect(publicationPolicyBlocksAtRef(file({ publication: { acceptance_merge: 'on' } })).generated_artifacts)
      .toEqual({ status: 'absent' });
  });

  test('a declared block is active and keeps the command, timeout and mixed rules', () => {
    const declared = {
      paths: ['api-surface/**', 'README.md'],
      command: 'bun scripts/regenerate.ts',
      timeout_ms: 120_000,
      mixed: [{ path: 'README.md', preserve_from_pr: ['/entries', '/notes'] }],
    };
    expect(parseGeneratedArtifactsBlock(declared)).toEqual({ ok: true, policy: declared });
    expect(publicationPolicyBlocksAtRef(file({ publication: { generated_artifacts: declared } })).generated_artifacts)
      .toEqual({ status: 'active', policy: declared });
  });

  test('the block is closed: unknown fields, missing parts and unsafe paths are invalid', () => {
    const invalid: unknown[] = [
      { generate: 'x' },
      { paths: 'gen.txt' },
      { paths: ['/abs/gen.txt'] },
      { paths: ['../gen.txt'] },
      { paths: ['gen.txt', 'gen.txt'] },
      { paths: ['gen.txt'], command: 'sh regen.sh' },
      { paths: [], command: 'sh regen.sh', timeout_ms: 1_000 },
      { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 0 },
      { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 600_001 },
      { paths: ['gen.txt'], command: '', timeout_ms: 1_000 },
      { paths: ['gen.txt'], command: 'sh regen.sh\nrm -rf /', timeout_ms: 1_000 },
      { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 1_000, mixed: [{ path: 'other.json', preserve_from_pr: ['/a'] }] },
      { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 1_000, mixed: [{ path: 'gen.txt', preserve_from_pr: ['a'] }] },
      { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 1_000, mixed: [{ path: 'gen.txt', preserve_from_pr: ['/~2'] }] },
      { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 1_000, mixed: [{ path: 'gen.txt', preserve_from_pr: [''] }] },
      { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 1_000, mixed: [{ path: 'gen.txt', preserve_from_pr: [] }] },
    ];
    for (const value of invalid) {
      const parsed = parseGeneratedArtifactsBlock(value);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.message.length).toBeGreaterThan(0);
    }
  });

  test('the policy file can never be a declared generated path, so regeneration cannot raise a budget', () => {
    for (const paths of [['.ai/harness/policy.json'], ['**']]) {
      const parsed = parseGeneratedArtifactsBlock({ paths, command: 'sh regen.sh', timeout_ms: 1_000 });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.message).toContain('.ai/harness/policy.json');
    }
  });

  test('a malformed block makes the publication policy invalid and a change to it blocks the merge', () => {
    const head = file({ publication: { acceptance_merge: 'on', generated_artifacts: { paths: ['gen.txt'] } } });
    const parsed = parsePublicationPolicy(head);
    expect(parsed.ok).toBe(false);
    expect(publicationPolicyBlocksAtRef(head).generated_artifacts.status).toBe('invalid');

    const base = parsePublicationPolicy(file({ publication: {
      acceptance_merge: 'on',
      generated_artifacts: { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 1_000 },
    } }));
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    expect(base.generated_artifacts).toEqual({ paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 1_000, mixed: [] });
    expect(publicationPolicyChanged(base, file({ publication: {
      acceptance_merge: 'on',
      generated_artifacts: { paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 2_000 },
    } }))).toBe(true);
  });
});

describe('mixed generated/human file resolution', () => {
  const base = `${JSON.stringify({ to: { snapshotSha256: 'base-snapshot' }, entries: [] }, null, 2)}\n`;
  const head = `${JSON.stringify({ to: { snapshotSha256: 'stale' }, entries: [{ id: 'change-1' }] }, null, 2)}\n`;

  test('human pointers come from the PR and every other field stays from the base', () => {
    const resolved = resolveMixedFileConflict({ path: 'manifest.json', base_text: base, head_text: head, preserve_from_pr: ['/entries'] });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(JSON.parse(resolved.text)).toEqual({ to: { snapshotSha256: 'base-snapshot' }, entries: [{ id: 'change-1' }] });
  });

  test('a pointer that is absent on either side fails closed instead of taking one side', () => {
    const missingInHead = resolveMixedFileConflict({ path: 'manifest.json', base_text: base, head_text: head, preserve_from_pr: ['/missing'] });
    expect(missingInHead.ok).toBe(false);
    if (!missingInHead.ok) expect(missingInHead.message).toContain('/missing');
    const missingInBase = resolveMixedFileConflict({
      path: 'manifest.json', base_text: base, head_text: head, preserve_from_pr: ['/to/newField'],
    });
    expect(missingInBase.ok).toBe(false);
    const invalidJson = resolveMixedFileConflict({ path: 'manifest.json', base_text: '{', head_text: head, preserve_from_pr: ['/entries'] });
    expect(invalidJson.ok).toBe(false);
  });
});

describe('network-denied sandbox plan', () => {
  test('macOS denies every network operation and Linux uses a network namespace', () => {
    const darwin = sandboxCommand('/bin/sh', ['-c', 'sh regen.sh'], { platform: 'darwin', sandbox_exec: '/usr/bin/sandbox-exec' });
    expect(darwin[0]).toBe('/usr/bin/sandbox-exec');
    expect(darwin).toContain('(version 1)(allow default)(deny network*)');
    expect(darwin.slice(-3)).toEqual(['/bin/sh', '-c', 'sh regen.sh']);
    const linux = sandboxCommand('/bin/sh', ['-c', 'sh regen.sh'], { platform: 'linux', unshare_bin: 'unshare' });
    expect(linux.slice(0, 6)).toEqual(['unshare', '--user', '--map-root-user', '--net', '--fork', '--']);
  });

  test('a platform without a supported sandbox fails closed before any command runs', () => {
    const check = observeGeneratedArtifacts({
      repo_root: '/nonexistent',
      base_sha: 'a'.repeat(40),
      head_sha: 'b'.repeat(40),
      policy: policy(),
      platform: 'win32',
    });
    expect(check.failure?.code).toBe('generated_artifacts_unavailable');
    expect(check.failure?.message).toContain('network-denied sandbox');
  });
});

describe('generated-artifact regeneration on the merge tree', () => {
  darwinTest('a stale generated file that the PR edited fails closed, so the author pushes the regeneration', () => {
    const created = staleGeneratedFixture();
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root, policy: policy(),
    });
    expect(check.failure?.code).toBe('generated_artifacts_unpushed_regeneration');
    expect(check.failure?.message).toContain('"gen.txt"');
    expect(check.failure?.message).toContain('commit the result');
    expect(check.failure?.message).toContain('-stale');
    expect(check.failure?.message).toContain('+two');
    expect(check.regenerated_paths).toEqual(['gen.txt']);
  });

  darwinTest('a stale merge tree regenerates when the PR did not edit the generated path', () => {
    const created = staleGeneratedFixture({ prTouchesGenerated: false });
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root, policy: policy(),
    });
    expect(check.failure).toBeNull();
    expect(check.merge_tree_sha).toMatch(/^[0-9a-f]{40}$/u);
    expect(check.regenerated_paths).toEqual(['gen.txt']);
    expect(check.generated_paths).toEqual(['gen.txt']);
  });

  darwinTest('a base-only declared change is not a PR edit, so the merge tree regenerates', () => {
    const created = divergedBaseFixture();
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root, policy: policy(),
    });
    expect(check.failure).toBeNull();
    expect(check.regenerated_paths).toEqual(['gen.txt']);
  });

  darwinTest('a generated file that is already current passes without a change', () => {
    const created = fixture((repo, writeFile) => {
      writeFile('input.txt', 'one\n');
      writeFile('gen.txt', 'one\n');
      writeFile('regen.sh', 'cat input.txt > gen.txt\n');
    });
    commitAll(created.repo, 'base');
    git(created.repo, 'checkout', '-q', '-b', 'pr');
    write(created.repo, 'input.txt', 'two\n');
    write(created.repo, 'gen.txt', 'two\n');
    commitAll(created.repo, 'pr regenerated the generated file');
    const head = git(created.repo, 'rev-parse', 'HEAD');
    git(created.repo, 'checkout', '-q', 'main');
    write(created.repo, 'main-only.txt', 'main\n');
    commitAll(created.repo, 'main moves on');
    const base = git(created.repo, 'rev-parse', 'HEAD');
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: base, head_sha: head, tmp_root: created.root, policy: policy(),
    });
    expect(check.failure).toBeNull();
    expect(check.regenerated_paths).toEqual([]);
  });

  darwinTest('a conflict outside the declared generated paths stays a normal conflict', () => {
    const created = fixture((repo, writeFile) => {
      writeFile('human.txt', 'a\n');
      writeFile('gen.txt', 'one\n');
    });
    commitAll(created.repo, 'base');
    git(created.repo, 'checkout', '-q', '-b', 'pr');
    write(created.repo, 'human.txt', 'pr\n');
    commitAll(created.repo, 'pr changes human text');
    const head = git(created.repo, 'rev-parse', 'HEAD');
    git(created.repo, 'checkout', '-q', 'main');
    write(created.repo, 'human.txt', 'main\n');
    commitAll(created.repo, 'main changes human text');
    const base = git(created.repo, 'rev-parse', 'HEAD');
    const check = observeGeneratedArtifacts({ repo_root: created.repo, base_sha: base, head_sha: head, tmp_root: created.root, policy: policy() });
    expect(check.failure?.code).toBe('generated_artifacts_conflict_outside');
    expect(check.failure?.message).toContain('"human.txt"');
    expect(check.conflicted_paths).toEqual(['human.txt']);
  });

  function mixedFixture(): Fixture & { base: string; head: string } {
    const created = fixture((repo, writeFile) => {
      writeFile('snapshot.txt', 'base-snapshot\n');
      writeFile('manifest.json', `${JSON.stringify({ to: { snapshotSha256: 'base-snapshot' }, entries: [] }, null, 2)}\n`);
      writeFile('regen.js', "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));m.to.snapshotSha256=fs.readFileSync('snapshot.txt','utf8').trim();fs.writeFileSync('manifest.json',JSON.stringify(m,null,2)+'\\n');\n");
    });
    commitAll(created.repo, 'base');
    git(created.repo, 'checkout', '-q', '-b', 'pr');
    write(created.repo, 'manifest.json', `${JSON.stringify({ to: { snapshotSha256: 'stale' }, entries: [{ id: 'change-1' }] }, null, 2)}\n`);
    commitAll(created.repo, 'pr adds a human entry');
    const head = git(created.repo, 'rev-parse', 'HEAD');
    git(created.repo, 'checkout', '-q', 'main');
    write(created.repo, 'snapshot.txt', 'main-snapshot\n');
    write(created.repo, 'manifest.json', `${JSON.stringify({ to: { snapshotSha256: 'main-snapshot' }, entries: [] }, null, 2)}\n`);
    commitAll(created.repo, 'main moves the snapshot pin');
    return { ...created, base: git(created.repo, 'rev-parse', 'HEAD'), head };
  }

  darwinTest('a mixed file keeps the PR human entries and regenerates the pinned field', () => {
    const created = mixedFixture();
    const mixed = [{ path: 'manifest.json', preserve_from_pr: ['/entries'] }];
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root,
      policy: policy({ paths: ['manifest.json'], command: 'node regen.js', mixed }),
    });
    expect(check.failure).toBeNull();
    expect(check.resolved_paths).toEqual(['manifest.json']);
    expect(check.regenerated_paths).toEqual(['manifest.json']);
  });

  darwinTest('a mixed file without a rule fails closed and names the lost human content', () => {
    const created = mixedFixture();
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root,
      policy: policy({ paths: ['manifest.json'], command: 'node regen.js' }),
    });
    expect(check.failure?.code).toBe('generated_artifacts_mixed_without_rule');
    expect(check.failure?.message).toContain('"manifest.json"');
    expect(check.failure?.message).toContain('"entries"');
    expect(check.failure?.message).toContain('change-1');
  });

  darwinTest('a timeout is a typed blocker that names the declared budget', () => {
    const created = staleGeneratedFixture();
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root,
      policy: policy({ command: 'sleep 5', timeout_ms: 100 }),
    });
    expect(check.failure?.code).toBe('generated_artifacts_timeout');
    expect(check.failure?.message).toContain('100ms');
  });

  darwinTest('a failing command is a typed blocker with the exit code and output', () => {
    const created = staleGeneratedFixture();
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root,
      policy: policy({ command: 'echo boom >&2; exit 7' }),
    });
    expect(check.failure?.code).toBe('generated_artifacts_command_failed');
    expect(check.failure?.message).toContain('exit 7');
    expect(check.failure?.message).toContain('boom');
  });

  darwinTest('a network attempt is denied by the sandbox and fails closed', () => {
    const created = staleGeneratedFixture();
    const command = `${process.execPath} -e "require('node:net').connect({host:'1.1.1.1',port:443})"`;
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root,
      policy: policy({ command }),
    });
    expect(check.failure?.code).toBe('generated_artifacts_network_attempt');
  });

  darwinTest('a change outside the declared paths fails closed with the exact diff', () => {
    const created = staleGeneratedFixture();
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root,
      policy: policy({ command: 'printf x > other.txt' }),
    });
    expect(check.failure?.code).toBe('generated_artifacts_diff_outside');
    expect(check.failure?.message).toContain('"other.txt"');
    expect(check.failure?.message).toContain('+++ b/other.txt');
  });

  darwinTest('a generator that changes a declared path on every run is unstable', () => {
    const created = staleGeneratedFixture({ prTouchesGenerated: false });
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: created.base, head_sha: created.head, tmp_root: created.root,
      policy: policy({ command: 'echo more >> gen.txt' }),
    });
    expect(check.failure?.code).toBe('generated_artifacts_unstable');
    expect(check.failure?.message).toContain('"gen.txt"');
  });

  darwinTest('a missing base commit is unavailable and names the SHA', () => {
    const created = staleGeneratedFixture();
    const missing = 'f'.repeat(40);
    const check = observeGeneratedArtifacts({
      repo_root: created.repo, base_sha: missing, head_sha: created.head, tmp_root: created.root, policy: policy(),
    });
    expect(check.failure?.code).toBe('generated_artifacts_unavailable');
    expect(check.failure?.message).toContain(missing);
  });
});

const E2E_REQUIRED_LINK = 'https://github.com/example/repo-harness/actions/runs/123/job/456';

/** A provider stand-in for the readiness reads the generated-artifact block needs. */
function readinessGh(options: { head: string; base: string; policy: string | null }) {
  const repository = { id: 1001, node_id: 'R_generated_artifacts', full_name: 'example/repo-harness', default_branch: 'main' };
  return (args: readonly string[]): { status: number; stdout: string; stderr?: string } => {
    const [command, sub] = args;
    if (command === 'repo' && sub === 'view') return { status: 0, stdout: JSON.stringify({ id: repository.node_id, nameWithOwner: repository.full_name }) };
    if (command === 'api' && sub === 'repos/example/repo-harness') return { status: 0, stdout: JSON.stringify(repository) };
    if (command === 'api' && sub?.startsWith('repos/example/repo-harness/contents/.ai/harness/policy.json')) {
      if (options.policy === null) return { status: 1, stdout: JSON.stringify({ status: '404' }) };
      return { status: 0, stdout: JSON.stringify({ type: 'file', path: '.ai/harness/policy.json', encoding: 'base64', content: Buffer.from(options.policy).toString('base64') }) };
    }
    if (command === 'api' && sub?.includes('/contents/.github/workflows/ci-report.yml')) return { status: 1, stdout: JSON.stringify({ status: '404' }) };
    if (command === 'pr' && sub === 'view') {
      return { status: 0, stdout: JSON.stringify({
        number: 42, url: 'https://github.com/example/repo-harness/pull/42', state: 'OPEN', isDraft: false,
        headRefOid: options.head, headRefName: 'feat/generated', baseRefOid: options.base, baseRefName: 'main',
        body: 'Closes #1257', reviewDecision: '', changedFiles: 0, mergeable: 'MERGEABLE',
      }) };
    }
    if (command === 'pr' && sub === 'checks') {
      return { status: 0, stdout: JSON.stringify([{ name: 'Required / CI', bucket: 'pass', link: E2E_REQUIRED_LINK }]) };
    }
    if (command === 'api' && sub === 'repos/example/repo-harness/actions/runs/123') {
      return { status: 0, stdout: JSON.stringify({
        path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: options.head, status: 'completed', conclusion: 'success',
        pull_requests: [{ number: 42, head: { sha: options.head }, base: { sha: options.base } }],
      }) };
    }
    if (command === 'api' && sub === 'graphql') {
      return { status: 0, stdout: JSON.stringify({ data: { node: { id: repository.node_id, pullRequest: {
        number: 42, headRefOid: options.head, baseRefOid: options.base, reviewDecision: null,
        latestOpinionatedReviews: { pageInfo: { hasNextPage: false }, nodes: [] },
        reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
      } } } }) };
    }
    return { status: 2, stdout: '', stderr: `unexpected fake gh args: ${args.join(' ')}` };
  };
}

function readinessInput(created: Fixture & { base: string; head: string }, policyText: string): PullRequestReadinessInput {
  return {
    repo_root: created.repo,
    repository: 'example/repo-harness',
    provider_repository_id: '1001',
    pr_number: 42,
    expected_head_sha: created.head,
    expected_base_sha: created.base,
    gh_runner: readinessGh({ head: created.head, base: created.base, policy: policyText }),
  };
}

describe('readiness wiring for generated artifacts', () => {
  darwinTest('a failing regeneration blocks readiness with the command failure', () => {
    const created = staleGeneratedFixture();
    const policyText = JSON.stringify({ publication: { acceptance_merge: 'on', generated_artifacts: {
      paths: ['gen.txt'], command: 'exit 4', timeout_ms: 10_000,
    } } });
    const verdict = collectPullRequestMergeReadiness(readinessInput(created, policyText));
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((blocker) => blocker.code)).toContain('generated_artifacts_command_failed');
    expect(verdict.blockers.find((blocker) => blocker.code === 'generated_artifacts_command_failed')?.detail).toContain('exit 4');
  });

  darwinTest('a clean regeneration leaves a ready verdict', () => {
    const created = staleGeneratedFixture({ prTouchesGenerated: false });
    const policyText = JSON.stringify({ publication: { acceptance_merge: 'on', generated_artifacts: {
      paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 10_000,
    } } });
    const verdict = collectPullRequestMergeReadiness(readinessInput(created, policyText));
    expect(verdict.blockers).toEqual([]);
    expect(verdict.ready).toBe(true);
  });

  darwinTest('a malformed generated-artifact block blocks readiness with the fix', () => {
    const created = staleGeneratedFixture();
    const policyText = JSON.stringify({ publication: { acceptance_merge: 'on', generated_artifacts: {
      paths: ['gen.txt'], command: 'sh regen.sh', timeout_ms: 0,
    } } });
    const verdict = collectPullRequestMergeReadiness(readinessInput(created, policyText));
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['generated_artifacts_policy_invalid']);
    expect(verdict.blockers[0]?.detail).toContain('publication.generated_artifacts');
  });
});
