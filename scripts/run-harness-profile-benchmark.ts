#!/usr/bin/env bun
import {
  constants, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync,
  rmSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, relative, resolve } from 'path';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { acquireExpensiveRunLock } from '../src/effects/expensive-run-lock';
import type { ExclusiveDirectoryLockHandle } from '../src/effects/locking/exclusive-directory-lock';
import {
  HOOK_EVENT_TELEMETRY_PATH,
  isHookEventTelemetryRecord,
} from '../src/cli/hook/event-telemetry';
import type { HookEventTelemetryRecord } from '../src/core/loop/loop-event-protocol';

const ROOT = resolve(import.meta.dir, '..');
const DEFAULT_MANIFEST = join(ROOT, 'evals/harness/scenarios.json');
const DEFAULT_REPORT = join(ROOT, 'evals/harness/reports/profile-comparison.json');
export const BENCHMARK_PROFILES = ['no-harness', 'adaptive-lite', 'strict-harness'] as const;
export type BenchmarkProfile = (typeof BENCHMARK_PROFILES)[number];
export const BENCHMARK_PROVIDERS = ['codex', 'claude'] as const;
export type BenchmarkProvider = (typeof BENCHMARK_PROVIDERS)[number];
export const BENCHMARK_WALL_TIME_BUDGET_MS = 50 * 60 * 1000;
export const BENCHMARK_MAX_CONCURRENCY = 2;
const BENCHMARK_TERMINATION_GRACE_MS = 500;
const ACTIVE_PROVIDER_PROCESS_GROUPS = new Set<number>();
let ACTIVE_EXPENSIVE_RUN_LOCK: ExclusiveDirectoryLockHandle | null = null;
let PRODUCER_TERMINATING = false;
let PRODUCER_SIGNAL_TERMINATING = false;
let PRESERVE_EXPENSIVE_RUN_LOCK = false;

const PROVIDER_INVOCATION_SCHEMA = {
  codex: {
    common: ['exec', '--json', '--ephemeral', '--sandbox', 'workspace-write'],
    no_harness: ['--ignore-user-config', '--ignore-rules'],
    harness: ['--dangerously-bypass-hook-trust'],
  },
  claude: {
    common: [
      '-p', '--output-format', 'stream-json', '--verbose', '--include-hook-events',
      '--permission-mode', 'bypassPermissions', '--no-session-persistence', '--disable-slash-commands',
    ],
    no_harness: ['--safe-mode'],
    harness: ['--setting-sources', 'project'],
  },
} as const;

const INSTALL_PROFILE_INPUTS = ['package.json', 'src/cli', 'assets'] as const;

export interface HarnessScenario {
  id: string;
  category: string;
  prompt: string;
  expected_paths: string[];
  acceptance_command: string;
  requires_resume_projection?: boolean;
}

export interface HarnessScenarioManifest {
  protocol: 'repo-harness-profile-benchmark/scenarios/v1';
  seed: string;
  profiles: BenchmarkProfile[];
  scenarios: HarnessScenario[];
}

export interface BenchmarkRunRecord {
  run_id: string;
  profile: BenchmarkProfile;
  scenario_id: string;
  profile_base_id: string;
  workspace: string;
  home: string;
  baseline_revision: string | null;
  command: string[];
  status: 'dry-run' | 'passed' | 'failed';
  provider_exit_code: number | null;
  usage_authority: 'structured-provider' | 'unavailable';
  provider_unavailable_reason: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  model_call_count: number | null;
  subagent_call_count: number | null;
  time_to_first_edit_ms: number | null;
  total_duration_ms: number | null;
  hook_invocation_count: number;
  hook_total_duration_ms: number;
  hook_p50_ms: number | null;
  hook_p95_ms: number | null;
  hook_p99_ms: number | null;
  hook_output_bytes: number | null;
  session_start_context_tokens: number | null;
  guard_block_count: number;
  repeated_guard_fingerprint_count: number;
  artifact_files_created: number;
  artifact_files: string[];
  profile_projection_artifact_files: number;
  grader_acceptance: 'passed' | 'failed' | 'unavailable';
  no_harness_isolation: 'passed' | 'failed' | 'not_applicable' | 'unavailable';
  evidence_hashes: {
    provider_stream: string | null;
    provider_stderr: string | null;
    grader_stdout: string | null;
    grader_stderr: string | null;
    workspace: string | null;
  };
}

export interface HarnessBenchmarkReport {
  protocol: 'repo-harness-profile-benchmark/report/v2';
  generated_at: string;
  run_id: string;
  authoritative: boolean;
  provider: BenchmarkProvider;
  manifest: string;
  source_commit: string;
  benchmark_subject_sha256: string;
  runner_sha256: string;
  scenario_manifest_sha256: string;
  fixture_set_sha256: string;
  install_profile_inputs_sha256: string;
  provider_invocation_schema_sha256: string;
  report_byte_binding: string;
  provider_version: string;
  profiles: BenchmarkProfile[];
  scenario_count: number;
  records: BenchmarkRunRecord[];
  provenance: {
    producer: 'repo-harness-profile-benchmark';
    profile_base_count: number;
    arm_count: number;
    profile_bases: Array<{
      id: string;
      profile: BenchmarkProfile;
      workspace_sha256: string | null;
      home_sha256: string | null;
    }>;
  };
}

export interface HarnessBenchmarkReportByteBinding {
  protocol: 'repo-harness-profile-benchmark/report-bytes/v1';
  benchmark_subject_sha256: string;
  files: {
    json: { path: string; bytes: number; sha256: string };
    markdown: { path: string; bytes: number; sha256: string };
  };
}

interface CliOptions {
  execute: boolean;
  regradeExisting?: boolean;
  provider?: BenchmarkProvider;
  requireAuthoritative?: boolean;
  profile?: BenchmarkProfile[];
  scenario: string[];
  manifest: string;
  report: string;
}

interface ProviderProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signalCode: NodeJS.Signals | null;
  timedOut: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    execute: false,
    regradeExisting: false,
    provider: 'codex',
    requireAuthoritative: false,
    profile: [],
    scenario: [],
    manifest: DEFAULT_MANIFEST,
    report: DEFAULT_REPORT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--dry-run') options.execute = false;
    else if (arg === '--regrade-existing') options.regradeExisting = true;
    else if (arg === '--require-authoritative') {
      options.requireAuthoritative = true;
      options.execute = true;
    } else if (arg === '--profile') {
      const value = argv[++index] ?? '';
      if (value !== 'all' && !BENCHMARK_PROFILES.includes(value as BenchmarkProfile)) {
        throw new Error(`invalid profile: ${value}`);
      }
      if (value !== 'all') options.profile!.push(value as BenchmarkProfile);
    } else if (arg === '--provider') {
      const value = argv[++index] ?? '';
      if (!BENCHMARK_PROVIDERS.includes(value as BenchmarkProvider)) throw new Error(`invalid provider: ${value}`);
      options.provider = value as BenchmarkProvider;
    } else if (arg === '--scenario') {
      const value = argv[++index] ?? '';
      if (value !== 'all') options.scenario.push(value);
    }
    else if (arg === '--manifest') options.manifest = resolve(argv[++index] ?? '');
    else if (arg === '--report') options.report = resolve(argv[++index] ?? '');
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

