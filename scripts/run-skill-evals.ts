#!/usr/bin/env bun

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const REPO_ROOT = join(__dirname, "..");
export const DEFAULT_EVALS_PATH = join(REPO_ROOT, "evals", "evals.json");
export const DEFAULT_BENCHMARK_CONFIG_PATH = join(REPO_ROOT, "evals", "benchmark.config.json");

export type AgentName = "claude" | "codex";
export type ProfileName = "with_skill" | "without_skill";

export interface EvalEntry {
  id: number;
  slug: string;
  prompt: string;
  expected_output: string;
  files: string[];
  expectations: string[];
  graders: EvalGraders;
  anti_graders?: EvalAntiGraders;
}

export interface EvalManifest {
  skill_name: string;
  evals: EvalEntry[];
}

export interface AgentConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ProfileConfig {
  skillPath?: string;
}

export interface BenchmarkConfig {
  workspaceRoot: string;
  summaryPath: string;
  agents: Record<AgentName, AgentConfig>;
  profiles: Record<ProfileName, ProfileConfig>;
}

export interface RunSkillEvalsOptions {
  agent?: AgentName | "all";
  profile?: ProfileName | "all";
  evalFilters?: string[];
  iterationLabel?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  repoRoot?: string;
  evalsPath?: string;
  configPath?: string;
  now?: Date;
}

export interface RunMetadata {
  agent: AgentName;
  profile: ProfileName;
  evalId: number;
  evalSlug: string;
  prompt: string;
  expectedOutput: string;
  expectations: string[];
  workspacePath: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  agentStatus: "dry_run" | "success" | "failed";
  graderStatus: "skipped" | "passed" | "failed";
  graderReportPath: string | null;
  graderSummary: {
    total: number;
    failed: number;
  };
  graderResults: GraderResult[];
  durationMs: number;
  dryRun: boolean;
  status: "dry_run" | "success" | "failed";
  stdoutPath: string;
  stderrPath: string;
  promptPath: string;
  commandPath: string;
  finalResponsePath: string;
  metadataPath: string;
  changedFilesPath: string;
  gitDiffPath: string;
  diffStat: string;
  changedFiles: string[];
  finalResponseExcerpt: string;
  model?: string | null;
  sessionId?: string | null;
}

export interface IterationReport {
  iterationName: string;
  iterationPath: string;
  summaryPath: string;
  manifestPath: string;
  generatedAt: string;
  workspaceRoot: string;
  records: RunMetadata[];
}

export interface BenchmarkQualityMetrics {
  fullTestCount: number;
  dryRunCount: number;
  dryRunRatio: number;
  graderPassed: number;
  graderTotal: number;
  graderPassRate: number | null;
  effectivenessAuthority: "authoritative" | "non_authoritative";
}

interface CommandSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface PathPatternCheck {
  path: string;
  pattern: string;
}

export interface EvalGraders {
  files_exist?: string[];
  files_contain?: PathPatternCheck[];
  commands_succeed?: string[];
}

export interface EvalAntiGraders {
  files_not_exist?: string[];
  files_not_contain?: PathPatternCheck[];
}

export interface GraderResult {
  kind: string;
  target: string;
  passed: boolean;
  message: string;
}

export interface GraderReport {
  contract: string;
  previous_status: string;
  next_status: string;
  quiet: boolean;
  strict: boolean;
  total: number;
  failed: number;
  results: GraderResult[];
}

const ARTIFACT_FILES = [
  "prompt.txt",
  "command.txt",
  "stdout.txt",
  "stderr.txt",
  "final-response.md",
  "metadata.json",
  "changed-files.txt",
  "git-diff.patch",
] as const;

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function resolveRepoPath(repoRoot: string, maybeRelative: string): string {
  return isAbsolute(maybeRelative) ? maybeRelative : resolve(repoRoot, maybeRelative);
}

