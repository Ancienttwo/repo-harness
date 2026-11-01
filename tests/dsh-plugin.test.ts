import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools';
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand';
import { createDshPlugin } from '../src/dsh/plugin';
import { guardDenialsProjection } from '../src/dsh/guard-denials';
import { GUARD_DENIED_ERROR_CODE, GUARD_DENIED_ERROR_NAME } from '../src/dsh/protocol';
import type { BridgeHookRequest } from '../src/cli/hook/bridge-client';
import { HookBridge } from '../src/cli/hook/bridge-client';
import type { BridgeHookOutput } from '../src/cli/hook/hook-protocol';
import type { HookEvent, RouteId } from '../src/cli/hook/route-registry';
import { commitAll, initGitRepo, tmpWorkspace } from './helpers/repo-fixture';

/**
 * Boundary test for the DSH Cordis plugin.
 *
 * The host pipeline is real: a real Cordis app mounts the real system-prompt
 * and tools services, and every tool call runs through the real
 * `tools/pre-execute` pipeline. The bridge transport and the agent fixture are
 * scripted, because this test owns the plugin's mapping, not DSH's loop.
 */

class ScriptedBridge extends HookBridge {
  readonly calls: BridgeHookRequest[] = [];

  constructor(private readonly respond: (request: BridgeHookRequest) => BridgeHookOutput | Promise<BridgeHookOutput>) {
    super({ host: 'dsh', codePrefix: 'DSH', entry: '/unused/hook-entry.js' });
  }

  override async call(request: BridgeHookRequest): Promise<BridgeHookOutput> {
    this.calls.push(request);
    return this.respond(request);
  }
}

function output(
  event: HookEvent,
  routeId: RouteId,
  override: Partial<BridgeHookOutput> = {},
): BridgeHookOutput {
  return {
    protocol: 1,
    event,
    route_id: routeId,
    exit_code: 0,
    reason: 'ok',
    decision: 'none',
    additional_context: null,
    system_message: null,
    diagnostics: '',
    ...override,
  };
}

interface SessionFixture {
  readonly id: string;
  readonly header: { readonly cwd: string };
  readonly surface: { readonly nodes: readonly number[] };
  eventAt(seq: number): unknown;
}

function agentFixture(): { session: SessionFixture } {
  const session: SessionFixture = {
    id: 'session-1',
    header: { cwd: '/repo' },
    surface: { nodes: [] },
    eventAt: () => undefined,
  };
  return { session };
}