export function loadHarnessScenarioManifest(path = DEFAULT_MANIFEST): HarnessScenarioManifest {
  const manifest = JSON.parse(readFileSync(path, 'utf-8')) as HarnessScenarioManifest;
  if (manifest.protocol !== 'repo-harness-profile-benchmark/scenarios/v1') throw new Error('invalid benchmark manifest protocol');
  if (JSON.stringify(manifest.profiles) !== JSON.stringify(BENCHMARK_PROFILES)) throw new Error('benchmark profiles must be no-harness/adaptive-lite/strict-harness');
  const required = new Set([
    'single-file-small-bug', 'ordinary-feature', 'cross-capability-feature', 'database-migration',
    'chinese-prompt', 'negation', 'quoted-old-report', 'workflow-discussion-no-execution', 'cross-session-recovery',
  ]);
  if (manifest.scenarios.length !== 9 || manifest.scenarios.some((scenario) => !required.delete(scenario.category)) || required.size > 0) {
    throw new Error('benchmark manifest must contain the authoritative nine scenario categories exactly once');
  }
  return manifest;
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result.stdout.trim();
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === 'win32') process.kill(pid, signal);
    else process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

function processGroupExists(pid: number): boolean {
  try {
    if (process.platform === 'win32') process.kill(pid, 0);
    else process.kill(-pid, 0);
    return true;
  } catch (error) {
    // Permission and unknown errors cannot prove that the group is gone.
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function waitForProcessGroupExit(pid: number, deadlineMs = Number.POSITIVE_INFINITY): Promise<boolean> {
  while (processGroupExists(pid)) {
    if (Date.now() >= deadlineMs) return false;
    await Bun.sleep(Math.min(10, Math.max(1, deadlineMs - Date.now())));
  }
  return true;
}

async function terminateActiveProviderGroups(): Promise<void> {
  PRODUCER_TERMINATING = true;
  const cleanupDeadline = Date.now() + (BENCHMARK_TERMINATION_GRACE_MS * 2);
  try {
    if (ACTIVE_PROVIDER_PROCESS_GROUPS.size > 0) {
      for (const pid of ACTIVE_PROVIDER_PROCESS_GROUPS) signalProcessGroup(pid, 'SIGTERM');
      await Bun.sleep(BENCHMARK_TERMINATION_GRACE_MS);
      for (const pid of ACTIVE_PROVIDER_PROCESS_GROUPS) signalProcessGroup(pid, 'SIGKILL');
      // Let each provider promise observe exit and delete its PID before
      // deciding the lane is empty. New spawns are blocked above.
      while (ACTIVE_PROVIDER_PROCESS_GROUPS.size > 0 && Date.now() < cleanupDeadline) {
        await Bun.sleep(10);
      }
    }
    if (ACTIVE_PROVIDER_PROCESS_GROUPS.size > 0) {
      throw new Error(`benchmark provider cleanup did not drain ${ACTIVE_PROVIDER_PROCESS_GROUPS.size} process group(s)`);
    }
  } catch (error) {
    // Never reopen the lane when complete provider termination is uncertain.
    PRESERVE_EXPENSIVE_RUN_LOCK = true;
    throw error;
  }
}

function releaseActiveExpensiveRunLock(): void {
  if (PRESERVE_EXPENSIVE_RUN_LOCK) return;
  ACTIVE_EXPENSIVE_RUN_LOCK?.release();
  ACTIVE_EXPENSIVE_RUN_LOCK = null;
}

export function installProducerSignalCleanup(): void {
  let terminating = false;
  for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const) {
    process.on(signal, () => {
      if (terminating) return;
      terminating = true;
      PRODUCER_TERMINATING = true;
      PRODUCER_SIGNAL_TERMINATING = true;
      void terminateActiveProviderGroups()
        .then(() => {
          releaseActiveExpensiveRunLock();
          process.exit(exitCode);
        })
        .catch((error) => {
          console.error(error instanceof Error ? error.message : String(error));
          // The exact token intentionally remains for manual recovery.
          process.exit(exitCode);
        });
    });
  }
}

export async function runBoundedProviderProcess(
  command: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  deadlineMs: number,
): Promise<ProviderProcessResult> {
  if (PRODUCER_TERMINATING) throw new Error('benchmark producer is terminating; refusing a new provider arm');
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) throw new Error('benchmark wall-clock budget exhausted before provider start');
  const processHandle = Bun.spawn(command, {
    cwd, env, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore', detached: true,
  });
  ACTIVE_PROVIDER_PROCESS_GROUPS.add(processHandle.pid);
  let groupDrained = false;
  try {
    const stdoutPromise = new Response(processHandle.stdout).text();
    const stderrPromise = new Response(processHandle.stderr).text();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const groupCompletion = processHandle.exited.then(async () => {
      return await waitForProcessGroupExit(processHandle.pid, deadlineMs)
        ? 'exited' as const
        : 'timed-out' as const;
    });
    const outcome = await Promise.race([
      groupCompletion,
      new Promise<'timed-out'>((resolveTimeout) => {
        timer = setTimeout(() => resolveTimeout('timed-out'), remainingMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    const timedOut = outcome === 'timed-out';
    if (timedOut) {
      signalProcessGroup(processHandle.pid, 'SIGTERM');
      await Bun.sleep(BENCHMARK_TERMINATION_GRACE_MS);
      // The group leader may exit before a descendant that ignored SIGTERM.
      // Always address the original process group after the grace period; ESRCH
      // means the whole group is already gone.
      signalProcessGroup(processHandle.pid, 'SIGKILL');
      groupDrained = await waitForProcessGroupExit(
        processHandle.pid,
        Date.now() + BENCHMARK_TERMINATION_GRACE_MS,
      );
      if (!groupDrained) {
        PRESERVE_EXPENSIVE_RUN_LOCK = true;
        throw new Error(`benchmark provider process group ${processHandle.pid} did not terminate`);
      }
    } else {
      groupDrained = true;
    }
    const [stdout, stderr, exitCode] = await Promise.all([
      stdoutPromise, stderrPromise, processHandle.exited,
    ]);
    return { stdout, stderr, exitCode, signalCode: processHandle.signalCode, timedOut };
  } finally {
    if (groupDrained || !processGroupExists(processHandle.pid)) {
      ACTIVE_PROVIDER_PROCESS_GROUPS.delete(processHandle.pid);
    } else {
      // Keep the exact token and active PGID registered when group absence is
      // uncertain. Reopening the lane would allow overlapping benchmark work.
      PRESERVE_EXPENSIVE_RUN_LOCK = true;
    }
  }
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('benchmark concurrency must be a positive integer');
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (failure === undefined) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        failure = error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  if (failure !== undefined) throw failure;
  return results;
}

function hashFile(path: string): string {
  return sha256(readFileSync(path));
}

export function hashTree(root: string): string {
  const entries: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(dir, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isSymbolicLink()) {
        entries.push(`${path}\0symlink\0${readlinkSync(absolute, { encoding: 'buffer' }).toString('hex')}`);
      } else entries.push(`${path}\0${statSync(absolute).mode & 0o777}\0${hashFile(absolute)}`);
    }
  };
  visit(root);
  return sha256(entries.join('\0'));
}

function hashPathSet(root: string, paths: readonly string[]): string {
  const entries = paths.map((path) => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) throw new Error(`benchmark subject input missing: ${path}`);
    return `${path}\0${statSync(absolute).isDirectory() ? hashTree(absolute) : hashFile(absolute)}`;
  });
  return sha256(entries.join('\0'));
}

export function benchmarkSubject(root: string, manifestPath: string, seed: string) {
  const runnerSha256 = hashFile(resolve(import.meta.dir, 'run-harness-profile-benchmark.ts'));
  const scenarioManifestSha256 = hashFile(manifestPath);
  const fixtureSetSha256 = hashTree(seed);
  const installProfileInputsSha256 = hashPathSet(root, INSTALL_PROFILE_INPUTS);
  const providerInvocationSchemaSha256 = sha256(JSON.stringify(PROVIDER_INVOCATION_SCHEMA));
  return {
    benchmark_subject_sha256: sha256(JSON.stringify({
      runner_sha256: runnerSha256,
      scenario_manifest_sha256: scenarioManifestSha256,
      fixture_set_sha256: fixtureSetSha256,
      install_profile_inputs_sha256: installProfileInputsSha256,
      provider_invocation_schema_sha256: providerInvocationSchemaSha256,
    })),
    runner_sha256: runnerSha256,
    scenario_manifest_sha256: scenarioManifestSha256,
    fixture_set_sha256: fixtureSetSha256,
    install_profile_inputs_sha256: installProfileInputsSha256,
    provider_invocation_schema_sha256: providerInvocationSchemaSha256,
  };
}

function workspaceEvidenceHash(workspace: string, baselineRevision?: string): string {
  const paths = benchmarkChangedFiles(workspace, baselineRevision);
  const entries = paths.map((path) => {
    const absolute = join(workspace, path);
    if (!existsSync(absolute)) return `${path}\0deleted`;
    return `${path}\0${statSync(absolute).mode & 0o777}\0${hashFile(absolute)}`;
  });
  return sha256(entries.join('\0'));
}

export function noHarnessIsolation(provider: BenchmarkProvider, profile: BenchmarkProfile, jsonl: string, hookCount: number): BenchmarkRunRecord['no_harness_isolation'] {
  if (profile !== 'no-harness') return 'not_applicable';
  if (hookCount !== 0) return 'failed';
  if (provider === 'codex') return 'passed';
  for (const line of jsonl.split('\n')) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type !== 'system' || event.subtype !== 'init') continue;
      const empty = (key: string) => Array.isArray(event[key]) && (event[key] as unknown[]).length === 0;
      return empty('skills') && empty('plugins') && empty('mcp_servers') && empty('slash_commands') ? 'passed' : 'failed';
    } catch { /* continue to the structured init event */ }
  }
  return 'unavailable';
}

