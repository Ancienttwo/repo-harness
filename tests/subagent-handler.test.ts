import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runReturnChannel } from '../src/cli/hook/return-channel';
import {
  appendLongCommandGuardrail,
  EXECUTION_BOUNDARY_MARKER,
  LONG_COMMAND_GUARDRAIL_MARKER,
  runSubagentContext,
} from '../src/cli/hook/subagent-context';
import { payloadIdentityField, type HookIdentity, type HookPayload } from '../src/cli/hook/hook-input';
import { HOST_RENDERERS } from '../src/cli/hook/hook-protocol';
import type { HookHandlerResult } from '../src/cli/hook/handler-contract';
import type { RouteHost, RouteId } from '../src/cli/hook/route-registry';
import { resolveHookEffectiveState, runHook } from '../src/cli/hook/runtime';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';

type SubagentEvent = 'PreToolUse' | 'SubagentStart';

const SUBAGENT_ROUTE: Readonly<Record<SubagentEvent, RouteId>> = {
  PreToolUse: 'subagent',
  SubagentStart: 'context',
};

/** The real collector wiring the runtime builds for one hook event. */
function collectorFor(repoRoot: string, event: SubagentEvent, env: NodeJS.ProcessEnv) {
  return createStateInputCollector({
    repoRoot,
    resolveEffectiveState: () => resolveHookEffectiveState(repoRoot, Date.now()),
  });
}

/**
 * Runs the route's typed handler with the identity the runtime derives (host
 * from HOOK_HOST, ids from the payload) and renders it through the host table.
 * The default env is a Claude host, as the runtime sees it without Codex.
 */
function invokeSubagent(opts: {
  readonly event: SubagentEvent;
  readonly repoRoot: string;
  readonly payload: HookPayload;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}) {
  const env = opts.env ?? { ...process.env, HOOK_HOST: 'claude' };
  const host = env.HOOK_HOST;
  if (host !== 'claude' && host !== 'codex' && host !== 'pi') throw new Error(`invokeSubagent needs HOOK_HOST, got ${String(host)}`);
  const identity: HookIdentity = {
    host: host satisfies RouteHost,
    sessionId: payloadIdentityField(opts.payload, 'session_id'),
    runId: payloadIdentityField(opts.payload, 'run_id'),
    turnId: payloadIdentityField(opts.payload, 'turn_id'),
  };
  const collector = collectorFor(opts.repoRoot, opts.event, env);
  const result: HookHandlerResult = opts.event === 'PreToolUse'
    ? runReturnChannel({ collector, payload: opts.payload })
    : runSubagentContext({ collector, payload: opts.payload, identity, env, now: opts.now });
  const rendered = HOST_RENDERERS[host]({
    event: opts.event,
    routeId: SUBAGENT_ROUTE[opts.event],
    repoRoot: opts.repoRoot,
    exitCode: result.exitCode,
    reason: result.reason ?? 'ok',
    permission: result.permission,
    additionalContext: result.additionalContext ?? null,
    diagnostics: result.diagnostics ?? '',
  });
  return { ...result, stdout: rendered.stdout, stderr: rendered.stderr };
}

const REPO_ROOT = join(import.meta.dir, '..');
const BOUNDARY_MARKER = EXECUTION_BOUNDARY_MARKER;
const BOUNDARY_SENTENCE = 'Execution boundary: implement exactly the parent brief Goal/Scope/Verify/Rollback.';

/** A real git repository, so Effective State resolves exactly as it does under the runtime. */
function tempRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-subagent-handler-')));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  return root;
}

/** A plain directory outside any repository. */
function tempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-subagent-outside-')));
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Copy a real generated persona into the fixture repo so the composed stack is
 * assembled from the same bytes a live Codex child sees: persona
 * developer_instructions + SubagentStart context.
 */
function installGoldenPersona(repoRoot: string, agent: string): { instructions: string; model: string } {
  mkdirSync(join(repoRoot, '.codex/agents'), { recursive: true });
  const toml = readFileSync(join(REPO_ROOT, '.codex/agents', `${agent}.toml`), 'utf8');
  writeFileSync(join(repoRoot, '.codex/agents', `${agent}.toml`), toml);
  const parsed = Bun.TOML.parse(toml) as Record<string, unknown>;
  return { instructions: String(parsed.developer_instructions), model: String(parsed.model) };
}

