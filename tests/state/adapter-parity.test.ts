import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
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
  buildStateSnapshot,
  resolveEffectiveState,
} from '../../src/effects/state/resolve-effective-state';
import { stateVersionOwnerPath } from '../../src/effects/state/git-state-version-store';
import {
  CLI,
  EFFECTIVE_STATE_SCENARIOS,
  HOOK_ENTRY,
  PLAN,
  ROOT,
  createEffectiveStateFixture,
  effectiveStateCliRiskArgs,
  runStateCli,
  writeFixture,
} from './effective-state-fixture';

const FIXTURES = join(import.meta.dir, 'fixtures');

// The adapter-parity cells synchronously exercise multiple real CLI/hook child
// processes. Under the full-suite scheduler, spawnSync can keep the test body
// blocked well beyond the command-line default before Bun can observe a test
// timeout. Size this file-level harness budget above the measured loaded path;
// production state/lock deadlines remain independently bounded.
setDefaultTimeout(300_000);

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
  'blockers',
  'stale_sources',
  'conflicting_sources',
  'next_action',

  'guidance',
] as const satisfies readonly (keyof EffectiveState)[];

const AUTHORITY_FIELDS = [
  'protocol',
  'kind',
  'task_id',
  'state_version',
  'state_revision',
  // Authority, subject, evidence, and projection revisions are all computed
  // independently of the calling risk/operation input (LSC-04), so -- like
  // the other fields in this set -- they must be identical between a
  // risk-bearing "requested" resolve and the zero-risk "inspect" resolve.
  'authority_revision',
  'subject_revision',
  'projection_revision',
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
    expect(EFFECTIVE_STATE_SCENARIOS.map((scenario) => scenario.name).sort()).toEqual(goldenNames);
  });

  for (const scenario of EFFECTIVE_STATE_SCENARIOS) {
    test(`${scenario.name}: requested CLI parity and default inspect adapter contract`, async () => {
      const fixture = createEffectiveStateFixture({ includeLegacyActivePlan: true });
      const nowMs = Date.now();
      try {
        scenario.setup?.(fixture.cwd, nowMs);
        const requested = resolveEffectiveState(fixture.cwd, nowMs, scenario.risk);
        const cli = runStateCli(fixture.cwd, [
          'state', 'resolve', '--json', ...effectiveStateCliRiskArgs(scenario.risk),
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
        expect(hook).toEqual(buildStateSnapshot(fixture.cwd, nowMs));

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

  test('default MCP summary declares itself read-only and writes no state', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const ownerPath = stateVersionOwnerPath(fixture.cwd);
      expect(buildStateToolDefinitions()[0].annotations.readOnlyHint).toBe(true);
      const result = callStateTool({
        repoRoot: fixture.cwd,
        mcpPolicyProfile: 'planner',
      }, 'summarize_repo_harness_state', {
        isAdopted: () => true,
        branch: () => 'main',
      });
      expect(result.kind).toBe('repo-harness-effective-state');
      expect(result.state_version).toBe(0);
      expect(existsSync(join(ownerPath, '..'))).toBe(false);
      expect(existsSync(join(fixture.cwd, '.ai/harness/state'))).toBe(false);
      const published = resolveEffectiveState(fixture.cwd, Date.now(), {
        targetPaths: [],
        operationKind: 'inspect',
      });
      expect(published.state_revision).toBe(result.state_revision);
      expect(published.state_version).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  test('MCP reports the last published version after authority mutation; only state resolve allocates', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const first = resolveEffectiveState(fixture.cwd, Date.now(), {
        targetPaths: [],
        operationKind: 'inspect',
      });
      const ownerPath = stateVersionOwnerPath(fixture.cwd);
      const ownerBefore = readFileSync(ownerPath);
      writeFixture(fixture.cwd, '.ai/harness/policy.json', '{"worktree_strategy":{"review_base":"main"}}\n');
      const projected = callStateTool({
        repoRoot: fixture.cwd,
        mcpPolicyProfile: 'planner',
      }, 'summarize_repo_harness_state', {
        isAdopted: () => true,
        branch: () => 'main',
      });
      expect(projected.state_revision).not.toBe(first.state_revision);
      expect(projected.state_version).toBe(first.state_version);
      expect(readFileSync(ownerPath).equals(ownerBefore)).toBe(true);
      const published = resolveEffectiveState(fixture.cwd, Date.now(), {
        targetPaths: [],
        operationKind: 'inspect',
      });
      expect(published.state_revision).toBe(projected.state_revision);
      expect(published.state_version).toBe(first.state_version + 1);
    } finally {
      fixture.cleanup();
    }
  });

  test('public MCP dispatch exposes no plan or tasks/current.md projection', async () => {
    const fixture = createEffectiveStateFixture();
    try {
      const policy = getMcpPolicy('planner', { allowedRoots: [fixture.cwd] });
      const ctx: McpToolContext = { repoRoot: fixture.cwd, policy };
      const beforeRaw = await callMcpTool(ctx, 'summarize_repo_harness_state');
      const before = JSON.parse(beforeRaw.content[0].text) as Record<string, any>;
      expect(before.kind).toBe('repo-harness-effective-state');
      expect(before.protocol).toBe(2);
      expect(before.task_id).toBeNull();
      for (const field of ['authoritative_plan', 'current', 'current_authority', 'current_preview']) {
        expect(Object.hasOwn(before, field)).toBe(false);
      }

      writeFixture(fixture.cwd, 'tasks/current.md', [
        '# Forged projection',
        '- Active Plan: plans/plan-forged.md',
        'SHOULD_NOT_APPEAR_IN_MCP_STATE',
      ].join('\n'));
      const afterRaw = await callMcpTool(ctx, 'summarize_repo_harness_state');
      const after = JSON.parse(afterRaw.content[0].text) as Record<string, any>;
      expect(after.kind).toBe('repo-harness-effective-state');
      expect(JSON.stringify(after)).not.toContain('SHOULD_NOT_APPEAR_IN_MCP_STATE');
      expect(Object.hasOwn(after, 'contract')).toBe(false);
      expect(after.status.profile_authority).toBe('mcp-policy');
      expect(after.status.profile).toBe('planner');
    } finally {
      fixture.cleanup();
    }
  });

});