export function isAuthoritativeCompletedRecord(record: BenchmarkRunRecord): boolean {
  return typeof record.baseline_revision === 'string'
    && /^[a-f0-9]{40}$/.test(record.baseline_revision)
    && record.provider_exit_code === 0
    && record.usage_authority === 'structured-provider'
    && record.status === 'passed'
    && record.grader_acceptance === 'passed'
    && (record.profile !== 'no-harness' || record.no_harness_isolation === 'passed');
}

export function isCompleteBenchmarkMatrix(
  records: readonly BenchmarkRunRecord[],
  scenarios: readonly HarnessScenario[],
): boolean {
  if (scenarios.length !== 9 || records.length !== BENCHMARK_PROFILES.length * scenarios.length) return false;
  const expected = new Set(BENCHMARK_PROFILES.flatMap((profile) => (
    scenarios.map((scenario) => `${profile}\0${scenario.id}`)
  )));
  for (const record of records) {
    if (!expected.delete(`${record.profile}\0${record.scenario_id}`)) return false;
  }
  return expected.size === 0;
}

interface PreparedProfileBase {
  id: string;
  profile: BenchmarkProfile;
  workspace: string;
  home: string;
  workspaceSha256: string;
  homeSha256: string;
}

export interface BenchmarkRunLayout {
  profile: BenchmarkProfile;
  scenario_id: string;
  profile_base_id: string;
  workspace: string;
  home: string;
}

export function benchmarkRunLayout(
  root: string,
  profiles: readonly BenchmarkProfile[],
  scenarios: readonly HarnessScenario[],
  reportRunId: string,
): BenchmarkRunLayout[] {
  return profiles.flatMap((profile) => scenarios.map((scenario) => ({
    profile,
    scenario_id: scenario.id,
    profile_base_id: `${reportRunId}:${profile}:base`,
    workspace: join(root, profile, scenario.id, 'workspace'),
    home: join(root, profile, scenario.id, 'home'),
  })));
}

export function prepareBenchmarkProfiles<T>(
  profiles: readonly BenchmarkProfile[],
  prepare: (profile: BenchmarkProfile) => T,
): Map<BenchmarkProfile, T> {
  const prepared = new Map<BenchmarkProfile, T>();
  for (const profile of profiles) {
    if (prepared.has(profile)) throw new Error(`duplicate benchmark profile: ${profile}`);
    prepared.set(profile, prepare(profile));
  }
  return prepared;
}

function initializeBenchmarkWorkspace(seed: string, workspace: string): void {
  mkdirSync(dirname(workspace), { recursive: true });
  cpSync(seed, workspace, { recursive: true });
  run('git', ['init', '-b', 'main'], workspace);
  run('git', ['config', 'user.email', 'benchmark@example.com'], workspace);
  run('git', ['config', 'user.name', 'Benchmark'], workspace);
  run('git', ['add', '.'], workspace);
  run('git', ['commit', '-m', 'benchmark seed'], workspace);
}

function writeStrictArtifacts(workspace: string, scenario: HarnessScenario, activeWorktree: string): void {
  const plan = 'plans/plan-20000101-0000-benchmark.md';
  const contract = 'tasks/contracts/20000101-0000-benchmark.contract.md';
  mkdirSync(join(workspace, 'plans'), { recursive: true });
  mkdirSync(join(workspace, 'tasks/contracts'), { recursive: true });
  mkdirSync(join(workspace, '.ai/harness'), { recursive: true });
  writeFileSync(join(workspace, plan), [
    '# Benchmark Plan', '', '> **Status**: Executing', `> **Task Contract**: ${contract}`, '',
    '## Task Breakdown', `- [ ] ${scenario.id}`, '', '## Evidence Contract',
    '- **State/progress path**: benchmark record', '- **Verification evidence**: acceptance command',
    '- **Evaluator rubric**: deterministic grader', '- **Stop condition**: grader pass', '- **Rollback surface**: disposable worktree', '',
  ].join('\n'));
  writeFileSync(join(workspace, contract), [
    '# Benchmark Contract', '', '> **Status**: Active', `> **Plan**: ${plan}`, '> **Task Profile**: code-change',
    '> **Workflow Profile**: strict', '', '## Allowed Paths', '```yaml', 'allowed_paths:',
    '  - src/', '  - tests/', '  - deploy/', '```', '',
  ].join('\n'));
  writeFileSync(join(workspace, '.ai/harness/active-plan'), `${plan}\n`);
  writeFileSync(join(workspace, '.ai/harness/active-worktree'), `${activeWorktree}\n`);
}

export function writeResumeProjection(workspace: string): void {
  mkdirSync(join(workspace, '.ai/harness/handoff'), { recursive: true });
  writeFileSync(join(workspace, '.ai/harness/handoff/resume.md'), [
    '# Resume', '', '## Exact Next Step', 'Change src/recovery.ts so recoveryState() returns complete.',
    '', '## Verification', 'bun test tests/recovery.test.ts', '',
  ].join('\n'));
}

function copyCodexAuthOnly(hostRoot: string): void {
  const sourceHome = process.env.CODEX_HOME ?? join(process.env.HOME ?? '', '.codex');
  const source = join(sourceHome, 'auth.json');
  if (!existsSync(source)) throw new Error(`Codex auth unavailable: ${source}`);
  mkdirSync(join(hostRoot, '.codex'), { recursive: true });
  cpSync(source, join(hostRoot, '.codex/auth.json'));
}

