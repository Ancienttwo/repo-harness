import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runSubagentHandler } from '../src/cli/hook/subagent-handler';

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), 'repo-harness-subagent-handler-'));
}

function codexEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, HOOK_HOST: 'codex', ...overrides };
}

function jsonResult(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function seedDelegation(
  repoRoot: string,
  payload: Record<string, unknown>,
  env: NodeJS.ProcessEnv = codexEnv(),
): void {
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  const seeded = runSubagentHandler({
    event: 'UserPromptSubmit',
    repoRoot,
    env,
    input: JSON.stringify({ prompt: '/delegate use bounded subagents', ...payload }),
  });
  expect(seeded.exitCode).toBe(0);
  expect(seeded.stdout).not.toBe('');
}

function startSubagent(
  repoRoot: string,
  payload: Record<string, unknown>,
  env: NodeJS.ProcessEnv = codexEnv(),
) {
  return runSubagentHandler({
    event: 'SubagentStart',
    repoRoot,
    env,
    input: JSON.stringify({ hook_event_name: 'SubagentStart', ...payload }),
  });
}

function additionalContext(stdout: string): string {
  return ((jsonResult(stdout).hookSpecificOutput as Record<string, unknown>).additionalContext as string);
}

function readLatest(repoRoot: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, '.ai/harness/delegation/latest.json'), 'utf8')) as Record<string, unknown>;
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

