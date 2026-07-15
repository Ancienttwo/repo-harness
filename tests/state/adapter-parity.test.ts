import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import type { EffectiveState, EffectiveStateRiskInput } from '../../src/core/state/types';
import { resolveStateCommand } from '../../src/cli/commands/state';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildStateToolDefinitions, callStateTool } from '../../src/cli/mcp/state-tools';
import { callMcpTool, type McpToolContext } from '../../src/cli/mcp/tools';
import {
  buildStateSnapshotFromEffectiveState,
  resolveEffectiveState,
} from '../../src/effects/state/resolve-effective-state';
import { stateVersionOwnerPath } from '../../src/effects/state/git-state-version-store';
import {
  CONTRACT,
  PLAN,
  REVIEW,
  commitFixture,
  createEffectiveStateFixture,
  replaceContractProfile,
  writeFixture,
  writeFixtureStateLock,
} from './effective-state-fixture';

const FIXTURES = join(import.meta.dir, 'fixtures');

interface Scenario {
  readonly name: string;
  readonly risk: EffectiveStateRiskInput;
  readonly setup?: (cwd: string, nowMs: number) => void;
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function gitHead(cwd: string): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function makeFreshEvidence(cwd: string, nowMs: number): void {
  const risk = { targetPaths: ['src/feature.ts'], operationKind: 'feature' } as const;
  const initial = resolveEffectiveState(cwd, nowMs, risk);
  const subject = initial.source_hashes.review_subject;
  if (!subject) throw new Error('fixture review subject is unavailable');
  const target = gitHead(cwd);
  writeFixture(cwd, REVIEW, [
    '# Review',
    '> **Recommendation**: pass',
    `> **Reviewed Subject SHA256**: ${subject}`,
    `> **Reviewed Target Revision**: ${target}`,
    '## External Acceptance Advice',
    '> **External Acceptance**: pass',
    `> **Reviewed Subject SHA256**: ${subject}`,
    `> **Reviewed Target Revision**: ${target}`,
    '',
  ].join('\n'));
  const reviewed = resolveEffectiveState(cwd, nowMs, risk);
  const authorityRevision = reviewed.source_hashes.authority_revision;
  const handoff = [
    '# Handoff',
    '> **Task ID**: 20260712-2327-effective-fixture',
    `> **Source State Revision**: ${authorityRevision}`,
    '- Exact Next Step: implement resolver',
    '',
  ].join('\n');
  writeFixture(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
    status: 'pass',
    active_plan: PLAN,
    review_subject_sha256: subject,
  }));
  writeFixture(cwd, '.ai/harness/handoff/current.md', handoff);
  writeFixture(cwd, '.ai/harness/handoff/resume.md', [
    '# Resume',
    '> **Task ID**: 20260712-2327-effective-fixture',
    `> **Source State Revision**: ${authorityRevision}`,
    `> **Handoff Hash**: ${sha256(handoff)}`,
    '',
  ].join('\n'));
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'idle-inspect',
    risk: { targetPaths: [], operationKind: 'inspect' },
    setup: (cwd) => {
      rmSync(join(cwd, '.ai/harness/active-plan'), { force: true });
      rmSync(join(cwd, '.claude/.active-plan'), { force: true });
    },
  },
  {
    name: 'executing-fresh-evidence',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: makeFreshEvidence,
  },
  {
    name: 'missing-contract',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd) => rmSync(join(cwd, CONTRACT)),
  },
  {
    name: 'foreign-worktree-owner',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd) => writeFixture(cwd, '.ai/harness/active-worktree', '/tmp/foreign-worktree\n'),
  },
  {
    name: 'stale-projections',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd) => {
      writeFixture(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
        status: 'pass',
        active_plan: 'plans/plan-old.md',
      }));
      writeFixture(cwd, '.ai/harness/handoff/current.md', '- Active Plan: plans/plan-old.md\n');
      writeFixture(cwd, 'tasks/current.md', [
        '> **Updated At**: 2020-01-01T00:00:00Z',
        '- Active Plan: plans/plan-old.md',
      ].join('\n'));
      writeFixture(cwd, '.ai/harness/sprint/active-sprint', 'plans/sprints/missing.sprint.md\n');
    },
  },
  {
    name: 'invalid-capability-registry',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'edit' },
    setup: (cwd) => {
      writeFixture(cwd, '.ai/context/capabilities.json', '{not json');
      commitFixture(cwd, 'seed invalid capability registry');
    },
  },
  {
    name: 'profile-below-strict-floor',
    risk: { targetPaths: ['src/security/auth.ts'], operationKind: 'security' },
  },
  {
    name: 'deleted-cache-reconstruction',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd, nowMs) => {
      resolveEffectiveState(cwd, nowMs, { targetPaths: ['src/feature.ts'], operationKind: 'feature' });
      rmSync(join(cwd, '.ai/harness/state/effective.json'));
    },
  },
  {
    name: 'corrupt-cache-reconstruction',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd, nowMs) => {
      resolveEffectiveState(cwd, nowMs, { targetPaths: ['src/feature.ts'], operationKind: 'feature' });
      writeFixture(cwd, '.ai/harness/state/effective.json', '{broken');
    },
  },
  {
    name: 'stale-dead-lock-reclaimed',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd, nowMs) => writeFixtureStateLock(cwd, {
      pid: 99999999,
      created_at: nowMs - 60_000,
      token: '99999999-0-00000000-0000-4000-8000-000000000003',
    }),
  },
  {
    name: 'live-lock-waits-for-release',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd, nowMs) => {
      const { lockPath, ownerPath } = writeFixtureStateLock(cwd, {
        pid: process.pid,
        created_at: nowMs,
        token: 'live',
      });
      const release = spawn('sh', ['-c', 'sleep 0.1; rm -f "$1"; rmdir "$2"', 'release-lock', ownerPath, lockPath], {
        cwd,
        stdio: 'ignore',
      });
      release.unref();
    },
  },
  {
    name: 'explicit-strict-without-path-signals',
    risk: { explicitOverride: 'strict' },
    setup: (cwd) => replaceContractProfile(cwd, 'strict'),
  },
];