export function isolatedHarnessEnvironment(hostRoot: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: hostRoot,
    CODEX_HOME: join(hostRoot, '.codex'),
    REPO_HARNESS_BRAIN_ROOT: join(hostRoot, 'brain'),
    BUN_INSTALL: join(hostRoot, '.bun'),
    PATH: `${join(hostRoot, '.bun/bin')}:${process.env.PATH ?? ''}`,
  };
}

function projectHarnessBase(
  profile: BenchmarkProfile,
  provider: BenchmarkProvider,
  workspace: string,
  hostRoot: string,
): void {
  if (profile === 'no-harness') return;
  const env = isolatedHarnessEnvironment(hostRoot);
  run(process.execPath, [join(ROOT, 'src/cli/index.ts'), 'adopt', '--repo', workspace, '--no-codegraph', '--mode', 'standard'], ROOT, env);
  const installProfile = profile === 'adaptive-lite' ? 'standard' : 'strict';
  run(process.execPath, [
    join(ROOT, 'src/cli/index.ts'), 'install', '--profile', installProfile, '--target', provider,
    '--no-external-skills', '--no-codegraph', '--json',
  ], ROOT, env);
  run('git', ['add', '.'], workspace, env);
  run('git', ['commit', '--allow-empty', '-m', `benchmark ${profile} base`], workspace, env);
}

function prepareProfileBase(
  profile: BenchmarkProfile,
  provider: BenchmarkProvider,
  seed: string,
  root: string,
  reportRunId: string,
): PreparedProfileBase {
  const baseRoot = join(root, profile, 'profile-base');
  const workspace = join(baseRoot, 'workspace');
  const home = join(baseRoot, 'home');
  initializeBenchmarkWorkspace(seed, workspace);
  mkdirSync(home, { recursive: true });
  if (provider === 'codex') copyCodexAuthOnly(home);
  projectHarnessBase(profile, provider, workspace, home);
  return {
    id: `${reportRunId}:${profile}:base`,
    profile,
    workspace: realpathSync(workspace),
    home: realpathSync(home),
    workspaceSha256: hashTree(workspace),
    homeSha256: hashTree(home),
  };
}

function assertProfileBaseImmutable(base: PreparedProfileBase): void {
  if (hashTree(base.workspace) !== base.workspaceSha256 || hashTree(base.home) !== base.homeSha256) {
    throw new Error(`benchmark profile base mutated: ${base.profile}`);
  }
}

export function rebaseAbsoluteSymlinks(sourceRoot: string, targetRoot: string): void {
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isSymbolicLink()) {
        const linkTarget = readlinkSync(absolute);
        if (linkTarget === sourceRoot || linkTarget.startsWith(`${sourceRoot}/`)) {
          unlinkSync(absolute);
          symlinkSync(`${targetRoot}${linkTarget.slice(sourceRoot.length)}`, absolute);
        }
      }
    }
  };
  visit(targetRoot);
}

export function cloneImmutableWorkspaceBase(source: string, target: string): void {
  run('git', ['clone', '--local', '--no-hardlinks', '--quiet', source, target], dirname(target));
  const armOrigin = join(dirname(target), 'origin.git');
  run('git', ['init', '--bare', '--quiet', armOrigin], dirname(target));
  // Every disposable arm has one canonical integration branch regardless of
  // the operator's init.defaultBranch or the source checkout's branch name.
  run('git', ['switch', '--quiet', '--force-create', 'main', 'HEAD'], target);
  run('git', ['remote', 'set-url', 'origin', armOrigin], target);
  run('git', ['push', '--quiet', '--set-upstream', 'origin', 'HEAD:refs/heads/main'], target);
}

export function addLinkedArmWorkspace(primary: string, target: string): void {
  run('git', ['worktree', 'add', '--quiet', '-b', 'codex/benchmark', target, 'HEAD'], primary);
}

export function createRunOverlay(base: PreparedProfileBase, layout: BenchmarkRunLayout, scenario: HarnessScenario): void {
  mkdirSync(dirname(layout.workspace), { recursive: true });
  const usesLinkedWorkspace = base.profile !== 'no-harness';
  const primaryWorkspace = usesLinkedWorkspace ? `${layout.workspace}-primary` : layout.workspace;
  cloneImmutableWorkspaceBase(base.workspace, primaryWorkspace);
  run('git', ['config', 'user.email', 'benchmark@example.com'], primaryWorkspace);
  run('git', ['config', 'user.name', 'Benchmark'], primaryWorkspace);
  cpSync(base.home, layout.home, { recursive: true, mode: constants.COPYFILE_FICLONE });
  rebaseAbsoluteSymlinks(base.home, layout.home);
  if (base.profile === 'strict-harness') {
    const canonicalWorkspace = join(realpathSync(dirname(layout.workspace)), basename(layout.workspace));
    writeStrictArtifacts(primaryWorkspace, scenario, canonicalWorkspace);
  }
  if (scenario.requires_resume_projection) writeResumeProjection(primaryWorkspace);
  run('git', ['add', '.'], primaryWorkspace);
  run('git', ['commit', '--allow-empty', '-m', `benchmark ${base.profile} ${scenario.id} input`], primaryWorkspace);
  if (usesLinkedWorkspace) {
    addLinkedArmWorkspace(primaryWorkspace, layout.workspace);
    // Handoff projections are intentionally ignored runtime state. Recreate
    // them in the linked workspace because `git worktree add` can only project
    // committed input from the private primary clone.
    if (scenario.requires_resume_projection) writeResumeProjection(layout.workspace);
  }
  assertProfileBaseImmutable(base);
}

export function codexBenchmarkCommand(profile: BenchmarkProfile, workspace: string, prompt: string): string[] {
  const args: string[] = [...PROVIDER_INVOCATION_SCHEMA.codex.common, '--cd', workspace];
  if (profile === 'no-harness') args.push(...PROVIDER_INVOCATION_SCHEMA.codex.no_harness);
  else args.push(...PROVIDER_INVOCATION_SCHEMA.codex.harness);
  args.push(prompt);
  return ['codex', ...args];
}

export function claudeBenchmarkCommand(
  profile: BenchmarkProfile,
  hostRoot: string,
  prompt: string,
): string[] {
  const args: string[] = [...PROVIDER_INVOCATION_SCHEMA.claude.common];
  if (profile === 'no-harness') args.push(...PROVIDER_INVOCATION_SCHEMA.claude.no_harness);
  else args.push(...PROVIDER_INVOCATION_SCHEMA.claude.harness, '--settings', join(hostRoot, '.claude/settings.json'));
  args.push(prompt);
  return ['claude', ...args];
}

function benchmarkCommand(
  provider: BenchmarkProvider,
  profile: BenchmarkProfile,
  workspace: string,
  hostRoot: string,
  prompt: string,
): string[] {
  return provider === 'claude'
    ? claudeBenchmarkCommand(profile, hostRoot, prompt)
    : codexBenchmarkCommand(profile, workspace, prompt);
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(quantile * sorted.length) - 1] ?? sorted[sorted.length - 1];
}