function quoteShellArg(value: string): string {
  if (value.length === 0) return "''";
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toShellCommand(spec: CommandSpec): string {
  return [spec.command, ...spec.args].map(quoteShellArg).join(" ");
}

function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatIterationName(date: Date = new Date(), label?: string): string {
  const stamp =
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}` +
    `-${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`;
  const suffix = label ? `-${slugifyLabel(label)}` : "";
  return `iteration-${stamp}${suffix}`;
}

export function loadEvalManifest(path: string = DEFAULT_EVALS_PATH): EvalManifest {
  const manifest = readJsonFile<EvalManifest>(path);
  if (manifest.skill_name !== "repo-harness") {
    throw new Error(`Unexpected skill_name in eval manifest: ${manifest.skill_name}`);
  }
  return manifest;
}

export function loadBenchmarkConfig(path: string = DEFAULT_BENCHMARK_CONFIG_PATH): BenchmarkConfig {
  const config = readJsonFile<Partial<BenchmarkConfig>>(path);
  return {
    workspaceRoot: config.workspaceRoot ?? "../repo-harness-workspace",
    summaryPath: config.summaryPath ?? "evals/benchmark.md",
    agents: {
      claude: {
        command: config.agents?.claude?.command ?? "claude",
        args: config.agents?.claude?.args ?? [],
        env: config.agents?.claude?.env ?? {},
      },
      codex: {
        command: config.agents?.codex?.command ?? "codex",
        args: config.agents?.codex?.args ?? [],
        env: config.agents?.codex?.env ?? {},
      },
    },
    profiles: {
      with_skill: {
        skillPath: config.profiles?.with_skill?.skillPath ?? ".",
      },
      without_skill: {
        skillPath: config.profiles?.without_skill?.skillPath,
      },
    },
  };
}

export function selectEvals(evals: EvalEntry[], filters: string[] = []): EvalEntry[] {
  if (filters.length === 0) return evals;

  const wanted = new Set(filters.map((entry) => entry.trim()).filter(Boolean));
  return evals.filter((entry) => wanted.has(entry.slug) || wanted.has(String(entry.id)));
}

function selectedAgents(input: RunSkillEvalsOptions["agent"] = "all"): AgentName[] {
  if (!input || input === "all") return ["claude", "codex"];
  return [input];
}

function selectedProfiles(input: RunSkillEvalsOptions["profile"] = "all"): ProfileName[] {
  if (!input || input === "all") return ["with_skill", "without_skill"];
  return [input];
}

export function computeBenchmarkQualityMetrics(records: RunMetadata[]): BenchmarkQualityMetrics {
  const total = records.length;
  const dryRunCount = records.filter((record) => record.dryRun).length;
  const fullTestCount = total - dryRunCount;
  const graderTotal = records.reduce((sum, record) => sum + record.graderSummary.total, 0);
  const graderFailed = records.reduce((sum, record) => sum + record.graderSummary.failed, 0);
  const graderPassed = graderTotal - graderFailed;
  const dryRunRatio = total === 0 ? 0 : dryRunCount / total;
  const graderPassRate = graderTotal === 0 ? null : graderPassed / graderTotal;

  return {
    fullTestCount,
    dryRunCount,
    dryRunRatio,
    graderPassed,
    graderTotal,
    graderPassRate,
    effectivenessAuthority: dryRunRatio > 0.3 ? "non_authoritative" : "authoritative",
  };
}

function formatRatio(value: number | null): string {
  if (value === null) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function copyPathIntoWorkspace(sourcePath: string, destinationRoot: string): void {
  if (!existsSync(sourcePath)) {
    throw new Error(`Fixture path does not exist: ${sourcePath}`);
  }

  const stats = lstatSync(sourcePath);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(sourcePath)) {
      cpSync(join(sourcePath, entry), join(destinationRoot, entry), {
        recursive: true,
        dereference: true,
      });
    }
    return;
  }

  cpSync(sourcePath, join(destinationRoot, sourcePath.split("/").pop() ?? "fixture"), {
    recursive: false,
    dereference: true,
  });
}

export function copyEvalFixtures(evalEntry: EvalEntry, repoRoot: string, destinationRoot: string): void {
  ensureDir(destinationRoot);
  for (const relativePath of evalEntry.files) {
    copyPathIntoWorkspace(resolveRepoPath(repoRoot, relativePath), destinationRoot);
  }
}

function resolveSkillPath(
  repoRoot: string,
  profile: ProfileName,
  config: BenchmarkConfig
): string | null {
  const configured = config.profiles[profile]?.skillPath;
  if (!configured) return null;
  return resolveRepoPath(repoRoot, configured);
}

function buildCodexWrapper(existingAgents: string, skillMarkdown: string): string {
  const sections = [
    "# Benchmark Skill Wrapper",
    "",
    "Treat the embedded `repo-harness` skill as the primary routing contract for this benchmark run.",
    "The benchmark mounts Claude's canonical skill path at `.claude/skills/repo-harness`.",
    "When the embedded skill references `scripts/`, `references/`, `assets/`, or `evals/` files, resolve them relative to `.skill-src/`.",
    "Preserve any fixture-specific instructions listed below unless they conflict with the embedded skill.",
    "",
    "## Embedded Skill",
    "",
    skillMarkdown.trim(),
  ];

  if (existingAgents.trim().length > 0) {
    sections.push("", "## Existing Fixture Instructions", "", existingAgents.trim());
  }

  sections.push("");
  return sections.join("\n");
}

export function prepareWorkspaceForRun(
  workspacePath: string,
  agent: AgentName,
  profile: ProfileName,
  skillPath: string | null
): void {
  if (profile !== "with_skill" || !skillPath) {
    return;
  }

  if (agent === "claude") {
    const linkPath = join(workspacePath, ".claude", "skills", "repo-harness");
    ensureDir(dirname(linkPath));
    rmSync(linkPath, { recursive: true, force: true });
    symlinkSync(skillPath, linkPath, "dir");
    return;
  }

  const skillLinkPath = join(workspacePath, ".skill-src");
  rmSync(skillLinkPath, { recursive: true, force: true });
  symlinkSync(skillPath, skillLinkPath, "dir");

  const existingAgentsPath = join(workspacePath, "AGENTS.md");
  const existingAgents = existsSync(existingAgentsPath)
    ? readFileSync(existingAgentsPath, "utf-8")
    : "";
  const skillMarkdown = readFileSync(join(skillPath, "SKILL.md"), "utf-8");
  writeFileSync(existingAgentsPath, buildCodexWrapper(existingAgents, skillMarkdown), "utf-8");
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>
): { exitCode: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      ...env,
    },
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function assertCommandSucceeded(result: { exitCode: number | null; stderr: string }, command: string): void {
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${command}): ${result.stderr.trim()}`);
  }
}

