import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import {
  createAgentSession, createCodemodeExtension, DefaultResourceLoader, getPackageDir,
  ModelRuntime, SessionManager, SettingsManager, VERSION,
  type AgentSession, type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, type AssistantMessage, type ToolCall } from '@earendil-works/pi-ai';
import { probePiCapability, type PiCapability } from '../src/pi/compat';
import { registerPiHooks } from '../src/pi/extension';
import {
  PiHookBridge, piHookEnvironment, PI_HOOK_INPUT_BYTES, PI_HOOK_OUTPUT_BYTES, type PiHookRequest,
} from '../src/pi/hook-bridge';
import type { PiHookOutput } from '../src/cli/hook/hook-protocol';
import { commitAll, initGitRepo, tmpWorkspace } from './helpers/repo-fixture';
import { writeNoticeRegistry } from './helpers/agent-notice';

const buildRoot = tmpWorkspace('pi-hook-bundle');
// test:files builds dist/hook-entry.js before this file. Exercise the same-package default.
afterAll(() => rmSync(buildRoot, { recursive: true, force: true }));

class ObservedBridge extends PiHookBridge {
  readonly requests: PiHookRequest[] = [];
  readonly outputs: PiHookOutput[] = [];
  override async call(request: PiHookRequest): Promise<PiHookOutput> {
    this.requests.push(request);
    const output = await super.call(request);
    this.outputs.push(output);
    return output;
  }
}