// Parses `git status --porcelain=v1 -z` output: NUL-delimited entries of
// `XY path`, with rename/copy entries (X or Y === 'R'/'C') followed by a
// separate NUL token carrying the source path. -z is required for
// correctness, not just convenience: the newline-delimited (non -z) format
// quotes paths containing special characters and renders renames as a single
// `old -> new` line, which a fixed `.slice(3)` cannot parse back into a real
// path -- only the new path is kept for a rename, since that is the file's
// current, artifact-relevant location (counting both old and new would
// double-count one rename as two artifacts).
export function parsePorcelainPaths(output: string): string[] {
  const tokens = output.split('\0').filter((token) => token.length > 0);
  const paths: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const entry = tokens[index];
    if (entry.length < 3) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) continue;
    paths.push(path);
    if (xy[0] === 'R' || xy[0] === 'C' || xy[1] === 'R' || xy[1] === 'C') {
      // Consume the paired source-path token so it is never mis-read as the
      // next status entry.
      index += 1;
    }
  }
  return paths;
}

export function benchmarkChangedFiles(workspace: string, baselineRevision?: string): string[] {
  const status = spawnSync('git', ['status', '--porcelain=v1', '-uall', '-z'], { cwd: workspace, encoding: 'utf-8' });
  if (status.status !== 0) throw new Error(status.stderr || status.stdout || 'git status failed');
  const paths = new Set(parsePorcelainPaths(status.stdout));
  if (baselineRevision) {
    const committed = spawnSync(
      'git', ['diff', '--name-only', '--no-renames', '-z', baselineRevision, '--'],
      { cwd: workspace, encoding: 'utf-8' },
    );
    if (committed.status !== 0) throw new Error(committed.stderr || committed.stdout || 'git baseline diff failed');
    for (const path of committed.stdout.split('\0').filter(Boolean)) paths.add(path);
  }
  return [...paths].sort();
}

export function readHookMetrics(workspace: string): HookEventTelemetryRecord[] {
  const path = join(workspace, HOOK_EVENT_TELEMETRY_PATH);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records: HookEventTelemetryRecord[] = [];
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`invalid hook event telemetry JSON in ${path}`);
    }
    if (!isHookEventTelemetryRecord(parsed)) {
      throw new Error(`invalid or mixed hook event telemetry protocol in ${path}`);
    }
    records.push(parsed);
  }
  return records;
}

function providerUsage(jsonl: string): Pick<BenchmarkRunRecord, 'usage_authority' | 'provider_unavailable_reason' | 'input_tokens' | 'cached_input_tokens' | 'output_tokens' | 'model_call_count' | 'subagent_call_count'> {
  let usage: Record<string, unknown> | null = null;
  let providerError: string | null = null;
  for (const line of jsonl.split('\n')) {
    try {
      const event = JSON.parse(line) as { type?: unknown; usage?: unknown; message?: unknown; error?: { message?: unknown } };
      if (event.type === 'turn.completed' && event.usage && typeof event.usage === 'object') usage = event.usage as Record<string, unknown>;
      if ((event.type === 'turn.failed' || event.type === 'error') && typeof (event.error?.message ?? event.message) === 'string') {
        providerError = (event.error?.message ?? event.message) as string;
      }
    } catch { /* provider stderr/non-JSON does not create authority */ }
  }
  const number = (key: string): number | null => typeof usage?.[key] === 'number' ? usage[key] as number : null;
  return {
    usage_authority: usage ? 'structured-provider' : 'unavailable',
    provider_unavailable_reason: usage ? null : providerError ?? 'missing_structured_usage',
    input_tokens: number('input_tokens'),
    cached_input_tokens: number('cached_input_tokens'),
    output_tokens: number('output_tokens'),
    model_call_count: number('model_call_count'),
    subagent_call_count: number('subagent_call_count'),
  };
}

function claudeProviderUsage(jsonl: string): Pick<BenchmarkRunRecord, 'usage_authority' | 'provider_unavailable_reason' | 'input_tokens' | 'cached_input_tokens' | 'output_tokens' | 'model_call_count' | 'subagent_call_count'> {
  let result: {
    subtype?: unknown;
    is_error?: unknown;
    result?: unknown;
    num_turns?: unknown;
    usage?: Record<string, unknown>;
  } | null = null;
  let subagents = 0;
  for (const line of jsonl.split('\n')) {
    try {
      const event = JSON.parse(line) as {
        type?: unknown;
        subtype?: unknown;
        is_error?: unknown;
        result?: unknown;
        num_turns?: unknown;
        usage?: Record<string, unknown>;
        message?: { content?: Array<{ type?: unknown; name?: unknown }> };
      };
      if (event.type === 'result') result = event;
      if (event.type === 'assistant') {
        subagents += event.message?.content?.filter((item) => item.type === 'tool_use' && item.name === 'Task').length ?? 0;
      }
    } catch { /* provider stderr/non-JSON does not create authority */ }
  }
  const number = (key: string): number | null => typeof result?.usage?.[key] === 'number' ? result.usage[key] as number : null;
  const rawInput = number('input_tokens');
  const cacheCreation = number('cache_creation_input_tokens');
  const input = rawInput === null ? null : rawInput + (cacheCreation ?? 0);
  const ok = result?.subtype === 'success' && result.is_error === false && result.usage;
  return {
    usage_authority: ok ? 'structured-provider' : 'unavailable',
    provider_unavailable_reason: ok ? null : typeof result?.result === 'string' ? result.result : 'missing_structured_usage',
    input_tokens: ok ? input : null,
    cached_input_tokens: ok ? number('cache_read_input_tokens') : null,
    output_tokens: ok ? number('output_tokens') : null,
    model_call_count: ok && typeof result?.num_turns === 'number' ? result.num_turns : null,
    subagent_call_count: ok ? subagents : null,
  };
}

// Each arm home is a disposable toolchain/config overlay. The retained
// workspace is the regrade authority; deleting the home after all result
// extraction bounds peak disk use without changing benchmark semantics.
export function cleanupArmHostRoot(hostRoot: string): void {
  rmSync(hostRoot, { recursive: true, force: true });
}

