#!/usr/bin/env bun
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  statSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';

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
  grader_acceptance: 'passed' | 'failed' | 'unavailable';
}

interface CliOptions {
  execute: boolean;
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

function changedFiles(workspace: string): string[] {
  const output = run('git', ['status', '--porcelain=v1', '-uall'], workspace);
  return output ? output.split('\n').filter(Boolean).map((line) => line.slice(3)) : [];
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

async function executeRun(provider: BenchmarkProvider, profile: BenchmarkProfile, scenario: HarnessScenario, seed: string, root: string): Promise<BenchmarkRunRecord> {
  const runRoot = join(root, profile, scenario.id);
  const workspace = prepareWorkspace(seed, runRoot);
  const hostRoot = join(runRoot, 'host');
  if (provider === 'codex') copyCodexAuthOnly(hostRoot);
  projectHarness(profile, provider, workspace, hostRoot, scenario);
  const command = benchmarkCommand(provider, profile, workspace, hostRoot, scenario.prompt);
  const started = Date.now();
  let firstEdit: number | null = null;
  const processHandle = Bun.spawn(command, {
    cwd: workspace,
    env: {
      ...process.env,
      HOME: provider === 'codex' ? hostRoot : process.env.HOME,
      CODEX_HOME: provider === 'codex' ? join(hostRoot, '.codex') : process.env.CODEX_HOME,
      BUN_INSTALL: join(hostRoot, '.bun'),
      PATH: `${join(hostRoot, '.bun/bin')}:${process.env.PATH ?? ''}`,
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
  const artifacts = changed.filter((path) => /^(plans|tasks|\.ai\/harness)\//.test(path)).length;
  const graderPassed = grader.status === 0 && expectedPathsPassed;
  return {
    profile, scenario_id: scenario.id, workspace, command, status: exitCode === 0 && graderPassed ? 'passed' : 'failed',
    provider_exit_code: exitCode,
    ...(provider === 'claude' ? claudeProviderUsage(stdout) : providerUsage(stdout)),
    time_to_first_edit_ms: firstEdit,
    total_duration_ms: duration, hook_invocation_count: hooks.length,
    hook_total_duration_ms: hookDurations.reduce((sum, value) => sum + value, 0),
    hook_p50_ms: percentile(hookDurations, 0.5), hook_p95_ms: percentile(hookDurations, 0.95), hook_p99_ms: percentile(hookDurations, 0.99),
    hook_output_bytes: knownOutputBytes, session_start_context_tokens: contextTokens,
    guard_block_count: hooks.filter((entry) => entry.blocked).length,
    repeated_guard_fingerprint_count: repeated, artifact_files_created: artifacts,
    grader_acceptance: graderPassed ? 'passed' : 'failed',
  };
}

function dryRunRecord(provider: BenchmarkProvider, profile: BenchmarkProfile, scenario: HarnessScenario, seed: string, root: string): BenchmarkRunRecord {
  const workspace = join(root, profile, scenario.id, 'workspace');
  return {
    profile, scenario_id: scenario.id, workspace, command: benchmarkCommand(provider, profile, workspace, join(root, profile, scenario.id, 'host'), scenario.prompt), status: 'dry-run',
    provider_exit_code: null, usage_authority: 'unavailable', provider_unavailable_reason: 'dry-run', input_tokens: null, cached_input_tokens: null, output_tokens: null,
    model_call_count: null, subagent_call_count: null, time_to_first_edit_ms: null, total_duration_ms: null,
    hook_invocation_count: 0, hook_total_duration_ms: 0, hook_p50_ms: null, hook_p95_ms: null, hook_p99_ms: null,
    hook_output_bytes: null, session_start_context_tokens: null, guard_block_count: 0,
    repeated_guard_fingerprint_count: 0, artifact_files_created: 0, grader_acceptance: 'unavailable',
  };
}

export async function runHarnessProfileBenchmark(options: CliOptions) {
  const manifest = loadHarnessScenarioManifest(options.manifest);
  const provider = options.provider ?? 'codex';
  const selected = options.scenario.length > 0
    ? manifest.scenarios.filter((scenario) => options.scenario.includes(scenario.id))
    : manifest.scenarios;
  const runRoot = mkdtempSync(join(tmpdir(), 'repo-harness-profile-benchmark-'));
  const seed = resolve(ROOT, manifest.seed);
  const records: BenchmarkRunRecord[] = [];
  const profiles = (options.profile?.length ?? 0) > 0 ? options.profile! : [...BENCHMARK_PROFILES];
  for (const profile of profiles) {
    for (const scenario of selected) {
      records.push(options.execute
        ? await executeRun(provider, profile, scenario, seed, runRoot)
        : dryRunRecord(provider, profile, scenario, seed, runRoot));
    }
  }
  const authoritative = options.execute && records.every((record) =>
    record.provider_exit_code === 0
    && record.usage_authority === 'structured-provider');
  const report = {
    protocol: 'repo-harness-profile-benchmark/report/v1', generated_at: new Date().toISOString(),
    authoritative, provider, manifest: options.manifest, profiles, scenario_count: selected.length,
    records,
  };
  mkdirSync(dirname(options.report), { recursive: true });
  writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
  const markdownPath = options.report.endsWith('.json') ? options.report.replace(/\.json$/, '.md') : `${options.report}.md`;
  const rows = BENCHMARK_PROFILES.map((profile) => {
    const profileRecords = records.filter((record) => record.profile === profile);
    const passed = profileRecords.filter((record) => record.status === 'passed').length;
    const durations = profileRecords.map((record) => record.total_duration_ms).filter((value): value is number => value !== null);
    const tokens = profileRecords.map((record) => record.input_tokens === null || record.output_tokens === null ? null : record.input_tokens + record.output_tokens);
    const knownTokens = tokens.filter((value): value is number => value !== null);
    const recovery = profileRecords.find((record) => record.scenario_id === 'cross-session-recovery');
    return `| ${profile} | ${passed}/${profileRecords.length} | ${knownTokens.length ? knownTokens.reduce((a, b) => a + b, 0) : 'unavailable'} | ${durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 'unavailable'} | ${recovery?.grader_acceptance ?? 'unavailable'} |`;
  });
  writeFileSync(markdownPath, [
    '# Harness Profile Benchmark', '',
    `> **Authority**: ${authoritative ? `live ${provider} provider execution` : 'incomplete/dry-run; non-authoritative'}`,
    `> **Generated**: ${report.generated_at}`, '',
    '| Profile | Passed | Known tokens | Avg duration ms | Recovery |',
    '|---|---:|---:|---:|---|', ...rows, '',
    'Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, artifact, and grader evidence.', '',
  ].join('\n'));
  if (options.requireAuthoritative) {
    const incomplete = records.filter((record) =>
      record.provider_exit_code !== 0
      || record.usage_authority !== 'structured-provider');
    if (incomplete.length > 0) {
      throw new Error(`authoritative benchmark incomplete: ${incomplete.length}/${records.length} run(s) lacked successful structured provider execution; report=${options.report}`);
    }
  }
  return report;
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));
  runHarnessProfileBenchmark(options)
    .then((report) => console.log(`profile benchmark: ${report.records.length} runs -> ${options.report}`))
    .catch((error) => { console.error((error as Error).message); process.exit(1); });
}
