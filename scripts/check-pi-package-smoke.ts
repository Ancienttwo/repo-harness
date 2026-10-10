#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// The tarball smoke supplies an installed consumer, a disposable repo and HOME.
const [app, cwd] = process.argv.slice(2);
if (!app || !cwd || !process.env.PI_CODING_AGENT_DIR) throw new Error('Pi smoke requires app, repo and isolated agent directory');
const agentDir = process.env.PI_CODING_AGENT_DIR;
const sdkRoot = join(app, 'node_modules/@earendil-works/pi-coding-agent');
const packageRoot = join(app, 'node_modules/repo-harness');
const install = spawnSync(process.execPath, [join(sdkRoot, 'dist/bundle/cli.js'), 'install', packageRoot], {
  cwd, env: process.env, encoding: 'utf8', timeout: 60_000,
});
assert.equal(install.status, 0, `Pi install failed: ${install.stdout}\n${install.stderr}`);
const sdk: typeof import('@earendil-works/pi-coding-agent') = await import(pathToFileURL(join(sdkRoot, 'dist/index.js')).href);
const ai: typeof import('@earendil-works/pi-ai') = await import(pathToFileURL(join(app, 'node_modules/@earendil-works/pi-ai/dist/index.js')).href);
assert.equal(sdk.VERSION, '1.1.0');
const settingsManager = sdk.SettingsManager.create(cwd, agentDir);
const loader = new sdk.DefaultResourceLoader({ cwd, agentDir, settingsManager, noContextFiles: true,
  noPromptTemplates: true, noThemes: true, extensionFactories: [sdk.createCodemodeExtension({ models: false })] });
await loader.reload();
assert.deepEqual(loader.getExtensions().errors, []);
assert(loader.getExtensions().extensions.some(extension => extension.path.endsWith('/src/pi/extension.ts')
  && realpathSync(extension.path) === realpathSync(join(packageRoot, 'src/pi/extension.ts'))));
assert.deepEqual(loader.getSkills().skills.map(skill => skill.name).sort(), ['repo-harness', 'repo-harness-check']);
mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
writeFileSync(join(cwd, '.ai/harness/workflow-contract.json'), '{}\n');
writeFileSync(join(cwd, 'pi-smoke.txt'), 'seed\n');
for (const args of [['add', '.'], ['-c', 'user.name=Pi Smoke', '-c', 'user.email=pi-smoke@example.invalid', 'commit', '-qm', 'seed']]) {
  const git = spawnSync('git', args, { cwd, env: process.env, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
}
const provider = ai.fauxProvider();
const modelRuntime = await sdk.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
modelRuntime.registerNativeProvider(provider.provider);
const { session } = await sdk.createAgentSession({ cwd, agentDir, settingsManager, resourceLoader: loader,
  modelRuntime, model: provider.getModel(), thinkingLevel: 'off', sessionManager: sdk.SessionManager.inMemory(cwd), tools: ['edit', 'write', 'codemode'] });
const errors: string[] = [];
await session.bindExtensions({ onError: event => { errors.push(event.error); } });
try {
  provider.setResponses([
    ai.fauxAssistantMessage(ai.fauxToolCall('edit', { path: 'pi-smoke.txt', edits: [{ oldText: 'seed', newText: 'installed' }] }, { id: 'installed-edit' }), { stopReason: 'toolUse' }),
    ai.fauxAssistantMessage(ai.fauxToolCall('codemode', { code: 'await tools.write({path:"_ops/pi-private.txt",content:"forbidden"});' }, { id: 'installed-nested' }), { stopReason: 'toolUse' }),
    ai.fauxAssistantMessage('Done.'),
  ]);
  await session.prompt('Run the scripted install smoke.');
  assert.deepEqual(errors, []);
  assert.equal(readFileSync(join(cwd, 'pi-smoke.txt'), 'utf8'), 'installed\n');
  assert.equal(existsSync(join(cwd, '_ops/pi-private.txt')), false);
  assert(session.state.messages.some(message => message.role === 'toolResult' && message.toolCallId === 'installed-edit' && !message.isError));
  assert(session.state.messages.some(message => message.role === 'toolResult' && message.toolCallId === 'installed-nested' && message.isError));
  console.log('[pi-package-smoke] official install, two skills, Node extension load, edit and nested refusal passed');
} finally {
  await session.abort();
  session.dispose();
}