async function executeRun(
  provider: BenchmarkProvider,
  base: PreparedProfileBase,
  scenario: HarnessScenario,
  layout: BenchmarkRunLayout,
  reportRunId: string,
  deadlineMs: number,
): Promise<BenchmarkRunRecord> {
  const runRoot = dirname(layout.workspace);
  createRunOverlay(base, layout, scenario);
  const workspace = realpathSync(layout.workspace);
  const hostRoot = realpathSync(layout.home);
  const baselineRevision = run('git', ['rev-parse', 'HEAD'], workspace);
  const command = benchmarkCommand(provider, base.profile, workspace, hostRoot, scenario.prompt);
  const started = Date.now();
  let firstEdit: number | null = null;
  const providerPromise = runBoundedProviderProcess(command, workspace, {
      ...isolatedHarnessEnvironment(hostRoot),
      // Claude keeps the real HOME only for its host authentication. Every
      // repo-harness-owned mutable authority remains pinned to the disposable
      // benchmark host by isolatedHarnessEnvironment.
      HOME: provider === 'codex' ? hostRoot : process.env.HOME,
      CODEX_HOME: provider === 'codex' ? join(hostRoot, '.codex') : process.env.CODEX_HOME,
      HOOK_SESSION_ID: `${base.profile}-${scenario.id}`,
    }, deadlineMs);
  const poll = setInterval(() => {
    if (firstEdit === null && benchmarkChangedFiles(workspace, baselineRevision).length > 0) firstEdit = Date.now() - started;
  }, 50);
  const providerResult = await providerPromise;
  const { stdout, stderr, exitCode } = providerResult;
  clearInterval(poll);
  const duration = Date.now() - started;
  mkdirSync(runRoot, { recursive: true });
  writeFileSync(join(runRoot, 'provider.jsonl'), stdout);
  writeFileSync(join(runRoot, 'provider.stderr.txt'), stderr);
  const grader = spawnSync('bash', ['-lc', scenario.acceptance_command], { cwd: workspace, encoding: 'utf-8' });
  writeFileSync(join(runRoot, 'grader.stdout.txt'), grader.stdout ?? '');
  writeFileSync(join(runRoot, 'grader.stderr.txt'), grader.stderr ?? '');
  const changed = benchmarkChangedFiles(workspace, baselineRevision);
  const expectedPathsPassed = scenario.expected_paths.length === 0
    ? changed.length === 0
    : scenario.expected_paths.every((path) => changed.includes(path));
  const hooks = readHookMetrics(workspace);
  const hookDurations = hooks.map((entry) => entry.metrics.elapsed_ms);
  const knownOutputBytes = hooks.every((entry) => entry.steps.every((step) => step.output_bytes !== null))
    ? hooks.reduce((sum, entry) => sum + entry.steps.reduce((stepSum, step) => stepSum + (step.output_bytes ?? 0), 0), 0)
    : null;
  const fingerprints = new Set<string>();
  let repeated = 0;
  for (const hook of hooks.filter((entry) => entry.blocked)) {
    if (fingerprints.has(hook.fingerprint)) repeated += 1;
    fingerprints.add(hook.fingerprint);
  }
  let contextTokens: number | null = null;
  const contextEvidence = join(workspace, '.ai/harness/state/session-context-budget.json');
  if (existsSync(contextEvidence)) {
    const parsed = JSON.parse(readFileSync(contextEvidence, 'utf-8')) as { estimated_tokens?: unknown };
    if (typeof parsed.estimated_tokens === 'number') contextTokens = parsed.estimated_tokens;
  }
  const artifactFiles = changed.filter((path) => /^(plans|tasks|\.ai\/harness)\//.test(path));
  const graderPassed = grader.status === 0 && expectedPathsPassed;
  const workspaceHash = workspaceEvidenceHash(workspace, baselineRevision);
  cleanupArmHostRoot(hostRoot);
  return {
    run_id: `${reportRunId}:${base.profile}:${scenario.id}`,
    profile: base.profile, scenario_id: scenario.id, profile_base_id: base.id, workspace, home: hostRoot,
    baseline_revision: baselineRevision,
    command, status: exitCode === 0 && graderPassed ? 'passed' : 'failed',
    provider_exit_code: exitCode,
    ...(provider === 'claude' ? claudeProviderUsage(stdout) : providerUsage(stdout)),
    time_to_first_edit_ms: firstEdit,
    total_duration_ms: duration, hook_invocation_count: hooks.length,
    hook_total_duration_ms: hookDurations.reduce((sum, value) => sum + value, 0),
    hook_p50_ms: percentile(hookDurations, 0.5), hook_p95_ms: percentile(hookDurations, 0.95), hook_p99_ms: percentile(hookDurations, 0.99),
    hook_output_bytes: knownOutputBytes, session_start_context_tokens: contextTokens,
    guard_block_count: hooks.filter((entry) => entry.blocked).length,
    repeated_guard_fingerprint_count: repeated, artifact_files_created: artifactFiles.length, artifact_files: artifactFiles,
    profile_projection_artifact_files: base.profile === 'strict-harness' ? 2 : 0,
    grader_acceptance: graderPassed ? 'passed' : 'failed',
    no_harness_isolation: noHarnessIsolation(provider, base.profile, stdout, hooks.length),
    evidence_hashes: {
      provider_stream: sha256(stdout), provider_stderr: sha256(stderr),
      grader_stdout: sha256(grader.stdout ?? ''), grader_stderr: sha256(grader.stderr ?? ''),
      workspace: workspaceHash,
    },
  };
}

function dryRunRecord(provider: BenchmarkProvider, scenario: HarnessScenario, layout: BenchmarkRunLayout, reportRunId: string): BenchmarkRunRecord {
  const { profile, workspace, home } = layout;
  return {
    run_id: `${reportRunId}:${profile}:${scenario.id}`,
    profile, scenario_id: scenario.id, profile_base_id: layout.profile_base_id, workspace, home,
    baseline_revision: null,
    command: benchmarkCommand(provider, profile, workspace, home, scenario.prompt), status: 'dry-run',
    provider_exit_code: null, usage_authority: 'unavailable', provider_unavailable_reason: 'dry-run', input_tokens: null, cached_input_tokens: null, output_tokens: null,
    model_call_count: null, subagent_call_count: null, time_to_first_edit_ms: null, total_duration_ms: null,
    hook_invocation_count: 0, hook_total_duration_ms: 0, hook_p50_ms: null, hook_p95_ms: null, hook_p99_ms: null,
    hook_output_bytes: null, session_start_context_tokens: null, guard_block_count: 0,
    repeated_guard_fingerprint_count: 0, artifact_files_created: 0, artifact_files: [], profile_projection_artifact_files: profile === 'strict-harness' ? 2 : 0,
    grader_acceptance: 'unavailable', no_harness_isolation: 'unavailable',
    evidence_hashes: { provider_stream: null, provider_stderr: null, grader_stdout: null, grader_stderr: null, workspace: null },
  };
}

function markdownReportPath(reportPath: string): string {
  return reportPath.endsWith('.json') ? reportPath.replace(/\.json$/, '.md') : `${reportPath}.md`;
}

export function reportByteBindingPath(reportPath: string): string {
  return reportPath.endsWith('.json') ? reportPath.replace(/\.json$/, '.sha256.json') : `${reportPath}.sha256.json`;
}

function writeReportByteBinding(report: HarnessBenchmarkReport, reportPath: string): HarnessBenchmarkReportByteBinding {
  const markdownPath = markdownReportPath(reportPath);
  const jsonBytes = readFileSync(reportPath);
  const markdownBytes = readFileSync(markdownPath);
  const binding: HarnessBenchmarkReportByteBinding = {
    protocol: 'repo-harness-profile-benchmark/report-bytes/v1',
    benchmark_subject_sha256: report.benchmark_subject_sha256,
    files: {
      json: { path: basename(reportPath), bytes: jsonBytes.byteLength, sha256: sha256(jsonBytes) },
      markdown: { path: basename(markdownPath), bytes: markdownBytes.byteLength, sha256: sha256(markdownBytes) },
    },
  };
  writeFileSync(reportByteBindingPath(reportPath), `${JSON.stringify(binding, null, 2)}\n`);
  return binding;
}

export function validateHarnessBenchmarkReportByteBinding(
  reportPath: string,
  expectedSubject?: string,
): HarnessBenchmarkReportByteBinding {
  const bindingPath = reportByteBindingPath(reportPath);
  if (!existsSync(bindingPath)) throw new Error(`benchmark report byte binding missing: ${bindingPath}`);
  const binding = JSON.parse(readFileSync(bindingPath, 'utf-8')) as HarnessBenchmarkReportByteBinding;
  if (binding.protocol !== 'repo-harness-profile-benchmark/report-bytes/v1') {
    throw new Error('invalid benchmark report byte binding protocol');
  }
  if (!binding.benchmark_subject_sha256 || (expectedSubject && binding.benchmark_subject_sha256 !== expectedSubject)) {
    throw new Error('benchmark report byte binding subject mismatch');
  }
  const markdownPath = markdownReportPath(reportPath);
  const expected = [
    ['json', reportPath, binding.files?.json],
    ['markdown', markdownPath, binding.files?.markdown],
  ] as const;
  for (const [label, path, entry] of expected) {
    if (!entry || entry.path !== basename(path) || !Number.isInteger(entry.bytes) || entry.bytes < 0 || !entry.sha256) {
      throw new Error(`invalid benchmark ${label} byte binding`);
    }
    const bytes = readFileSync(path);
    if (entry.bytes !== bytes.byteLength || entry.sha256 !== sha256(bytes)) {
      throw new Error(`benchmark ${label} report bytes changed`);
    }
  }
  return binding;
}

function writeHarnessBenchmarkReport(report: HarnessBenchmarkReport, reportPath: string): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const markdownPath = markdownReportPath(reportPath);
  const rows = BENCHMARK_PROFILES.map((profile) => {
    const profileRecords = report.records.filter((record) => record.profile === profile);
    const passed = profileRecords.filter((record) => record.status === 'passed').length;
    const durations = profileRecords.map((record) => record.total_duration_ms).filter((value): value is number => value !== null);
    const tokens = profileRecords.map((record) => record.input_tokens === null || record.output_tokens === null ? null : record.input_tokens + record.output_tokens);
    const knownTokens = tokens.filter((value): value is number => value !== null);
    const recovery = profileRecords.find((record) => record.scenario_id === 'cross-session-recovery');
    const taskArtifacts = profileRecords.reduce((sum, record) => sum + record.artifact_files_created, 0);
    const projectionArtifacts = profileRecords.reduce((sum, record) => sum + record.profile_projection_artifact_files, 0);
    return `| ${profile} | ${passed}/${profileRecords.length} | ${knownTokens.length ? knownTokens.reduce((a, b) => a + b, 0) : 'unavailable'} | ${durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 'unavailable'} | ${taskArtifacts} | ${projectionArtifacts} | ${recovery?.grader_acceptance ?? 'unavailable'} |`;
  });
  const artifactLines = report.records
    .filter((record) => record.artifact_files.length > 0)
    .map((record) => `- ${record.profile}/${record.scenario_id}: ${record.artifact_files.join(', ')}`);
  writeFileSync(markdownPath, [
    '# Harness Profile Benchmark', '',
    `> **Authority**: ${report.authoritative ? `live ${report.provider} provider execution` : 'incomplete/dry-run; non-authoritative'}`,
    `> **Generated**: ${report.generated_at}`,
    `> **Run ID**: ${report.run_id}`,
    `> **Benchmark subject**: ${report.benchmark_subject_sha256}`,
    `> **Source commit**: ${report.source_commit}`,
    `> **Provider version**: ${report.provider_version}`,
    `> **Hashes**: runner=${report.runner_sha256}; scenarios=${report.scenario_manifest_sha256}; fixtures=${report.fixture_set_sha256}; install=${report.install_profile_inputs_sha256}; provider-schema=${report.provider_invocation_schema_sha256}`,
    `> **Profile bases / arms**: ${report.provenance.profile_base_count} / ${report.provenance.arm_count}`, '',
    '| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |',
    '|---|---:|---:|---:|---:|---:|---|', ...rows, '',
    'Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.', '',
    '## Artifact Files', '',
    'Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).', '',
    artifactLines.length > 0 ? artifactLines.join('\n') : '(none)', '',
  ].join('\n'));
  writeReportByteBinding(report, reportPath);
}

