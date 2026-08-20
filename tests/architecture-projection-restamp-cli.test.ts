import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectionResultReceiptDigest, type ProjectionResultV1 } from '../src/core/architecture/projection';
import { ARCHITECTURE_PROJECTION_MANIFEST_PATH, RESTAMP_COMMIT_SUBJECT } from '../src/core/architecture/restamp-publication';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const digest = (token: string) => `sha256:${token.repeat(64).slice(0, 64)}` as const;
const JOB_ID = 'job-07e4d2d8fe733699af945715';

// A leaked ambient authority value would repoint the CLI at the real repository;
// bun runs test files in one process, so strip them before every subprocess.
const AUTHORITY_ENV_KEYS = [
  'REPO_HARNESS_TARGET_REPO_ROOT',
  'REPO_HARNESS_HELPER_SOURCE',
  'REPO_HARNESS_HELPER_SOURCE_PATH',
  'REPO_HARNESS_SOURCE_ROOT',
  'REPO_HARNESS_NODE_BIN',
  'REPO_HARNESS_GIT_BIN',
] as const;

function isolatedEnv(): NodeJS.ProcessEnv {
  const base = { ...process.env };
  for (const key of AUTHORITY_ENV_KEYS) delete base[key];
  return base;
}

function cli(cwd: string, args: readonly string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: isolatedEnv() });
}

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
    schemaVersion: 'archcontext.projection-result/v1',
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

/** A repository whose only dirty tracked path is a restamped manifest. */
function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-restamp-cli-')));
  roots.push(root);
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  mkdirSync(join(root, 'docs/architecture'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  writeFileSync(join(root, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
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

describe('architecture-projection publish-restamp', () => {
  test('publishes a prepared dirty-manifest fixture and reports the outcome as JSON', () => {
    const root = fixture();
    seedReceipt(root, RESTAMP);
    const base = git(root, ['rev-parse', 'HEAD']);

    const result = cli(root, ['architecture-projection', 'publish-restamp', '--json']);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const outcome = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(outcome.schemaVersion).toBe('repo-harness.architecture-projection-restamp/v1');
    expect(outcome.status).toBe('published');
    expect(outcome.branch).toBe('main');
    expect(outcome.receiptDigest).toBe(RESTAMP.receiptDigest);
    expect(outcome.commitSha).toBe(git(root, ['rev-parse', 'HEAD']));
    expect(status(root)).toBe('');
    expect(git(root, ['rev-parse', 'HEAD^'])).toBe(base);
    expect(git(root, ['log', '-1', '--format=%s'])).toBe(RESTAMP_COMMIT_SUBJECT);
  });

  test('exits 1 without publishing when the gate refuses or no receipt exists', () => {
    const empty = fixture();
    const missing = cli(empty, ['architecture-projection', 'publish-restamp', '--json']);
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout)).toMatchObject({ status: 'not-applicable', reason: 'no-receipt' });
    expect(status(empty)).toBe(` M ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);

    const dirty = fixture();
    seedReceipt(dirty, RESTAMP);
    writeFileSync(join(dirty, 'README.md'), '# user work\n');
    const head = git(dirty, ['rev-parse', 'HEAD']);
    const refused = cli(dirty, ['architecture-projection', 'publish-restamp', '--json']);
    expect(refused.status).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({ status: 'skipped', reason: 'other-tracked-paths-dirty' });
    expect(git(dirty, ['rev-parse', 'HEAD'])).toBe(head);
  });
});

describe('architecture-projection drain output shape', () => {
  // Publication lives outside the drain: this locks the operator-visible JSON
  // contract so it cannot silently grow a publication field.
  test('is byte-stable and carries no publication keys', () => {
    const root = fixture();
    const result = cli(root, ['architecture-projection', 'drain', '--json']);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const drain = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Object.keys(drain)).toEqual([
      'schemaVersion',
      'status',
      'jobId',
      'sourceEventIds',
      'resultStatus',
      'error',
      'acknowledgeSourceEvents',
      'queue',
      'sourceJournalPending',
    ]);
    expect(Object.keys(drain.queue as Record<string, unknown>)).toEqual([
      'schemaVersion',
      'pending',
      'running',
      'receipts',
      'deadLetters',
      'oldestPendingJobId',
      'oldestDeadLetterJobId',
    ]);
    expect(drain.schemaVersion).toBe('repo-harness.architecture-projection-drain/v1');
    expect(drain.status).toBe('disabled');
    // The drain never publishes: the dirty manifest is still dirty afterward.
    expect(status(root)).toBe(` M ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);
  });
});
