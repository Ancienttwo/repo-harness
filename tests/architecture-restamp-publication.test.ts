import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectionResultReceiptDigest, type ProjectionResultV1 } from '../src/core/architecture/projection';
import { ARCHITECTURE_PROJECTION_MANIFEST_PATH, RESTAMP_COMMIT_SUBJECT } from '../src/core/architecture/restamp-publication';
import {
  collectRestampGitFacts,
  publishArchitectureProjectionRestamp,
  publishArchitectureProjectionRestampForDrain,
  publishLatestArchitectureProjectionRestamp,
} from '../src/effects/architecture/restamp-publication';
import type { ArchitectureProjectionDrainResultV1 } from '../src/effects/architecture/projection-orchestrator';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const digest = (token: string) => `sha256:${token.repeat(64).slice(0, 64)}` as const;

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return (result.stdout ?? '').trim();
}

const SNAPSHOT: ProjectionResultV1['inputSnapshot'] = {
  repositoryId: 'repo.a5b76eee64af71c3',
  workspaceId: 'workspace.a1438df45d859976',
  headSha: '1c7476a9465a7383b4597502da97631116a97235',
  worktreeDigest: digest('7'),
  baseHeadSha: '1c7476a9465a7383b4597502da97631116a97235',
  sourceTreeDigest: digest('0'),
  modelDigest: digest('e'),
  codeGraphDigest: digest('6'),
  indexedWorktreeDigest: digest('b'),
  projectionInputDigest: digest('5'),
  rendererVersion: 'archcontext.docs-renderer/v4',
  layoutVersion: 'archcontext.docs-layout/v1',
  generatedFrom: {
    codeGraphPackage: '@colbymchenry/codegraph',
    codeGraphVersion: '1.5.0',
    codeGraphBinaryDigest: digest('4'),
    codeGraphStatus: 'ready',
  },
};

function result(overrides: Partial<Omit<ProjectionResultV1, 'receiptDigest'>> = {}): ProjectionResultV1 {
  const body: Omit<ProjectionResultV1, 'receiptDigest'> = {
    schemaVersion: 'archcontext.projection-result/v2',
    requestId: 'repo-harness.projection.job-07e4d2d8fe733699af945715',
    status: 'applied',
    inputSnapshot: SNAPSHOT,
    outputSnapshot: SNAPSHOT,
    affectedNodeIds: [],
    files: [{ path: ARCHITECTURE_PROJECTION_MANIFEST_PATH, action: 'update', preimageDigest: digest('9'), outputDigest: digest('c') }],
    humanActions: [],
    refreshSignals: [],
    ...overrides,
  };
  return { ...body, receiptDigest: projectionResultReceiptDigest(body) };
}

const RESTAMP = result();
const SEMANTIC = result({
  files: [
    { path: ARCHITECTURE_PROJECTION_MANIFEST_PATH, action: 'update', preimageDigest: digest('9'), outputDigest: digest('c') },
    { path: 'docs/architecture/index.md', action: 'update', preimageDigest: digest('1'), outputDigest: digest('2') },
  ],
});

/** A repository whose only dirty tracked path is a restamped manifest. */
function fixture(options: { dirtyManifest?: boolean } = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-restamp-')));
  roots.push(root);
  git(root, ['init', '-q', '-b', 'main', '.']);
  git(root, ['config', 'user.email', 'restamp@example.com']);
  git(root, ['config', 'user.name', 'Restamp Test']);
  // Pinned locally so a machine-global signing configuration cannot decide the gate.
  git(root, ['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(root, 'docs/architecture'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  writeFileSync(join(root, ARCHITECTURE_PROJECTION_MANIFEST_PATH), `${JSON.stringify({ worktreeDigest: digest('a') }, null, 2)}\n`);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seed']);
  if (options.dirtyManifest !== false) {
    writeFileSync(join(root, ARCHITECTURE_PROJECTION_MANIFEST_PATH), `${JSON.stringify({ worktreeDigest: digest('b') }, null, 2)}\n`);
  }
  return root;
}

