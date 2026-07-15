import { describe, expect, test } from 'bun:test';
import {
  resolveWorkflowProfile,
  type WorkflowOperationKind,
  type WorkflowProfileInput,
} from '../src/core/workflow/profile';
import { isImplementationSurfacePath, isWorkflowSurfacePath } from '../src/effects/review/diff-fingerprint';

describe('workflow runtime profile risk floor', () => {
  test('keeps a low-risk local edit in lite', () => {
    expect(
      resolveWorkflowProfile({
        targetPaths: ['src/cli/format.ts'],
        capabilityIds: ['workflow-formatting'],
        operationKind: 'edit',
      }),
    ).toMatchObject({
      ok: true,
      profile: 'lite',
      riskFloor: 'lite',
      reasons: ['risk-floor:lite:local-low-risk'],
    });
  });

  test.each([
    ['ordinary feature', { operationKind: 'feature' }, 'risk-floor:standard:feature'],
    [
      'medium path scope',
      { targetPaths: ['src/a.ts', 'src/b.ts', 'tests/a.test.ts', 'tests/b.test.ts'] },
      'risk-floor:standard:medium-scope',
    ],
    [
      'capability ids',
      { capabilityIds: ['workflow-state', 'workflow-hooks'] },
      'risk-floor:standard:cross-capability',
    ],
    [
      'declared capability count',
      { capabilityIds: ['workflow-state'], capabilityCount: 2 },
      'risk-floor:standard:cross-capability',
    ],
    [
      'cross-capability operation',
      { operationKind: 'cross-capability' },
      'risk-floor:standard:cross-capability',
    ],
    [
      'multi-file operation',
      { operationKind: 'multi-file' },
      'risk-floor:standard:medium-scope',
    ],
  ] as const)('raises %s to standard', (_label, input, reason) => {
    expect(resolveWorkflowProfile(input)).toMatchObject({
      ok: true,
      profile: 'standard',
      riskFloor: 'standard',
      reasons: [reason],
    });
  });

  const strictOperationCases: ReadonlyArray<[WorkflowOperationKind, string]> = [
    ['auth', 'auth'],
    ['payment', 'payment'],
    ['security', 'security'],
    ['schema', 'schema'],
    ['migration', 'migration'],
    ['deploy', 'deploy'],
    ['release', 'release'],
    ['public-api', 'public-api'],
    ['destructive', 'destructive'],
  ];

  test.each(strictOperationCases)('makes %s operations strict', (operationKind, category) => {
    expect(resolveWorkflowProfile({ operationKind })).toMatchObject({
      ok: true,
      profile: 'strict',
      riskFloor: 'strict',
      reasons: [`risk-floor:strict:${category}`],
    });
  });

  test.each([
    ['auth', 'src/auth/session.ts', 'auth'],
    ['payment', 'apps/web/billing/checkout.ts', 'payment'],
    ['security', 'src/security/policy.ts', 'security'],
    ['schema', 'db/schema.sql', 'schema'],
    ['migration', 'deploy/sql/migrations/001.sql', 'migration'],
    ['deploy', 'deploy/worker.ts', 'deploy'],
    ['release', '.github/release/config.yml', 'release'],
    ['public API', 'src/api/v1/users.ts', 'public-api'],
  ] as const)('makes the %s target path strict', (_label, targetPath, category) => {
    const result = resolveWorkflowProfile({ targetPaths: [targetPath] });
    expect(result).toMatchObject({ ok: true, profile: 'strict', riskFloor: 'strict' });
    expect(result.reasons).toContain(`risk-floor:strict:${category}`);
  });

  // Every strict-category target path above also happens to be an
  // implementation-surface path -- true for these specific fixtures, but NOT
  // a general invariant of STRICT_CATEGORY_TOKENS' matching logic (a pure
  // token scan with no workflow-surface awareness at all): a strict token can
  // just as easily appear inside a workflow-surface path, e.g.
  // docs/auth/runbook.md. See the "workflow-surface path carrying a strict
  // token" test below for the real fix -- resolveWorkflowProfile's
  // strictScanPaths input, not this predicate, is what keeps a workflow-
  // surface-excluded strict signal from being silently dropped.
  test.each([
    'src/auth/session.ts',
    'apps/web/billing/checkout.ts',
    'src/security/policy.ts',
    'db/schema.sql',
    'deploy/sql/migrations/001.sql',
    'deploy/worker.ts',
    '.github/release/config.yml',
    'src/api/v1/users.ts',
  ])('every strict-category target path is also an implementation surface: %s', (targetPath) => {
    expect(isWorkflowSurfacePath(targetPath)).toBe(false);
    expect(isImplementationSurfacePath(targetPath)).toBe(true);
  });

  test('a workflow-surface path carrying a strict token still raises the floor via strictScanPaths, even though it is excluded from medium-scope counting', () => {
    expect(isWorkflowSurfacePath('docs/auth/runbook.md')).toBe(true);
    expect(isImplementationSurfacePath('docs/auth/runbook.md')).toBe(false);
    const result = resolveWorkflowProfile({
      targetPaths: ['src/plain.ts'],
      strictScanPaths: ['docs/auth/runbook.md', 'src/plain.ts'],
      operationKind: 'edit',
    });
    expect(result).toMatchObject({ ok: true, profile: 'strict', riskFloor: 'strict' });
    expect(result.reasons).toContain('risk-floor:strict:auth');
    if (!result.ok) throw new Error('expected an ok resolution');
    // Medium-scope/targetPathCount still reflect only the filtered set (1),
    // not the wider strict-scan set (2) -- strictScanPaths widens strict
    // detection only.
    expect(result.signals.targetPathCount).toBe(1);
  });

  test('strictScanPaths is additive: omitting it keeps targetPaths-only strict detection unchanged', () => {
    expect(resolveWorkflowProfile({ targetPaths: ['src/plain.ts'], operationKind: 'edit' })).toMatchObject({
      ok: true,
      profile: 'lite',
      riskFloor: 'lite',
    });
  });

  test('applies the same deterministic risk signals to capability ids', () => {
    expect(resolveWorkflowProfile({ capabilityIds: ['apps-web-oauth'] })).toMatchObject({
      ok: true,
      profile: 'strict',
      riskFloor: 'strict',
      reasons: ['risk-floor:strict:auth'],
    });
  });

  test('allows an explicit override to raise or equal the risk floor', () => {
    expect(resolveWorkflowProfile({ targetPaths: ['src/local.ts'], operationKind: 'edit', explicitOverride: 'strict' })).toMatchObject({
      ok: true,
      profile: 'strict',
      riskFloor: 'lite',
      reasons: ['risk-floor:lite:local-low-risk', 'explicit-override:raise:strict'],
    });
    expect(resolveWorkflowProfile({ operationKind: 'feature', explicitOverride: 'standard' })).toMatchObject({
      ok: true,
      profile: 'standard',
      riskFloor: 'standard',
      reasons: ['risk-floor:standard:feature', 'explicit-override:equal:standard'],
    });
  });

  test('fails closed when an explicit override lowers the deterministic floor', () => {
    expect(
      resolveWorkflowProfile({ targetPaths: ['src/auth/login.ts'], explicitOverride: 'lite' }),
    ).toEqual({
      ok: false,
      code: 'PROFILE_BELOW_RISK_FLOOR',
      message: 'explicit profile lite is below deterministic risk floor strict',
      requestedProfile: 'lite',
      riskFloor: 'strict',
      reasons: ['risk-floor:strict:auth'],
    });
  });

  test('does not accept natural language as a safety authority', () => {
    const input = {
      targetPaths: ['src/format.ts'],
      operationKind: 'edit',
      prompt: 'deploy release schema migration and delete production',
    } as WorkflowProfileInput & { prompt: string };

    expect(resolveWorkflowProfile(input)).toMatchObject({
      ok: true,
      profile: 'lite',
      riskFloor: 'lite',
    });
  });

  test('normalizes duplicate signals and returns reasons in stable category order', () => {
    const first = resolveWorkflowProfile({
      targetPaths: ['db/schema.sql', 'src/auth/session.ts', 'db/schema.sql'],
      capabilityIds: ['payments-checkout', 'payments-checkout'],
    });
    const reordered = resolveWorkflowProfile({
      targetPaths: ['src/auth/session.ts', 'db/schema.sql'],
      capabilityIds: ['payments-checkout'],
    });

    expect(first).toEqual(reordered);
    expect(first).toMatchObject({
      ok: true,
      reasons: [
        'risk-floor:strict:auth',
        'risk-floor:strict:payment',
        'risk-floor:strict:schema',
      ],
    });
  });

  test('fails closed for an invalid runtime capability count', () => {
    expect(resolveWorkflowProfile({ capabilityCount: -1, explicitOverride: 'lite' })).toEqual({
      ok: false,
      code: 'INVALID_RISK_INPUT',
      message: 'capabilityCount must be a non-negative integer',
      requestedProfile: 'lite',
      riskFloor: 'strict',
      reasons: ['risk-floor:invalid-capability-count'],
    });
  });

  test('fails closed when an edit has no authoritative scope signals', () => {
    expect(resolveWorkflowProfile({})).toMatchObject({
      ok: false,
      code: 'INVALID_RISK_INPUT',
      riskFloor: 'strict',
      reasons: ['risk-floor:strict:signals-unavailable'],
    });
    expect(resolveWorkflowProfile({ operationKind: 'edit' })).toMatchObject({
      ok: false,
      code: 'INVALID_RISK_INPUT',
      riskFloor: 'strict',
    });
    expect(resolveWorkflowProfile({ operationKind: 'edit', explicitOverride: 'strict' })).toMatchObject({
      ok: true,
      profile: 'strict',
      riskFloor: 'strict',
    });
  });

  test('rejects invalid runtime enum strings', () => {
    expect(resolveWorkflowProfile({ operationKind: 'unknown' as WorkflowOperationKind })).toMatchObject({
      ok: false,
      code: 'INVALID_RISK_INPUT',
      reasons: ['risk-floor:invalid-operation-kind'],
    });
    expect(resolveWorkflowProfile({
      targetPaths: ['src/local.ts'],
      explicitOverride: 'unsafe' as never,
    })).toMatchObject({
      ok: false,
      code: 'INVALID_RISK_INPUT',
      reasons: ['risk-floor:invalid-explicit-profile'],
    });
  });
});