function seedActiveContract(repoRoot: string, contractHeaders = '> **Status**: Active\n', slug = '20260101-0000-composed'): string {
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  mkdirSync(join(repoRoot, 'plans'), { recursive: true });
  mkdirSync(join(repoRoot, 'tasks/contracts'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/active-plan'), `plans/plan-${slug}.md\n`);
  writeFileSync(join(repoRoot, `plans/plan-${slug}.md`), '# plan\n');
  writeFileSync(join(repoRoot, `tasks/contracts/${slug}.contract.md`), contractHeaders);
  return `tasks/contracts/${slug}.contract.md`;
}

/** persona + SubagentStart context, in spawn order. */
function composedChildStack(
  repoRoot: string,
  agent: string,
  observedModel: string,
  env: NodeJS.ProcessEnv,
): { composed: string; startContext: string; personaInstructions: string } {
  const persona = installGoldenPersona(repoRoot, agent);
  const start = startSubagent(repoRoot, {
    session_id: `session-${agent}`,
    turn_id: `turn-${agent}`,
    agent_id: `agent-${agent}`,
    agent_type: agent,
    model: observedModel,
  }, env);
  expect(start.exitCode).toBe(0);
  const startContext = additionalContext(start.stdout);
  return {
    composed: [persona.instructions, startContext].join('\n\n'),
    startContext,
    personaInstructions: persona.instructions,
  };
}

function codexEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, HOOK_HOST: 'codex', ...overrides };
}

function jsonResult(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function startSubagent(
  repoRoot: string,
  payload: Record<string, unknown>,
  env: NodeJS.ProcessEnv = codexEnv(),
) {
  return invokeSubagent({
    event: 'SubagentStart',
    repoRoot,
    env,
    payload: { hook_event_name: 'SubagentStart', ...payload },
  });
}

function additionalContext(stdout: string): string {
  return ((jsonResult(stdout).hookSpecificOutput as Record<string, unknown>).additionalContext as string);
}

function readNativeRoutingState(repoRoot: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, '.ai/harness/delegation/native-role-routing.json'), 'utf8')) as Record<string, unknown>;
}

function readRoutingObservations(repoRoot: string): Record<string, unknown>[] {
  const root = join(repoRoot, '.ai/harness/delegation/role-routing');
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && entry.name.endsWith('.json')) paths.push(candidate);
    }
  };
  if (!existsSync(root)) return [];
  visit(root);
  return paths.sort().map((path) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>);
}

function writeWorkerProfile(repoRoot: string, content = 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\nsandbox_mode = "workspace-write"\n'): void {
  mkdirSync(join(repoRoot, '.codex/agents'), { recursive: true });
  writeFileSync(join(repoRoot, '.codex/agents/worker.toml'), content);
}

function symlinkDirectory(target: string, path: string): void {
  symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
}

