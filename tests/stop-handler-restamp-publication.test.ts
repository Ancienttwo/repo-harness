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
    codeGraphVersion: '1.6.1',
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
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  mkdirSync(join(root, '.ai/harness/test-home/.repo-harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/test-home/.repo-harness/config.json'), `${JSON.stringify(policy)}\n`);
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

describe('Stop never publishes architecture projections automatically', () => {
  for (const failureGate of ['advisory', 'strict']) {
    test(`existing ${failureGate} queue/receipt stays available for explicit provider commands`, () => {
      const root = fixture({ architecture: { projection_failure_gate: failureGate } });
      const base = git(root, ['rev-parse', 'HEAD']);
      seedReceipt(root, RESTAMP);
      const result = runStopHandler({
        collector: {
          getRepoRoot: () => root,
          getWorktreeOwnership: () => ({owner:null,ownedByCurrent:false}),
          getActivePlanMarker: () => null,
          getStopEffectiveState: () => null,
        },
        env: { ...process.env, HOME: join(root, '.ai/harness/test-home') },
      });
      expect(result.exitCode).toBe(0); expect(result.stdout).toBe('');
      expect(git(root, ['rev-parse', 'HEAD'])).toBe(base);
      expect(status(root)).toBe(` M ${ARCHITECTURE_PROJECTION_MANIFEST_PATH}`);
      expect(readArchitectureDriftCursor(root)).toBeNull();
    });
  }
});
