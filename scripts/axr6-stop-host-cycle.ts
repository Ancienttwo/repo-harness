#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const HOLD_MS = 31_000;
const HOST_TIMEOUT_MS = 150_000;
const PROCESS_TIMEOUT_MS = 145_000;
const repoRoot = resolve(import.meta.dir, '..');
const workspace = mkdtempSync(join(tmpdir(), 'repo-harness-axr6-host-cycle-'));

try {
  const artifacts = join(workspace, 'artifacts');
  const consumer = join(workspace, 'consumer');
  const fakeArchctx = join(workspace, 'fake-archctx');
  const fixture = join(workspace, 'fixture');
  const hostHome = join(workspace, 'host-home');
  for (const path of [artifacts, consumer, fakeArchctx, fixture, hostHome]) mkdirSync(path, { recursive: true });

  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', artifacts], repoRoot).stdout) as Array<{ filename?: string }>;
  if (packed.length !== 1 || !packed[0]?.filename) throw new Error('repo-harness npm pack did not produce exactly one artifact');
  const repoHarnessTarball = join(artifacts, packed[0].filename);

  writeFakeArchctx(fakeArchctx);
  const offlineEnv = {
    ...process.env,
    HOME: hostHome,
    NPM_CONFIG_REGISTRY: 'http://127.0.0.1:9',
    BUN_CONFIG_REGISTRY: 'http://127.0.0.1:9',
  };
  installPackedRuntime(consumer, repoHarnessTarball, fakeArchctx);

  const binDir = join(consumer, 'node_modules', '.bin');
  const cli = join(binDir, 'repo-harness');
  run(cli, ['install', '--target', 'both', '--location', 'global'], fixture, {
    ...offlineEnv,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
  });
  const adapters = readInstalledAdapters(hostHome);

  initializeFixture(fixture);
  const hookEnv = {
    ...offlineEnv,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    HOOK_HOST: 'codex',
    HOOK_REPO_ROOT: fixture,
    AXR6_FAKE_ARCHCTX_HOLD_MS: String(HOLD_MS),
    AXR6_FAKE_ARCHCTX_COMPLETION_MARKER: join(workspace, 'first-provider-complete'),
  };
  const postEdit = spawnSync('/bin/sh', ['-c', adapters.codex.postEdit.command], {
    cwd: fixture,
    env: hookEnv,
    input: `${JSON.stringify({ session_id: 'axr6-host-cycle', tool_input: { file_path: join(fixture, 'src', 'index.ts') } })}\n`,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assertProcess(postEdit, 'installed PostToolUse.edit');

  const stopInput = `${JSON.stringify({ session_id: 'axr6-host-cycle', run_id: 'axr6-host-cycle', stop_hook_active: false })}\n`;
  const legacyStarted = performance.now();
  const legacyStop = spawnSync('/bin/sh', ['-c', adapters.codex.stop.command], {
    cwd: fixture,
    env: hookEnv,
    input: stopInput,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const legacyElapsedMs = Math.round(performance.now() - legacyStarted);
  if ((legacyStop.error as NodeJS.ErrnoException | undefined)?.code !== 'ETIMEDOUT') {
    throw new Error(`installed Stop unexpectedly survived the legacy 30 second process budget: status=${String(legacyStop.status)} elapsed=${legacyElapsedMs}ms`);
  }
  const receiptsDir = join(fixture, '.ai', 'harness', 'architecture-projection', 'receipts');
  if (existsSync(receiptsDir) && readdirSync(receiptsDir).some((name) => name.endsWith('.json'))) {
    throw new Error('legacy 30 second process budget produced a false durable receipt');
  }

  const guardedStarted = performance.now();
  const guardedStop = spawnSync('/bin/sh', ['-c', adapters.codex.stop.command], {
    cwd: fixture,
    env: hookEnv,
    input: stopInput,
    encoding: 'utf8',
    timeout: 10_000,
  });
  const guardedElapsedMs = Math.round(performance.now() - guardedStarted);
  assertProcess(guardedStop, 'provider-lease guarded Stop.default');
  if (existsSync(receiptsDir) && readdirSync(receiptsDir).some((name) => name.endsWith('.json'))) {
    throw new Error('fresh abandoned job incorrectly started a second provider');
  }

  const providerMarker = hookEnv.AXR6_FAKE_ARCHCTX_COMPLETION_MARKER;
  const markerDeadline = Date.now() + 10_000;
  while (!existsSync(providerMarker) && Date.now() < markerDeadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  if (!existsSync(providerMarker)) throw new Error('orphaned provider did not finish within its bounded hold');
  const runningDir = join(fixture, '.ai', 'harness', 'architecture-projection', 'running');
  const runningFiles = readdirSync(runningDir).filter((name) => name.endsWith('.json'));
  if (runningFiles.length !== 1) throw new Error(`expected one quarantined running job, got ${runningFiles.length}`);
  const runningPath = join(runningDir, runningFiles[0]!);
  const abandoned = JSON.parse(readFileSync(runningPath, 'utf8')) as { updatedAt: string };
  abandoned.updatedAt = new Date(Date.now() - 150_001).toISOString();
  writeFileSync(runningPath, `${JSON.stringify(abandoned, null, 2)}\n`);

  const started = performance.now();
  const stop = spawnSync('/bin/sh', ['-c', adapters.codex.stop.command], {
    cwd: fixture,
    env: hookEnv,
    input: stopInput,
    encoding: 'utf8',
    timeout: PROCESS_TIMEOUT_MS,
  });
  const elapsedMs = Math.round(performance.now() - started);
  assertProcess(stop, 'installed Stop.default');
  if (elapsedMs >= HOST_TIMEOUT_MS) throw new Error(`installed Stop exceeded the managed 150 second timeout: ${elapsedMs}ms`);

  const receiptFiles = readdirSync(receiptsDir).filter((name) => name.endsWith('.json'));
  if (receiptFiles.length !== 1) throw new Error(`expected one durable projection receipt, got ${receiptFiles.length}`);
  const receipt = JSON.parse(readFileSync(join(receiptsDir, receiptFiles[0]!), 'utf8')) as {
    schemaVersion?: string;
    attempt?: number;
    result?: { receiptDigest?: string; status?: string };
  };
  if (receipt.attempt !== 2) throw new Error(`expected recovered Stop receipt on attempt 2, got ${String(receipt.attempt)}`);
  const pendingDir = join(fixture, '.ai', 'harness', 'journal', 'post-edit', 'pending');
  const pendingSourceEvents = readdirSync(pendingDir).filter((name) => name.endsWith('.json')).length;
  if (pendingSourceEvents !== 0) throw new Error(`source journal was not acknowledged after receipt: ${pendingSourceEvents} pending`);

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'repo-harness.axr6-stop-host-cycle/v1',
    status: 'verified',
    installedPackage: { name: 'repo-harness', tarball: basename(repoHarnessTarball) },
    provider: { name: 'archctx', version: '0.5.6', packageLocal: true, holdMs: HOLD_MS },
    adapters: {
      codex: { stopTimeoutSeconds: adapters.codex.stop.timeout, nonStopTimeoutSeconds: adapters.codex.postEdit.timeout },
      claude: { stopTimeoutSeconds: adapters.claude.stop.timeout, nonStopTimeoutSeconds: adapters.claude.postEdit.timeout },
    },
    stop: {
      legacyBudget: { timeoutMs: 30_000, elapsedMs: legacyElapsedMs, timedOut: true },
      providerLeaseGuard: { elapsedMs: guardedElapsedMs, secondProviderStarted: false },
      elapsedMs,
      processTimeoutMs: PROCESS_TIMEOUT_MS,
      managedTimeoutMs: HOST_TIMEOUT_MS,
      durableReceiptSchemaVersion: receipt.schemaVersion,
      attempt: receipt.attempt,
      projectionStatus: receipt.result?.status,
      receiptDigest: receipt.result?.receiptDigest,
      pendingSourceEvents,
    },
  }, null, 2)}\n`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

function installPackedRuntime(consumer: string, repoHarnessTarball: string, fakeArchctx: string): void {
  const modules = join(consumer, 'node_modules');
  const installedRepoHarness = join(modules, 'repo-harness');
  const bin = join(modules, '.bin');
  mkdirSync(installedRepoHarness, { recursive: true });
  mkdirSync(bin, { recursive: true });
  run('tar', ['-xzf', repoHarnessTarball, '-C', installedRepoHarness, '--strip-components=1'], consumer);
  for (const entry of readdirSync(join(repoRoot, 'node_modules'), { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name === 'archctx' || entry.name === 'repo-harness') continue;
    symlinkSync(join(repoRoot, 'node_modules', entry.name), join(modules, entry.name), entry.isDirectory() ? 'dir' : 'file');
  }
  symlinkSync(fakeArchctx, join(modules, 'archctx'), 'dir');
  symlinkSync(join('..', 'repo-harness', 'src', 'cli', 'index.ts'), join(bin, 'repo-harness'));
  symlinkSync(join('..', 'repo-harness', 'dist', 'hook-entry.js'), join(bin, 'repo-harness-hook'));
  symlinkSync(join('..', 'archctx', 'bin', 'archctx.mjs'), join(bin, 'archctx'));
}

function initializeFixture(root: string): void {
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  mkdirSync(join(root, '.archcontext', 'model', 'nodes'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'workflow-contract.json'), '{}\n');
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    context: { capability_source: 'archcontext' },
    architecture: {
      projection_provider: 'archctx',
      projection_apply: 'automatic',
      projection_version: '0.5.6',
      projection_timeout_ms: 120000,
      freshness_gate: 'advisory',
    },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'src', 'index.ts'), 'export const hostCycle = true;\n');
  writeFileSync(join(root, 'AGENTS.md'), '# Host-cycle fixture\n');
  writeFileSync(join(root, 'CLAUDE.md'), '# Host-cycle fixture\n');
  writeFileSync(join(root, '.archcontext', 'model', 'nodes', 'capability.fixture.host-cycle.yaml'), `schemaVersion: archcontext.node/v2
id: capability.fixture.host-cycle
kind: capability
name: Host Cycle Fixture
status: active
summary: Exercises one installed Stop projection cycle.
responsibilities:
  - Own the disposable host-cycle source.
source:
  include:
    - src/**
extensions:
  contractFiles:
    agents: AGENTS.md
    claude: CLAUDE.md
  lspProfile: typescript-lsp
  verification: []
`);
  run('git', ['init'], root);
  run('git', ['config', 'user.email', 'axr6@example.invalid'], root);
  run('git', ['config', 'user.name', 'AXR6 Host Cycle'], root);
  run('git', ['add', '.'], root);
  run('git', ['commit', '-m', 'host-cycle fixture'], root);
}

function writeFakeArchctx(root: string): void {
  const bin = join(root, 'bin', 'archctx.mjs');
  mkdirSync(dirname(bin), { recursive: true });
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: 'archctx',
    version: '0.5.6',
    type: 'module',
    engines: { node: '>=22.22 <26' },
    bin: { archctx: './bin/archctx.mjs' },
  }, null, 2)}\n`);
  writeFileSync(bin, `#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === 'capabilities') {
  console.log(JSON.stringify({
    schemaVersion: 'archcontext.capabilities/v1',
    package: { name: 'archctx', version: '0.5.6' },
    protocols: {
      projectionRequest: 'archcontext.projection-request/v1',
      projectionResult: 'archcontext.projection-result/v2',
      architectureRefreshSignal: 'archcontext.architecture-refresh-signal/v1',
    },
    renderers: { architectureDocs: 'archcontext.docs-renderer/v4', agentContext: 'archcontext.agent-context/v1' },
    features: ['architecture-docs-renderer-v2', 'architecture-refresh-signal-v1', 'projection-apply-receipt-v1', 'projection-protocol-v2'],
  }));
  process.exit(0);
}
if (args[0] !== 'projection' || args[1] !== 'run') process.exit(2);
const requestIndex = args.indexOf('--request-json');
const request = JSON.parse(args[requestIndex + 1]);
const digest = 'sha256:' + '1'.repeat(64);
const snapshot = {
  ...request.expected,
  baseHeadSha: request.expected.headSha,
  sourceTreeDigest: digest,
  modelDigest: digest,
  codeGraphDigest: digest,
  indexedWorktreeDigest: null,
  projectionInputDigest: digest,
  rendererVersion: 'archcontext.docs-renderer/v4',
  layoutVersion: 'archcontext.docs-layout/v1',
  generatedFrom: {
    codeGraphPackage: '@colbymchenry/codegraph',
    codeGraphVersion: '1.5.0',
    codeGraphBinaryDigest: digest,
    codeGraphStatus: 'unavailable',
  },
};
const payload = {
  schemaVersion: 'archcontext.projection-result/v2',
  requestId: request.requestId,
  status: 'noop',
  inputSnapshot: snapshot,
  outputSnapshot: snapshot,
  affectedNodeIds: [],
  files: [],
  humanActions: [],
  refreshSignals: [],
};
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
};
const receiptDigest = 'sha256:' + createHash('sha256').update(canonical(payload)).digest('hex');
await new Promise((resolve) => setTimeout(resolve, Number(process.env.AXR6_FAKE_ARCHCTX_HOLD_MS ?? '31000')));
if (process.env.AXR6_FAKE_ARCHCTX_COMPLETION_MARKER) writeFileSync(process.env.AXR6_FAKE_ARCHCTX_COMPLETION_MARKER, 'complete\\n');
console.log(JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, data: { ...payload, receiptDigest } }));
`);
  chmodSync(bin, 0o755);
}

function readInstalledAdapters(home: string): {
  codex: { stop: HookCommand; postEdit: HookCommand };
  claude: { stop: HookCommand; postEdit: HookCommand };
} {
  const codex = JSON.parse(readFileSync(join(home, '.codex', 'hooks.json'), 'utf8')) as { hooks: Record<string, HookGroup[]> };
  const claude = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')) as { hooks: Record<string, HookGroup[]> };
  const result = {
    codex: { stop: hook(codex.hooks, 'Stop'), postEdit: hook(codex.hooks, 'PostToolUse') },
    claude: { stop: hook(claude.hooks, 'Stop'), postEdit: hook(claude.hooks, 'PostToolUse') },
  };
  for (const [host, entries] of Object.entries(result)) {
    if (entries.stop.timeout !== 150) throw new Error(`${host} Stop timeout is ${entries.stop.timeout}, expected 150`);
    if (entries.postEdit.timeout !== 30) throw new Error(`${host} non-Stop timeout is ${entries.postEdit.timeout}, expected 30`);
  }
  return result;
}

interface HookCommand { command: string; timeout: number }
interface HookGroup { matcher?: string; hooks: HookCommand[] }
function hook(hooks: Record<string, HookGroup[]>, event: string): HookCommand {
  const entries = hooks[event];
  if (!entries?.length || entries[0]?.hooks.length !== 1) throw new Error(`installed ${event} adapter is missing`);
  return entries[0].hooks[0]!;
}

function assertProcess(result: ReturnType<typeof spawnSync>, label: string): void {
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${label} failed: ${result.error?.message ?? result.signal ?? result.status}; ${String(result.stderr || result.stdout).trim().slice(0, 1000)}`);
  }
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? result.signal ?? result.status}; ${String(result.stderr || result.stdout).trim().slice(0, 2000)}`);
  }
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
