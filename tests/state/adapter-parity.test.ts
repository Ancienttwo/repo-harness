import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  EffectiveState,
  EffectiveStateRiskInput,
  StateSnapshot,
} from '../../src/core/state/types';
import type { OperationReadinessResult } from '../../src/core/workflow/operation-readiness';
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
  CONTRACT,
  EFFECTIVE_STATE_SCENARIOS,
  HOOK_ENTRY,
  PLAN,
  ROOT,
  createEffectiveStateFixture,
  effectiveStateCliRiskArgs,
  replaceContractProfile,
  runStateCli,
  writeFixture,
} from './effective-state-fixture';

const FIXTURES = join(import.meta.dir, 'fixtures');

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
  // LSC-08: additive parity fields -- MCP's compact projection now carries
  // the LSC-06/07 readiness authority and its Skill guidance verbatim, so
  // this same per-scenario loop (mcp vs. the zero-risk `inspect` authority
  // below) proves adapter parity for both without a separate assertion.
  'readiness',
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
  'evidence_revision',
  'projection_revision',
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

  // LSC-08 falsifier: the frozen strict.stop.not-ready-to-ship-still-allows
  // cell (tests/state/fixtures/loop-semantics/characterization.json) is the
  // cheapest fixture that forces allowedToStop=allow and readyToShip=block
  // from the SAME evaluation -- Strict's stop-only requirement
  // (durable_recovery_state) is satisfied by any on-disk handoff/resume
  // checkpoint, while its ship-only requirements (fresh_review,
  // external_acceptance, fresh_checks) stay unmet because the base fixture's
  // review is stale and no checks/external-acceptance evidence exists. Every
  // adapter below is compared to the ONE resolved-state/readiness authority,
  // never to each other in a chain.
  test('allowed-to-stop with readyToShip=false is reported identically by CLI, MCP, and the Stop hook', async () => {
    const fixture = createEffectiveStateFixture();
    try {
      replaceContractProfile(fixture.cwd, 'strict');
      writeFixture(fixture.cwd, '.ai/harness/handoff/current.md', [
        '# Handoff',
        '> **Task ID**: adapter-parity-probe',
        '- Exact Next Step: resolve outstanding ship evidence',
        '',
      ].join('\n'));
      writeFixture(fixture.cwd, '.ai/harness/handoff/resume.md', [
        '# Resume',
        '> **Task ID**: adapter-parity-probe',
        '',
      ].join('\n'));
      const nowMs = Date.now();
      const risk: EffectiveStateRiskInput = { explicitOverride: 'strict' };

      const authority = resolveEffectiveState(fixture.cwd, nowMs, risk);
      expect(authority.workflow_profile).toBe('strict');
      expect(authority.blockers).toEqual([]);
      expect(authority.readiness?.ok).toBe(true);
      const readiness = authority.readiness as OperationReadinessResult;
      expect(readiness.allowedToStop).toEqual({ decision: 'allow' });
      expect(readiness.readyToShip.decision).toBe('block');

      // CLI full JSON.
      const cliFull = runStateCli(fixture.cwd, ['state', 'resolve', '--json', ...effectiveStateCliRiskArgs(risk)]);
      expect(cliFull.status).toBe(0);
      const cliState = JSON.parse(cliFull.stdout) as EffectiveState;
      expect(cliState.readiness).toEqual(authority.readiness);
      expect(cliState.guidance).toBe(authority.guidance);

      // CLI --field readiness: a distinct output projection in state.ts,
      // not merely a re-read of the same --json body.
      const cliField = runStateCli(fixture.cwd, [
        'state', 'resolve', '--json', '--field', 'readiness', ...effectiveStateCliRiskArgs(risk),
      ]);
      expect(cliField.status).toBe(0);
      expect(JSON.parse(cliField.stdout)).toEqual(authority.readiness);

      // MCP compact state.
      const mcp = await runPublicMcp(fixture.cwd);
      expect(mcp.readiness).toEqual(authority.readiness);
      expect(mcp.guidance).toBe(authority.guidance);

      // The Stop hook's own readiness consumption -- read-only, pinned to
      // the repo-source CLI so a stale global `repo-harness` binary cannot
      // skew it (the same hazard the hook.test.ts REPO_HARNESS_CLI fixtures
      // guard against). Does not modify stop-orchestrator.sh's decision
      // logic; only observes its emitted decision/reason.
      const hook = spawnSync('bash', [join(ROOT, '.ai/hooks/stop-orchestrator.sh')], {
        cwd: fixture.cwd,
        input: JSON.stringify({ stop_hook_active: false, last_assistant_message: '' }),
        encoding: 'utf-8',
        env: { ...process.env, REPO_HARNESS_CLI: CLI, REPO_HARNESS_WORKFLOW_PROFILE: 'strict' },
      });
      expect(hook.status).toBe(0);
      expect(hook.stdout).not.toContain('"decision":"block"');
      const shipReasons = readiness.readyToShip.decision === 'block' ? readiness.readyToShip.reasons.join(',') : '';
      expect(hook.stderr).toContain(
        `[ReadinessGate] readyToShip=false (missing: ${shipReasons}); Stop is not blocked -- resolve before shipping.`,
      );
    } finally {
      fixture.cleanup();
    }
  });
});