export function validateHarnessBenchmarkReport(
  reportPath: string,
  requireAuthoritative = false,
): HarnessBenchmarkReport {
  const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as HarnessBenchmarkReport;
  if (report.protocol !== 'repo-harness-profile-benchmark/report/v2') throw new Error('invalid benchmark report protocol');
  if (!BENCHMARK_PROVIDERS.includes(report.provider) || JSON.stringify(report.profiles) !== JSON.stringify(BENCHMARK_PROFILES)) {
    throw new Error('invalid benchmark report provider or profiles');
  }
  if (!/^[a-f0-9]{40}$/.test(report.source_commit)) throw new Error('invalid benchmark source commit metadata');
  if (report.report_byte_binding !== basename(reportByteBindingPath(reportPath))) {
    throw new Error('benchmark report byte binding path mismatch');
  }
  validateHarnessBenchmarkReportByteBinding(reportPath, report.benchmark_subject_sha256);
  const manifestPath = resolve(ROOT, report.manifest);
  if (relative(ROOT, manifestPath).startsWith('..')) throw new Error('benchmark manifest path escapes repository');
  const manifest = loadHarnessScenarioManifest(manifestPath);
  const currentSubject = benchmarkSubject(ROOT, manifestPath, resolve(ROOT, manifest.seed));
  for (const [field, value] of Object.entries(currentSubject)) {
    if (report[field as keyof HarnessBenchmarkReport] !== value) throw new Error(`benchmark subject changed at ${field}`);
  }
  if (report.scenario_count !== manifest.scenarios.length || !isCompleteBenchmarkMatrix(report.records, manifest.scenarios)) {
    throw new Error('benchmark report is not the complete unique 3x9 matrix');
  }
  if (report.provenance?.producer !== 'repo-harness-profile-benchmark'
    || report.provenance.profile_base_count !== 3
    || report.provenance.arm_count !== 27
    || report.provenance.profile_bases.length !== 3) {
    throw new Error('benchmark provenance counts are invalid');
  }
  const bases = new Map(report.provenance.profile_bases.map((base) => [base.profile, base]));
  if (bases.size !== 3 || BENCHMARK_PROFILES.some((profile) => !bases.has(profile))) {
    throw new Error('benchmark profile base provenance is invalid');
  }
  if (new Set(report.records.map((record) => record.workspace)).size !== 27
    || new Set(report.records.map((record) => record.home)).size !== 27
    || report.records.some((record) => bases.get(record.profile)?.id !== record.profile_base_id)) {
    throw new Error('benchmark arm isolation provenance is invalid');
  }
  const provenanceComplete = report.provenance.profile_bases.every((base) => (
    typeof base.workspace_sha256 === 'string' && typeof base.home_sha256 === 'string'
  ));
  const authoritative = provenanceComplete && report.records.every(isAuthoritativeCompletedRecord);
  if (report.authoritative !== authoritative) throw new Error('benchmark authoritative flag does not match evidence');
  if (requireAuthoritative && !authoritative) throw new Error('benchmark report is not authoritative');
  return report;
}

export function regradeHarnessBenchmarkReport(reportPath: string): HarnessBenchmarkReport {
  const report = validateHarnessBenchmarkReport(reportPath);
  const manifestPath = resolve(ROOT, report.manifest);
  const manifest = loadHarnessScenarioManifest(manifestPath);
  const scenarios = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));
  for (const record of report.records) {
    const scenario = scenarios.get(record.scenario_id);
    if (!scenario) throw new Error(`scenario missing while regrading: ${record.scenario_id}`);
    if (!record.baseline_revision || !record.evidence_hashes.workspace
      || workspaceEvidenceHash(record.workspace, record.baseline_revision) !== record.evidence_hashes.workspace) {
      throw new Error(`workspace evidence changed; refusing regrade: ${record.run_id}`);
    }
    const grader = spawnSync('bash', ['-lc', scenario.acceptance_command], { cwd: record.workspace, encoding: 'utf-8' });
    const changed = benchmarkChangedFiles(record.workspace, record.baseline_revision);
    const expectedPathsPassed = scenario.expected_paths.length === 0
      ? changed.length === 0
      : scenario.expected_paths.every((path) => changed.includes(path));
    const graderPassed = grader.status === 0 && expectedPathsPassed;
    record.grader_acceptance = graderPassed ? 'passed' : 'failed';
    record.status = record.provider_exit_code === 0 && graderPassed ? 'passed' : 'failed';
    record.evidence_hashes.grader_stdout = sha256(grader.stdout ?? '');
    record.evidence_hashes.grader_stderr = sha256(grader.stderr ?? '');
  }
  report.generated_at = new Date().toISOString();
  report.authoritative = isCompleteBenchmarkMatrix(report.records, manifest.scenarios)
    && report.provenance.profile_base_count === 3
    && report.provenance.arm_count === 27
    && report.provenance.profile_bases.every((base) => base.workspace_sha256 && base.home_sha256)
    && report.records.every(isAuthoritativeCompletedRecord);
  writeHarnessBenchmarkReport(report, reportPath);
  return report;
}

