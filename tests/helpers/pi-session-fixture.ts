import { createAgentSession, createCodemodeExtension, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
  type ToolCallEvent } from '@earendil-works/pi-coding-agent';
import { fauxAssistantMessage, fauxProvider, fauxToolCall, InMemoryCredentialStore, type JsonObject } from '@earendil-works/pi-ai';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import repoHarnessPi from '../../src/pi/extension';
import { readPendingPostEditEvents } from '../../src/cli/hook/mutation-observed';

// A scripted provider drives the real Pi session, tools, codemode and extension runner.
// This fixture proves the tool boundary. It does not claim live-provider acceptance.
const cwd = process.cwd();
const mode = process.argv[2] ?? 'pipeline';
const repoRoot = mode === 'paths' ? dirname(cwd) : cwd;
const agentDir = join(process.env.HOME!, '.pi/agent');
const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: 'off' });
const calls: Array<{ name: string; id: string; parent: string | null }> = [];
const errors: string[] = [];
const journalPaths: string[] = [];
const resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager,
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  extensionFactories: [repoHarnessPi, createCodemodeExtension({ models: false }), pi => {
    pi.on('tool_call', (event: ToolCallEvent) => { calls.push({ name: event.toolName, id: event.toolCallId, parent: event.parentToolCallId ?? null }); });
    pi.on('tool_result', () => { journalPaths.push(...readPendingPostEditEvents(repoRoot).flatMap(event => event.changed_paths)); });
  }],
});
await resourceLoader.reload();
if (resourceLoader.getExtensions().errors.length) throw new Error(JSON.stringify(resourceLoader.getExtensions().errors));
const provider = fauxProvider();
const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
modelRuntime.registerNativeProvider(provider.provider);
const sessionManager = mode === 'resume' || mode === 'fork'
  ? SessionManager.create(cwd, join(agentDir, 'sessions')) : SessionManager.inMemory(cwd);
let { session } = await createAgentSession({ cwd, agentDir, settingsManager, resourceLoader, modelRuntime,
  model: provider.getModel(), thinkingLevel: 'off', sessionManager, tools: ['edit', 'write', 'bash', 'codemode'],
});
const sessionIds = [session.sessionId];
await session.bindExtensions({ onError: event => { errors.push(event.error); } });
const prompt = async (name: string, input: JsonObject, id: string) => {
  provider.setResponses([fauxAssistantMessage(fauxToolCall(name, input, { id }), { stopReason: 'toolUse' }), fauxAssistantMessage('Done.')]);
  await session.prompt('Run the requested fixture tool once.');
};
try {
  if (mode === 'pipeline') {
    await prompt('edit', { path: 'README.md', edits: [{ oldText: 'seed', newText: 'updated' }] }, 'direct-edit');
    await prompt('write', { path: '_ops/private.txt', content: 'forbidden' }, 'direct-private');
    await prompt('codemode', { code: 'await tools.edit({path: "README.md", edits: [{oldText: "updated", newText: "nested"}]}); return "nested edit done";' }, 'nested-edit');
    await prompt('codemode', { code: 'await tools.write({path: "_ops/nested.txt", content: "forbidden"});' }, 'nested-private');
    await prompt('bash', { command: 'printf "fixture command\\n"' }, 'bash-unknown');
    await session.reload();
    await prompt('write', { path: 'reloaded.txt', content: 'fresh session context' }, 'after-reload');
  } else if (mode === 'paths') {
    for (const [id, path] of [
      ['relative-private', '../_ops/relative.txt'],
      ['at-private', '@../_ops/at.txt'],
      ['url-private', pathToFileURL(join(repoRoot, '_ops/url.txt')).href],
      ['tilde-private', '~/../repo/_ops/tilde.txt'],
    ] as const) await prompt('write', { path, content: 'forbidden' }, id);
    await prompt('write', { path: '../normal.txt', content: 'normal' }, 'normal-relative');
    await prompt('edit', { path: '@../normal.txt', edits: [{ oldText: 'normal', newText: 'at' }] }, 'normal-at');
    await prompt('edit', { path: pathToFileURL(join(repoRoot, 'normal.txt')).href, edits: [{ oldText: 'at', newText: 'url' }] }, 'normal-url');
    await prompt('edit', { path: '~/../repo/normal.txt', edits: [{ oldText: 'url', newText: 'tilde' }] }, 'normal-tilde');
  } else if (mode === 'parallel') {
    await prompt('codemode', { code: `const results = await Promise.allSettled([
      tools.write({path:"alpha.txt",content:"alpha"}),
      tools.write({path:"beta.txt",content:"beta"}),
      tools.write({path:"_ops/parallel.txt",content:"forbidden"})
    ]); if (results.some(result => result.status === "rejected")) throw new Error("fixture outer failure");` }, 'parallel-parent');
  } else if (mode === 'cancel') {
    let started!: () => void;
    const reached = new Promise<void>(resolve => { started = resolve; });
    provider.setResponses([fauxAssistantMessage(fauxToolCall('bash', { command: 'printf "started\\n"; exec tail -f /dev/null' }, { id: 'cancel-command' }), { stopReason: 'toolUse' })]);
    const unsubscribe = session.subscribe(event => {
      if (event.type === 'tool_execution_update' && event.toolCallId === 'cancel-command') started();
    });
    const running = session.prompt('Run the fixture command.');
    await reached;
    await session.abort();
    await running;
    unsubscribe();
    await prompt('write', { path: 'after-cancel.txt', content: 'new run' }, 'after-cancel');
  } else if (mode === 'resume' || mode === 'fork') {
    await prompt('write', { path: 'before-replacement.txt', content: 'old run' }, 'before-replacement');
    const leaf = sessionManager.getLeafId();
    const file = mode === 'fork' && leaf ? sessionManager.createBranchedSession(leaf) : sessionManager.getSessionFile();
    if (!file) throw new Error('Missing persisted fixture session');
    session.dispose();
    await resourceLoader.reload();
    ({ session } = await createAgentSession({ cwd, agentDir, settingsManager, resourceLoader, modelRuntime,
      model: provider.getModel(), thinkingLevel: 'off', sessionManager: SessionManager.open(file), tools: ['edit', 'write', 'bash', 'codemode'],
    }));
    sessionIds.push(session.sessionId);
    await session.bindExtensions({ onError: event => { errors.push(event.error); } });
    await prompt('edit', { path: 'README.md', edits: [{ oldText: 'seed', newText: 'replaced' }] }, 'after-replacement');
    await prompt('write', { path: '_ops/replaced.txt', content: 'forbidden' }, 'replaced-private');
  } else if (mode === 'inactive') {
    await prompt('write', { path: '_ops/private.txt', content: 'allowed outside opt-in' }, 'inactive-write');
  } else if (mode === 'unavailable') {
    await prompt('write', { path: 'blocked.txt', content: 'must not write' }, 'unavailable-write');
  } else throw new Error(`Unknown fixture mode: ${mode}`);
  console.log(JSON.stringify({ calls, errors, journalPaths, messages: session.state.messages, sessionId: session.sessionId, sessionIds,
    readme: readFileSync(join(repoRoot, 'README.md'), 'utf8') }));
} finally {
  await session.abort();
  session.dispose();
}