async function spawnDirectSubagentStart(
  repoRoot: string,
  payload: Record<string, unknown>,
): Promise<{ exitCode: number; result: Record<string, unknown>; stderr: string }> {
  const source = [
    `import { runSubagentContext } from ${JSON.stringify(join(import.meta.dir, '../src/cli/hook/subagent-context.ts'))};`,
    `import { resolveHookEffectiveState } from ${JSON.stringify(join(import.meta.dir, '../src/cli/hook/runtime.ts'))};`,
    `import { createStateInputCollector } from ${JSON.stringify(join(import.meta.dir, '../src/effects/loop/state-input-collector.ts'))};`,
    'const repoRoot = process.argv[1];',
    'const payload = JSON.parse(process.argv[2]);',
    'const result = runSubagentContext({',
    '  collector: createStateInputCollector({',
    '    repoRoot,',
    '    resolveEffectiveState: () => resolveHookEffectiveState(repoRoot, Date.now()),',
    '  }),',
    '  payload,',
    '  identity: { host: "codex", sessionId: payload.session_id, runId: null, turnId: payload.turn_id },',
    '  env: process.env,',
    '});',
    'process.stdout.write(JSON.stringify(result));',
    'process.exitCode = result.exitCode;',
  ].join('\n');
  const child = Bun.spawn([process.execPath, '-e', source, repoRoot, JSON.stringify(payload)], {
    env: codexEnv(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, result: JSON.parse(stdout) as Record<string, unknown>, stderr };
}

describe('typed subagent hook handlers', () => {
  test('the return channel stamps Agent prompts once and ignores SendUserMessage', () => {
    const repoRoot = tempRepo();
    try {
      const spawn = invokeSubagent({
        event: 'PreToolUse',
        repoRoot,
        payload: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_input: { description: 'Explore repo', prompt: 'Write the report.' },
        },
      });
      expect(spawn.exitCode).toBe(0);
      const spawnOutput = jsonResult(spawn.stdout);
      const specific = spawnOutput.hookSpecificOutput as Record<string, unknown>;
      expect(specific.permissionDecision).toBe('allow');
      const updated = specific.updatedInput as Record<string, unknown>;
      expect(updated.description).toBe('Explore repo');
      expect(updated.prompt).toContain('[repo-harness:return-channel]');
      expect(updated.prompt).toContain('final text');

      const idempotent = invokeSubagent({
        event: 'PreToolUse',
        repoRoot,
        payload: { tool_name: 'Agent', tool_input: { prompt: updated.prompt } },
      });
      expect(idempotent.stdout).toBe('');
      expect(invokeSubagent({ event: 'PreToolUse', repoRoot, payload: { tool_name: 'Task', tool_input: { prompt: 'inspect' } } }).stdout).toBe('');

      // Every Agent prompt already carries the return contract, so the
      // SendUserMessage tool gets no second copy of it.
      const subagentMessage = invokeSubagent({
        event: 'PreToolUse',
        repoRoot,
        payload: { tool_name: 'SendUserMessage', agent_id: 'agent-a', tool_input: { message: 'report' } },
      });
      expect(subagentMessage).toMatchObject({ exitCode: 0, stdout: '' });
      expect(subagentMessage.additionalContext).toBeUndefined();

      const mainLoop = invokeSubagent({
        event: 'PreToolUse',
        repoRoot,
        payload: { tool_name: 'SendUserMessage', tool_input: { message: 'main loop' } },
      });
      expect(mainLoop.stdout).toBe('');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('SubagentStart on Claude fails closed with unsupported-host-route', () => {
    const repoRoot = tempRepo();
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/workflow-contract.json'), '{}\n');
      const result = runHook({
        event: 'SubagentStart',
        routeId: 'context',
        cwd: repoRoot,
        input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'default', model: 'gpt-x' }),
        env: { ...process.env, HOOK_REPO_ROOT: repoRoot, HOOK_HOST: 'claude' },
      });
      expect(result).toMatchObject({ exitCode: 2, reason: 'unsupported-host-route' });
      expect(existsSync(join(repoRoot, '.ai/harness/delegation'))).toBe(false);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('SubagentStart records verified custom-agent evidence', () => {
    const repoRoot = tempRepo();
    const home = tempDir();
    try {
      writeWorkerProfile(repoRoot);
      const output = invokeSubagent({
        event: 'SubagentStart',
        repoRoot,
        env: codexEnv({ HOME: home }),
        payload: {
          hook_event_name: 'SubagentStart',
          session_id: 'session-role',
          turn_id: 'turn-role',
          agent_id: 'agent-worker',
          agent_type: 'fast-worker',
          model: 'gpt-5.6-sol',
        },
        now: () => new Date('2026-07-21T12:01:00.000Z'),
      });
      expect(output.exitCode).toBe(0);
      const context = additionalContext(output.stdout);
      expect(context).toContain('[repo-harness:native-role-routing] verified');
      expect(context).toContain('reasoning-effort routing remains unverified');
      expect(readRoutingObservations(repoRoot)).toEqual([
        expect.objectContaining({ status: 'verified', checked_at: '2026-07-21T12:01:00.000Z' }),
      ]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('persists native role/model evidence without delegation state', () => {
    const repoRoot = tempRepo();
    try {
      writeWorkerProfile(repoRoot);
      const output = startSubagent(repoRoot, {
        session_id: 'session-native-event',
        turn_id: 'turn-native-event',
        agent_id: 'agent-native-event',
        agent_type: 'fast-worker',
        model: 'gpt-5.6-sol',
      });
      expect(output.exitCode).toBe(0);
      expect(additionalContext(output.stdout)).toContain('[repo-harness:native-role-routing] verified');
      expect(existsSync(join(repoRoot, '.ai/harness/delegation/latest.json'))).toBe(false);
      expect(readNativeRoutingState(repoRoot)).toMatchObject({
        required: true,
        evidence_dir: 'role-routing/session-session-native-event',
        reasoning_effort_status: 'configured_unverified',
      });
      expect(readRoutingObservations(repoRoot)).toEqual([
        expect.objectContaining({
          status: 'verified',
          agent_type: 'fast-worker',
          observed_model: 'gpt-5.6-sol',
          reasoning_effort_status: 'configured_unverified',
        }),
      ]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('injects the long-command guardrail advisory once into SubagentStart context', () => {
    const repoRoot = tempRepo();
    try {
      writeWorkerProfile(repoRoot);
      const output = startSubagent(repoRoot, {
        session_id: 'session-guardrail',
        turn_id: 'turn-guardrail',
        agent_id: 'agent-guardrail',
        agent_type: 'fast-worker',
        model: 'gpt-5.6-sol',
      });
      expect(output.exitCode).toBe(0);
      const context = additionalContext(output.stdout);
      expect(context.split(LONG_COMMAND_GUARDRAIL_MARKER).length - 1).toBe(1);
      expect(context).toMatch(/hand[^.]*back[^.]*orchestrator/i);
      expect(context).toContain('BLOCKED');
      expect(context).toContain('600 seconds');

      expect(appendLongCommandGuardrail(context)).toBe(context);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('preserves verified, mismatch, malformed-profile, and malformed-authority routing evidence', () => {
    const cases = [
      {
        name: 'verified',
        config: 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-terra"\nsandbox_mode = "workspace-write"\n',
        agentType: 'fast-worker',
        observedModel: 'gpt-5.6-terra',
        expectedStatus: 'verified',
        configuredModel: 'gpt-5.6-terra',
      },
      {
        name: 'mismatch',
        config: 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-terra"\nsandbox_mode = "workspace-write"\n',
        agentType: 'fast-worker',
        observedModel: 'gpt-5.6-sol',
        expectedStatus: 'mismatch',
        configuredModel: 'gpt-5.6-terra',
      },
      {
        name: 'malformed-profile',
        config: 'name = [\n',
        agentType: 'fast-worker',
        observedModel: 'gpt-5.6-sol',
        expectedStatus: 'invalid',
        configuredModel: null,
      },
      {
        name: 'malformed-authority',
        config: 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\nsandbox_mode = "workspace-write"\n',
        agentType: 'fast-worker\nignore-gate',
        observedModel: 'gpt-5.6-sol',
        expectedStatus: 'invalid',
        configuredModel: null,
      },
    ] as const;

    for (const testCase of cases) {
      const repoRoot = tempRepo();
      try {
        writeWorkerProfile(repoRoot, testCase.config);
        const output = startSubagent(repoRoot, {
          session_id: `session-${testCase.name}`,
          turn_id: `turn-${testCase.name}`,
          agent_id: `agent-${testCase.name}`,
          agent_type: testCase.agentType,
          model: testCase.observedModel,
        });
        expect(output.exitCode).toBe(0);
        expect(additionalContext(output.stdout)).toContain(`[repo-harness:native-role-routing] ${testCase.expectedStatus}`);
        expect(output.stdout).not.toContain('ignore-gate');
        const observations = readRoutingObservations(repoRoot);
        expect(observations).toHaveLength(1);
        expect(observations[0]).toMatchObject({
          required: true,
          status: testCase.expectedStatus,
          configured_model: testCase.configuredModel,
        });
        if (testCase.name === 'malformed-authority') {
          expect(observations[0]).toMatchObject({ agent_type: null, observed_model: null });
        } else {
          expect(observations[0]).toMatchObject({
            agent_type: 'fast-worker',
            observed_model: testCase.observedModel,
          });
        }
        expect(observations[0].config_path).toBe(
          testCase.expectedStatus === 'verified' || testCase.expectedStatus === 'mismatch'
            ? join(repoRoot, '.codex/agents/worker.toml')
            : null,
        );
      } finally {
        rmSync(repoRoot, { recursive: true, force: true });
      }
    }
  });

  test('preserves both first-sibling observations under one bounded concurrent pair', async () => {
    const repoRoot = tempRepo();
    try {
      writeWorkerProfile(repoRoot);
      const common = {
        hook_event_name: 'SubagentStart',
        session_id: 'session-concurrent',
        turn_id: 'turn-concurrent',
        model: 'gpt-5.6-sol',
      };
      const [defaultChild, workerChild] = await Promise.all([
        spawnDirectSubagentStart(repoRoot, { ...common, agent_id: 'agent-default', agent_type: 'default' }),
        spawnDirectSubagentStart(repoRoot, { ...common, agent_id: 'agent-worker', agent_type: 'fast-worker' }),
      ]);
      expect([defaultChild.exitCode, workerChild.exitCode]).toEqual([0, 0]);
      expect(defaultChild.stderr).toBe('');
      expect(workerChild.stderr).toBe('');
      expect((defaultChild.result.exitCode as number)).toBe(0);
      expect((workerChild.result.exitCode as number)).toBe(0);
      const observations = readRoutingObservations(repoRoot);
      expect(observations).toHaveLength(2);
      expect(observations.map((entry) => entry.status).sort()).toEqual(['unavailable', 'verified']);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test('retains only the current scope and its latest 32 native observations', () => {
    const repoRoot = tempRepo();
    try {
      writeWorkerProfile(repoRoot);
      const start = (sessionId: string, index: number) => startSubagent(repoRoot, {
        session_id: sessionId,
        turn_id: `turn-${index}`,
        agent_id: `agent-${index}`,
        agent_type: 'fast-worker',
        model: 'gpt-5.6-sol',
      });

      expect(start('old', 0).exitCode).toBe(0);
      for (let index = 1; index <= 40; index += 1) {
        const output = start('current', index);
        expect(output.exitCode).toBe(0);
        expect(additionalContext(output.stdout)).toContain('[repo-harness:native-role-routing] verified');
      }

      const routingRoot = join(repoRoot, '.ai/harness/delegation/role-routing');
      expect(readdirSync(routingRoot)).toEqual(['session-current']);
      expect(readRoutingObservations(repoRoot)).toHaveLength(32);
      expect(readNativeRoutingState(repoRoot)).toMatchObject({
        evidence_dir: 'role-routing/session-current',
        reasoning_effort_status: 'configured_unverified',
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test('rejects symlinked custom-agent and role-routing evidence directories', () => {
    const agentOutside = tempDir();
    const evidenceOutside = tempDir();
    const linkedAgentRepo = tempRepo();
    const linkedEvidenceRepo = tempRepo();
    try {
      writeFileSync(join(agentOutside, 'worker.toml'), 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\nsandbox_mode = "workspace-write"\n');
      mkdirSync(join(linkedAgentRepo, '.codex'), { recursive: true });
      symlinkDirectory(agentOutside, join(linkedAgentRepo, '.codex/agents'));
      const linkedConfig = startSubagent(linkedAgentRepo, {
        session_id: 'session-config-link',
        turn_id: 'turn-config-link',
        agent_id: 'agent-config-link',
        agent_type: 'fast-worker',
        model: 'gpt-5.6-sol',
      });
      expect(additionalContext(linkedConfig.stdout)).toContain('[repo-harness:native-role-routing] invalid');
      expect(readRoutingObservations(linkedAgentRepo)[0].config_path).toBeNull();

      writeWorkerProfile(linkedEvidenceRepo);
      const evidencePath = join(linkedEvidenceRepo, '.ai/harness/delegation/role-routing/session-session-evidence-link');
      mkdirSync(join(evidencePath, '..'), { recursive: true });
      symlinkDirectory(evidenceOutside, evidencePath);
      const linkedEvidence = startSubagent(linkedEvidenceRepo, {
        session_id: 'session-evidence-link',
        turn_id: 'turn-evidence-link',
        agent_id: 'agent-evidence-link',
        agent_type: 'fast-worker',
        model: 'gpt-5.6-sol',
      });
      expect(additionalContext(linkedEvidence.stdout)).toContain('[repo-harness:native-role-routing] unverified');
      expect(additionalContext(linkedEvidence.stdout)).toContain('No safe native role-routing evidence directory');
      expect(readdirSync(evidenceOutside)).toEqual([]);
    } finally {
      rmSync(agentOutside, { recursive: true, force: true });
      rmSync(evidenceOutside, { recursive: true, force: true });
      rmSync(linkedAgentRepo, { recursive: true, force: true });
      rmSync(linkedEvidenceRepo, { recursive: true, force: true });
    }
  });

  // Board slice coverage also checks the arming predicate and lease identity in tests/board-slice.test.ts.
  test('a repository with no coordination state receives no slice on either mount', () => {
    const repoRoot = tempRepo();
    try {
      const spawn = invokeSubagent({
        event: 'PreToolUse',
        repoRoot,
        payload: { tool_name: 'Agent', tool_input: { prompt: 'Write the report.' } },
      });
      const prompt = String(
        ((jsonResult(spawn.stdout).hookSpecificOutput as Record<string, unknown>)
          .updatedInput as Record<string, unknown>).prompt,
      );
      expect(prompt).toContain('[repo-harness:return-channel]');
      expect(prompt).not.toContain('[repo-harness:board-slice]');

      const start = invokeSubagent({
        event: 'SubagentStart',
        repoRoot,
        env: codexEnv(),
        payload: { agent_type: 'default', model: 'gpt-x', agent_id: 'a-1', turn_id: 't-1' },
      });
      const context = String(
        (jsonResult(start.stdout).hookSpecificOutput as Record<string, unknown>).additionalContext,
      );
      expect(context).toContain('[repo-harness:subagent-context]');
      expect(context).not.toContain('[repo-harness:board-slice]');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  // The composed native-child stack is persona developer_instructions +
  // SubagentStart context. Each row of the decision table is
  // asserted against that whole stack, because "exactly once" is a property of the
  // composition, not of any single injection site.
  describe('composed native-child stack owns the execution boundary exactly once', () => {
    test('active contract + workspace-write child: the boundary appears once, with the contract path', () => {
      const repoRoot = tempRepo();
      const home = tempDir();
      try {
        const contract = seedActiveContract(repoRoot);
        const stack = composedChildStack(repoRoot, 'fast-worker', 'gpt-6.1-sol', codexEnv({ HOME: home }));
        expect(stack.startContext).toContain('[repo-harness:native-role-routing] verified');
        expect(occurrences(stack.composed, BOUNDARY_MARKER)).toBe(1);
        expect(occurrences(stack.composed, BOUNDARY_SENTENCE)).toBe(1);
        expect(occurrences(stack.startContext, BOUNDARY_MARKER)).toBe(1);
        expect(stack.personaInstructions).not.toContain(BOUNDARY_SENTENCE);
        expect(stack.startContext).toContain(`Read the active repo-harness contract before working: ${contract}.`);
        expect(stack.startContext).not.toContain('Read-only scope:');
      } finally {
        rmSync(repoRoot, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    });

    test('active contract + read-only child: zero implementation boundary, read-only scope note instead', () => {
      const repoRoot = tempRepo();
      const home = tempDir();
      try {
        const contract = seedActiveContract(repoRoot);
        const stack = composedChildStack(repoRoot, 'explorer', 'gpt-6-luna', codexEnv({ HOME: home }));
        expect(stack.startContext).toContain('[repo-harness:native-role-routing] verified');
        expect(occurrences(stack.composed, BOUNDARY_MARKER)).toBe(0);
        expect(occurrences(stack.composed, BOUNDARY_SENTENCE)).toBe(0);
        expect(stack.startContext).toContain('Read-only scope:');
        expect(stack.startContext).toContain(`Read the active repo-harness contract before working: ${contract}.`);
      } finally {
        rmSync(repoRoot, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    });

    test('no active contract: writable child receives exactly one boundary from its parent brief', () => {
      const repoRoot = tempRepo();
      const home = tempDir();
      try {
        const stack = composedChildStack(repoRoot, 'fast-worker', 'gpt-6.1-sol', codexEnv({ HOME: home }));
        expect(stack.startContext).toContain('[repo-harness:native-role-routing] verified');
        expect(occurrences(stack.composed, BOUNDARY_MARKER)).toBe(1);
        expect(occurrences(stack.composed, BOUNDARY_SENTENCE)).toBe(1);
        expect(stack.startContext).not.toContain('Read the active repo-harness contract');
        expect(stack.startContext).not.toContain('Read-only scope:');
        expect(stack.startContext).toContain('Stay within the assigned role and permission scope.');
        expect(stack.startContext).toContain('Do not claim overall task completion.');
      } finally {
        rmSync(repoRoot, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    });

    test('no active contract: verified read-only child has no write boundary or fabricated contract', () => {
      const repoRoot=tempRepo(), home=tempDir();
      try {
        const stack=composedChildStack(repoRoot,'explorer','gpt-6-luna',codexEnv({HOME:home}));
        expect(occurrences(stack.composed,BOUNDARY_MARKER)).toBe(0);
        expect(stack.startContext).toContain('Read-only scope:');
        expect(stack.startContext).not.toContain('Read the active repo-harness contract');
      } finally { rmSync(repoRoot,{recursive:true,force:true});rmSync(home,{recursive:true,force:true}); }
    });

    test('unverified routing on a writable persona: fail-closed notice, zero boundary', () => {
      const repoRoot = tempRepo();
      const home = tempDir();
      try {
        seedActiveContract(repoRoot);
        const stack = composedChildStack(repoRoot, 'fast-worker', 'gpt-5.6-sol', codexEnv({ HOME: home }));
        expect(stack.startContext).toContain('[repo-harness:native-role-routing] mismatch');
        expect(stack.startContext).toContain('Do not claim custom-agent model or reasoning-effort routing.');
        expect(occurrences(stack.composed, BOUNDARY_MARKER)).toBe(0);
        expect(occurrences(stack.composed, BOUNDARY_SENTENCE)).toBe(0);
        expect(stack.startContext).not.toContain('Read-only scope:');
      } finally {
        rmSync(repoRoot, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    });

    test('a persona without a declared sandbox_mode fails closed and receives no boundary', () => {
      const repoRoot = tempRepo();
      const home = tempDir();
      try {
        seedActiveContract(repoRoot);
        writeWorkerProfile(repoRoot, 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\n');
        const output = startSubagent(repoRoot, {
          session_id: 'session-no-sandbox',
          turn_id: 'turn-no-sandbox',
          agent_id: 'agent-no-sandbox',
          agent_type: 'fast-worker',
          model: 'gpt-5.6-sol',
        }, codexEnv({ HOME: home }));
        expect(output.exitCode).toBe(0);
        const context = additionalContext(output.stdout);
        expect(context).toContain('[repo-harness:native-role-routing] invalid');
        expect(context).toContain('does not declare a valid sandbox_mode');
        expect(context).not.toContain(BOUNDARY_MARKER);
        expect(readRoutingObservations(repoRoot)[0]).toMatchObject({ status: 'invalid', sandbox_mode: null });
      } finally {
        rmSync(repoRoot, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    });

    test('verified routing records the scanned sandbox_mode in role evidence', () => {
      const repoRoot = tempRepo();
      const home = tempDir();
      try {
        installGoldenPersona(repoRoot, 'gatekeeper');
        const output = startSubagent(repoRoot, {
          session_id: 'session-sandbox-evidence',
          turn_id: 'turn-sandbox-evidence',
          agent_id: 'agent-sandbox-evidence',
          agent_type: 'gatekeeper',
          model: 'gpt-6-astra',
        }, codexEnv({ HOME: home }));
        expect(output.exitCode).toBe(0);
        expect(readRoutingObservations(repoRoot)[0]).toMatchObject({
          status: 'verified',
          agent_type: 'gatekeeper',
          sandbox_mode: 'read-only',
        });
      } finally {
        rmSync(repoRoot, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    });
  });
});