function writeWorkerProfile(repoRoot: string, content = 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\n'): void {
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
  const modulePath = join(import.meta.dir, '../src/cli/hook/subagent-handler.ts');
  const source = [
    `import { runSubagentHandler } from ${JSON.stringify(modulePath)};`,
    'const result = runSubagentHandler({',
    '  event: "SubagentStart",',
    '  repoRoot: process.argv[1],',
    '  env: { ...process.env, HOOK_HOST: "codex" },',
    '  input: process.argv[2],',
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
  test('ports the return-channel allow/deny decisions and idempotence', () => {
    const repoRoot = tempRepo();
    try {
      const spawn = runSubagentHandler({
        event: 'PreToolUse',
        repoRoot,
        input: JSON.stringify({
          hook_event_name: 'PreToolUse',
          tool_name: 'Task',
          tool_input: { description: 'Explore repo', prompt: 'Write the report.' },
        }),
      });
      expect(spawn.exitCode).toBe(0);
      const spawnOutput = jsonResult(spawn.stdout);
      const specific = spawnOutput.hookSpecificOutput as Record<string, unknown>;
      expect(specific.permissionDecision).toBe('allow');
      const updated = specific.updatedInput as Record<string, unknown>;
      expect(updated.description).toBe('Explore repo');
      expect(updated.prompt).toContain('[repo-harness:return-channel]');
      expect(updated.prompt).toContain('final text');

      const idempotent = runSubagentHandler({
        event: 'PreToolUse',
        repoRoot,
        input: JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: updated.prompt } }),
      });
      expect(idempotent.stdout).toBe('');

      const deny = runSubagentHandler({
        event: 'PreToolUse',
        repoRoot,
        input: JSON.stringify({ tool_name: 'SendUserMessage', agent_id: 'agent-a', tool_input: { message: 'report' } }),
      });
      expect((jsonResult(deny.stdout).hookSpecificOutput as Record<string, unknown>).permissionDecision).toBe('deny');

      const mainLoop = runSubagentHandler({
        event: 'PreToolUse',
        repoRoot,
        input: JSON.stringify({ tool_name: 'SendUserMessage', tool_input: { message: 'main loop' } }),
      });
      expect(mainLoop.stdout).toBe('');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('ports explicit delegation state, scope, policy limits, and contract context', () => {
    const repoRoot = tempRepo();
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      mkdirSync(join(repoRoot, 'plans'), { recursive: true });
      mkdirSync(join(repoRoot, 'tasks/contracts'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), JSON.stringify({
        delegation: { max_agents: 4, max_depth: 2, preferred_runners: ['subagent', 'codex'], fallback_runner: 'main-thread' },
      }));
      writeFileSync(join(repoRoot, '.ai/harness/active-plan'), 'plans/plan-test.md\n');
      writeFileSync(join(repoRoot, 'plans/plan-test.md'), '# plan\n');
      writeFileSync(join(repoRoot, 'tasks/contracts/test.contract.md'), '> **Status**: Active\n');
      const env = codexEnv({ HOME: tempRepo() });
      const output = runSubagentHandler({
        event: 'UserPromptSubmit',
        repoRoot,
        env,
        input: JSON.stringify({ session_id: 'session-1', prompt: '/delegate inspect in parallel' }),
        now: () => new Date('2026-07-21T12:00:00.000Z'),
      });
      expect(output.exitCode).toBe(0);
      const context = ((jsonResult(output.stdout).hookSpecificOutput as Record<string, unknown>).additionalContext as string);
      expect(context).toContain('[repo-harness:delegation]');
      expect(context).toContain('Spawn no more than 2 agents.');
      expect(context).toContain('active task contract (tasks/contracts/test.contract.md)');
      expect(context).toContain('Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief.');
      const state = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/delegation/latest.json'), 'utf8')) as Record<string, unknown>;
      expect(state.scope_id).toBe('session-session-1');
      expect(state.state_file).toBe('turns/session-session-1.json');
      expect(state.max_agents).toBe(2);
      expect(state.max_depth).toBe(2);
      expect(state.preferred_runners).toEqual(['subagent', 'codex']);

      const silent = runSubagentHandler({
        event: 'UserPromptSubmit',
        repoRoot,
        env,
        input: JSON.stringify({ session_id: 'session-silent', prompt: 'Should we use subagents for this?' }),
      });
      expect(silent.stdout).toBe('');
      const nonCodex = runSubagentHandler({
        event: 'UserPromptSubmit',
        repoRoot,
        env: { ...env, HOOK_HOST: 'claude' },
        input: JSON.stringify({ prompt: '/delegate inspect in parallel' }),
      });
      expect(nonCodex.stdout).toBe('');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('ports SubagentStart role context, spawned state, and custom-agent evidence', () => {
    const repoRoot = tempRepo();
    const home = tempRepo();
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      mkdirSync(join(repoRoot, '.codex/agents'), { recursive: true });
      writeFileSync(join(repoRoot, '.codex/agents/worker.toml'), 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\n');
      const env = codexEnv({ HOME: home });
      runSubagentHandler({
        event: 'UserPromptSubmit',
        repoRoot,
        env,
        input: JSON.stringify({ session_id: 'session-role', prompt: '/delegate use a worker' }),
      });
      const output = runSubagentHandler({
        event: 'SubagentStart',
        repoRoot,
        env,
        input: JSON.stringify({
          hook_event_name: 'SubagentStart',
          session_id: 'session-role',
          turn_id: 'turn-role',
          agent_id: 'agent-worker',
          agent_type: 'fast-worker',
          model: 'gpt-5.6-sol',
        }),
        now: () => new Date('2026-07-21T12:01:00.000Z'),
      });
      expect(output.exitCode).toBe(0);
      const context = ((jsonResult(output.stdout).hookSpecificOutput as Record<string, unknown>).additionalContext as string);
      expect(context).toContain('[repo-harness:native-role-routing] verified');
      expect(context).toContain('reasoning-effort routing remains unverified');
      const latest = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/delegation/latest.json'), 'utf8')) as Record<string, unknown>;
      expect(latest.spawned).toBe(true);
      expect(latest.spawned_at).toBeTruthy();
      // The prompt hash is intentionally part of the evidence scope; inspect
      // the directory shape instead of reconstructing that opaque digest here.
      const roleRoot = join(repoRoot, '.ai/harness/delegation', 'role-routing');
      expect(exists(roleRoot)).toBe(true);
      expect(findJsonFile(roleRoot)).not.toBeNull();
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('preserves verified, mismatch, malformed-profile, and malformed-authority routing evidence', () => {
    const cases = [
      {
        name: 'verified',
        config: 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\n',
        agentType: 'fast-worker',
        observedModel: 'gpt-5.6-sol',
        expectedStatus: 'verified',
        configuredModel: 'gpt-5.6-sol',
      },
      {
        name: 'mismatch',
        config: 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\n',
        agentType: 'fast-worker',
        observedModel: 'gpt-5.6-terra',
        expectedStatus: 'mismatch',
        configuredModel: 'gpt-5.6-sol',
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
        config: 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\n',
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
        seedDelegation(repoRoot, { session_id: `session-${testCase.name}` });
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
      seedDelegation(repoRoot, { session_id: 'session-concurrent' });
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
      expect(readLatest(repoRoot).spawned).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('does not roll latest.json back when a stale scoped SubagentStart arrives', () => {
    const repoRoot = tempRepo();
    try {
      seedDelegation(repoRoot, { session_id: 'session-stale', turn_id: 'stale-a' });
      const stateAPath = join(repoRoot, '.ai/harness/delegation/turns/turn-stale-a.json');
      expect((JSON.parse(readFileSync(stateAPath, 'utf8')) as Record<string, unknown>).spawned).toBe(false);
      seedDelegation(repoRoot, { session_id: 'session-stale', turn_id: 'stale-b' });
      const latestBefore = readFileSync(join(repoRoot, '.ai/harness/delegation/latest.json'), 'utf8');
      expect((JSON.parse(latestBefore) as Record<string, unknown>).scope_id).toBe('turn-stale-b');

      const stale = startSubagent(repoRoot, {
        session_id: 'session-stale',
        turn_id: 'stale-a',
        agent_id: 'agent-stale-a',
        agent_type: 'default',
        model: 'gpt-5.6-sol',
      });
      expect(stale.exitCode).toBe(0);
      expect(readFileSync(join(repoRoot, '.ai/harness/delegation/latest.json'), 'utf8')).toBe(latestBefore);
      expect((JSON.parse(readFileSync(stateAPath, 'utf8')) as Record<string, unknown>).spawned).toBe(false);
      expect(additionalContext(stale.stdout)).not.toContain('[repo-harness:native-role-routing]');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('bounds a held delegation lock without partially updating either projection', () => {
    const repoRoot = tempRepo();
    try {
      seedDelegation(repoRoot, { session_id: 'session-held', turn_id: 'held-a' });
      const latestPath = join(repoRoot, '.ai/harness/delegation/latest.json');
      const lockPath = `${latestPath}.lock`;
      const turnPath = join(repoRoot, '.ai/harness/delegation/turns/turn-held-a.json');
      const latestBefore = readFileSync(latestPath, 'utf8');
      const heldLock = JSON.stringify({ pid: 999_999, token: 'external-owner', acquired_at: '2026-07-21T12:00:00.000Z' });
      writeFileSync(lockPath, heldLock, { flag: 'wx' });
      const startedAt = Date.now();
      const output = startSubagent(repoRoot, {
        session_id: 'session-held',
        turn_id: 'held-a',
        agent_id: 'agent-held',
        agent_type: 'default',
        model: 'gpt-5.6-sol',
      });
      const elapsedMs = Date.now() - startedAt;
      expect(output.exitCode).toBe(0);
      expect(elapsedMs).toBeLessThan(4_500);
      expect(readFileSync(lockPath, 'utf8')).toBe(heldLock);
      expect(readFileSync(latestPath, 'utf8')).toBe(latestBefore);
      const isolated = JSON.parse(readFileSync(turnPath, 'utf8')) as Record<string, unknown>;
      expect(isolated.spawned).toBe(false);
      expect(isolated.spawned_at).toBeUndefined();
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 8_000);

  test('rejects symlinked custom-agent and role-routing evidence directories', () => {
    const agentOutside = tempRepo();
    const evidenceOutside = tempRepo();
    const linkedAgentRepo = tempRepo();
    const linkedEvidenceRepo = tempRepo();
    try {
      writeFileSync(join(agentOutside, 'worker.toml'), 'name = "fast-worker"\ndescription = "Bounded worker"\ndeveloper_instructions = "Stay in scope."\nmodel = "gpt-5.6-sol"\n');
      mkdirSync(join(linkedAgentRepo, '.codex'), { recursive: true });
      symlinkDirectory(agentOutside, join(linkedAgentRepo, '.codex/agents'));
      seedDelegation(linkedAgentRepo, { session_id: 'session-config-link' });
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
      seedDelegation(linkedEvidenceRepo, { session_id: 'session-evidence-link' });
      const seeded = readLatest(linkedEvidenceRepo);
      const routing = seeded.native_role_routing as Record<string, unknown>;
      const evidencePath = join(
        linkedEvidenceRepo,
        '.ai/harness/delegation',
        routing.evidence_dir as string,
      );
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
      expect(additionalContext(linkedEvidence.stdout)).toContain('no safe role-routing evidence directory');
      expect(readdirSync(evidenceOutside)).toEqual([]);
    } finally {
      rmSync(agentOutside, { recursive: true, force: true });
      rmSync(evidenceOutside, { recursive: true, force: true });
      rmSync(linkedAgentRepo, { recursive: true, force: true });
      rmSync(linkedEvidenceRepo, { recursive: true, force: true });
    }
  });

  test('resolves delegation scope in turn, run, session, transcript order', () => {
    const repoRoot = tempRepo();
    try {
      seedDelegation(repoRoot, {
        turn_id: 'turn-priority',
        run_id: 'run-priority',
        session_id: 'session-priority',
        transcript_path: '/tmp/transcript-priority.jsonl',
      });
      expect(readLatest(repoRoot)).toMatchObject({ scope_source: 'turn_id', scope_id: 'turn-turn-priority' });

      seedDelegation(repoRoot, {
        run_id: 'run-priority',
        session_id: 'session-priority',
        transcript_path: '/tmp/transcript-priority.jsonl',
      });
      expect(readLatest(repoRoot)).toMatchObject({ scope_source: 'run_id', scope_id: 'run-run-priority' });

      seedDelegation(repoRoot, {
        session_id: 'session-priority',
        transcript_path: '/tmp/transcript-priority.jsonl',
      });
      expect(readLatest(repoRoot)).toMatchObject({ scope_source: 'session_id', scope_id: 'session-session-priority' });

      const transcriptPath = '  /tmp/transcript-priority.jsonl  ';
      const digest = createHash('sha1').update(transcriptPath.trim()).digest('hex').slice(0, 16);
      seedDelegation(repoRoot, { transcript_path: transcriptPath });
      expect(readLatest(repoRoot)).toMatchObject({
        scope_source: 'transcript_path',
        scope_id: `transcript-${digest}`,
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('ports SubagentStop quality gating and same-scope idempotence', () => {
    const repoRoot = tempRepo();
    try {
      const thin = runSubagentHandler({
        event: 'SubagentStop',
        repoRoot,
        env: codexEnv(),
        input: JSON.stringify({ session_id: 'session-a', subagent_id: 'agent-a', final_message: 'looks good' }),
        now: () => new Date('2026-07-21T12:02:00.000Z'),
      });
      expect(thin.exitCode).toBe(0);
      expect((jsonResult(thin.stdout).reason as string)).toContain('[SubagentQualityGate]');
      expect((jsonResult(thin.stdout).decision as string)).toBe('block');

      const repeated = runSubagentHandler({
        event: 'SubagentStop',
        repoRoot,
        env: codexEnv(),
        input: JSON.stringify({ session_id: 'session-a', subagent_id: 'agent-a', final_message: 'looks good' }),
      });
      expect(repeated.stdout).toBe('');

      const differentSubagent = runSubagentHandler({
        event: 'SubagentStop',
        repoRoot,
        env: codexEnv(),
        input: JSON.stringify({ session_id: 'session-a', subagent_id: 'agent-b', final_message: 'looks good' }),
      });
      expect((jsonResult(differentSubagent.stdout).decision as string)).toBe('block');

      const differentSession = runSubagentHandler({
        event: 'SubagentStop',
        repoRoot,
        env: codexEnv(),
        input: JSON.stringify({ session_id: 'session-b', subagent_id: 'agent-a', final_message: 'looks good' }),
      });
      expect((jsonResult(differentSession.stdout).decision as string)).toBe('block');

      const unresolvedError = runSubagentHandler({
        event: 'SubagentStop',
        repoRoot,
        env: codexEnv(),
        input: JSON.stringify({
          session_id: 'session-error',
          subagent_id: 'agent-error',
          final_message: 'The investigation failed with a timeout while reading the repository. The operation failed again and the requested mapping remains blocked without any further explanation or parent action.',
        }),
      });
      expect((jsonResult(unresolvedError.stdout).reason as string)).toContain('unresolved error');

      const recursiveStop = runSubagentHandler({
        event: 'SubagentStop',
        repoRoot,
        env: codexEnv(),
        input: JSON.stringify({ subagent_stop_hook_active: true, final_message: 'looks good' }),
      });
      expect(recursiveStop.stdout).toBe('');

      const complete = runSubagentHandler({
        event: 'SubagentStop',
        repoRoot,
        env: codexEnv(),
        input: JSON.stringify({ final_message: 'Inspected src/cli/hook/subagent-handler.ts and tests/subagent-handler.test.ts. Evidence: typed route decisions and state writes match the four retired scripts. Ran bun test tests/subagent-handler.test.ts. Risk: host payload fields may evolve; parent should verify route fixtures.' }),
      });
      expect(complete.stdout).toBe('');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

function exists(path: string): boolean {
  return existsSync(path);
}

function findJsonFile(root: string): string | null {
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      const candidate = join(root, entry.name);
      if (entry.isDirectory()) {
        const nested = findJsonFile(candidate);
        if (nested) return nested;
      } else if (entry.name.endsWith('.json')) {
        return candidate;
      }
    }
  } catch {
    return null;
  }
  return null;
}