export function initBenchmarkGitRepo(workspacePath: string): void {
  const initResult = runProcess("git", ["init"], workspacePath, {});
  assertCommandSucceeded(initResult, "git init");
  assertCommandSucceeded(
    runProcess("git", ["config", "user.name", "Skill Benchmark"], workspacePath, {}),
    "git config user.name"
  );
  assertCommandSucceeded(
    runProcess("git", ["config", "user.email", "skill-benchmark@example.com"], workspacePath, {}),
    "git config user.email"
  );
  assertCommandSucceeded(runProcess("git", ["add", "."], workspacePath, {}), "git add");
  assertCommandSucceeded(
    runProcess("git", ["commit", "-m", "benchmark baseline"], workspacePath, {}),
    "git commit"
  );

  const excludePath = join(workspacePath, ".git", "info", "exclude");
  const content =
    "\n# benchmark artifacts\n" +
    ARTIFACT_FILES.map((entry) => `/${entry}`).join("\n") +
    "\n";
  writeFileSync(excludePath, readFileSync(excludePath, "utf-8") + content, "utf-8");
}

function stageWorkspaceChanges(workspacePath: string): void {
  runProcess("git", ["add", "-A"], workspacePath, {});
}

export function captureGitArtifacts(workspacePath: string): {
  changedFiles: string[];
  diffPatch: string;
  diffStat: string;
} {
  stageWorkspaceChanges(workspacePath);

  const changed = runProcess("git", ["diff", "--cached", "--name-only", "HEAD"], workspacePath, {});
  const patch = runProcess("git", ["diff", "--cached", "--binary", "HEAD"], workspacePath, {});
  const stat = runProcess("git", ["diff", "--cached", "--stat", "HEAD"], workspacePath, {});

  return {
    changedFiles: changed.stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean),
    diffPatch: patch.stdout,
    diffStat: stat.stdout.trim(),
  };
}

