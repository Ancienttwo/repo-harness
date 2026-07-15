import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import type {
  EffectiveState,
  EffectiveStateRiskInput,
  StateSnapshot,
} from '../../src/core/state/types';
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
  HOOK_ENTRY,
  PLAN,
  REVIEW,
  commitFixture,
  createEffectiveStateFixture,
  replaceContractProfile,
  runStateCli,
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

const MCP_COMPACT_FIELDS = [
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

const AUTHORITY_FIELDS = [
  'protocol',
  'kind',
  'task_id',
  'state_version',
  'state_revision',
  'authoritative_plan',
  'contract',
  'stale_sources',
  'conflicting_sources',
] as const satisfies readonly (keyof EffectiveState)[];

const POLICY_FIELDS = [
  'phase',
  'workflow_profile',
  'requested_workflow_profile',
  'risk_floor',
  'profile_reasons',
  'blockers',
  'next_action',
] as const satisfies readonly (keyof EffectiveState)[];

type CompactState = Pick<EffectiveState, (typeof MCP_COMPACT_FIELDS)[number]>;

function fields(state: object, names: readonly (keyof EffectiveState)[]): Record<string, unknown> {
  const record = state as Readonly<Record<keyof EffectiveState, unknown>>;
  return Object.fromEntries(names.map((field) => [field, record[field]]));
}

function cliRiskArgs(risk: EffectiveStateRiskInput): string[] {
  return [
    ...(risk.targetPaths?.length ? ['--target-path', ...risk.targetPaths] : []),
    ...(risk.operationKind ? ['--operation', risk.operationKind] : []),
    ...(risk.explicitOverride ? ['--profile', risk.explicitOverride] : []),
  ];
}

function runPublicHook(cwd: string): StateSnapshot {
  const result = spawnSync(process.execPath, [HOOK_ENTRY, 'state-snapshot', '--json'], {
    cwd,
    encoding: 'utf-8',
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout) as StateSnapshot;
}

async function runPublicMcp(cwd: string): Promise<CompactState> {
  const policy = getMcpPolicy('planner', { allowedRoots: [cwd] });
  const raw = await callMcpTool({ repoRoot: cwd, policy }, 'summarize_repo_harness_state');
  return JSON.parse(raw.content[0].text) as CompactState;
}

describe('Effective State adapter authority parity and policy boundaries', () => {
  test('the parity matrix covers every ESA-01 golden scenario', () => {
    const goldenNames = readdirSync(FIXTURES)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();
    expect(SCENARIOS.map((scenario) => scenario.name).sort()).toEqual(goldenNames);
  });

  for (const scenario of SCENARIOS) {
    test(`${scenario.name}: requested CLI parity and default inspect adapter contract`, async () => {
      const fixture = createEffectiveStateFixture();
      const nowMs = Date.now();
      try {
        scenario.setup?.(fixture.cwd, nowMs);
        const requested = resolveEffectiveState(fixture.cwd, nowMs, scenario.risk);
        const cli = runStateCli(fixture.cwd, [
          'state', 'resolve', '--json', ...cliRiskArgs(scenario.risk),
        ]);
        const cliState = JSON.parse(cli.stdout) as EffectiveState;
        expect(fields(cliState, MCP_COMPACT_FIELDS)).toEqual(fields(requested, MCP_COMPACT_FIELDS));
        expect(cli.status).toBe(requested.blockers.length > 0 ? 1 : 0);

        const inspect = resolveEffectiveState(fixture.cwd, nowMs, {
          targetPaths: [],
          operationKind: 'inspect',
        });
        expect(fields(requested, AUTHORITY_FIELDS)).toEqual(fields(inspect, AUTHORITY_FIELDS));

        const hook = runPublicHook(fixture.cwd);
        expect(hook).toEqual(buildStateSnapshotFromEffectiveState(inspect, fixture.cwd, nowMs));

        const mcp = await runPublicMcp(fixture.cwd);
        expect(fields(mcp, MCP_COMPACT_FIELDS))
          .toEqual(fields(inspect, MCP_COMPACT_FIELDS));

        if (scenario.name === 'profile-below-strict-floor') {
          expect(fields(requested, POLICY_FIELDS)).not.toEqual(fields(inspect, POLICY_FIELDS));
          expect(fields(cliState, POLICY_FIELDS)).toEqual(fields(requested, POLICY_FIELDS));
          expect(fields(mcp, POLICY_FIELDS)).toEqual(fields(inspect, POLICY_FIELDS));
        }
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