function assistant(content: AssistantMessage['content'] = [], stopReason: AssistantMessage['stopReason'] = 'stop'): AssistantMessage {
  return {
    role: 'assistant', content, api: 'openai-completions', provider: 'scripted-fixture', model: 'fixture',
    stopReason, timestamp: Date.now(), usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

async function fixture(options: {
  optIn?: boolean;
  probe?: () => Promise<PiCapability>;
  bridge?: (env: NodeJS.ProcessEnv) => ObservedBridge;
  mode?: 'print' | 'json' | 'rpc';
  nativeEntry?: boolean;
} = {}) {
  const workspace = tmpWorkspace('pi-sdk-fixture');
  const root = join(workspace, 'repo');
  const home = join(workspace, 'home');
  const agentDir = join(home, '.pi/agent');
  mkdirSync(root, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  initGitRepo(root);
  mkdirSync(join(root, '_ops'));
  writeFileSync(join(root, '_ops/x'), 'protected original\n');
  writeFileSync(join(root, 'normal.txt'), 'original\n');
  writeFileSync(join(root, '.gitignore'), '_ops/\n.ai/harness/state/\n.ai/harness/runs/\n.ai/harness/handoff/\n');
  if (options.optIn !== false) {
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
    writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  }
  commitAll(root, 'SDK fixture');
  const bin = join(home, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'repo-harness-hook'), '#!/bin/sh\n: > "$HOME/decoy-ran"\nexit 99\n');
  chmodSync(join(bin, 'repo-harness-hook'), 0o755);
  const env = { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agentDir,
    PATH: `${bin}${delimiter}${process.env.PATH}`, HOOK_HOST: 'codex', HOOK_REPO_ROOT: '/stale-root', REPO_HARNESS_RUN_ID: 'stale-run' };
  const bridges: ObservedBridge[] = [];
  const script: AssistantMessage[] = [];
  const providerContexts: unknown[] = [];
  let waitingForAbort: (() => void) | undefined;
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false });
  // Scripted provider fixture. The real SDK and tools execute every requested call.
  modelRuntime.registerProvider('scripted-fixture', {
    api: 'openai-completions', apiKey: 'fixture-only', baseUrl: 'http://127.0.0.1:1',
    models: [{ id: 'fixture', name: 'Scripted fixture', reasoning: false, input: ['text'],
      contextWindow: 200_000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    streamSimple: (_model, context, streamOptions) => {
      providerContexts.push(context);
      const stream = createAssistantMessageEventStream();
      if (waitingForAbort) {
        const abort = () => stream.push({ type: 'error', reason: 'aborted', error: assistant([], 'aborted') });
        streamOptions?.signal?.addEventListener('abort', abort, { once: true });
        waitingForAbort();
        if (streamOptions?.signal?.aborted) abort();
      } else {
        const message = script.shift() ?? assistant([{ type: 'text', text: 'fixture done' }]);
        stream.push({ type: 'start', partial: message });
        stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'toolUse', message });
      }
      return stream;
    },
  });
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const loader = new DefaultResourceLoader({
    cwd: root, agentDir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true,
    noThemes: true, noContextFiles: true,
    additionalExtensionPaths: options.nativeEntry ? [join(import.meta.dir, '../src/pi/extension.ts')] : [],
    extensionFactories: [
      ...(options.nativeEntry ? [] : [(pi: ExtensionAPI) => registerPiHooks(pi, {
        probe: options.probe,
        bridge: () => {
          const bridge = options.bridge?.(env) ?? new ObservedBridge({ env });
          bridges.push(bridge);
          return bridge;
        },
      })]),
      createCodemodeExtension({ models: false }),
    ],
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  const { session } = await createAgentSession({
    cwd: root, agentDir, modelRuntime, model: modelRuntime.getModel('scripted-fixture', 'fixture'),
    sessionManager: SessionManager.inMemory(root), settingsManager, resourceLoader: loader,
    tools: ['edit', 'write', 'bash', 'codemode'], thinkingLevel: 'off',
  });
  await session.bindExtensions({ mode: options.mode ?? 'print' });
  let counter = 0;
  return {
    root, home, session, bridges, providerContexts,
    async tool(name: string, args: ToolCall['arguments']) {
      const id = `fixture-${++counter}`;
      script.push(assistant([{ type: 'toolCall', id, name, arguments: args }], 'toolUse'));
      await session.prompt('Run the scripted fixture tool.', { expandPromptTemplates: false });
      const result = session.messages.find(message => message.role === 'toolResult' && message.toolCallId === id);
      if (!result || result.role !== 'toolResult') throw new Error(`SDK tool result missing: ${id}`);
      return result;
    },
    async abort() {
      const ready = new Promise<void>(resolve => { waitingForAbort = resolve; });
      const run = session.prompt('Wait for fixture cancellation.', { expandPromptTemplates: false });
      await ready;
      await session.abort();
      await run;
      waitingForAbort = undefined;
    },
    async close() {
      await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
      session.dispose();
      for (const bridge of bridges) bridge.close();
      rmSync(workspace, { recursive: true, force: true });
    },
  };
}

function records(root: string): Record<string, unknown>[] {
  return readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
}
function customMessages(session: AgentSession) {
  return session.messages.filter(message => message.role === 'custom' && message.customType === 'repo-harness');
}

describe('Pi real SDK with scripted provider fixture', () => {
  test('normal tools pass; protected direct and codemode writes keep their bytes', async () => {
    const f = await fixture();
    try {
      expect((await f.tool('write', { path: 'new.txt', content: 'new bytes\n' })).isError).toBe(false);
      expect(readFileSync(join(f.root, 'new.txt'), 'utf8')).toBe('new bytes\n');
      expect((await f.tool('edit', { path: '@normal.txt', oldText: 'original', newText: 'edited' })).isError).toBe(false);
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('edited\n');
      for (const [name, args] of [
        ['write', { path: '_ops/x', content: 'forbidden' }],
        ['edit', { path: '_ops/x', oldText: 'protected original', newText: 'forbidden' }],
        ['bash', { command: 'printf forbidden > _ops/x' }],
        ['codemode', { code: 'await tools.write({path: "_ops/x", content: "forbidden"});' }],
      ] as const) {
        const result = await f.tool(name, args);
        expect(result.isError, `${name}: ${JSON.stringify(result)}`).toBe(true);
        expect(JSON.stringify(result)).toContain('OpsPrivateGuard');
        expect(readFileSync(join(f.root, '_ops/x'), 'utf8')).toBe('protected original\n');
      }
      const requests = f.bridges.flatMap(bridge => bridge.requests);
      const nested = requests.find(request => request.payload.parent_tool_call_id !== null && request.payload.parent_tool_call_id !== undefined);
      expect(nested?.payload).toMatchObject({ tool_name: 'Write', tool_call_id: 'fixture-6/1', parent_tool_call_id: 'fixture-6' });
      expect(nested?.payload.tool_input).toEqual({ file_path: join(f.root, '_ops/x') });
      const toolRecords = records(f.root).filter(record => record.event === 'PreToolUse');
      expect(toolRecords).toHaveLength(6);
      expect(toolRecords.every(record => record.host === 'pi' && record.session_id === f.session.sessionManager.getSessionId())).toBe(true);
      expect(new Set(toolRecords.map(record => record.run_id)).size).toBe(6);
      expect(toolRecords.filter(record => record.blocked)).toHaveLength(4);
      expect(existsSync(join(f.home, 'decoy-ran'))).toBe(false);
    } finally { await f.close(); }
  });

  test('context is hidden and delivered once per session; inbox notices reach the model', async () => {
    const f = await fixture();
    try {
      // Adopt registry context after SessionStart, so inbox owns the new status notice.
      writeNoticeRegistry(f.root);
      writeFileSync(join(f.root, '.ai/harness/policy.json'), JSON.stringify({ context: { capability_source: 'registry' } }));
      await f.tool('write', { path: 'first.txt', content: 'one' });
      await f.tool('write', { path: 'second.txt', content: 'two' });
      const messages = customMessages(f.session);
      expect(messages.every(message => message.role === 'custom' && message.display === false)).toBe(true);
      expect(messages.filter(message => JSON.stringify(message).includes('[HarnessState]'))).toHaveLength(1);
      const bridge = f.bridges[0]!;
      expect(bridge.requests.filter(request => request.event === 'SessionStart')).toHaveLength(1);
      expect(bridge.requests.filter(request => request.event === 'UserPromptSubmit')).toHaveLength(2);
      const notice = bridge.outputs.find(output => output.event === 'UserPromptSubmit' && output.additional_context);
      expect(notice?.additional_context).toContain('[Architecture]');
      expect(JSON.stringify(f.providerContexts)).toContain(notice!.additional_context!);
      await f.session.extensionRunner.emit({ type: 'session_shutdown', reason: 'reload' });
      await f.session.extensionRunner.emit({ type: 'session_start', reason: 'reload' });
      await f.tool('write', { path: 'after-reload.txt', content: 'three' });
      expect(customMessages(f.session).filter(message => JSON.stringify(message).includes('[HarnessState]'))).toHaveLength(2);
      expect(f.bridges).toHaveLength(2);
    } finally { await f.close(); }
  });

  test('agent_settled passes aborted and renders the Stop recovery views', async () => {
    const f = await fixture();
    try {
      await f.tool('write', { path: 'normal.txt', content: 'complete' });
      await f.abort();
      const stops = f.bridges.flatMap(bridge => bridge.requests).filter(request => request.event === 'Stop');
      expect(stops.map(request => request.payload.aborted)).toEqual([false, true]);
      expect(records(f.root).filter(record => record.event === 'Stop')).toHaveLength(2);
      expect(existsSync(join(f.root, '.ai/harness/handoff/current.md'))).toBe(true);
      expect(existsSync(join(f.root, '.ai/harness/handoff/resume.md'))).toBe(true);
    } finally { await f.close(); }
  });

  test.each(['print', 'json', 'rpc'] as const)('%s mode blocks without UI or hook stdout', async (mode) => {
    const f = await fixture({ mode });
    const stdout: string[] = [];
    const capture = spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { stdout.push(String(chunk)); return true; });
    try {
      expect(f.session.extensionRunner.hasUI()).toBe(false);
      expect((await f.tool('write', { path: '_ops/x', content: 'forbidden' })).isError).toBe(true);
      expect(readFileSync(join(f.root, '_ops/x'), 'utf8')).toBe('protected original\n');
      expect(stdout.join('')).toBe('');
    } finally { capture.mockRestore(); await f.close(); }
  });

  test.each([
    ['old version', () => probePiCapability('1.3.9', getPackageDir()), 'PI_HOST_UNSUPPORTED_VERSION'],
    ['missing resolver', () => probePiCapability(VERSION, getPackageDir(), async () => ({})), 'PI_HOST_PATH_RESOLVER_UNAVAILABLE'],
  ] as const)('%s is unavailable and blocks each mutation tool', async (_name, probe, code) => {
    const f = await fixture({ probe });
    try {
      for (const [name, args] of [
        ['write', { path: '_ops/x', content: 'forbidden' }],
        ['edit', { path: '_ops/x', oldText: 'protected original', newText: 'forbidden' }],
        ['bash', { command: 'printf forbidden > _ops/x' }],
      ] as const) {
        const result = await f.tool(name, args);
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result)).toContain(code);
      }
      expect(readFileSync(join(f.root, '_ops/x'), 'utf8')).toBe('protected original\n');
      expect(f.bridges.flatMap(bridge => bridge.requests)).toHaveLength(0);
      expect(JSON.stringify(customMessages(f.session))).toContain(code);
    } finally { await f.close(); }
  });

  test('a repository without the opt-in marker is inactive and calls no hooks or probe', async () => {
    let probes = 0;
    const f = await fixture({ optIn: false, probe: async () => { probes++; throw new Error('must not probe'); } });
    try {
      expect((await f.tool('write', { path: '_ops/x', content: 'inactive write' })).isError).toBe(false);
      expect(readFileSync(join(f.root, '_ops/x'), 'utf8')).toBe('inactive write');
      expect(probes).toBe(0);
      expect(f.bridges.flatMap(bridge => bridge.requests)).toHaveLength(0);
      expect(customMessages(f.session)).toHaveLength(0);
    } finally { await f.close(); }
  });

  test('the package entry loads through the real SDK extension loader', async () => {
    const f = await fixture({ nativeEntry: true });
    try {
      expect(f.session.extensionRunner.getExtensionPaths()).toContain(join(import.meta.dir, '../src/pi/extension.ts'));
      expect((await f.tool('write', { path: 'normal.txt', content: 'native entry' })).isError).toBe(false);
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('native entry');
      expect((await f.tool('write', { path: '_ops/x', content: 'forbidden' })).isError).toBe(true);
      expect(readFileSync(join(f.root, '_ops/x'), 'utf8')).toBe('protected original\n');
      expect(records(f.root).some(record => record.host === 'pi' && record.blocked === true)).toBe(true);
    } finally { await f.close(); }
  });

  test('a late tool result from the prior runtime cannot admit a write after reload', async () => {
    let reached!: () => void;
    let release!: () => void;
    const ready = new Promise<void>(resolve => { reached = resolve; });
    const delayed = new Promise<void>(resolve => { release = resolve; });
    class DelayedBridge extends ObservedBridge {
      override async call(request: PiHookRequest) {
        const output = await super.call(request);
        if (request.event === 'PreToolUse') { reached(); await delayed; }
        return output;
      }
    }
    const f = await fixture({ bridge: env => new DelayedBridge({ env }) });
    try {
      await f.session.extensionRunner.emitBeforeAgentStart({ messageType: 'user', prompt: 'old run' }, { cwd: f.root });
      const pending = f.session.extensionRunner.emitToolCall({ type: 'tool_call', toolCallId: 'old-call',
        toolName: 'write', input: { path: 'normal.txt', content: 'late' } });
      await ready;
      await f.session.extensionRunner.emit({ type: 'session_shutdown', reason: 'reload' });
      await f.session.extensionRunner.emit({ type: 'session_start', reason: 'reload' });
      release();
      expect(await pending).toEqual({ block: true, reason: 'PI_HOOK_STALE_SESSION' });
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('original\n');
      await f.tool('write', { path: 'normal.txt', content: 'new runtime' });
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('new runtime');
    } finally { release(); await f.close(); }
  });
});