function buildClaudeCommand(
  prompt: string,
  config: AgentConfig,
  repoRoot: string,
  profile: ProfileName
): CommandSpec {
  const args = [...(config.args ?? []), "-p", "--output-format", "text", "--no-session-persistence"];
  if (profile === "with_skill") {
    args.push("--permission-mode", "bypassPermissions", "--add-dir", repoRoot);
  } else {
    args.push("--permission-mode", "bypassPermissions", "--disable-slash-commands");
  }
  args.push(prompt);

  return {
    command: config.command ?? "claude",
    args,
    env: config.env ?? {},
  };
}

function buildCodexCommand(
  prompt: string,
  config: AgentConfig,
  repoRoot: string,
  workspacePath: string,
  finalResponsePath: string,
  profile: ProfileName
): CommandSpec {
  const args = [
    ...(config.args ?? []),
    "exec",
    "-C",
    workspacePath,
    "--dangerously-bypass-approvals-and-sandbox",
    "-o",
    finalResponsePath,
  ];
  if (profile === "with_skill") {
    args.push("--add-dir", repoRoot);
  }
  args.push(prompt);

  return {
    command: config.command ?? "codex",
    args,
    env: config.env ?? {},
  };
}

export function buildAgentCommand(
  agent: AgentName,
  prompt: string,
  profile: ProfileName,
  config: AgentConfig,
  repoRoot: string,
  workspacePath: string,
  finalResponsePath: string
): CommandSpec {
  if (agent === "claude") {
    return buildClaudeCommand(prompt, config, repoRoot, profile);
  }
  return buildCodexCommand(prompt, config, repoRoot, workspacePath, finalResponsePath, profile);
}

function writeTextFile(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf-8");
}

function excerpt(content: string, maxLength = 220): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

