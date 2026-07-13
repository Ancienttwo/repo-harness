#!/usr/bin/env bun
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  rmSync, statSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';

const ROOT = resolve(import.meta.dir, '..');
const DEFAULT_MANIFEST = join(ROOT, 'evals/harness/scenarios.json');
const DEFAULT_REPORT = join(ROOT, 'evals/harness/reports/profile-comparison.json');
export const BENCHMARK_PROFILES = ['no-harness', 'adaptive-lite', 'strict-harness'] as const;
export type BenchmarkProfile = (typeof BENCHMARK_PROFILES)[number];
export const BENCHMARK_PROVIDERS = ['codex', 'claude'] as const;
export type BenchmarkProvider = (typeof BENCHMARK_PROVIDERS)[number];

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
  workspace: string;
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
  protocol: 'repo-harness-profile-benchmark/report/v1';
  generated_at: string;
  run_id: string;
  authoritative: boolean;
  provider: BenchmarkProvider;
  manifest: string;
  source_commit: string;
  runner_sha256: string;
  manifest_sha256: string;
  fixture_sha256: string;
  provider_version: string;
  profiles: BenchmarkProfile[];
  scenario_count: number;
  records: BenchmarkRunRecord[];
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

function hashFile(path: string): string {
  return sha256(readFileSync(path));
}

function hashTree(root: string): string {
  const entries: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(dir, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(absolute);
      else entries.push(`${path}\0${statSync(absolute).mode & 0o777}\0${hashFile(absolute)}`);
    }
  };
  visit(root);
  return sha256(entries.join('\0'));
}

function workspaceEvidenceHash(workspace: string): string {
  const paths = changedFiles(workspace);
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
  return record.provider_exit_code === 0
    && record.usage_authority === 'structured-provider'
    && record.status === 'passed'
    && record.grader_acceptance === 'passed'
    && (record.profile !== 'no-harness' || record.no_harness_isolation === 'passed');
}

function prepareWorkspace(seed: string, destination: string): string {
  const base = join(destination, 'base');
  const workspace = join(destination, 'workspace');
  mkdirSync(base, { recursive: true });
  cpSync(seed, base, { recursive: true });
  run('git', ['init', '-b', 'main'], base);
  run('git', ['config', 'user.email', 'benchmark@example.com'], base);
  run('git', ['config', 'user.name', 'Benchmark'], base);
  run('git', ['add', '.'], base);
  run('git', ['commit', '-m', 'benchmark seed'], base);
  run('git', ['worktree', 'add', '-b', 'benchmark', workspace], base);
  return realpathSync(workspace);
}

function writeStrictArtifacts(workspace: string, scenario: HarnessScenario): void {
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
  writeFileSync(join(workspace, '.ai/harness/active-worktree'), `${workspace}\n`);
}