const CANONICAL_FIELDS = [
  'protocol',
  'kind',
  'task_id',
  'phase',
  'state_version',
  'state_revision',
  'workflow_profile',
  'requested_workflow_profile',
  'risk_floor',
  'profile_reasons',
  'authoritative_plan',
  'contract',
  'blockers',
  'stale_sources',
  'conflicting_sources',
  'next_action',
] as const satisfies readonly (keyof EffectiveState)[];

type CanonicalState = Pick<EffectiveState, (typeof CANONICAL_FIELDS)[number]>;

function canonicalFields(state: CanonicalState): Record<string, unknown> {
  return Object.fromEntries(CANONICAL_FIELDS.map((field) => [field, state[field]]));
}

function commandOptions(risk: EffectiveStateRiskInput) {
  return {
    targetPath: risk.targetPaths,
    operation: risk.operationKind,
    profile: risk.explicitOverride,
  };
}

describe('Effective State adapter parity', () => {
  test('the parity matrix covers every ESA-01 golden scenario', () => {
    const goldenNames = readdirSync(FIXTURES)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();
    expect(SCENARIOS.map((scenario) => scenario.name).sort()).toEqual(goldenNames);
  });

  for (const scenario of SCENARIOS) {
    test(`${scenario.name}: direct, CLI, hook, and MCP derive from one Effective State`, () => {
      const fixture = createEffectiveStateFixture();
      const nowMs = Date.now();
      try {
        scenario.setup?.(fixture.cwd, nowMs);
        const direct = resolveEffectiveState(fixture.cwd, nowMs, scenario.risk);
        const expected = canonicalFields(direct);

        let cliInvocation: unknown = null;
        const cliOptions = commandOptions(scenario.risk);
        const cli = resolveStateCommand(cliOptions, {
          repoRoot: fixture.cwd,
          nowMs,
          resolve: (repoRoot, resolvedAt, risk) => {
            cliInvocation = { repoRoot, resolvedAt, risk };
            return direct;
          },
        });
        expect(cliInvocation).toEqual({
          repoRoot: fixture.cwd,
          resolvedAt: nowMs,
          risk: {
            targetPaths: cliOptions.targetPath,
            operationKind: cliOptions.operation,
            explicitOverride: cliOptions.profile,
          },
        });
        const cliState = JSON.parse(cli.stdout) as EffectiveState;
        expect(canonicalFields(cliState)).toEqual(expected);
        expect(cli.exitCode).toBe(direct.blockers.length > 0 ? 1 : 0);

        const hook = buildStateSnapshotFromEffectiveState(direct, fixture.cwd, nowMs);
        expect(hook.states.contract).toBe(direct.contract ? 'present' : 'missing');
        if (direct.authoritative_plan) {
          expect(hook.paths.active_plan).toBe(direct.authoritative_plan.path);
          expect(hook.states.plan).toBe(direct.authoritative_plan.status);
        } else if (direct.worktree.freshness === 'stale') {
          expect(hook.marker.problem).toBe('foreign_worktree');
          expect(hook.states.plan).toBe('foreign_worktree');
        }

        let mcpInvocation: unknown = null;
        const mcp = callStateTool({
          repoRoot: fixture.cwd,
          mcpPolicyProfile: 'planner',
          nowMs,
        }, 'summarize_repo_harness_state', {
          resolve: (repoRoot, resolvedAt, risk) => {
            mcpInvocation = { repoRoot, resolvedAt, risk };
            return direct;
          },
          isAdopted: () => true,
          branch: () => 'main',
        });
        expect(mcpInvocation).toEqual({
          repoRoot: fixture.cwd,
          resolvedAt: nowMs,
          risk: { targetPaths: [], operationKind: 'inspect' },
        });
        expect(canonicalFields(mcp)).toEqual(expected);
        expect(mcp.status.profile_authority).toBe('mcp-policy');
        expect(mcp.status.profile).toBe('planner');
        expect(mcp.workflow_profile).toBe(direct.workflow_profile);
      } finally {
        fixture.cleanup();
      }
    });
  }

  test('default MCP summary truthfully declares and materializes its canonical read model', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const cachePath = join(fixture.cwd, '.ai/harness/state/effective.json');
      const ownerPath = stateVersionOwnerPath(fixture.cwd);
      expect(existsSync(cachePath)).toBe(false);
      expect(buildStateToolDefinitions()[0].annotations.readOnlyHint).toBe(false);
      const result = callStateTool({
        repoRoot: fixture.cwd,
        mcpPolicyProfile: 'planner',
      }, 'summarize_repo_harness_state', {
        isAdopted: () => true,
        branch: () => 'main',
      });
      expect(result.kind).toBe('repo-harness-effective-state');
      expect(result.state_version).toBe(1);
      expect(existsSync(cachePath)).toBe(true);
      expect(existsSync(ownerPath)).toBe(true);
      const persisted = resolveEffectiveState(fixture.cwd, Date.now(), {
        targetPaths: [],
        operationKind: 'inspect',
      });
      expect(persisted.state_revision).toBe(result.state_revision);
      expect(persisted.state_version).toBe(result.state_version);
    } finally {
      fixture.cleanup();
    }
  });

  test('MCP allocates the next durable version after authority mutation', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const first = resolveEffectiveState(fixture.cwd, Date.now(), {
        targetPaths: [],
        operationKind: 'inspect',
      });
      const ownerPath = stateVersionOwnerPath(fixture.cwd);
      const plan = readFileSync(join(fixture.cwd, PLAN), 'utf-8');
      writeFixture(fixture.cwd, PLAN, `${plan}\n<!-- authority mutation -->\n`);
      const projected = callStateTool({
        repoRoot: fixture.cwd,
        mcpPolicyProfile: 'planner',
      }, 'summarize_repo_harness_state', {
        isAdopted: () => true,
        branch: () => 'main',
      });
      expect(projected.state_revision).not.toBe(first.state_revision);
      expect(projected.state_version).toBe(first.state_version + 1);
      expect(JSON.parse(readFileSync(ownerPath, 'utf-8')).version).toBe(projected.state_version);
      const persisted = resolveEffectiveState(fixture.cwd, Date.now(), {
        targetPaths: [],
        operationKind: 'inspect',
      });
      expect(persisted.state_revision).toBe(projected.state_revision);
      expect(persisted.state_version).toBe(projected.state_version);
    } finally {
      fixture.cleanup();
    }
  });

  test('public MCP dispatch keeps canonical authority independent from its labeled current preview', async () => {
    const fixture = createEffectiveStateFixture();
    try {
      const policy = getMcpPolicy('planner', { allowedRoots: [fixture.cwd] });
      const ctx: McpToolContext = { repoRoot: fixture.cwd, policy };
      const beforeRaw = await callMcpTool(ctx, 'summarize_repo_harness_state');
      const before = JSON.parse(beforeRaw.content[0].text) as Record<string, any>;
      expect(before.kind).toBe('repo-harness-effective-state');
      expect(before.authoritative_plan.path).toBe(PLAN);
      expect(before.current).toContain(`Active Plan: ${PLAN}`);
      expect(before.current_preview).toEqual({
        source: 'tasks/current.md',
        authority: 'non-authoritative-projection',
        text: before.current,
      });
      expect(before.current_authority).toBe('non-authoritative-projection');

      writeFixture(fixture.cwd, 'tasks/current.md', [
        '# Forged projection',
        '- Active Plan: plans/plan-forged.md',
        'SHOULD_NOT_APPEAR_IN_MCP_STATE',
      ].join('\n'));
      const afterRaw = await callMcpTool(ctx, 'summarize_repo_harness_state');
      const after = JSON.parse(afterRaw.content[0].text) as Record<string, any>;
      expect(after.authoritative_plan.path).toBe(PLAN);
      expect(after.contract.path).toBe(CONTRACT);
      expect(after.current).toContain('SHOULD_NOT_APPEAR_IN_MCP_STATE');
      expect(after.current_preview.authority).toBe('non-authoritative-projection');
      expect(after.status.profile_authority).toBe('mcp-policy');
      expect(after.status.profile).toBe('planner');
    } finally {
      fixture.cleanup();
    }
  });
});