async function runHarnessProfileBenchmarkUnlocked(options: CliOptions) {
  const deadlineMs = Date.now() + BENCHMARK_WALL_TIME_BUDGET_MS;
  if (options.execute && run('git', ['status', '--porcelain=v1', '-uall'], ROOT) !== '') {
    throw new Error('authoritative benchmark requires a clean source checkout');
  }
  const manifest = loadHarnessScenarioManifest(options.manifest);
  const provider = options.provider ?? 'codex';
  const selected = options.scenario.length > 0
    ? manifest.scenarios.filter((scenario) => options.scenario.includes(scenario.id))
    : manifest.scenarios;
  const runRoot = mkdtempSync(join(tmpdir(), 'repo-harness-profile-benchmark-'));
  const seed = resolve(ROOT, manifest.seed);
  const reportRunId = randomUUID();
  const records: BenchmarkRunRecord[] = [];
  const profiles = (options.profile?.length ?? 0) > 0 ? options.profile! : [...BENCHMARK_PROFILES];
  if (options.requireAuthoritative && (
    JSON.stringify(profiles) !== JSON.stringify(BENCHMARK_PROFILES) || selected.length !== 9
  )) {
    throw new Error('authoritative benchmark requires the complete 3x9 matrix');
  }
  const layout = benchmarkRunLayout(runRoot, profiles, selected, reportRunId);
  const preparedBases = options.execute
    ? prepareBenchmarkProfiles(profiles, (profile) => prepareProfileBase(profile, provider, seed, runRoot, reportRunId))
    : new Map<BenchmarkProfile, PreparedProfileBase>();
  const scenarios = new Map(selected.map((scenario) => [scenario.id, scenario]));
  const executeArm = async (arm: BenchmarkRunLayout, index: number): Promise<BenchmarkRunRecord> => {
    try {
      const scenario = scenarios.get(arm.scenario_id);
      if (!scenario) throw new Error(`benchmark scenario missing from layout: ${arm.scenario_id}`);
      if (options.execute) {
        const base = preparedBases.get(arm.profile);
        if (!base) throw new Error(`benchmark profile base missing: ${arm.profile}`);
        const record = await executeRun(provider, base, scenario, arm, reportRunId, deadlineMs);
        assertProfileBaseImmutable(base);
        process.stdout.write(`benchmark arm ${index + 1}/${layout.length}: ${arm.profile}/${arm.scenario_id} -> ${record.status}\n`);
        if (options.requireAuthoritative && !isAuthoritativeCompletedRecord(record)) {
          throw new Error(`authoritative benchmark arm failed: ${arm.profile}/${arm.scenario_id}; evidence=${dirname(arm.workspace)}`);
        }
        return record;
      }
      return dryRunRecord(provider, scenario, arm, reportRunId);
    } catch (error) {
      if (options.requireAuthoritative) await terminateActiveProviderGroups();
      throw error;
    }
  };
  records.push(...await mapWithConcurrency(
    layout,
    options.execute ? BENCHMARK_MAX_CONCURRENCY : 1,
    executeArm,
  ));
  if (Date.now() > deadlineMs) throw new Error('benchmark wall-clock budget exhausted after provider execution');
  const completeMatrix = JSON.stringify(profiles) === JSON.stringify(BENCHMARK_PROFILES)
    && isCompleteBenchmarkMatrix(records, selected);
  const authoritative = options.execute && completeMatrix && records.every(isAuthoritativeCompletedRecord);
  const subject = benchmarkSubject(ROOT, options.manifest, seed);
  const report: HarnessBenchmarkReport = {
    protocol: 'repo-harness-profile-benchmark/report/v2', generated_at: new Date().toISOString(),
    run_id: reportRunId, authoritative, provider, manifest: relative(ROOT, options.manifest).replaceAll('\\', '/'),
    source_commit: run('git', ['rev-parse', 'HEAD'], ROOT),
    ...subject,
    report_byte_binding: basename(reportByteBindingPath(options.report)),
    provider_version: options.execute ? run(provider, ['--version'], ROOT) : 'unavailable',
    profiles,
    scenario_count: selected.length,
    records,
    provenance: {
      producer: 'repo-harness-profile-benchmark',
      profile_base_count: profiles.length,
      arm_count: layout.length,
      profile_bases: profiles.map((profile) => {
        const base = preparedBases.get(profile);
        return {
          id: `${reportRunId}:${profile}:base`, profile,
          workspace_sha256: base?.workspaceSha256 ?? null,
          home_sha256: base?.homeSha256 ?? null,
        };
      }),
    },
  };
  writeHarnessBenchmarkReport(report, options.report);
  if (options.requireAuthoritative) {
    const incomplete = records.filter((record) => !isAuthoritativeCompletedRecord(record));
    if (incomplete.length > 0) {
      throw new Error(`authoritative benchmark incomplete: ${incomplete.length}/${records.length} run(s) lacked successful structured provider execution; report=${options.report}`);
    }
    validateHarnessBenchmarkReport(options.report, true);
  }
  return report;
}

export async function withHarnessBenchmarkExecutionLock<T>(
  execute: boolean,
  lockCwd: string,
  runLocked: () => Promise<T>,
): Promise<T> {
  if (!execute) return runLocked();
  if (ACTIVE_EXPENSIVE_RUN_LOCK !== null) {
    throw new Error('benchmark execution lock is already owned by this process');
  }
  const lock = acquireExpensiveRunLock(lockCwd);
  ACTIVE_EXPENSIVE_RUN_LOCK = lock;
  try {
    lock.assertOwned();
    return await runLocked();
  } finally {
    if (!PRESERVE_EXPENSIVE_RUN_LOCK && !PRODUCER_SIGNAL_TERMINATING) {
      if (ACTIVE_EXPENSIVE_RUN_LOCK === lock) ACTIVE_EXPENSIVE_RUN_LOCK = null;
      lock.release();
    }
  }
}

export async function runHarnessProfileBenchmark(options: CliOptions) {
  if (PRODUCER_TERMINATING) throw new Error('benchmark producer is terminating');
  try {
    return await withHarnessBenchmarkExecutionLock(
      options.execute,
      ROOT,
      () => runHarnessProfileBenchmarkUnlocked(options),
    );
  } finally {
    if (!PRODUCER_SIGNAL_TERMINATING && !PRESERVE_EXPENSIVE_RUN_LOCK) PRODUCER_TERMINATING = false;
  }
}

if (import.meta.main) {
  installProducerSignalCleanup();
  const options = parseArgs(process.argv.slice(2));
  try {
    const report = options.regradeExisting
      ? regradeHarnessBenchmarkReport(options.report)
      : await runHarnessProfileBenchmark(options);
    console.log(`profile benchmark: ${report.records.length} runs -> ${options.report}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  } finally {
    releaseActiveExpensiveRunLock();
  }
}