function writeResumeProjection(workspace: string): void {
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

function projectHarness(
  profile: BenchmarkProfile,
  provider: BenchmarkProvider,
  workspace: string,
  hostRoot: string,
  scenario: HarnessScenario,
): void {
  if (profile === 'no-harness') {
    if (scenario.requires_resume_projection) {
      writeResumeProjection(workspace);
      run('git', ['add', '.'], workspace);
      run('git', ['commit', '-m', 'benchmark recovery input'], workspace);
    }
    return;
  }
  const env = isolatedHarnessEnvironment(hostRoot);
  run(process.execPath, [join(ROOT, 'src/cli/index.ts'), 'adopt', '--repo', workspace, '--no-codegraph', '--mode', 'standard'], ROOT, env);
  const installProfile = profile === 'adaptive-lite' ? 'standard' : 'strict';
  run(process.execPath, [
    join(ROOT, 'src/cli/index.ts'), 'install', '--profile', installProfile, '--target', provider,
    '--no-external-skills', '--no-codegraph', '--json',
  ], ROOT, env);
  if (profile === 'strict-harness') writeStrictArtifacts(workspace, scenario);
  if (scenario.requires_resume_projection) writeResumeProjection(workspace);
  run('git', ['add', '.'], workspace, env);
  run('git', ['commit', '--allow-empty', '-m', `benchmark ${profile} projection`], workspace, env);
}

export function rebaselineBenchmarkMain(workspace: string, env: NodeJS.ProcessEnv = process.env): void {
  const base = join(dirname(workspace), 'base');
  run('git', ['reset', '--hard', 'benchmark'], base, env);
}

export function codexBenchmarkCommand(profile: BenchmarkProfile, workspace: string, prompt: string): string[] {
  const args = ['exec', '--json', '--ephemeral', '--sandbox', 'workspace-write', '--cd', workspace];
  if (profile === 'no-harness') args.push('--ignore-user-config', '--ignore-rules');
  else args.push('--dangerously-bypass-hook-trust');
  args.push(prompt);
  return ['codex', ...args];
}

export function claudeBenchmarkCommand(
  profile: BenchmarkProfile,
  hostRoot: string,
  prompt: string,
): string[] {
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-hook-events',
    '--permission-mode', 'bypassPermissions', '--no-session-persistence', '--disable-slash-commands',
  ];
  if (profile === 'no-harness') args.push('--safe-mode');
  else args.push('--setting-sources', 'project', '--settings', join(hostRoot, '.claude/settings.json'));
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

function changedFiles(workspace: string): string[] {
  const result = spawnSync('git', ['status', '--porcelain=v1', '-uall', '-z'], { cwd: workspace, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'git status failed');
  return parsePorcelainPaths(result.stdout);
}

function readHookMetrics(workspace: string) {
  const path = join(workspace, '.ai/harness/runs/hook-invocations.jsonl');
  if (!existsSync(path)) return [] as Array<{ duration_ms: number; output_bytes: number | null; blocked: boolean; fingerprint: string }>;
  return readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
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

// hostRoot (BUN_INSTALL, CODEX_HOME, brain root) is a disposable per-arm
// toolchain install -- it is never read again after the provider process
// exits and its path never enters BenchmarkRunRecord. Removing it once per
// arm bounds a matrix run's peak disk footprint to one arm's installs
// instead of accumulating every arm's (the ENOSPC failure mode). `base`/
// `workspace` are deliberately left alone: `workspace` is a git worktree of
// `base` and shares its object store, so deleting `base` would corrupt
// `workspace`; `workspace` itself is the retained evidence
// regradeHarnessBenchmarkReport re-grades against (see
// docs/architecture/modules/verification/evals-checks.md's
// --regrade-existing note). Exported so tests can verify this in isolation
// without spawning a real provider process.
export function cleanupArmHostRoot(hostRoot: string): void {
  rmSync(hostRoot, { recursive: true, force: true });
}

async function executeRun(provider: BenchmarkProvider, profile: BenchmarkProfile, scenario: HarnessScenario, seed: string, root: string, reportRunId: string): Promise<BenchmarkRunRecord> {
  const runRoot = join(root, profile, scenario.id);
  const workspace = prepareWorkspace(seed, runRoot);
  const hostRoot = join(runRoot, 'host');
  if (provider === 'codex') copyCodexAuthOnly(hostRoot);
  projectHarness(profile, provider, workspace, hostRoot, scenario);
  rebaselineBenchmarkMain(workspace, {
    ...process.env,
    BUN_INSTALL: join(hostRoot, '.bun'),
    PATH: `${join(hostRoot, '.bun/bin')}:${process.env.PATH ?? ''}`,
  });
  const command = benchmarkCommand(provider, profile, workspace, hostRoot, scenario.prompt);
  const started = Date.now();
  let firstEdit: number | null = null;
  const processHandle = Bun.spawn(command, {
    cwd: workspace,
    env: {
      ...isolatedHarnessEnvironment(hostRoot),
      // Claude keeps the real HOME only for its host authentication. Every
      // repo-harness-owned mutable authority remains pinned to the disposable
      // benchmark host by isolatedHarnessEnvironment.
      HOME: provider === 'codex' ? hostRoot : process.env.HOME,
      CODEX_HOME: provider === 'codex' ? join(hostRoot, '.codex') : process.env.CODEX_HOME,
      HOOK_SESSION_ID: `${profile}-${scenario.id}`,
    },
    stdout: 'pipe', stderr: 'pipe', stdin: 'ignore',
  });
  const poll = setInterval(() => {
    if (firstEdit === null && changedFiles(workspace).length > 0) firstEdit = Date.now() - started;
  }, 50);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(), new Response(processHandle.stderr).text(), processHandle.exited,
  ]);
  clearInterval(poll);
  const duration = Date.now() - started;
  mkdirSync(runRoot, { recursive: true });
  writeFileSync(join(runRoot, 'provider.jsonl'), stdout);
  writeFileSync(join(runRoot, 'provider.stderr.txt'), stderr);
  const grader = spawnSync('bash', ['-lc', scenario.acceptance_command], { cwd: workspace, encoding: 'utf-8' });
  writeFileSync(join(runRoot, 'grader.stdout.txt'), grader.stdout ?? '');
  writeFileSync(join(runRoot, 'grader.stderr.txt'), grader.stderr ?? '');
  const changed = changedFiles(workspace);
  const expectedPathsPassed = scenario.expected_paths.length === 0
    ? changed.length === 0
    : scenario.expected_paths.every((path) => changed.includes(path));
  const hooks = readHookMetrics(workspace);
  const hookDurations = hooks.map((entry) => entry.duration_ms);
  const knownOutputBytes = hooks.every((entry) => entry.output_bytes !== null)
    ? hooks.reduce((sum, entry) => sum + (entry.output_bytes ?? 0), 0)
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
  const workspaceHash = workspaceEvidenceHash(workspace);
  cleanupArmHostRoot(hostRoot);
  return {
    run_id: `${reportRunId}:${profile}:${scenario.id}`,
    profile, scenario_id: scenario.id, workspace, command, status: exitCode === 0 && graderPassed ? 'passed' : 'failed',
    provider_exit_code: exitCode,
    ...(provider === 'claude' ? claudeProviderUsage(stdout) : providerUsage(stdout)),
    time_to_first_edit_ms: firstEdit,
    total_duration_ms: duration, hook_invocation_count: hooks.length,
    hook_total_duration_ms: hookDurations.reduce((sum, value) => sum + value, 0),
    hook_p50_ms: percentile(hookDurations, 0.5), hook_p95_ms: percentile(hookDurations, 0.95), hook_p99_ms: percentile(hookDurations, 0.99),
    hook_output_bytes: knownOutputBytes, session_start_context_tokens: contextTokens,
    guard_block_count: hooks.filter((entry) => entry.blocked).length,
    repeated_guard_fingerprint_count: repeated, artifact_files_created: artifactFiles.length, artifact_files: artifactFiles,
    profile_projection_artifact_files: profile === 'strict-harness' ? 2 : 0,
    grader_acceptance: graderPassed ? 'passed' : 'failed',
    no_harness_isolation: noHarnessIsolation(provider, profile, stdout, hooks.length),
    evidence_hashes: {
      provider_stream: sha256(stdout), provider_stderr: sha256(stderr),
      grader_stdout: sha256(grader.stdout ?? ''), grader_stderr: sha256(grader.stderr ?? ''),
      workspace: workspaceHash,
    },
  };
}

function dryRunRecord(provider: BenchmarkProvider, profile: BenchmarkProfile, scenario: HarnessScenario, seed: string, root: string, reportRunId: string): BenchmarkRunRecord {
  const workspace = join(root, profile, scenario.id, 'workspace');
  return {
    run_id: `${reportRunId}:${profile}:${scenario.id}`,
    profile, scenario_id: scenario.id, workspace, command: benchmarkCommand(provider, profile, workspace, join(root, profile, scenario.id, 'host'), scenario.prompt), status: 'dry-run',
    provider_exit_code: null, usage_authority: 'unavailable', provider_unavailable_reason: 'dry-run', input_tokens: null, cached_input_tokens: null, output_tokens: null,
    model_call_count: null, subagent_call_count: null, time_to_first_edit_ms: null, total_duration_ms: null,
    hook_invocation_count: 0, hook_total_duration_ms: 0, hook_p50_ms: null, hook_p95_ms: null, hook_p99_ms: null,
    hook_output_bytes: null, session_start_context_tokens: null, guard_block_count: 0,
    repeated_guard_fingerprint_count: 0, artifact_files_created: 0, artifact_files: [], profile_projection_artifact_files: profile === 'strict-harness' ? 2 : 0,
    grader_acceptance: 'unavailable', no_harness_isolation: 'unavailable',
    evidence_hashes: { provider_stream: null, provider_stderr: null, grader_stdout: null, grader_stderr: null, workspace: null },
  };
}

function writeHarnessBenchmarkReport(report: HarnessBenchmarkReport, reportPath: string): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const markdownPath = reportPath.endsWith('.json') ? reportPath.replace(/\.json$/, '.md') : `${reportPath}.md`;
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
    `> **Source commit**: ${report.source_commit}`,
    `> **Provider version**: ${report.provider_version}`,
    `> **Hashes**: runner=${report.runner_sha256}; manifest=${report.manifest_sha256}; fixture=${report.fixture_sha256}`, '',
    '| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |',
    '|---|---:|---:|---:|---:|---:|---|', ...rows, '',
    'Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.', '',
    '## Artifact Files', '',
    'Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).', '',
    artifactLines.length > 0 ? artifactLines.join('\n') : '(none)', '',
  ].join('\n'));
}

