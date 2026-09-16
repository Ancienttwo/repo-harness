import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { architectureProjectionQueueState, enqueueArchitectureProjectionJob } from '../src/effects/architecture/projection-jobs';

const ROOT = join(import.meta.dir, '..');
let sandbox: string;
let consumer: string;
let bundle: string;
let parentClock: string;
beforeAll(async () => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'projection-continuation-')));
  consumer = join(sandbox, 'consumer');
  mkdirSync(consumer);
  // A complete source import tree and isolated dependency resolution: never
  // replace the developer's installed provider to test a process boundary.
  cpSync(join(ROOT, 'src'), join(consumer, 'src'), { recursive: true });
  cpSync(join(ROOT, 'assets'), join(consumer, 'assets'), { recursive: true });
  cpSync(join(ROOT, 'scripts'), join(consumer, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'interfaces'), join(consumer, 'interfaces'), { recursive: true });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '0.19.2', type: 'module' }));
  mkdirSync(join(consumer, 'node_modules'));
  for (const name of readdirSync(join(ROOT, 'node_modules'))) {
    if (name === 'archctx') continue;
    symlinkSync(join(ROOT, 'node_modules', name), join(consumer, 'node_modules', name));
  }
  const provider = join(consumer, 'node_modules/archctx');
  parentClock = join(consumer, 'parent-clock.ts');
  // Advance only the host clock after provider return. The detached child is
  // launched without --preload and therefore receives its real policy budget.
  // This exercises expiry without sleeping through the 110-second host slice.
  writeFileSync(parentClock, `import { existsSync } from 'node:fs'; const realNow = Date.now; Date.now = () => realNow() + (existsSync(process.env.CONTINUATION_TEST_YIELD_MARKER!) ? 200000 : 0);`);
  mkdirSync(join(provider, 'bin'), { recursive: true });
  writeFileSync(join(provider, 'package.json'), JSON.stringify({ name: 'archctx', version: '0.5.10', type: 'module', engines: { node: '>=22.22 <26' }, bin: { archctx: './bin/provider.mjs' } }));
  writeFileSync(join(provider, 'bin/provider.mjs'), `
import { createHash } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'capabilities') {
 console.log(JSON.stringify({ schemaVersion: 'archcontext.capabilities/v1', package: { name: 'archctx', version: '0.5.10' },
 protocols: { projectionRequest: 'archcontext.projection-request/v1', projectionResult: 'archcontext.projection-result/v2', architectureRefreshSignal: 'archcontext.architecture-refresh-signal/v1' },
 renderers: { architectureDocs: 'archcontext.docs-renderer/v4', agentContext: 'archcontext.agent-context-renderer/v1' },
 features: ['architecture-docs-renderer-v2', 'architecture-refresh-signal-v1', 'projection-apply-receipt-v1', 'projection-prior-committed-applies-v1', 'projection-protocol-v2'] }));
} else {
 const request = JSON.parse(args[3]);
 appendFileSync(process.env.CONTINUATION_TEST_CALLS, JSON.stringify({ requestId: request.requestId, pid: process.pid }) + '\\n');
 await new Promise(resolve => setTimeout(resolve, Number(process.env.CONTINUATION_TEST_DELAY || 0)));
 if (process.env.CONTINUATION_TEST_FAIL === '1') { console.error('fixture provider failure'); process.exit(1); }
 const d = 'sha256:' + '1'.repeat(64);
 const snapshot = { ...request.expected, baseHeadSha: request.expected.headSha, sourceTreeDigest: d, modelDigest: d,
 codeGraphDigest: d, indexedWorktreeDigest: d, projectionInputDigest: d, rendererVersion: 'archcontext.docs-renderer/v4', layoutVersion: 'archcontext.docs-layout/v1',
 generatedFrom: { codeGraphPackage: '@colbymchenry/codegraph', codeGraphVersion: '1.5.0', codeGraphBinaryDigest: d, codeGraphStatus: 'ready' } };
 const result = { schemaVersion: 'archcontext.projection-result/v2', requestId: request.requestId, status: 'noop', inputSnapshot: snapshot, outputSnapshot: snapshot,
 affectedNodeIds: [], files: [], humanActions: [], refreshSignals: [] };
 const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
 const receiptDigest = 'sha256:' + createHash('sha256').update(JSON.stringify(canonical(result))).digest('hex');
 if (process.env.CONTINUATION_TEST_YIELD_MARKER) writeFileSync(process.env.CONTINUATION_TEST_YIELD_MARKER, 'host clock expired');
 console.log(JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.run', data: { ...result, receiptDigest } }));
}
`);
  bundle = join(consumer, 'dist/hook-entry.js');
  const result = await Bun.build({ entrypoints: [join(consumer, 'src/cli/hook-entry.ts')], target: 'bun', outdir: join(consumer, 'dist'), naming: 'hook-entry.js', define: { REPO_HARNESS_BUNDLED_CLI_VERSION: '"0.19.2"' } });
  if (!result.success) throw new Error(result.logs.join('\n'));
});
afterAll(() => { if (sandbox) rmSync(sandbox, { recursive: true, force: true }); });

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function fixture(name: string, mode = 'automatic') {
  const root = join(sandbox, name);
  const home = join(root, '.ai/harness/test-home');
  mkdirSync(join(home, '.repo-harness'), { recursive: true });
  writeFileSync(join(home, '.repo-harness/config.json'), JSON.stringify({ architecture: { projection_provider: 'archctx', projection_apply: mode, projection_failure_gate: 'advisory', projection_timeout_ms: 60_000 } }));
  mkdirSync(join(root, '.archcontext/model/nodes'), { recursive: true });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ context: { capability_source: 'archcontext' } }));
  cpSync(join(ROOT, 'assets/workflow-contract.v1.json'), join(root, '.ai/harness/workflow-contract.json'));
  writeFileSync(join(root, '.archcontext/model/nodes/root.yaml'), `schemaVersion: archcontext.node/v2
id: capability.test.root
kind: capability
name: Root
summary: Own fixture calls.
responsibilities:
  - Own fixture calls.
status: active
source:
  include:
    - src/**
extensions:
  lspProfile: typescript-lsp
  verification: []
  contractFiles:
    agents: AGENTS.md
    claude: CLAUDE.md
`);
  writeFileSync(join(root, '.gitignore'), '.ai/harness/\nnode_modules/\n');
  writeFileSync(join(root, 'src/index.ts'), 'export const value = 1;\n');
  writeFileSync(join(root, 'AGENTS.md'), '# Fixture\n');
  writeFileSync(join(root, 'CLAUDE.md'), '# Fixture\n');
  git(root, ['init', '-b', 'main']); git(root, ['config', 'user.name', 'Fixture']); git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['add', '.']); git(root, ['commit', '-m', 'fixture']);
  const calls = join(root, '.ai/harness/provider-calls.jsonl');
  return { root, calls, env: { ...process.env, HOME: home, CONTINUATION_TEST_CALLS: calls } };
}
async function until(predicate: () => boolean, label: string, timeoutMs = 35_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out: ${label}`);
    await Bun.sleep(50);
  }
}
function receipts(root: string) {
  const path = join(root, '.ai/harness/architecture-projection/receipts');
  return existsSync(path) ? readdirSync(path).map(name => JSON.parse(readFileSync(join(path, name), 'utf8'))) : [];
}
function launch(root: string, env: NodeJS.ProcessEnv) {
  const script = `import { startArchitectureProjectionContinuation } from ${JSON.stringify(join(consumer, 'src/effects/architecture/projection-continuation.ts'))}; console.log(JSON.stringify(startArchitectureProjectionContinuation(process.cwd(), process.env)));`;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: root, env, encoding: 'utf8', timeout: 5000 });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as { pid: number; logPath: string };
}

describe('architecture projection detached continuation', () => {
  for (const mode of ['source', 'bundle']) {
    test(`${mode} Stop yields an expired host budget and completes after parent exit with one owned receipt`, async () => {
      const f = fixture(mode);
      const head = git(f.root, ['rev-parse', 'HEAD']);
      writeFileSync(join(f.root, 'src/index.ts'), 'export const value = 2;\n');
      const entry = mode === 'source' ? join(consumer, 'src/cli/hook-entry.ts') : bundle;
      const env = { ...f.env, CONTINUATION_TEST_DELAY: '2000', CONTINUATION_TEST_YIELD_MARKER: join(f.root, '.ai/harness/host-clock-expired') };
      const parent = spawnSync(process.execPath, ['--preload', parentClock, entry, 'Stop', '--route', 'default'], { cwd: f.root, env,
        input: JSON.stringify({ cwd: f.root, session_id: 'continuation-test' }), encoding: 'utf8', timeout: 35_000 });
      expect(parent.status).toBe(0);
      expect(parent.stderr).toContain('continuation started pid=');
      expect(receipts(f.root)).toHaveLength(0);
      await until(() => architectureProjectionQueueState(f.root).running === 1, 'detached claim');
      // A second detached wake while the first owns the queue must not invoke
      // the provider or publish a competing receipt.
      const duplicate = launch(f.root, env);
      await until(() => readFileSync(join(f.root, duplicate.logPath), 'utf8').includes('"status":"idle"'), 'duplicate idle result');
      await until(() => receipts(f.root).length === 1, 'provider completion');
      const [receipt] = receipts(f.root);
      expect(receipt.attempt).toBe(1); // host yield is refunded, not a business failure
      expect(receipt.result.status).toBe('noop');
      expect(receipt.result.requestId).toBe(`repo-harness.projection.${receipt.jobId}`);
      expect(architectureProjectionQueueState(f.root)).toMatchObject({ pending: 0, running: 0, deadLetters: 0, receipts: 1 });
      const calls = readFileSync(f.calls, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls).toHaveLength(2); // expired Stop + independent full-budget attempt
      expect(new Set(calls.map(call => call.requestId)).size).toBe(1);
      expect(git(f.root, ['rev-parse', 'HEAD'])).toBe(head);
    }, 65_000);
  }
  test('rechecks manual policy without claiming or invoking the provider', async () => {
    const f = fixture('manual', 'manual');
    enqueueArchitectureProjectionJob(f.root, ['event-manual'], ['key-manual'], ['src/index.ts']);
    const child = launch(f.root, f.env);
    await until(() => readFileSync(join(f.root, child.logPath), 'utf8').includes('"status":"disabled"'), 'manual mode result');
    expect(architectureProjectionQueueState(f.root)).toMatchObject({ pending: 1, running: 0, receipts: 0 });
    expect(existsSync(f.calls)).toBe(false);
  });
  test('records real provider failure without recursive workers or a false receipt', async () => {
    const f = fixture('failure');
    enqueueArchitectureProjectionJob(f.root, ['event-failure'], ['key-failure'], ['src/index.ts']);
    const child = launch(f.root, { ...f.env, CONTINUATION_TEST_FAIL: '1' });
    await until(() => readFileSync(join(f.root, child.logPath), 'utf8').includes('"status":"retry-pending"'), 'provider failure result');
    expect(architectureProjectionQueueState(f.root)).toMatchObject({ pending: 1, running: 0, receipts: 0 });
    expect(readFileSync(f.calls, 'utf8').trim().split('\n')).toHaveLength(1);
  });
});