/** Raw porcelain rows: the leading index column is load-bearing, so never trim-start it. */
function status(root: string): string {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`git status failed: ${result.stderr}`);
  return (result.stdout ?? '').trimEnd();
}

describe('architecture projection restamp synthesis', () => {
  test('publishes one single-path commit and leaves git status clean', () => {
    const root = fixture();
    const base = git(root, ['rev-parse', 'HEAD']);
    const manifest = readFileSync(join(root, ARCHITECTURE_PROJECTION_MANIFEST_PATH), 'utf8');

    const outcome = publishArchitectureProjectionRestamp(root, RESTAMP);

    expect(outcome.status).toBe('published');
    expect(outcome.branch).toBe('main');
    expect(outcome.receiptDigest).toBe(RESTAMP.receiptDigest);
    expect(outcome.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(status(root)).toBe('');
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(outcome.commitSha!);
    expect(git(root, ['rev-parse', 'HEAD^'])).toBe(base);
    expect(git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', base, outcome.commitSha!]))
      .toBe(ARCHITECTURE_PROJECTION_MANIFEST_PATH);
    expect(git(root, ['show', `${outcome.commitSha}:${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`])).toBe(manifest.trimEnd());
  });

  test('writes the frozen subject and receipt trailer without CI directives', () => {
    const root = fixture();
    const outcome = publishArchitectureProjectionRestamp(root, RESTAMP);
    const body = git(root, ['log', '-1', '--format=%B', outcome.commitSha!]);
    expect(body).toBe(`${RESTAMP_COMMIT_SUBJECT}\n\nArchitecture-Projection-Restamp: ${RESTAMP.receiptDigest}`);
    expect(body).not.toContain('[skip ci]');
  });

  test('never sweeps untracked files into the publication', () => {
    const root = fixture();
    writeFileSync(join(root, 'scratch.txt'), 'user work in progress\n');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/new-module.ts'), 'export const draft = 1;\n');

    const outcome = publishArchitectureProjectionRestamp(root, RESTAMP);

    expect(outcome.status).toBe('published');
    expect(git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD^', 'HEAD']))
      .toBe(ARCHITECTURE_PROJECTION_MANIFEST_PATH);
    expect(status(root).split('\n').sort()).toEqual(['?? scratch.txt', '?? src/new-module.ts']);
    expect(readFileSync(join(root, 'scratch.txt'), 'utf8')).toBe('user work in progress\n');
  });

  test('emits the ahead-of-origin advisory only when the branch outruns its remote', () => {
    const root = fixture();
    const remote = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-restamp-remote-')));
    roots.push(remote);
    git(remote, ['init', '-q', '--bare', '.']);
    git(root, ['remote', 'add', 'origin', remote]);
    git(root, ['push', '-q', 'origin', 'main']);

    const outcome = publishArchitectureProjectionRestamp(root, RESTAMP);

    expect(outcome.status).toBe('published');
    expect(outcome.aheadOfOrigin).toBe(true);
    expect(outcome.advisory).toBe(`[ArchitectureProjection] published restamp ${outcome.commitSha}; main is ahead of origin/main — push before running acceptance gates.`);

    const withoutRemote = fixture();
    const solo = publishArchitectureProjectionRestamp(withoutRemote, RESTAMP);
    expect(solo.aheadOfOrigin).toBe(false);
    expect(solo.advisory).toBe(`[ArchitectureProjection] published restamp ${solo.commitSha}.`);
  });
});

describe('architecture projection restamp gate matrix', () => {
  test('never publishes a semantic projection delta', () => {
    const root = fixture();
    const base = git(root, ['rev-parse', 'HEAD']);

    const outcome = publishArchitectureProjectionRestamp(root, SEMANTIC);

    expect(outcome.status).toBe('not-applicable');
    expect(outcome.reason).toBe('not-a-restamp');
    expect(outcome.advisory).toBeNull();
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(base);
    expect(status(root)).toBe(` M ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);
  });

  test('skips a linked worktree, a detached HEAD, a dirty index, sibling dirt, and signing', () => {
    const primary = fixture();
    const linked = join(primary, '..', `${primary.split('/').pop()}-linked`);
    git(primary, ['worktree', 'add', '-q', '-b', 'linked', linked, 'HEAD']);
    roots.push(linked);
    writeFileSync(join(linked, ARCHITECTURE_PROJECTION_MANIFEST_PATH), `${JSON.stringify({ worktreeDigest: digest('c') }, null, 2)}\n`);
    expect(publishArchitectureProjectionRestamp(realpathSync(linked), RESTAMP)).toMatchObject({
      status: 'skipped',
      reason: 'linked-worktree',
    });

    const detached = fixture();
    git(detached, ['checkout', '-q', '--detach', 'HEAD']);
    expect(publishArchitectureProjectionRestamp(detached, RESTAMP).reason).toBe('detached-head');

    const stagedIndex = fixture();
    writeFileSync(join(stagedIndex, 'README.md'), '# staged\n');
    git(stagedIndex, ['add', '--', 'README.md']);
    const stagedOutcome = publishArchitectureProjectionRestamp(stagedIndex, RESTAMP);
    expect(stagedOutcome.reason).toBe('index-dirty');
    expect(git(stagedIndex, ['diff', '--cached', '--name-only'])).toBe('README.md');

    const siblingDirt = fixture();
    writeFileSync(join(siblingDirt, 'README.md'), '# edited\n');
    expect(publishArchitectureProjectionRestamp(siblingDirt, RESTAMP).reason).toBe('other-tracked-paths-dirty');

    const clean = fixture({ dirtyManifest: false });
    expect(publishArchitectureProjectionRestamp(clean, RESTAMP).reason).toBe('manifest-not-dirty');

    const signing = fixture();
    git(signing, ['config', 'commit.gpgsign', 'true']);
    const signedOutcome = publishArchitectureProjectionRestamp(signing, RESTAMP);
    expect(signedOutcome.reason).toBe('commit-gpgsign-enabled');
    expect(signedOutcome.advisory).toBe('[ArchitectureProjection] restamp publication skipped: commit-gpgsign-enabled.');
    expect(git(signing, ['rev-parse', 'HEAD'])).toBe(git(signing, ['rev-parse', 'main']));
  });

  test('restores the index and publishes nothing when the ref update is refused', () => {
    const root = fixture();
    const base = git(root, ['rev-parse', 'HEAD']);
    const hook = join(root, '.git/hooks/reference-transaction');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);

    const outcome = publishArchitectureProjectionRestamp(root, RESTAMP);

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toBe('ref-update-refused');
    expect(outcome.advisory).toContain('[ArchitectureProjection] restamp publication skipped: ref-update-refused');
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(base);
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(status(root)).toBe(` M ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);
  });

  test('rejects a manifest deletion even when it is the only dirty tracked path', () => {
    const root = fixture();
    const base = git(root, ['rev-parse', 'HEAD']);
    rmSync(join(root, ARCHITECTURE_PROJECTION_MANIFEST_PATH));

    const outcome = publishArchitectureProjectionRestamp(root, RESTAMP);

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toBe('single-path-proof-failed');
    expect(outcome.detail).toBe(`D ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(base);
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(status(root)).toBe(` D ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);
  });

  test('git refuses a stale compare-and-swap, which is the only concurrency primitive used', () => {
    const root = fixture();
    const stale = git(root, ['rev-parse', 'HEAD']);
    writeFileSync(join(root, 'README.md'), '# moved\n');
    git(root, ['commit', '-q', '-a', '-m', 'competing writer']);
    const moved = git(root, ['rev-parse', 'HEAD']);

    const refused = spawnSync('git', ['update-ref', '-m', 'stale', 'refs/heads/main', stale, stale], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(refused.status).not.toBe(0);
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(moved);
  });
});

describe('architecture projection restamp facts', () => {
  test('reports the primary-worktree, branch, index, and dirty-path facts git actually holds', () => {
    const root = fixture();
    writeFileSync(join(root, 'untracked.txt'), 'ignored by commit-tree\n');
    const facts = collectRestampGitFacts(root);
    expect(facts).toEqual({
      primaryWorktree: true,
      branchRef: 'refs/heads/main',
      headSha: git(root, ['rev-parse', 'HEAD']),
      indexDirty: false,
      dirtyTrackedPaths: [ARCHITECTURE_PROJECTION_MANIFEST_PATH],
      commitGpgSign: false,
    });
  });
});

function drain(overrides: Partial<ArchitectureProjectionDrainResultV1> = {}): ArchitectureProjectionDrainResultV1 {
  return {
    schemaVersion: 'repo-harness.architecture-projection-drain/v1',
    status: 'succeeded',
    jobId: 'job-07e4d2d8fe733699af945715',
    sourceEventIds: ['drift-c50aae832b3d997cfdf323e3'],
    resultStatus: 'applied',
    error: null,
    acknowledgeSourceEvents: true,
    queue: {
      schemaVersion: 'repo-harness.architecture-projection-queue-state/v1',
      pending: 0, running: 0, receipts: 1, deadLetters: 0,
      oldestPendingJobId: null, oldestDeadLetterJobId: null,
    },
    ...overrides,
  };
}

function seedReceipt(root: string, jobId: string, value: ProjectionResultV1, completedAt: string): void {
  mkdirSync(join(root, '.ai/harness/architecture-projection/receipts'), { recursive: true });
  writeFileSync(join(root, `.ai/harness/architecture-projection/receipts/${jobId}.json`), `${JSON.stringify({
    schemaVersion: 'repo-harness.architecture-projection-receipt/v1',
    jobId,
    sourceEventIds: ['drift-c50aae832b3d997cfdf323e3'],
    sourceKeys: ['architecture-drift-cursor'],
    changedPaths: ['tasks/todos.md'],
    attempt: 1,
    completedAt,
    result: value,
    refreshReceiptDigests: [],
  }, null, 2)}\n`);
}

describe('architecture projection restamp entrypoints', () => {
  test('publishes from the drain receipt and stays inert for every other drain outcome', () => {
    const root = fixture();
    seedReceipt(root, 'job-07e4d2d8fe733699af945715', RESTAMP, '2026-08-18T11:30:48.744Z');

    expect(publishArchitectureProjectionRestampForDrain(root, drain({ status: 'retry-pending' })).reason).toBe('no-applied-drain');
    expect(publishArchitectureProjectionRestampForDrain(root, drain({ resultStatus: 'noop' })).reason).toBe('no-applied-drain');
    expect(publishArchitectureProjectionRestampForDrain(root, drain({ jobId: null })).reason).toBe('no-applied-drain');
    expect(publishArchitectureProjectionRestampForDrain(root, drain({ jobId: 'job-000000000000000000000000' })).reason).toBe('no-receipt');
    expect(status(root)).toBe(` M ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);

    const published = publishArchitectureProjectionRestampForDrain(root, drain());
    expect(published.status).toBe('published');
    expect(published.receiptDigest).toBe(RESTAMP.receiptDigest);
    expect(status(root)).toBe('');
  });

  test('manual entry classifies against the newest durable receipt', () => {
    const root = fixture();
    expect(publishLatestArchitectureProjectionRestamp(root).reason).toBe('no-receipt');

    seedReceipt(root, 'job-115767b95ce6133151e1d3a9', SEMANTIC, '2026-08-18T11:30:48.744Z');
    expect(publishLatestArchitectureProjectionRestamp(root).reason).toBe('not-a-restamp');

    seedReceipt(root, 'job-07e4d2d8fe733699af945715', RESTAMP, '2026-08-19T09:00:00.000Z');
    const published = publishLatestArchitectureProjectionRestamp(root);
    expect(published.status).toBe('published');
    expect(status(root)).toBe('');
    expect(git(root, ['log', '-1', '--format=%B'])).toContain(`Architecture-Projection-Restamp: ${RESTAMP.receiptDigest}`);
  });
});
