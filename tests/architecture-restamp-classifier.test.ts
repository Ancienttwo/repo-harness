import { describe, expect, test } from 'bun:test';
import {
  ARCHITECTURE_PROJECTION_MANIFEST_PATH,
  RESTAMP_COMMIT_SUBJECT,
  evaluateRestampGate,
  isManifestRestampOnly,
  restampBranchName,
  restampCommitMessage,
  type RestampGitFacts,
} from '../src/core/architecture/restamp-publication';
import { projectionResultReceiptDigest, type ProjectionResultV1 } from '../src/core/architecture/projection';

const digest = (token: string) => `sha256:${token.repeat(64).slice(0, 64)}` as const;

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

/** Real receipt shapes, modeled on `.ai/harness/architecture-projection/receipts/`. */
function result(overrides: Partial<Omit<ProjectionResultV1, 'receiptDigest'>> = {}): ProjectionResultV1 {
  const body: Omit<ProjectionResultV1, 'receiptDigest'> = {
    schemaVersion: 'archcontext.projection-result/v1',
    requestId: 'repo-harness.projection.job-07e4d2d8fe733699af945715',
    status: 'applied',
    inputSnapshot: SNAPSHOT,
    outputSnapshot: SNAPSHOT,
    affectedNodeIds: [],
    files: [],
    humanActions: [],
    refreshSignals: [],
    ...overrides,
  };
  return { ...body, receiptDigest: projectionResultReceiptDigest(body) };
}

const manifestUpdate = {
  path: ARCHITECTURE_PROJECTION_MANIFEST_PATH,
  action: 'update' as const,
  preimageDigest: digest('9'),
  outputDigest: digest('c'),
};

/** `status: noop`, empty files -- 59 of the 121 observed receipts. */
const NOOP = result({ status: 'noop' });
/** `status: applied`, exactly the manifest -- 25 of the 121 observed receipts. */
const RESTAMP = result({ files: [manifestUpdate] });
/** `status: applied`, manifest plus rendered documents -- 37 of the 121. */
const SEMANTIC = result({
  files: [
    manifestUpdate,
    { path: 'docs/architecture/index.md', action: 'update', preimageDigest: digest('1'), outputDigest: digest('2') },
    { path: 'docs/architecture/modules/verification/evals-checks.md', action: 'update', preimageDigest: digest('3'), outputDigest: digest('8') },
  ],
});

const PUBLISHABLE: RestampGitFacts = {
  primaryWorktree: true,
  branchRef: 'refs/heads/main',
  headSha: '1c7476a9465a7383b4597502da97631116a97235',
  indexDirty: false,
  dirtyTrackedPaths: [ARCHITECTURE_PROJECTION_MANIFEST_PATH],
  commitGpgSign: false,
};

describe('architecture projection restamp classifier', () => {
  test('accepts only the restamp-only provider result shape', () => {
    expect(isManifestRestampOnly(RESTAMP)).toBe(true);
    expect(isManifestRestampOnly(NOOP)).toBe(false);
    expect(isManifestRestampOnly(SEMANTIC)).toBe(false);
  });

  test('rejects a single-file result whose entry is not a manifest update', () => {
    expect(isManifestRestampOnly(result({
      files: [{ path: 'docs/architecture/index.md', action: 'update', preimageDigest: digest('1'), outputDigest: digest('2') }],
    }))).toBe(false);
    for (const action of ['create', 'delete', 'unchanged'] as const) {
      expect(isManifestRestampOnly(result({
        files: [{
          path: ARCHITECTURE_PROJECTION_MANIFEST_PATH,
          action,
          preimageDigest: action === 'create' ? null : digest('9'),
          outputDigest: action === 'delete' ? null : action === 'unchanged' ? digest('9') : digest('c'),
        }],
      }))).toBe(false);
    }
  });

  test('rejects a manifest-only result that is not an applied status or carries a human action', () => {
    for (const status of ['planned', 'blocked', 'human-action-required', 'adoption-required', 'noop'] as const) {
      expect(isManifestRestampOnly(result({ status, files: [manifestUpdate] }))).toBe(false);
    }
    expect(isManifestRestampOnly(result({
      files: [manifestUpdate],
      humanActions: [{ reasonCode: 'unresolved-major-change', affectedNodeIds: ['capability.test.root'], requestPayloadDigest: digest('a') }],
    }))).toBe(false);
  });
});

describe('architecture projection restamp git gate', () => {
  test('publishes only on the fully proven primary-worktree state', () => {
    expect(evaluateRestampGate(PUBLISHABLE)).toEqual({
      publish: true,
      branchRef: 'refs/heads/main',
      headSha: '1c7476a9465a7383b4597502da97631116a97235',
    });
  });

  test('skips every unproven precondition with its own reason', () => {
    const cases: ReadonlyArray<readonly [Partial<RestampGitFacts>, string]> = [
      [{ primaryWorktree: false }, 'linked-worktree'],
      [{ branchRef: null }, 'detached-head'],
      [{ branchRef: 'refs/tags/v1' }, 'detached-head'],
      [{ headSha: null }, 'head-unresolvable'],
      [{ headSha: 'not-a-sha' }, 'head-unresolvable'],
      [{ indexDirty: true }, 'index-dirty'],
      [{ dirtyTrackedPaths: [] }, 'manifest-not-dirty'],
      [{ dirtyTrackedPaths: ['src/index.ts'] }, 'manifest-not-dirty'],
      [{ dirtyTrackedPaths: [ARCHITECTURE_PROJECTION_MANIFEST_PATH, 'src/index.ts'] }, 'other-tracked-paths-dirty'],
      [{ commitGpgSign: true }, 'commit-gpgsign-enabled'],
    ];
    for (const [overrides, reason] of cases) {
      expect(evaluateRestampGate({ ...PUBLISHABLE, ...overrides })).toEqual({ publish: false, reason: reason as never });
    }
  });

  test('treats a repeated manifest row as the single dirty path', () => {
    expect(evaluateRestampGate({
      ...PUBLISHABLE,
      dirtyTrackedPaths: [ARCHITECTURE_PROJECTION_MANIFEST_PATH, ARCHITECTURE_PROJECTION_MANIFEST_PATH],
    }).publish).toBe(true);
  });
});

describe('architecture projection restamp commit message', () => {
  test('carries the frozen subject and receipt trailer without CI directives', () => {
    const message = restampCommitMessage(RESTAMP.receiptDigest);
    expect(message).toBe(`${RESTAMP_COMMIT_SUBJECT}\n\nArchitecture-Projection-Restamp: ${RESTAMP.receiptDigest}\n`);
    expect(message).not.toContain('[skip ci]');
    expect(message).not.toContain('Source-Worktree-Head');
  });

  test('fails closed on an unusable receipt digest or branch ref', () => {
    expect(() => restampCommitMessage('sha256:short')).toThrow('receipt digest is invalid');
    expect(() => restampCommitMessage('')).toThrow('receipt digest is invalid');
    expect(restampBranchName('refs/heads/codex/restamp')).toBe('codex/restamp');
    expect(() => restampBranchName('refs/tags/v1')).toThrow('branch ref is invalid');
  });
});
