import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EffectiveState } from '../src/core/state/types';
import { runStopHandler } from '../src/cli/hook/stop-handler';
import {
  architectureDriftSourceEvent,
  computeArchitectureDriftChangedSet,
  readArchitectureDriftCursor,
} from '../src/cli/hook/architecture-drift';
import { drainArchitectureProjectionJobs } from '../src/effects/architecture/projection-orchestrator';
import { projectionResultReceiptDigest, type ArchitectureProjectionPolicy, type ProjectionResultV1 } from '../src/core/architecture/projection';
import { ARCHITECTURE_PROJECTION_MANIFEST_PATH, RESTAMP_COMMIT_SUBJECT } from '../src/core/architecture/restamp-publication';
import type { ArchitectureProjectionDrainResultV1 } from '../src/effects/architecture/projection-orchestrator';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const digest = (token: string) => `sha256:${token.repeat(64).slice(0, 64)}` as const;
const JOB_ID = 'job-07e4d2d8fe733699af945715';

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return (result.stdout ?? '').trim();
}

function status(root: string): string {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return (result.stdout ?? '').trimEnd();
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

function projectionResult(files: ProjectionResultV1['files']): ProjectionResultV1 {
  const body: Omit<ProjectionResultV1, 'receiptDigest'> = {
    schemaVersion: 'archcontext.projection-result/v2',
    requestId: `repo-harness.projection.${JOB_ID}`,
    status: 'applied',
    inputSnapshot: SNAPSHOT,
    outputSnapshot: SNAPSHOT,
    affectedNodeIds: [],
    files,
    humanActions: [],
    refreshSignals: [],
  };
  return { ...body, receiptDigest: projectionResultReceiptDigest(body) };
}

const RESTAMP = projectionResult([
  { path: ARCHITECTURE_PROJECTION_MANIFEST_PATH, action: 'update', preimageDigest: digest('9'), outputDigest: digest('c') },
]);
const SEMANTIC = projectionResult([
  { path: ARCHITECTURE_PROJECTION_MANIFEST_PATH, action: 'update', preimageDigest: digest('9'), outputDigest: digest('c') },
  { path: 'docs/architecture/index.md', action: 'update', preimageDigest: digest('1'), outputDigest: digest('2') },
]);

const CAPABILITY_NODE = `schemaVersion: archcontext.node/v2
kind: capability
id: capability.test.root
name: Root
summary: Root capability.
responsibilities:
  - Own runtime tests.
status: active
source:
  include:
    - src/**
extensions:
  lspProfile: ts
  verification: []
  contractFiles:
    agents: AGENTS.md
    claude: CLAUDE.md
`;

function fixture(policy: Record<string, unknown> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-stop-restamp-')));
  roots.push(root);
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  mkdirSync(join(root, 'docs/architecture'), { recursive: true });
  mkdirSync(join(root, '.archcontext/model/nodes'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), `${JSON.stringify(policy)}\n`);
  writeFileSync(join(root, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  writeFileSync(join(root, 'AGENTS.md'), '# agents\n');
  writeFileSync(join(root, 'CLAUDE.md'), '# claude\n');
  writeFileSync(join(root, 'src/index.ts'), 'export const value = 1;\n');
  writeFileSync(join(root, '.archcontext/model/nodes/root.yaml'), CAPABILITY_NODE);
  writeFileSync(join(root, ARCHITECTURE_PROJECTION_MANIFEST_PATH), `${JSON.stringify({ worktreeDigest: digest('a') }, null, 2)}\n`);
  git(root, ['init', '-q', '-b', 'main', '.']);
  git(root, ['config', 'user.email', 'restamp@example.com']);
  git(root, ['config', 'user.name', 'Restamp Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seed']);
  writeFileSync(join(root, ARCHITECTURE_PROJECTION_MANIFEST_PATH), `${JSON.stringify({ worktreeDigest: digest('b') }, null, 2)}\n`);
  return root;
}

function seedReceipt(root: string, value: ProjectionResultV1): void {
  mkdirSync(join(root, '.ai/harness/architecture-projection/receipts'), { recursive: true });
  writeFileSync(join(root, `.ai/harness/architecture-projection/receipts/${JOB_ID}.json`), `${JSON.stringify({
    schemaVersion: 'repo-harness.architecture-projection-receipt/v1',
    jobId: JOB_ID,
    sourceEventIds: ['drift-c50aae832b3d997cfdf323e3'],
    sourceKeys: ['architecture-drift-cursor'],
    changedPaths: ['tasks/todos.md'],
    attempt: 1,
    completedAt: '2026-08-18T11:30:48.744Z',
    result: value,
    refreshReceiptDigests: [],
  }, null, 2)}\n`);
}

function drainResult(overrides: Partial<ArchitectureProjectionDrainResultV1> = {}): ArchitectureProjectionDrainResultV1 {
  return {
    schemaVersion: 'repo-harness.architecture-projection-drain/v1',
    status: 'succeeded',
    jobId: JOB_ID,
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

function canonicalState(): EffectiveState {
  return {
    workflow_profile: 'standard',
    review: { path: null, freshness: 'missing', recommendation: null, recorded_subject_sha256: null, recorded_target_revision: null },
    readiness: {
      ok: true,
      allowedToEdit: { decision: 'allow' },
      allowedToStop: { decision: 'allow' },
      readyToShip: { decision: 'allow' },
      requirements: { edit: [], stop: [], ship: [] },
      nextAction: null,
    },
  } as unknown as EffectiveState;
}

function stop(root: string, drain: ArchitectureProjectionDrainResultV1) {
  return runStopHandler({
    collector: {
      getRepoRoot: () => root,
      getWorktreeOwnership: () => ({ owner: null, ownedByCurrent: false }),
      getActivePlanMarker: () => null,
      getStopEffectiveState: () => canonicalState(),
    },
    env: { ...process.env, HOOK_RUN_ID: 'restamp-publication' },
    dependencies: { drainArchitectureProjection: () => drain },
  });
}

describe('Stop-time restamp auto-publication', () => {
  test('publishes a digest-only restamp and leaves the checkout clean', () => {
    const root = fixture();
    seedReceipt(root, RESTAMP);
    const base = git(root, ['rev-parse', 'HEAD']);

    const result = stop(root, drainResult());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(status(root)).toBe('');
    expect(git(root, ['rev-parse', 'HEAD^'])).toBe(base);
    expect(git(root, ['log', '-1', '--format=%s'])).toBe(RESTAMP_COMMIT_SUBJECT);
    expect(git(root, ['log', '-1', '--format=%B'])).toContain(`Architecture-Projection-Restamp: ${RESTAMP.receiptDigest}`);
    expect(result.stderr).toContain(`[ArchitectureProjection] published restamp ${git(root, ['rev-parse', 'HEAD'])}.`);
    // The cursor stays where the drain left it; publication is not a third writer.
    expect(readArchitectureDriftCursor(root)?.head_sha).toBe(base);
  });

  test('never auto-commits a semantic projection delta', () => {
    const root = fixture();
    seedReceipt(root, SEMANTIC);
    const base = git(root, ['rev-parse', 'HEAD']);

    const result = stop(root, drainResult());

    expect(result.exitCode).toBe(0);
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(base);
    expect(status(root)).toBe(` M ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);
    expect(result.stderr).not.toContain('published restamp');
    expect(result.stderr).not.toContain('restamp publication');
  });

  test('exits 0 with one advisory on every skip and fault path', () => {
    const skipped = fixture();
    seedReceipt(skipped, RESTAMP);
    git(skipped, ['config', 'commit.gpgsign', 'true']);
    const skippedHead = git(skipped, ['rev-parse', 'HEAD']);
    const skippedResult = stop(skipped, drainResult());
    expect(skippedResult.exitCode).toBe(0);
    expect(skippedResult.stdout).toBe('');
    expect(git(skipped, ['rev-parse', 'HEAD'])).toBe(skippedHead);
    expect(skippedResult.stderr.split('\n').filter((line) => line.includes('restamp publication'))).toEqual([
      '[ArchitectureProjection] restamp publication skipped: commit-gpgsign-enabled.',
    ]);

    const faulted = fixture();
    mkdirSync(join(faulted, '.ai/harness/architecture-projection/receipts'), { recursive: true });
    writeFileSync(join(faulted, `.ai/harness/architecture-projection/receipts/${JOB_ID}.json`), '{ corrupt receipt\n');
    const faultedResult = stop(faulted, drainResult());
    expect(faultedResult.exitCode).toBe(0);
    expect(faultedResult.stdout).toBe('');
    expect(faultedResult.stderr).toContain('[ArchitectureProjection] restamp publication failed:');
    expect(status(faulted)).toBe(` M ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);

    const inert = fixture();
    const inertResult = stop(inert, drainResult({ status: 'idle', resultStatus: null }));
    expect(inertResult.exitCode).toBe(0);
    expect(inertResult.stderr).not.toContain('restamp publication');
  });

  test('leaves the strict projection failure gate criteria untouched', () => {
    const strictPolicy = { architecture: { projection_provider: 'archctx', projection_apply: 'automatic', projection_version: '0.5.7', projection_failure_gate: 'strict' } };

    // A publication fault under strict never blocks: it is not a drain failure.
    const faulted = fixture(strictPolicy);
    mkdirSync(join(faulted, '.ai/harness/architecture-projection/receipts'), { recursive: true });
    writeFileSync(join(faulted, `.ai/harness/architecture-projection/receipts/${JOB_ID}.json`), '{ corrupt receipt\n');
    const faultedResult = stop(faulted, drainResult());
    expect(faultedResult.exitCode).toBe(0);
    expect(faultedResult.stdout).toBe('');
    expect(faultedResult.stderr).toContain('restamp publication failed:');

    // The pre-existing criteria still block exactly what they blocked before.
    const failing = fixture(strictPolicy);
    const failingResult = stop(failing, drainResult({ status: 'retry-pending', resultStatus: null, error: 'projection failed', acknowledgeSourceEvents: false }));
    expect(failingResult.exitCode).toBe(0);
    expect(JSON.parse(failingResult.stdout).decision).toBe('block');
    expect(failingResult.stdout).toContain('Strict projection failure gate blocked Stop');
  });

  test('converges: the published restamp keeps the next drain idle without a provider run', () => {
    const root = fixture({ architecture: { projection_provider: 'archctx', projection_apply: 'automatic', projection_version: '0.5.7' } });
    seedReceipt(root, RESTAMP);

    expect(stop(root, drainResult()).exitCode).toBe(0);
    expect(status(root)).toBe('');

    const policy: ArchitectureProjectionPolicy = { provider: 'archctx', applyMode: 'automatic', failureGate: 'advisory', requiredVersion: '0.5.7', timeoutMs: 120_000 };
    const changedSet = computeArchitectureDriftChangedSet(root);
    expect(changedSet.paths).toEqual([ARCHITECTURE_PROJECTION_MANIFEST_PATH]);
    const event = architectureDriftSourceEvent(changedSet);
    expect(event).not.toBeNull();

    const second = drainArchitectureProjectionJobs(root, {
      policy,
      sourceEvents: [event!],
      run: () => { throw new Error('archctx must not run for an all-owned changed set'); },
    });

    expect(second.status).toBe('idle');
    expect(second.acknowledgeSourceEvents).toBe(true);
    expect(second.queue.pending).toBe(0);
  });
});
