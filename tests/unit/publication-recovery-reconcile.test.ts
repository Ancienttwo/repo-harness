import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildPublicationReceipt,
  publicationReceiptDigest,
  publicationSha256,
  replacePublicationMarker,
} from '../../src/core/publication/publication-receipt';
import {
  buildPublicationIntegrationObservation,
  PublicationLifecycleError,
  validatePublicationIntegrationObservation,
} from '../../src/core/publication/publication-lifecycle';
import {
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskRevision,
  enterReviewingLeaseRecord,
} from '../../src/core/state/coordination-identity';
import { reconcilePublication } from '../../src/effects/publication/publication-lifecycle';
import { writePublicationReceiptCache } from '../../src/effects/publication/publication-receipt';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { createLeaseDirectory, leaseOwnerPath, readLease, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { publicationPointerFromReceipt } from '../../src/core/publication/publication-lifecycle';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const SPRINT_PATH = 'plans/sprints/reconcile.sprint.md';
const TASK = 'reconcile publication';
const CLAIM = 'claim-reconcile';
const SUBJECT = `sha256:${'3'.repeat(64)}`;
const HARNESS_ROOT = join(import.meta.dir, '../..');

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

interface Fixture {
  readonly root: string;
  readonly remote: string;
  readonly remoteTargetOid: string;
  readonly taskId: string;
  readonly revision: string;
  readonly head: string;
  readonly receipt: ReturnType<typeof buildPublicationReceipt>;
  readonly gh: string;
}

function writeSprint(root: string, status: '[ ]' | '[x]'): void {
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, SPRINT_PATH), [
    '# Sprint: reconcile', '', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${fixtureTaskId(`${TASK}`)} | ${status} | ${TASK} | contract | reconcile tests | (pending) |`, '',
  ].join('\n'));
}

interface FixtureOptions {
  readonly complete?: boolean;
  readonly integration?: 'merge' | 'squash' | 'none';
}

function installFixture(options: FixtureOptions = {}): Fixture {
  const complete = options.complete ?? true;
  const integration = options.integration ?? 'merge';
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-publication-reconcile-'));
  const remote = join(root, 'remote.git');
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Reconcile Test');
  git(root, 'config', 'user.email', 'reconcile@test.invalid');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  copyFileSync(join(HARNESS_ROOT, 'scripts/worktree-merge-lib.sh'), join(root, 'scripts/worktree-merge-lib.sh'));
  writeSprint(root, '[ ]');
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'init', '--bare', remote);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', 'origin', 'main');

  const repoIdentity = resolveRepoIdentity(root);
  const taskId = fixtureTaskId(TASK);
  const revision = deriveTaskRevision({ taskCell: TASK, taskId, modeCell: 'contract', acceptanceCell: 'reconcile tests' });
  git(root, 'switch', '-c', 'codex/reconcile');
  writeFileSync(join(root, 'feature.txt'), 'published\n');
  git(root, 'add', 'feature.txt'); git(root, 'commit', '-m', 'feature');
  const head = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');

  const receipt = buildPublicationReceipt({
    repo_id: publicationSha256(resolveGitCommonDirectory(root)), task_id: taskId, task_revision: revision,
    claim_id: CLAIM, generation: 1, target_ref: 'main', base_sha: base, branch: 'codex/reconcile',
    head_sha: head, tree_sha: tree, review_subject_sha256: SUBJECT,
    verification_evidence_sha256: `sha256:${'4'.repeat(64)}`,
    merge_seal_sha256: `sha256:${'5'.repeat(64)}`,
    provider: 'github', provider_repo_id: 'R_reconcile', pr_number: 1,
    pr_url: 'https://example.invalid/pr/1', created_at: '2026-08-22T04:05:55Z',
  });
  writePublicationReceiptCache(root, receipt);
  const pointer = publicationPointerFromReceipt(receipt, 'ship-reconcile');
  const claimed = buildLeaseOwnerRecord({
    claimId: CLAIM, taskId, taskRevision: revision, sprintPath: SPRINT_PATH, targetRef: 'main', generation: 1,
    sessionId: 'session-reconcile', sourceWorktree: root,
  });
  const bound = bindLeaseRecord(claimed, { claimId: CLAIM, executionWorktree: root, branch: 'codex/reconcile', unitRef: 'plans/plan-reconcile.md' });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, { claimId: CLAIM, executionWorktree: root, finishTransactionKey: 'finish-reconcile' });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, { claimId: CLAIM, publication: pointer });
  if (!reviewing.ok) throw new Error(reviewing.error);
  if (!createLeaseDirectory(root, taskId)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(root, taskId, reviewing.record);

  // The provider target is deliberately allowed to move beyond the receipt's
  // original base. Reconcile must use the isolated fetched OID, never local
  // `main`, as its canonical and integration fence.
  git(root, 'switch', 'main');
  if (complete) {
    writeSprint(root, '[x]');
    git(root, 'add', SPRINT_PATH); git(root, 'commit', '-m', 'complete task');
  }
  if (integration === 'merge') {
    git(root, 'merge', '--no-ff', 'codex/reconcile', '-m', 'merge publication');
  } else if (integration === 'squash') {
    git(root, 'merge', '--squash', 'codex/reconcile');
    git(root, 'commit', '-m', 'squash publication');
  }
  git(root, 'push', 'origin', 'main');
  const remoteTargetOid = execFileSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main'], { encoding: 'utf-8' }).trim();
  // Make local main stale after publication. The fake provider reports the
  // bare remote's ref, so a passing reconcile proves it trusts fetched state.
  git(root, 'reset', '--hard', base);

  const body = join(root, 'pr-body.md');
  writeFileSync(body, replacePublicationMarker('PR body\n', receipt));
  const gh = join(root, 'fake-gh.sh');
  writeFileSync(gh, [
    '#!/bin/bash', 'set -euo pipefail',
    'body="$(jq -Rs . < "$GH_BODY_FILE")"',
    'head="$(git rev-parse codex/reconcile)"', 'base="$(git --git-dir "$GH_REMOTE_REPO" rev-parse refs/heads/main)"',
    'merged_at="null"; [[ -z "${GH_PR_MERGED_AT:-}" ]] || merged_at="\\"$GH_PR_MERGED_AT\\""',
    'pr="{\\"number\\":1,\\"url\\":\\"https://example.invalid/pr/1\\",\\"headRefOid\\":\\"$head\\",\\"headRefName\\":\\"codex/reconcile\\",\\"baseRefName\\":\\"main\\",\\"baseRefOid\\":\\"$base\\",\\"body\\":$body,\\"createdAt\\":\\"2026-08-22T04:05:55Z\\",\\"state\\":\\"${GH_PR_STATE:-MERGED}\\",\\"mergedAt\\":$merged_at}"',
    'if [[ "$1 $2" == "repo view" ]]; then printf \'{"id":"R_reconcile"}\\n\'; exit 0; fi',
    'if [[ "$1 $2" == "pr view" ]]; then printf \'%s\\n\' "$pr"; exit 0; fi',
    'echo "unexpected gh invocation: $*" >&2; exit 2', '',
  ].join('\n'));
  chmodSync(gh, 0o755);
  return { root, remote, remoteTargetOid, taskId, revision, head, receipt, gh };
}

function withFixture(options: FixtureOptions, run: (fixture: Fixture) => void): void {
  const fixture = installFixture(options);
  const before = { ...process.env };
  process.env.GH_BODY_FILE = join(fixture.root, 'pr-body.md');
  process.env.GH_REMOTE_REPO = fixture.remote;
  process.env.GH_PR_STATE = 'MERGED';
  process.env.GH_PR_MERGED_AT = '2026-08-22T05:05:55Z';
  try { run(fixture); } finally { process.env = before; rmSync(fixture.root, { recursive: true, force: true }); }
}

function reconcileInput(fixture: Fixture) {
  return {
    repo_root: fixture.root, task_id: fixture.taskId, expected_claim_id: CLAIM, expected_generation: 1,
    publication_id: fixture.receipt.publication_id, expected_head_sha: fixture.head, remote: 'origin', gh_bin: fixture.gh,
  } as const;
}

function expectLifecycleError(run: () => unknown, code: PublicationLifecycleError['code']): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PublicationLifecycleError);
    expect((error as PublicationLifecycleError).code).toBe(code);
    return;
  }
  throw new Error(`expected PublicationLifecycleError(${code})`);
}

describe('publication recovery and reconcile', () => {
  test('integration observations are deterministic and reject stale or unknown schema fields', () => {
    const input = {
      publication_id: `sha256:${'a'.repeat(64)}`, receipt_sha256: `sha256:${'b'.repeat(64)}`,
      task_id: '1'.repeat(64), task_revision: '2'.repeat(64), claim_id: 'claim-observation', generation: 1,
      head_sha: 'c'.repeat(40), target_ref: 'main', fetched_target_oid: 'd'.repeat(40),
      observation_ref: `refs/repo-harness/observations/publication/${'a'.repeat(64)}/${'d'.repeat(40)}`,
      provider_pr_number: 1, provider_state: 'MERGED', provider_merged_at: '2026-08-22T05:05:55Z' as string | null,
      integration_state: 'merged' as const,
    };
    const first = buildPublicationIntegrationObservation(input);
    expect(buildPublicationIntegrationObservation(input)).toEqual(first);
    expect(buildPublicationIntegrationObservation({ ...input, fetched_target_oid: 'e'.repeat(40) }).observation_id).not.toBe(first.observation_id);
    expect(validatePublicationIntegrationObservation(first)).toEqual(first);
    expect(() => validatePublicationIntegrationObservation({ ...first, unknown: true })).toThrow('fields are invalid');
    expect(() => validatePublicationIntegrationObservation({ ...first, observation_id: `sha256:${'f'.repeat(64)}` })).toThrow('id is stale');
  });

  test('a fetched provider OID plus canonical completion clears only the exact reviewing lease', () => withFixture({}, (fixture) => {
    const localMainBefore = git(fixture.root, 'rev-parse', 'main');
    const result = reconcilePublication(reconcileInput(fixture));
    expect(result).toMatchObject({ classification: 'integrated', integration_state: 'merged', attention: null });
    expect(readLease(fixture.root, fixture.taskId).record).toBeNull();
    expect(result.fetched_target_oid).toBe(fixture.remoteTargetOid);
    expect(localMainBefore).not.toBe(fixture.remoteTargetOid);
    expect(git(fixture.root, 'rev-parse', 'main')).toBe(localMainBefore);
    expect(git(fixture.root, 'rev-parse', result.observation_ref)).toBe(result.fetched_target_oid);
    const evidencePath = join(resolveGitCommonDirectory(fixture.root), 'repo-harness/publications/v1/integration', fixture.receipt.publication_id.slice('sha256:'.length), `${result.evidence.observation_id.slice('sha256:'.length)}.json`);
    expect(execFileSync('git', ['cat-file', '-e', `${fixture.head}^{commit}`], { cwd: fixture.root }).toString()).toBe('');
    expect(result.evidence.publication_id).toBe(fixture.receipt.publication_id);
    expect(existsSync(evidencePath)).toBe(true);
  }));

  test('stale claim, generation, publication pointer, and head fences retain the reviewing lease', () => withFixture({}, (fixture) => {
    const before = readLease(fixture.root, fixture.taskId).raw;
    for (const stale of [
      { expected_claim_id: 'claim-stale' },
      { expected_generation: 2 },
      { publication_id: `sha256:${'e'.repeat(64)}` },
      { expected_head_sha: 'f'.repeat(40) },
    ]) {
      expectLifecycleError(() => reconcilePublication({ ...reconcileInput(fixture), ...stale }), 'publication_claim_mismatch');
      expect(readLease(fixture.root, fixture.taskId).raw).toBe(before);
    }
  }));

  test('a task revision change between provider fetch and task lock retains the changed reviewing lease', () => withFixture({}, (fixture) => {
    const current = readLease(fixture.root, fixture.taskId).record;
    if (current === null) throw new Error('fixture reviewing lease is absent');
    const changedRevision = '9'.repeat(64);
    const replacementPath = join(fixture.root, 'replacement-owner.json');
    writeFileSync(replacementPath, `${JSON.stringify({ ...current, task_revision: changedRevision })}\n`);

    const racingGit = join(fixture.root, 'racing-git.sh');
    writeFileSync(racingGit, [
      '#!/bin/bash', 'set -euo pipefail',
      'command git "$@"',
      'if [[ "$1" == "fetch" ]]; then cp "$RACE_OWNER_SOURCE" "$RACE_OWNER_TARGET"; fi', '',
    ].join('\n'));
    chmodSync(racingGit, 0o755);
    process.env.RACE_OWNER_SOURCE = replacementPath;
    process.env.RACE_OWNER_TARGET = leaseOwnerPath(fixture.root, fixture.taskId);

    expectLifecycleError(
      () => reconcilePublication({ ...reconcileInput(fixture), git_bin: racingGit }),
      'publication_claim_mismatch',
    );
    const retained = readLease(fixture.root, fixture.taskId);
    expect(retained.record?.task_revision).toBe(changedRevision);
    expect(retained.record?.state).toBe('reviewing');
  }));

  test('a pre-existing byte-identical observation is idempotent before the exact lease removal', () => withFixture({}, (fixture) => {
    const reviewing = readLease(fixture.root, fixture.taskId).record;
    if (reviewing === null) throw new Error('fixture reviewing lease is absent');
    const first = reconcilePublication(reconcileInput(fixture));
    expect(createLeaseDirectory(fixture.root, fixture.taskId)).toBe(true);
    writeLeaseOwnerDurably(fixture.root, fixture.taskId, reviewing);
    const second = reconcilePublication(reconcileInput(fixture));
    expect(second.evidence).toEqual(first.evidence);
    expect(readLease(fixture.root, fixture.taskId).record).toBeNull();
  }));

  test('a pending canonical row at the fetched OID retains the reviewing lease byte-for-byte', () => withFixture({ complete: false }, (fixture) => {
    const before = readLease(fixture.root, fixture.taskId).raw;
    expectLifecycleError(() => reconcilePublication(reconcileInput(fixture)), 'canonical_row_incomplete');
    expect(readLease(fixture.root, fixture.taskId).raw).toBe(before);
  }));

  test('a CLOSED unmerged provider PR retains the exact reviewing lease', () => withFixture({ integration: 'none' }, (fixture) => {
    process.env.GH_PR_STATE = 'CLOSED';
    delete process.env.GH_PR_MERGED_AT;
    const before = readLease(fixture.root, fixture.taskId).raw;
    expectLifecycleError(() => reconcilePublication(reconcileInput(fixture)), 'closed_unmerged');
    expect(readLease(fixture.root, fixture.taskId).raw).toBe(before);
  }));

  test('an OPEN provider PR with squash-absorbed content clears the lease with attention', () => withFixture({ integration: 'squash' }, (fixture) => {
    process.env.GH_PR_STATE = 'OPEN';
    delete process.env.GH_PR_MERGED_AT;
    const result = reconcilePublication(reconcileInput(fixture));
    expect(result).toMatchObject({ classification: 'integrated', integration_state: 'absorbed', attention: 'superseded_attention' });
    expect(readLease(fixture.root, fixture.taskId).record).toBeNull();
  }));

  test('recover abort requires explicit confirmation before invoking the ship adapter', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-publication-recover-cli-'));
    try {
      const absent = spawnSync(process.execPath, [join(HARNESS_ROOT, 'src/cli/index.ts'), 'publication', 'recover', 'abort', '--key', 'ship-key'], { cwd: root, encoding: 'utf-8' });
      expect(absent.status).toBe(1);
      expect(absent.stderr).toContain("required option '--confirm-abort'");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('recover reconcile forwards exactly one required transaction key to the ship adapter', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-publication-recover-cli-'));
    const argsPath = join(root, 'recover-args.txt');
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      const adapter = join(root, 'scripts/ship-worktrees.sh');
      writeFileSync(adapter, [
        '#!/bin/bash', 'set -euo pipefail',
        'printf "%s\\n" "$@" > "$RECOVERY_ARGS_FILE"',
        'printf "recovered\\n"', '',
      ].join('\n'));
      chmodSync(adapter, 0o755);
      const result = spawnSync(process.execPath, [
        join(HARNESS_ROOT, 'src/cli/index.ts'), 'publication', 'recover', 'reconcile', '--key', 'ship-key',
      ], {
        cwd: root,
        encoding: 'utf-8',
        env: { ...process.env, RECOVERY_ARGS_FILE: argsPath },
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ ok: true, action: 'reconcile', message: 'recovered' });
      expect(readFileSync(argsPath, 'utf-8')).toBe('--recover\nreconcile\n--key\nship-key\n');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