export function regradeHarnessBenchmarkReport(reportPath: string): HarnessBenchmarkReport {
  const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as HarnessBenchmarkReport;
  if (report.protocol !== 'repo-harness-profile-benchmark/report/v1') throw new Error('invalid benchmark report protocol');
  if (hashFile(resolve(import.meta.dir, 'run-harness-profile-benchmark.ts')) !== report.runner_sha256) {
    throw new Error('benchmark runner hash changed; provider evidence cannot be regraded');
  }
  const manifestPath = resolve(ROOT, report.manifest);
  if (hashFile(manifestPath) !== report.manifest_sha256) throw new Error('benchmark manifest hash changed; provider evidence cannot be regraded');
  const manifest = loadHarnessScenarioManifest(manifestPath);
  if (hashTree(resolve(ROOT, manifest.seed)) !== report.fixture_sha256) throw new Error('benchmark fixture hash changed; provider evidence cannot be regraded');
  const scenarios = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));
  for (const record of report.records) {
    const scenario = scenarios.get(record.scenario_id);
    if (!scenario) throw new Error(`scenario missing while regrading: ${record.scenario_id}`);
    if (!record.evidence_hashes.workspace || workspaceEvidenceHash(record.workspace) !== record.evidence_hashes.workspace) {
      throw new Error(`workspace evidence changed; refusing regrade: ${record.run_id}`);
    }
    const grader = spawnSync('bash', ['-lc', scenario.acceptance_command], { cwd: record.workspace, encoding: 'utf-8' });
    const changed = changedFiles(record.workspace);
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
  report.authoritative = report.records.every(isAuthoritativeCompletedRecord);
  writeHarnessBenchmarkReport(report, reportPath);
  return report;
}