function relativeLink(fromRoot: string, targetPath: string): string {
  const rel = relative(fromRoot, targetPath).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function escapeYamlSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function renderEvalContract(evalEntry: EvalEntry): string {
  const lines: string[] = [
    `# Eval Contract: ${evalEntry.slug}`,
    "",
    "> **Status**: Pending",
    "",
    "```yaml",
    "exit_criteria:",
  ];

  const appendList = (section: string, values: string[] | undefined): void => {
    if (!values || values.length === 0) return;
    lines.push(`  ${section}:`);
    for (const value of values) {
      lines.push(`    - ${escapeYamlSingleQuoted(value)}`);
    }
  };

  const appendPathPatterns = (
    section: string,
    values: PathPatternCheck[] | undefined
  ): void => {
    if (!values || values.length === 0) return;
    lines.push(`  ${section}:`);
    for (const value of values) {
      lines.push(`    - path: ${escapeYamlSingleQuoted(value.path)}`);
      lines.push(`      pattern: ${escapeYamlSingleQuoted(value.pattern)}`);
    }
  };

  appendList("files_exist", evalEntry.graders.files_exist);
  appendList("commands_succeed", evalEntry.graders.commands_succeed);
  appendPathPatterns("files_contain", evalEntry.graders.files_contain);
  appendList("files_not_exist", evalEntry.anti_graders?.files_not_exist);
  appendPathPatterns("files_not_contain", evalEntry.anti_graders?.files_not_contain);

  lines.push("```", "");
  return `${lines.join("\n")}\n`;
}

function runEvalGraders(repoRoot: string, workspacePath: string, evalEntry: EvalEntry): {
  report: GraderReport;
  reportPath: string;
} {
  const verifyScriptPath = join(repoRoot, "assets", "templates", "helpers", "verify-contract.sh");
  const contractPath = join(workspacePath, "eval-grader.contract.md");
  const reportPath = join(workspacePath, "eval-grader-report.json");
  writeTextFile(contractPath, renderEvalContract(evalEntry));

  const result = runProcess(
    "bash",
    [
      verifyScriptPath,
      "--contract",
      contractPath,
      "--strict",
      "--quiet",
      "--report-file",
      reportPath,
    ],
    workspacePath,
    {}
  );

  if (!existsSync(reportPath)) {
    throw new Error(
      `Eval grader report missing for ${evalEntry.slug}: ${result.stderr.trim() || "no report generated"}`
    );
  }

  return {
    report: readJsonFile<GraderReport>(reportPath),
    reportPath,
  };
}

function buildRunMetadata(params: {
  agent: AgentName;
  profile: ProfileName;
  evalEntry: EvalEntry;
  workspacePath: string;
  command: string;
  exitCode: number | null;
  graderReportPath: string | null;
  graderReport: GraderReport | null;
  durationMs: number;
  dryRun: boolean;
  stdoutPath: string;
  stderrPath: string;
  promptPath: string;
  commandPath: string;
  finalResponsePath: string;
  metadataPath: string;
  changedFilesPath: string;
  gitDiffPath: string;
  changedFiles: string[];
  diffStat: string;
  finalResponse: string;
}): RunMetadata {
  return {
    agent: params.agent,
    profile: params.profile,
    evalId: params.evalEntry.id,
    evalSlug: params.evalEntry.slug,
    prompt: params.evalEntry.prompt,
    expectedOutput: params.evalEntry.expected_output,
    expectations: params.evalEntry.expectations,
    workspacePath: params.workspacePath,
    command: params.command,
    cwd: params.workspacePath,
    exitCode: params.exitCode,
    agentStatus: params.dryRun
      ? "dry_run"
      : params.exitCode === 0
        ? "success"
        : "failed",
    graderStatus: params.dryRun
      ? "skipped"
      : (params.graderReport?.failed ?? 0) === 0
        ? "passed"
        : "failed",
    graderReportPath: params.graderReportPath,
    graderSummary: {
      total: params.graderReport?.total ?? 0,
      failed: params.graderReport?.failed ?? 0,
    },
    graderResults: params.graderReport?.results ?? [],
    durationMs: params.durationMs,
    dryRun: params.dryRun,
    status: params.dryRun
      ? "dry_run"
      : params.exitCode === 0 && (params.graderReport?.failed ?? 0) === 0
        ? "success"
        : "failed",
    stdoutPath: params.stdoutPath,
    stderrPath: params.stderrPath,
    promptPath: params.promptPath,
    commandPath: params.commandPath,
    finalResponsePath: params.finalResponsePath,
    metadataPath: params.metadataPath,
    changedFilesPath: params.changedFilesPath,
    gitDiffPath: params.gitDiffPath,
    diffStat: params.diffStat,
    changedFiles: params.changedFiles,
    finalResponseExcerpt: excerpt(params.finalResponse),
    model: null,
    sessionId: null,
  };
}

function runSingleEval(params: {
  repoRoot: string;
  evalEntry: EvalEntry;
  agent: AgentName;
  profile: ProfileName;
  iterationPath: string;
  config: BenchmarkConfig;
  dryRun: boolean;
}): RunMetadata {
  const { repoRoot, evalEntry, agent, profile, iterationPath, config, dryRun } = params;
  const runPath = join(iterationPath, agent, profile, evalEntry.slug);
  ensureDir(runPath);

  copyEvalFixtures(evalEntry, repoRoot, runPath);
  prepareWorkspaceForRun(runPath, agent, profile, resolveSkillPath(repoRoot, profile, config));
  initBenchmarkGitRepo(runPath);

  const promptPath = join(runPath, "prompt.txt");
  const commandPath = join(runPath, "command.txt");
  const stdoutPath = join(runPath, "stdout.txt");
  const stderrPath = join(runPath, "stderr.txt");
  const finalResponsePath = join(runPath, "final-response.md");
  const metadataPath = join(runPath, "metadata.json");
  const changedFilesPath = join(runPath, "changed-files.txt");
  const gitDiffPath = join(runPath, "git-diff.patch");

  writeTextFile(promptPath, `${evalEntry.prompt}\n`);

  const commandSpec = buildAgentCommand(
    agent,
    evalEntry.prompt,
    profile,
    config.agents[agent],
    repoRoot,
    runPath,
    finalResponsePath
  );
  writeTextFile(commandPath, `${toShellCommand(commandSpec)}\n`);

  let exitCode: number | null = 0;
  let stdout = "";
  let stderr = "";
  let graderReport: GraderReport | null = null;
  let graderReportPath: string | null = null;
  const startedAt = Date.now();

  if (dryRun) {
    writeTextFile(stdoutPath, "dry-run: command not executed\n");
    writeTextFile(stderrPath, "");
    writeTextFile(finalResponsePath, "dry-run: no final response captured\n");
  } else {
    const result = runProcess(commandSpec.command, commandSpec.args, runPath, commandSpec.env);
    exitCode = result.exitCode;
    stdout = result.stdout;
    stderr = result.stderr;
    writeTextFile(stdoutPath, stdout);
    writeTextFile(stderrPath, stderr);
    if (!existsSync(finalResponsePath)) {
      writeTextFile(finalResponsePath, stdout.trim().length > 0 ? stdout : "(no final response captured)\n");
    }
  }

  const durationMs = Date.now() - startedAt;
  const finalResponse = readFileSync(finalResponsePath, "utf-8");
  const gitArtifacts = dryRun
    ? { changedFiles: [] as string[], diffPatch: "", diffStat: "" }
    : captureGitArtifacts(runPath);

  if (!dryRun) {
    const grading = runEvalGraders(repoRoot, runPath, evalEntry);
    graderReport = grading.report;
    graderReportPath = grading.reportPath;
  }

  writeTextFile(
    changedFilesPath,
    gitArtifacts.changedFiles.length > 0 ? `${gitArtifacts.changedFiles.join("\n")}\n` : ""
  );
  writeTextFile(gitDiffPath, gitArtifacts.diffPatch);

  const metadata = buildRunMetadata({
    agent,
    profile,
    evalEntry,
    workspacePath: runPath,
    command: toShellCommand(commandSpec),
    exitCode,
    graderReportPath,
    graderReport,
    durationMs,
    dryRun,
    stdoutPath,
    stderrPath,
    promptPath,
    commandPath,
    finalResponsePath,
    metadataPath,
    changedFilesPath,
    gitDiffPath,
    changedFiles: gitArtifacts.changedFiles,
    diffStat: gitArtifacts.diffStat,
    finalResponse,
  });

  writeTextFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

export function buildBenchmarkSummary(report: IterationReport, repoRoot: string): string {
  const commandRows = new Map<string, string>();
  const metrics = computeBenchmarkQualityMetrics(report.records);
  for (const record of report.records) {
    const key = `${record.agent}:${record.profile}`;
    if (!commandRows.has(key)) {
      commandRows.set(
        key,
        `| ${record.agent} | ${record.profile} | \`${record.command.replace(/\|/g, "\\|")}\` |`
      );
    }
  }

  const lines: string[] = [
    "# Skill Benchmark Report",
    "",
    `Latest iteration: \`${report.iterationName}\``,
    "",
    `Workspace root: \`${report.workspaceRoot}\``,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Quality Metrics",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| full_test_count | ${metrics.fullTestCount} |`,
    `| dry_run_count | ${metrics.dryRunCount} |`,
    `| dry_run_ratio | ${formatRatio(metrics.dryRunRatio)} |`,
    `| grader_pass_rate | ${formatRatio(metrics.graderPassRate)} (${metrics.graderPassed}/${metrics.graderTotal}) |`,
    `| effectiveness_authority | ${metrics.effectivenessAuthority} |`,
    "",
    metrics.effectivenessAuthority === "non_authoritative"
      ? "Effectiveness evidence is non-authoritative because dry_run_ratio is above 30%."
      : "Effectiveness evidence is authoritative for this benchmark run.",
    "",
    "## Command Matrix",
    "",
    "| Agent | Profile | Command |",
    "| --- | --- | --- |",
    ...[...commandRows.values()],
    "",
  ];

  for (const agent of ["claude", "codex"] as const) {
    for (const profile of ["with_skill", "without_skill"] as const) {
      const records = report.records.filter(
        (record) => record.agent === agent && record.profile === profile
      );
      if (records.length === 0) continue;

      lines.push(`## ${agent} / ${profile}`, "", "| Eval | Status | Exit / Graders | Duration | Changed Files | Raw Artifacts |", "| --- | --- | --- | ---: | ---: | --- |");
      for (const record of records) {
        const runLink = relativeLink(repoRoot, record.workspacePath);
        const graderCell =
          record.graderStatus === "skipped"
            ? "graders skipped"
            : record.graderSummary.failed === 0
              ? "graders pass"
              : `graders fail (${record.graderSummary.failed})`;
        lines.push(
          `| ${record.evalSlug} | ${record.status} | ${record.exitCode ?? "n/a"} / ${graderCell} | ${record.durationMs}ms | ${record.changedFiles.length} | [workspace](${runLink}) |`
        );
      }
      lines.push("");

      for (const record of records) {
        lines.push(`### ${record.evalSlug}`, "");
        lines.push(`- Eval: \`${record.evalId}\``);
        lines.push(`- Workspace: [${relativeLink(repoRoot, record.workspacePath)}](${relativeLink(repoRoot, record.workspacePath)})`);
        lines.push(`- Changed files: ${record.changedFiles.length > 0 ? `\`${record.changedFiles.join("`, `")}\`` : "none"}`);
        lines.push(`- Diff summary: ${record.diffStat.length > 0 ? record.diffStat : "no diff captured"}`);
        lines.push(`- Agent status: ${record.agentStatus} (exit ${record.exitCode ?? "n/a"})`);
        lines.push(`- Graders: ${record.graderStatus} (${record.graderSummary.total - record.graderSummary.failed}/${record.graderSummary.total} passed)`);
        lines.push(`- Final response excerpt: ${record.finalResponseExcerpt.length > 0 ? record.finalResponseExcerpt : "(empty)"}`);
        lines.push("- Expectations:");
        for (const expectation of record.expectations) {
          lines.push(`  - ${expectation}`);
        }
        if (record.graderResults.length > 0) {
          lines.push("- Grader results:");
          for (const graderResult of record.graderResults) {
            lines.push(`  - ${graderResult.passed ? "PASS" : "FAIL"} ${graderResult.kind}: ${graderResult.message}`);
          }
        }
        lines.push("");
      }
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function runSkillEvals(options: RunSkillEvalsOptions = {}): IterationReport {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const evalManifest = loadEvalManifest(options.evalsPath ?? join(repoRoot, "evals", "evals.json"));
  const config = loadBenchmarkConfig(
    options.configPath ?? join(repoRoot, "evals", "benchmark.config.json")
  );
  const workspaceRoot = resolveRepoPath(repoRoot, options.workspaceRoot ?? config.workspaceRoot);
  const summaryPath = resolveRepoPath(repoRoot, config.summaryPath);
  const selected = selectEvals(evalManifest.evals, options.evalFilters ?? []);

  if (selected.length === 0) {
    throw new Error("No evals selected for execution");
  }

  ensureDir(workspaceRoot);
  ensureDir(dirname(summaryPath));

  const iterationName = formatIterationName(options.now ?? new Date(), options.iterationLabel);
  const iterationPath = join(workspaceRoot, iterationName);
  ensureDir(iterationPath);

  const records: RunMetadata[] = [];
  for (const agent of selectedAgents(options.agent)) {
    for (const profile of selectedProfiles(options.profile)) {
      for (const evalEntry of selected) {
        records.push(
          runSingleEval({
            repoRoot,
            evalEntry,
            agent,
            profile,
            iterationPath,
            config,
            dryRun: options.dryRun ?? false,
          })
        );
      }
    }
  }

  const report: IterationReport = {
    iterationName,
    iterationPath,
    summaryPath,
    manifestPath: join(iterationPath, "manifest.json"),
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    records,
  };

  writeTextFile(report.manifestPath, `${JSON.stringify(report, null, 2)}\n`);
  writeTextFile(summaryPath, buildBenchmarkSummary(report, repoRoot));
  return report;
}

export function parseCliArgs(args: string[]): RunSkillEvalsOptions {
  const options: RunSkillEvalsOptions = {
    agent: "all",
    profile: "all",
    evalFilters: [],
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    switch (current) {
      case "--agent":
        options.agent = args[index + 1] as RunSkillEvalsOptions["agent"];
        index += 1;
        break;
      case "--profile":
        options.profile = args[index + 1] as RunSkillEvalsOptions["profile"];
        index += 1;
        break;
      case "--eval":
        options.evalFilters?.push(args[index + 1]);
        index += 1;
        break;
      case "--iteration":
        options.iterationLabel = args[index + 1];
        index += 1;
        break;
      case "--workspace-root":
        options.workspaceRoot = args[index + 1];
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return options;
}

if (import.meta.main) {
  try {
    const report = runSkillEvals(parseCliArgs(process.argv.slice(2)));
    console.log(
      `Benchmark complete: ${report.records.length} run(s) in ${report.iterationName}\n` +
      `Summary: ${report.summaryPath}\n` +
      `Manifest: ${report.manifestPath}`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