describe('Pi hook child boundary', () => {
  function childScript(code: string): string {
    const entry = join(buildRoot, `fixture-${crypto.randomUUID()}.js`);
    writeFileSync(entry, code);
    return entry;
  }
  const request: PiHookRequest = { event: 'PreToolUse', routeId: 'edit', cwd: buildRoot, payload: {} };
  const wire: PiHookOutput = { protocol: 1, event: 'PreToolUse', route_id: 'edit', exit_code: 0, reason: 'ok',
    decision: 'none', additional_context: null, system_message: null, diagnostics: '' };

  test('identity environment is removed; unrelated values remain', async () => {
    const env = piHookEnvironment({ PATH: '/bin', HOOK_HOST: 'codex', HOOK_REPO_ROOT: '/other', HOOK_SESSION_ID: 'stale',
      REPO_HARNESS_RUN_ID: 'stale', REPO_HARNESS_HOME: '/other-home', HOME: '/tmp/fixture-home' });
    expect(env).toEqual({ PATH: '/bin', HOME: '/tmp/fixture-home', HOOK_HOST: 'pi' });
    const entry = childScript(`process.stdin.resume(); process.stdin.on('end', () => console.log(JSON.stringify(${JSON.stringify(wire)})));`);
    const bridge = new PiHookBridge({ entry });
    try { expect(await bridge.call(request)).toEqual(wire); } finally { bridge.close(); }
  });

  test.each([
    ['invalid JSON', 'console.log("not json")', 'PI_HOOK_INVALID_OUTPUT'],
    ['multiple objects', 'console.log("{}\\n{}")', 'PI_HOOK_INVALID_OUTPUT'],
    ['protocol mismatch', `console.log(${JSON.stringify(JSON.stringify({ ...wire, protocol: 2 }))})`, 'PI_HOOK_PROTOCOL_MISMATCH'],
    ['wrong route', `console.log(${JSON.stringify(JSON.stringify({ ...wire, route_id: 'bash' }))})`, 'PI_HOOK_INVALID_OUTPUT'],
    ['exit mismatch', `console.log(${JSON.stringify(JSON.stringify({ ...wire, exit_code: 2 }))})`, 'PI_HOOK_INVALID_OUTPUT'],
    ['bridge crash', 'process.exit(1)', 'PI_HOOK_INVALID_OUTPUT'],
    ['stdout limit', `process.stdout.write('x'.repeat(${PI_HOOK_OUTPUT_BYTES + 1}))`, 'PI_HOOK_OUTPUT_LIMIT'],
  ])('%s fails closed', async (_name, code, reason) => {
    const entry = childScript(`await Bun.stdin.text(); ${code};`);
    const f = await fixture({ bridge: env => new ObservedBridge({ entry, env }) });
    try {
      const result = await f.tool('write', { path: 'normal.txt', content: 'must not write' });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain(reason);
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('original\n');
    } finally { await f.close(); }
  });

  test('a timeout kills only its child and does not retry', async () => {
    const entry = childScript('await Bun.stdin.text(); setInterval(() => {}, 1000);');
    const f = await fixture({ bridge: env => new ObservedBridge({ entry, env, timeoutMs: 100 }) });
    try {
      const result = await f.tool('bash', { command: 'printf forbidden > normal.txt' });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('PI_HOOK_TIMEOUT');
      expect(f.bridges.flatMap(bridge => bridge.requests).filter(item => item.event === 'PreToolUse')).toHaveLength(1);
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('original\n');
    } finally { await f.close(); }
  });

  test('input limit is checked before spawning; shutdown cancels and remains idempotent', async () => {
    const bridge = new PiHookBridge({ bun: '/no-such-bun' });
    await expect(bridge.call({ ...request, payload: { text: 'x'.repeat(PI_HOOK_INPUT_BYTES) } })).rejects.toThrow('PI_HOOK_INPUT_LIMIT');
    const child = new PiHookBridge({ entry: childScript('setInterval(() => {}, 1000);') });
    const pending = child.call(request).then(() => null, error => error as Error);
    child.close();
    child.close();
    expect((await pending)?.message).toBe('PI_HOOK_CANCELLED');
    await expect(child.call(request)).rejects.toThrow('PI_HOOK_CANCELLED');
  });

  test('a missing Bun binary blocks execution', async () => {
    const f = await fixture({ bridge: env => new ObservedBridge({ bun: '/no-such-bun', env }) });
    try {
      const result = await f.tool('edit', { path: 'normal.txt', oldText: 'original', newText: 'forbidden' });
      expect(result.isError).toBe(true);
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('original\n');
    } finally { await f.close(); }
  });

  test('an updated input blocks with the fixed unsupported code', async () => {
    const entry = childScript(`await Bun.stdin.text(); console.log(${JSON.stringify(JSON.stringify({ ...wire, updated_input: { path: 'elsewhere' } }))});`);
    const f = await fixture({ bridge: env => new ObservedBridge({ entry, env }) });
    try {
      const result = await f.tool('write', { path: 'normal.txt', content: 'must not write' });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('PI_HOST_UPDATED_INPUT_UNSUPPORTED');
      expect(readFileSync(join(f.root, 'normal.txt'), 'utf8')).toBe('original\n');
    } finally { await f.close(); }
  });
});