describe('workflow-surface path predicate (Phase C2 resolver layer)', () => {
  test.each([
    'plans/plan-20260101-0000-example.md',
    'plans/',
    'tasks/todos.md',
    'tasks/contracts/x.contract.md',
    'docs/architecture/index.md',
    'docs/spec.md',
    '.ai/harness/policy.json',
    '.ai/context/capabilities.json',
    '.claude/settings.json',
    '.codex/hooks.json',
    'README.md',
    'notes.markdown',
  ])('treats %s as workflow surface, not implementation surface', (path) => {
    expect(isWorkflowSurfacePath(path)).toBe(true);
    expect(isImplementationSurfacePath(path)).toBe(false);
  });

  test.each([
    'src/core/workflow/profile.ts',
    'src/cli/hook/state-snapshot.ts',
    'deploy/sql/0001_demo.sql',
    'scripts/run-harness-profile-benchmark.ts',
    'tests/harness-runtime-profiles.test.ts',
    '.github/workflows/release.yml',
    'package.json',
  ])('treats %s as implementation surface', (path) => {
    expect(isWorkflowSurfacePath(path)).toBe(false);
    expect(isImplementationSurfacePath(path)).toBe(true);
  });

  test('a 4-docs batch has zero implementation-surface paths (drives the lite outcome downstream)', () => {
    const docs = ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md'];
    expect(docs.filter(isImplementationSurfacePath)).toEqual([]);
  });

  test('3 docs plus 1 src file counts exactly one implementation-surface path', () => {
    const mixed = ['docs/a.md', 'docs/b.md', 'docs/c.md', 'src/only.ts'];
    expect(mixed.filter(isImplementationSurfacePath)).toEqual(['src/only.ts']);
  });

  test('a mixed workflow+implementation batch counts only the implementation paths', () => {
    const mixed = ['docs/a.md', 'tasks/todos.md', 'plans/plan-fixture.md', 'src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'];
    expect(mixed.filter(isImplementationSurfacePath)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']);
  });

  test('a single deploy path stays an implementation surface independent of any workflow-surface siblings', () => {
    expect(isImplementationSurfacePath('deploy/sql/0002_migration.sql')).toBe(true);
  });
});
