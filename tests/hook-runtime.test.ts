import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runHook } from '../src/cli/hook/runtime';
import { isHookEventTelemetryRecord } from '../src/cli/hook/event-telemetry';
import { buildTaskMessageEvent } from '../src/core/fleet/task-message';
import { bindLeaseRecord, buildLeaseOwnerRecord, deriveTaskRevision } from '../src/core/state/coordination-identity';
import { sendTaskMessage } from '../src/effects/fleet/task-inbox';
import { writeClaimTokenForBoundLease } from '../src/effects/state/coordination-claim-token';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../src/effects/state/coordination-lease-store';
import { fixtureTaskId } from './helpers/sprint-fixture';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'hrd09-hook-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function env(root: string, host: 'claude' | 'codex' | 'pi' = 'claude'): NodeJS.ProcessEnv {
  return { ...process.env, HOOK_REPO_ROOT: root, HOOK_HOST: host, REPO_HARNESS_WORKFLOW_PROFILE: 'routine' };
}

describe('hook runtime typed dispatch', () => {
  test('Pi JSON maps guard decisions and refuses host-specific routes', () => {
    const root = fixture();
    try {
      const allowed = runHook({ event: 'PreToolUse', routeId: 'edit', cwd: root, env: env(root, 'pi'), format: 'json', stdio: 'ignore',
        input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'safe' } }) });
      expect(allowed.json).toMatchObject({ protocol: 1, host: 'pi', exit_code: 0, decision: 'allow', reason: 'ok' });
      const refused = runHook({ event: 'PreToolUse', routeId: 'edit', cwd: root, env: env(root, 'pi'), format: 'json', stdio: 'ignore',
        input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '_ops/private', content: 'forbidden' } }) });
      expect(refused.json).toMatchObject({ host: 'pi', exit_code: 2, decision: 'block' });
      expect(refused.json?.diagnostics).toContain('OpsPrivateGuard');
      expect(runHook({ event: 'PreToolUse', routeId: 'subagent', cwd: root, env: env(root, 'pi'), format: 'json', stdio: 'ignore' }).json)
        .toMatchObject({ decision: 'block', reason: 'unsupported-host-route', exit_code: 2 });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('Pi JSON keeps the existing pipe and ignore fd contract', () => {
    const root = fixture();
    try {
      for (const stdio of ['pipe', 'ignore']) {
        const script = `import { runHook } from ${JSON.stringify(join(import.meta.dir, '../src/cli/hook/runtime.ts'))};
          const result = runHook({ event: 'PreToolUse', routeId: 'edit', cwd: ${JSON.stringify(root)}, format: 'json', stdio: ${JSON.stringify(stdio)},
            input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'safe' } }) });
          if (result.json?.decision !== 'allow') process.exit(1);`;
        expect(execFileSync('bun', ['-e', script], { cwd: root, env: env(root, 'pi'), encoding: 'utf8' })).toBe('');
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('passes host payload once to the command observer and records its result', () => {
    const root = fixture();
    try {
      const result = runHook({
        event: 'PostToolUse',
        routeId: 'bash',
        cwd: root,
        input: JSON.stringify({ tool_input: { command: 'echo hello' }, tool_response: { stdout: 'hello\n', stderr: '', interrupted: false }, exit_code: 0 }),
        env: env(root),
      });
      expect(result).toMatchObject({ exitCode: 0, reason: 'ok', handler: 'command-observed' });
      const record = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim()) as Record<string, unknown>;
      expect(record.steps).toEqual([expect.objectContaining({ name: 'command-observed', execution: 'in_process', exit_code: 0 })]);
      expect(record.measurement).toMatchObject({ opaque_steps: [] });
      expect((record.measurement as { incomplete_metrics: string[] }).incomplete_metrics).toContain('files_read');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);

  test('measures and captures Bash output from the Claude PostToolUse tool_response', () => {
    const root = fixture();
    try {
      // Claude Code builds PostToolUse input as { tool_name, tool_input,
      // tool_response, tool_use_id, duration_ms }; the Bash tool_response is
      // { stdout, stderr, interrupted, isImage? }.
      const stdout = `${Array.from({ length: 201 }, (_, index) => `line-${index}`).join('\n')}\n`;
      const stderr = 'warning: slow test\n';
      const hostEnv = env(root);
      delete hostEnv.EXIT_CODE;
      const result = runHook({
        event: 'PostToolUse',
        routeId: 'bash',
        cwd: root,
        input: JSON.stringify({
          session_id: 'claude-session',
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'bun test', description: 'Run tests' },
          tool_response: { stdout, stderr, interrupted: false, isImage: false },
          tool_use_id: 'toolu_01',
          duration_ms: 812,
        }),
        env: hostEnv,
      });
      expect(result).toMatchObject({ exitCode: 0, reason: 'ok', handler: 'command-observed' });
      const record = JSON.parse(readFileSync(join(root, '.ai/harness/checks/post-bash-latest.json'), 'utf8')) as Record<string, unknown>;
      const observed = `${stdout}${stderr}`;
      expect(record).toMatchObject({
        command: 'bun test',
        exit_code: 0,
        status: 'pass',
        output_line_count: 202,
        verbosity_class: 'long',
        suggested_runner: 'raw',
        raw_output_bytes: Buffer.byteLength(observed),
      });
      expect(typeof record.raw_output_path).toBe('string');
      expect(readFileSync(join(root, record.raw_output_path as string), 'utf8')).toBe(observed);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);

  test('host output policy is centralized and does not leak successful Codex stdout', () => {
    const root = fixture();
    try {
      const result = runHook({
        event: 'UserPromptSubmit',
        routeId: 'delegation',
        cwd: root,
        input: JSON.stringify({ prompt: 'implement the next task' }),
        env: env(root, 'codex'),
      });
      expect(result.handler).toBe('subagent');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);

  test('typed handlers do not consult a route filesystem or spawn a route child', () => {
    const root = fixture();
    try {
      const result = runHook({
        event: 'PostToolUse',
        routeId: 'always',
        cwd: root,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }),
        env: env(root),
      });
      expect(result.handler).toBe('trace-observer');
      const raw = readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim();
      const record = JSON.parse(raw) as { metrics: { child_processes: number }; steps: Array<{ execution: string }> };
      expect(record.metrics.child_processes).toBe(0);
      expect(record.steps.every((step) => step.execution === 'in_process')).toBe(true);
      expect(existsSync(join(root, '.ai/hooks'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);

  test('targeted commit-then-throw is a complete effect observation but incomplete metrics', () => {
    const root = fixture();
    try {
      const result = runHook({
        event: 'PostToolUse',
        routeId: 'edit',
        cwd: root,
        input: JSON.stringify({ tool_input: { file_path: 'src/example.ts' } }),
        env: env(root),
        afterEffectCommit: (phase) => {
          if (phase === 'journal') throw new Error('injected after journal commit');
        },
      });
      expect(result).toMatchObject({ exitCode: 1, reason: 'handler-failed', handler: 'mutation-observed' });
      const record: unknown = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim());
      expect(isHookEventTelemetryRecord(record)).toBe(true);
      if (!isHookEventTelemetryRecord(record)) throw new Error('record failed validation');
      expect(record.effect_observation).toMatchObject({
        contract_id: 'mutation-observed.durable-journal.v1',
        state: 'committed_complete',
        committed_phases: ['journal'],
        last_committed_phase: 'journal',
      });
      expect(record.measurement.complete).toBe(false);
      expect(record.measurement.incomplete_metrics).toContain('event_writes');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);

  test('handlers without an effect contract omit effect observation instead of claiming zero effects', () => {
    const root = fixture();
    try {
      runHook({
        event: 'PostToolUse',
        routeId: 'bash',
        cwd: root,
        input: JSON.stringify({ tool_input: { command: 'echo hello' }, tool_response: { stdout: 'hello\n', stderr: '', interrupted: false }, exit_code: 0 }),
        env: env(root),
      });
      const record = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim()) as Record<string, unknown>;
      expect(record).not.toHaveProperty('effect_observation');
      expect(isHookEventTelemetryRecord(record)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);

  test('failure before the first observed Stop commit is unknown-partial, not false zero', () => {
    const root = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'hrd09-stop-outside-'));
    try {
      symlinkSync(outside, join(root, '.ai/harness/handoff'));
      const result = runHook({
        event: 'Stop',
        routeId: 'default',
        cwd: root,
        input: JSON.stringify({ stop_hook_active: false }),
        env: env(root),
      });
      expect(result).toMatchObject({ exitCode: 1, reason: 'handler-failed', handler: 'stop' });
      const record: unknown = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim());
      expect(isHookEventTelemetryRecord(record)).toBe(true);
      if (!isHookEventTelemetryRecord(record)) throw new Error('record failed validation');
      expect(record.effect_observation).toMatchObject({ state: 'unknown_partial', committed_phases: [] });
      expect(record.measurement.complete).toBe(false);
      expect(record.measurement.incomplete_metrics).toContain('durable_writes');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30_000);

  test('bounded Stop overflow keeps public failure stable and marks reconciliation telemetry', () => {
    const root = fixture();
    try {
      const runEnv = { ...env(root), HOOK_RUN_ID: 'runtime-overflow-run' };
      const first = runHook({
        event: 'Stop', routeId: 'default', cwd: root,
        input: JSON.stringify({ stop_hook_active: false }), env: runEnv,
        afterEffectCommit: (phase) => {
          if (phase === 'event') throw new Error('fault after event');
        },
      });
      expect(first).toMatchObject({ exitCode: 1, reason: 'handler-failed', handler: 'stop' });
      const eventsPath = join(root, '.ai/harness/events.jsonl');
      writeFileSync(eventsPath, `${readFileSync(eventsPath, 'utf8')}${JSON.stringify({
        ts: '2026-08-14T08:00:30+0800', event_type: 'operator-event', reason: 'overflow', run_id: 'operator',
        extra: { payload: 'x'.repeat(2 * 1024 * 1024) },
      })}\n`);

      const retry = runHook({
        event: 'Stop', routeId: 'default', cwd: root,
        input: JSON.stringify({ stop_hook_active: false }), env: runEnv,
      });
      expect(retry).toMatchObject({ exitCode: 1, reason: 'handler-failed', handler: 'stop' });
      const records = readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8')
        .trim().split('\n').map((line) => JSON.parse(line));
      const record: unknown = records.at(-1);
      expect(isHookEventTelemetryRecord(record)).toBe(true);
      if (!isHookEventTelemetryRecord(record)) throw new Error('record failed validation');
      expect(record.result_reason).toBe('effect-reconcile-required');
      expect(record.effect_observation).toMatchObject({
        state: 'committed_partial',
        committed_phases: ['handoff', 'resume'],
        recovery: 'reconcile-required',
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);
});

describe('host envelopes on the real hook entry (#678)', () => {
  const HOOK_ENTRY = join(import.meta.dir, '../src/cli/hook-entry.ts');

  /** Registry-mode repo: `src/owned` belongs to `core-owned`; `feature` changed it after the manifest. */
  function owedFixture(): string {
    const root = fixture();
    const gitIn = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    writeFileSync(join(root, '.gitignore'), '.ai/harness/state/\n.ai/harness/runs/\n.ai/harness/handoff/\n.ai/harness/journal/\n.ai/harness/checks/\n.ai/harness/events.jsonl\nhome/\n');
    writeFileSync(join(root, '.ai/harness/policy.json'), `${JSON.stringify({ context: { capability_registry_file: '.ai/context/capabilities.json' } })}\n`);
    mkdirSync(join(root, '.ai/context'), { recursive: true });
    writeFileSync(join(root, '.ai/context/capabilities.json'), `${JSON.stringify({
      version: 1,
      capabilities: [{
        id: 'core-owned', domain: 'core', name: 'owned', prefixes: ['src/owned'],
        contract_files: { agents: 'AGENTS.md', claude: 'CLAUDE.md' },
        architecture_module: 'docs/architecture/modules/core/owned.md',
        workstream_dir: 'tasks/workstreams/core/owned', lsp_profile: 'typescript-lsp', verification_hints: [],
      }],
    })}\n`);
    mkdirSync(join(root, 'src/owned'), { recursive: true });
    mkdirSync(join(root, 'docs/architecture'), { recursive: true });
    writeFileSync(join(root, 'src/owned/a.ts'), 'export const a = 1;\n');
    writeFileSync(join(root, 'src/owned/a.test.ts'), 'export {};\n');
    writeFileSync(join(root, 'docs/architecture/.projection-manifest.json'), '{}\n');
    gitIn('add', '-A'); gitIn('commit', '-q', '-m', 'projected');
    gitIn('checkout', '-q', '-b', 'feature');
    writeFileSync(join(root, 'src/owned/a.ts'), 'export const a = 2;\n');
    gitIn('commit', '-q', '-am', 'change owned code');
    mkdirSync(join(root, 'home'), { recursive: true });
    return root;
  }

  /** The bytes the host reads from fd 1 and fd 2 of `repo-harness-hook`. */
  function host(root: string, hostName: 'claude' | 'codex', event: string, route: string, input: unknown) {
    const result = spawnSync(process.execPath, [HOOK_ENTRY, event, '--route', route], {
      cwd: root,
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: join(root, 'home'),
        HOOK_HOST: hostName, HOOK_REPO_ROOT: root, REPO_HARNESS_TOOLING_ADVISORY: '0',
      },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  function context(stdout: string, event: string): string {
    expect(stdout.endsWith('\n')).toBe(true);
    const envelope = JSON.parse(stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    expect(Object.keys(envelope)).toEqual(['hookSpecificOutput']);
    expect(envelope.hookSpecificOutput.hookEventName).toBe(event);
    return envelope.hookSpecificOutput.additionalContext;
  }

  test('edit, prompt, session and bash advisories reach both hosts as additionalContext', () => {
    const root = owedFixture();
    try {
      for (const hostName of ['claude', 'codex'] as const) {
        const edit = host(root, hostName, 'PreToolUse', 'edit', { tool_name: 'Edit', tool_input: { file_path: 'src/owned/a.ts' } });
        expect(edit.status).toBe(0);
        expect(context(edit.stdout, 'PreToolUse'))
          .toBe('[CapabilityOwner] src/owned/a.ts belongs to core-owned (docs/architecture/modules/core/owned.md).');

        const prompt = host(root, hostName, 'UserPromptSubmit', 'default', { prompt: '/check my branch' });
        expect(prompt.status).toBe(0);
        expect(context(prompt.stdout, 'UserPromptSubmit')).toContain('[ReviewAdvice]');

        const session = host(root, hostName, 'SessionStart', 'default', { session_id: `owed-${hostName}` });
        expect(session.status).toBe(0);
        const sessionContext = context(session.stdout, 'SessionStart');
        expect(sessionContext).toContain('[ArchitectureOwed]');
        expect(sessionContext).toContain('core-owned (docs/architecture/modules/core/owned.md)');

        const push = host(root, hostName, 'PostToolUse', 'bash', {
          tool_input: { command: 'git push origin feature' }, tool_response: { stdout: '', stderr: '' }, exit_code: 0,
        });
        expect(push.status).toBe(0);
        expect(context(push.stdout, 'PostToolUse')).toContain('repo-harness architecture-projection check --json');
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 120_000);

  test('PreToolUse.subagent keeps its updatedInput prompt rewrite on Claude and Codex', () => {
    const root = owedFixture();
    try {
      for (const hostName of ['claude', 'codex'] as const) {
        const spawn = host(root, hostName, 'PreToolUse', 'subagent', { tool_name: 'Agent', tool_input: { description: 'probe', prompt: 'inspect the repo' } });
        expect(spawn.status).toBe(0);
        const envelope = JSON.parse(spawn.stdout) as { hookSpecificOutput: Record<string, unknown> };
        expect(Object.keys(envelope)).toEqual(['hookSpecificOutput']);
        expect(envelope.hookSpecificOutput).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'allow' });
        expect(envelope.hookSpecificOutput).not.toHaveProperty('additionalContext');
        const updated = envelope.hookSpecificOutput.updatedInput as { description: string; prompt: string };
        expect(updated.description).toBe('probe');
        expect(updated.prompt.startsWith('inspect the repo')).toBe(true);
        expect(updated.prompt).toContain('[repo-harness:return-channel]');
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);

  test('Codex UserPromptSubmit.inbox writes its envelope unchanged', () => {
    const root = owedFixture();
    try {
      const sprintPath = 'plans/sprints/inbox.sprint.md';
      const taskCell = 'deliver the inbox envelope';
      const unitRef = 'plans/plan-inbox.md';
      const claimId = '44444444-4444-4444-8444-444444444444';
      mkdirSync(join(root, 'plans/sprints'), { recursive: true });
      writeFileSync(join(root, sprintPath), [
        '# Sprint: inbox', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
        '| # | ID | Status | Task | Mode | Acceptance | Plan |', '|---|---|---|---|---|---|---|',
        `| 1 | ${fixtureTaskId(taskCell)} | [ ] | ${taskCell} | contract | envelope | (pending) |`, '',
      ].join('\n'));
      execFileSync('git', ['add', sprintPath], { cwd: root });
      execFileSync('git', ['commit', '-q', '-m', 'task authority'], { cwd: root });
      const taskId = fixtureTaskId(taskCell);
      const taskRevision = deriveTaskRevision({ taskCell, taskId, modeCell: 'contract', acceptanceCell: 'envelope' });
      // The lease names the canonical worktree path, as the hook runtime resolves it.
      const worktree = realpathSync(root);
      const claimed = buildLeaseOwnerRecord({ claimId, taskId, taskRevision, sprintPath, targetRef: 'HEAD', generation: 1, sessionId: 'inbox-session', sourceWorktree: worktree });
      const bound = bindLeaseRecord(claimed, { claimId, executionWorktree: worktree, branch: 'feature', unitRef });
      if (!bound.ok) throw new Error(bound.error);
      createLeaseDirectory(root, taskId);
      writeLeaseOwnerDurably(root, taskId, bound.record);
      writeClaimTokenForBoundLease(root, { task_id: taskId, claim_id: claimId, worktree, sprint: sprintPath, task: taskCell, unit_ref: unitRef });
      writeFileSync(join(root, '.ai/harness/active-plan'), `${unitRef}\n`);
      sendTaskMessage({
        repo_root: root,
        canonical_source: { targetRef: 'HEAD', sprintPath },
        event: buildTaskMessageEvent({
          message_id: '66666666-6666-4666-8666-666666666666', task_id: taskId, task_revision: taskRevision,
          scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'inbox-test',
          sender_trust: 'local_operator', audience: 'owner', body: 'peer body for the owner', created_at: '2026-10-13T01:00:00.000Z', in_reply_to: null,
        }),
      });

      const inbox = host(root, 'codex', 'UserPromptSubmit', 'inbox', { prompt: 'continue' });
      expect(inbox.status).toBe(0);
      const inboxContext = context(inbox.stdout, 'UserPromptSubmit');
      // The handler's own envelope: the bounded untrusted block, not a second wrapper.
      expect(inboxContext.startsWith('[TaskInboxUntrustedPeerMessages]')).toBe(true);
      expect(inboxContext).toContain('peer body for the owner');
      expect(inboxContext).not.toContain('hookSpecificOutput');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);

  test('Stop: Claude gets one envelope per owed set; Codex Stop writes no bytes', () => {
    const root = owedFixture();
    try {
      const codex = host(root, 'codex', 'Stop', 'default', { stop_hook_active: false });
      expect(codex.status).toBe(0);
      expect(codex.stdout).toBe('');

      const claude = host(root, 'claude', 'Stop', 'default', { stop_hook_active: false });
      expect(claude.status).toBe(0);
      expect(context(claude.stdout, 'Stop')).toContain('[ArchitectureOwed]');
      expect(host(root, 'claude', 'Stop', 'default', { stop_hook_active: false }).stdout).toBe('');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);

  test('no owed line once the manifest changed later in the branch', () => {
    const root = owedFixture();
    try {
      writeFileSync(join(root, 'docs/architecture/.projection-manifest.json'), '{"refreshed":true}\n');
      execFileSync('git', ['commit', '-q', '-am', 'refresh the projection'], { cwd: root });
      for (const hostName of ['claude', 'codex'] as const) {
        const session = host(root, hostName, 'SessionStart', 'default', { session_id: `clear-${hostName}` });
        expect(session.status).toBe(0);
        expect(session.stdout).not.toContain('ArchitectureOwed');
        const push = host(root, hostName, 'PostToolUse', 'bash', {
          tool_input: { command: 'git commit -m done' }, tool_response: { stdout: '', stderr: '' }, exit_code: 0,
        });
        expect(push.stdout).toBe('');
      }
      expect(host(root, 'claude', 'Stop', 'default', { stop_hook_active: false }).stdout).toBe('');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);
});