export async function runHarnessProfileBenchmark(options: CliOptions) {
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
  for (const profile of profiles) {
    for (const scenario of selected) {
      records.push(options.execute
        ? await executeRun(provider, profile, scenario, seed, runRoot, reportRunId)
        : dryRunRecord(provider, profile, scenario, seed, runRoot, reportRunId));
    }
  }
  const authoritative = options.execute && records.every(isAuthoritativeCompletedRecord);
  const report: HarnessBenchmarkReport = {
    protocol: 'repo-harness-profile-benchmark/report/v1', generated_at: new Date().toISOString(),
    run_id: reportRunId, authoritative, provider, manifest: relative(ROOT, options.manifest).replaceAll('\\', '/'),
    source_commit: run('git', ['rev-parse', 'HEAD'], ROOT),
    runner_sha256: hashFile(resolve(import.meta.dir, 'run-harness-profile-benchmark.ts')),
    manifest_sha256: hashFile(options.manifest), fixture_sha256: hashTree(seed),
    provider_version: options.execute ? run(provider, ['--version'], ROOT) : 'unavailable',
    profiles,
    scenario_count: selected.length,
    records,
  };
  writeHarnessBenchmarkReport(report, options.report);
  if (options.requireAuthoritative) {
    const incomplete = records.filter((record) => !isAuthoritativeCompletedRecord(record));
    if (incomplete.length > 0) {
      throw new Error(`authoritative benchmark incomplete: ${incomplete.length}/${records.length} run(s) lacked successful structured provider execution; report=${options.report}`);
    }
  }
  return report;
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));
  const execution = options.regradeExisting
    ? Promise.resolve(regradeHarnessBenchmarkReport(options.report))
    : runHarnessProfileBenchmark(options);
  execution
    .then((report) => console.log(`profile benchmark: ${report.records.length} runs -> ${options.report}`))
    .catch((error) => { console.error((error as Error).message); process.exit(1); });
}