async function setup(respond: (request: BridgeHookRequest) => BridgeHookOutput | Promise<BridgeHookOutput>) {
  const bridge = new ScriptedBridge(respond);
  const app = new Context();
  await app.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
  await app.plugin(ToolRuntime, { mode: 'native' });
  await app.plugin(createDshPlugin({ bridge }));
  let ran = 0;
  for (const name of ['write', 'edit', 'bash'] as const) {
    app.tools.register(defineTool({
      name,
      description: `${name} fixture`,
      parameters: { file_path: { type: 'string' }, content: { type: 'string' }, command: { type: 'string' } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { ran += 1; return name; },
    }));
  }
  return { app, bridge, agent: agentFixture(), ran: () => ran };
}

function step(app: Context, agent: ReturnType<typeof agentFixture>, turn = 1, stepNumber = 1) {
  const payload = { agent, messages: [], turn, step: stepNumber, signal: new AbortController().signal };
  return app.waterfall('agent/pre-step', payload as never, async () => ({ kind: 'enter', messages: [] }));
}

interface EnteredStep {
  readonly messages: ReadonlyArray<{ readonly source: { readonly kind: string }; readonly content: unknown }>;
}

function entered(decision: unknown): EnteredStep {
  if (!decision || typeof decision !== 'object' || (decision as { kind?: unknown }).kind !== 'enter') {
    throw new Error('expected an enter decision');
  }
  return decision as EnteredStep;
}

function run(app: Context, name: 'write' | 'edit' | 'bash', args: Record<string, unknown>, agent: ReturnType<typeof agentFixture>) {
  return app.tools.execute({
    callId: `${name}-call` as ToolCallId,
    name,
    arguments: args,
    agent: agent as never,
    signal: new AbortController().signal,
  });
}

describe('DSH plugin', () => {
  test('denies a protected write before the tool body runs', async () => {
    const harness = await setup((request) => request.event === 'PreToolUse'
      ? output('PreToolUse', 'edit', { decision: 'block', exit_code: 2, reason: 'blocked', diagnostics: 'protected path' })
      : output(request.event, request.routeId));
    await step(harness.app, harness.agent);

    const result = await run(harness.app, 'write', { file_path: '/repo/a.ts', content: 'x' }, harness.agent);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('protected path');
    expect((result as { error?: { info?: unknown } }).error?.info).toEqual({
      name: GUARD_DENIED_ERROR_NAME, code: GUARD_DENIED_ERROR_CODE, reason: 'protected path',
    });
    expect(harness.ran()).toBe(0);
    const guard = harness.bridge.calls.find((call) => call.event === 'PreToolUse');
    expect(guard?.routeId).toBe('edit');
    expect(guard?.payload).toMatchObject({ tool_name: 'Write', tool_input: { file_path: '/repo/a.ts', content: 'x' } });
  });

  test('allows an edit when the hook allows it', async () => {
    const harness = await setup((request) => output(request.event, request.routeId, { decision: 'allow' }));
    await step(harness.app, harness.agent);

    const result = await run(harness.app, 'edit', { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' }, harness.agent);

    expect(result.isError).toBe(false);
    expect(harness.ran()).toBe(1);
    const guard = harness.bridge.calls.find((call) => call.event === 'PreToolUse');
    expect(guard?.payload).toMatchObject({ tool_name: 'Edit', tool_input: { file_path: '/repo/a.ts', new_string: 'b' } });
  });

  test('maps bash to the Bash guard', async () => {
    const harness = await setup((request) => output(request.event, request.routeId));
    await step(harness.app, harness.agent);

    await run(harness.app, 'bash', { command: 'touch /tmp/x' }, harness.agent);

    const guard = harness.bridge.calls.find((call) => call.event === 'PreToolUse');
    expect(guard?.routeId).toBe('bash');
    expect(guard?.payload).toMatchObject({ tool_name: 'Bash', tool_input: { command: 'touch /tmp/x' } });
  });

  test('fails a protected write closed when the bridge rejects', async () => {
    const harness = await setup((request) => {
      if (request.event === 'PreToolUse') throw new Error('DSH_HOOK_TIMEOUT');
      return output(request.event, request.routeId);
    });
    await step(harness.app, harness.agent);

    const result = await run(harness.app, 'write', { file_path: '/repo/a.ts', content: 'x' }, harness.agent);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('DSH_HOOK_TIMEOUT');
    expect(harness.ran()).toBe(0);
  });

  test('rejects a write without a target path', async () => {
    const harness = await setup((request) => output(request.event, request.routeId));
    await step(harness.app, harness.agent);

    const result = await run(harness.app, 'write', { content: 'x' }, harness.agent);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('DSH_HOOK_INVALID_INPUT');
    expect(harness.ran()).toBe(0);
  });

  test('rejects a write before the session context is ready', async () => {
    const harness = await setup((request) => output(request.event, request.routeId));

    const result = await run(harness.app, 'write', { file_path: '/repo/a.ts', content: 'x' }, harness.agent);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('DSH_HOOK_SESSION_NOT_READY');
    expect(harness.ran()).toBe(0);
  });

  test('does not guard a non-opt-in repository', async () => {
    const harness = await setup((request) => output(request.event, request.routeId, {
      reason: request.event === 'SessionStart' ? 'non-opt-in' : 'ok',
    }));
    await step(harness.app, harness.agent);

    const result = await run(harness.app, 'write', { file_path: '/repo/a.ts', content: 'x' }, harness.agent);

    expect(result.isError).toBe(false);
    expect(harness.ran()).toBe(1);
    expect(harness.bridge.calls.some((call) => call.event === 'PreToolUse')).toBe(false);
  });

  test('reports a missing hook entry as unavailable and blocks writes', async () => {
    const app = new Context();
    await app.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
    await app.plugin(ToolRuntime, { mode: 'native' });
    await app.plugin(createDshPlugin({ hookEntry: '/no/such/hook-entry.js' }));
    let ran = 0;
    app.tools.register(defineTool({
      name: 'write', description: 'fixture',
      parameters: { file_path: { type: 'string' }, content: { type: 'string' } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { ran += 1; return 'ok'; },
    }));
    const agent = agentFixture();
    await step(app, agent);

    const result = await run(app, 'write', { file_path: '/repo/a.ts', content: 'x' }, agent);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('DSH_HOOK_ENTRY_MISSING');
    expect(ran).toBe(0);
  });

  test('injects SessionStart context once and the inbox notice once per turn', async () => {
    const harness = await setup((request) => output(request.event, request.routeId, {
      additional_context: request.event === 'SessionStart' ? 'standing context' : request.event === 'UserPromptSubmit' ? 'inbox notice' : null,
    }));
    const first = await step(harness.app, harness.agent, 1, 1);
    const sameTurn = await step(harness.app, harness.agent, 1, 2);
    const nextTurn = await step(harness.app, harness.agent, 2, 1);

    const firstMessages = entered(first).messages.filter((message) => message.source.kind === 'repo-harness');
    expect(firstMessages).toHaveLength(1);
    expect(firstMessages[0]?.content).toEqual([{ type: 'text', text: 'standing context\n\ninbox notice' }]);
    expect(entered(sameTurn).messages.filter((message) => message.source.kind === 'repo-harness')).toHaveLength(0);
    expect(entered(nextTurn).messages.filter((message) => message.source.kind === 'repo-harness')).toHaveLength(1);
    expect(harness.bridge.calls.filter((call) => call.event === 'SessionStart')).toHaveLength(1);
  });

  test('skips SessionStart when the restored session already carries the context', async () => {
    const harness = await setup((request) => output(request.event, request.routeId));
    const session = harness.agent.session as unknown as { surface: { nodes: number[] }; eventAt(seq: number): unknown };
    session.surface.nodes = [1];
    session.eventAt = () => ({ type: 'user/message', data: { source: { kind: 'repo-harness' } } });

    const decision = await step(harness.app, harness.agent);

    expect(entered(decision).messages).toHaveLength(0);
  });

  test('runs the real hook entry against an opted-in repository', async () => {
    const workspace = tmpWorkspace('dsh-real-hook');
    const root = join(workspace, 'repo');
    mkdirSync(join(root, '_ops'), { recursive: true });
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    writeFileSync(join(root, '_ops/x'), 'protected\n');
    writeFileSync(join(root, 'normal.txt'), 'original\n');
    writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
    writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
    initGitRepo(root);
    commitAll(root, 'DSH fixture');
    try {
      const app = new Context();
      await app.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
      await app.plugin(ToolRuntime, { mode: 'native' });
      await app.plugin(createDshPlugin({ hookEntry: join(import.meta.dir, '../dist/hook-entry.js') }));
      let ran = 0;
      app.tools.register(defineTool({
        name: 'write', description: 'fixture',
        parameters: { file_path: { type: 'string' }, content: { type: 'string' } },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        async execute() { ran += 1; return 'ok'; },
      }));
      const session = {
        id: 'real-hook', header: { cwd: root }, surface: { nodes: [] as number[] }, eventAt: () => undefined,
      };
      const agent = { session };
      await app.waterfall('agent/pre-step', {
        agent, messages: [], turn: 1, step: 1, signal: new AbortController().signal,
      } as never, async () => ({ kind: 'enter', messages: [] }));

      const denied = await run(app, 'write', { file_path: join(root, '_ops/x'), content: 'changed' }, agent);
      expect(denied.isError).toBe(true);
      expect(ran).toBe(0);

      const allowed = await run(app, 'write', { file_path: join(root, 'normal.txt'), content: 'changed' }, agent);
      expect(allowed.isError).toBe(false);
      expect(ran).toBe(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('records Stop with the turn cancellation state', async () => {
    const harness = await setup((request) => output(request.event, request.routeId));
    await step(harness.app, harness.agent);
    const controller = new AbortController();
    controller.abort();

    await harness.app.serial('agent/turn-stopping', { agent: harness.agent, turn: 1, signal: controller.signal } as never);

    const stop = harness.bridge.calls.find((call) => call.event === 'Stop');
    expect(stop?.routeId).toBe('default');
    expect(stop?.payload).toMatchObject({ session_id: 'session-1', aborted: true });
  });

  test('projects denied calls from DSH tool events and skips other failures', async () => {
    const harness = await setup((request) => request.event === 'PreToolUse'
      ? output('PreToolUse', 'edit', { decision: 'block', exit_code: 2, reason: 'blocked', diagnostics: 'protected path' })
      : output(request.event, request.routeId));
    await step(harness.app, harness.agent);
    const denied = await run(harness.app, 'write', { file_path: '/repo/a.ts', content: 'x' }, harness.agent);
    // Labeled fixture: DSH's agent loop logs the call and the result with these fields.
    const events = [
      { type: 'tool/call', data: { turn: 1, step: 1, callId: 'write-call', name: 'write', arguments: '{}' } },
      { type: 'tool/call', data: { turn: 1, step: 1, callId: 'bash-call', name: 'bash', arguments: '{}' } },
      { type: 'tool/result', data: { turn: 1, step: 1, message: { toolCallId: 'write-call' }, error: (denied as { error?: { info?: unknown } }).error?.info } },
      { type: 'tool/result', data: { turn: 1, step: 1, message: { toolCallId: 'bash-call' }, error: { name: 'Error', code: 'EXIT_1', reason: 'exit 1' } } },
    ];
    let state = guardDenialsProjection.init();
    for (const event of events) state = guardDenialsProjection.apply(state, event as never);

    expect(guardDenialsProjection.wire.view(state)).toEqual([{ call_id: 'write-call', tool: 'write', reason: 'protected path' }]);
    expect(state.pending).toEqual({});
    expect(guardDenialsProjection.apply(state, { type: 'turn/start', data: {} } as never)).toBe(state);
    expect(guardDenialsProjection.stateSchema.parse(state)).toEqual(state);
  });

  test('bundle patch row matches the package wiring and the bundle name', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: string } };
    };
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml');
    const patch = readFileSync(join(import.meta.dir, '../cordis.patch.yml'), 'utf8');
    expect(patch).toContain('id: repo-harness');
    expect(patch).toContain("'./dist/dsh/plugin.js'");
    const nested = JSON.parse(readFileSync(join(import.meta.dir, '../src/dsh/package.dist.json'), 'utf8')) as {
      exports?: Record<string, string>;
      dsh?: { client?: { platform?: string } };
    };
    expect(nested.exports?.['.']).toBe('./plugin.js');
    expect(nested.exports?.['./client']).toBe('./client.js');
    expect(nested.dsh?.client?.platform).toBe('web');
  });
});
