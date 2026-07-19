#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

// Sibling of the existing bounded process runner (scripts/run-bounded-verifier-command.ts,
// mirrored to assets/templates/helpers/run-bounded-verifier-command.ts): both live next to
// whichever copy of this file is executing, canonical or projected.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

type Mode = "dry-run" | "run" | "preflight";

interface Options {
  mode: Mode;
  repo: string;
  contract: string;
  workerCommand?: string;
  verifierCommand?: string;
  out?: string;
  json: boolean;
  maxRunnerInvocations?: number;
  runner?: string;
  effort?: string;
}

interface DelegationBudget {
  tokens: number | null;
  runner_invocations: number | null;
  wall_time_minutes: number | null;
}

interface RunnerContract {
  preferred: string[];
  fallback: string | null;
  brief_is_authoritative: boolean;
}

interface DelegationContract {
  budget: DelegationBudget;
  permission_scope: {
    mode: string;
    writable_paths: string[];
    network: string;
  };
  roles: Record<string, DelegationRole>;
  runner: RunnerContract;
}

interface BriefPreflight {
  ok: boolean;
  issues: string[];
  failure_class:
    | "incomplete_brief"
    | "incomplete_root_cause"
    | "legacy_delegation_field"
    | "unenforceable_delegation_constraint"
    | null;
}

interface DelegationRole {
  mode: string;
  purpose: string;
}

interface ChildResult {
  role: "worker" | "verifier";
  command: string;
  exit_code: number | null;
  stdout_path: string;
  stderr_path: string;
  skipped?: boolean;
  timed_out?: boolean;
}

// Canonical anti-extras clause injected into every runner-reachable surface (worker
// prompt here, the Codex delegation advisor hook, subagent start context, and the MCP
// codex-goal path). Keep the first sentence byte-identical across all sources; a parity
// test asserts they never drift apart.
const EXECUTION_BOUNDARY = [
  "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.",
  "",
  "Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.",
  "",
  "If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.",
  "",
  "If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.",
].join("\n");

function usage(): string {
  return [
    "Usage:",
    "  bun scripts/contract-run.ts preflight --contract <contract-file> [--repo <path>] [--json]",
    "  bun scripts/contract-run.ts dry-run --contract <contract-file> [--repo <path>] [--out <dir>] [--runner <label>] [--effort <tier>] [--json]",
    "  bun scripts/contract-run.ts run --contract <contract-file> --worker-command <cmd> --verifier-command <cmd> [--repo <path>] [--out <dir>] [--max-runner-invocations <n>] [--runner <label>] [--effort <tier>] [--json]",
    "",
    "preflight asserts the contract is a self-sufficient execution brief (Goal, Scope,",
    "Allowed Paths, Exit Criteria are filled in, not template placeholders) and exits",
    "non-zero otherwise. run enforces the same gate before dispatching the worker.",
    "",
    "preflight also enforce-or-rejects the Delegation Contract budget: wall_time_minutes",
    "rides the existing bounded process runner deadline (scripts/run-bounded-verifier-command.ts);",
    "a non-null tokens, a non-'inherited' network, or a non-empty writable_paths narrowing",
    "is REJECTED (contract-run cannot yet enforce those dimensions, so it refuses to run with",
    "a false safety claim instead of silently ignoring them); the retired tool_calls budget",
    "field name is rejected in favor of runner_invocations, with no alias.",
    "",
    "--runner records which runner label actually ran this contract (manifest.runner_usage);",
    "it defaults to the contract's own delegation.runner.preferred[0] and does not itself",
    "select, spawn, or degrade a runner.",
    "",
    "--effort records the worker effort tier (manifest.runner_usage.effort); it defaults to",
    "\"high\" only when the resolved runner is the contract's worker fallback, and does not",
    "itself select, spawn, or enforce an effort tier.",
    "",
    "A file-coupled runner consumes the generated prompt from $CONTRACT_RUN_PROMPT, e.g.:",
    "  --worker-command 'codex exec --json \"$(cat \\\"$CONTRACT_RUN_PROMPT\\\")\"'",
  ].join("\n");
}

function parseArgs(argv: string[]): Options {
  let mode: Mode = "dry-run";
  let index = 0;
  if (argv[0] === "run" || argv[0] === "dry-run" || argv[0] === "preflight") {
    mode = argv[0];
    index = 1;
  }

  const opts: Options = {
    mode,
    repo: process.cwd(),
    contract: "",
    json: false,
  };

  while (index < argv.length) {
    const arg = argv[index];
    switch (arg) {
      case "--repo":
        opts.repo = requireValue(argv, ++index, arg);
        index++;
        break;
      case "--contract":
        opts.contract = requireValue(argv, ++index, arg);
        index++;
        break;
      case "--worker-command":
        opts.workerCommand = requireValue(argv, ++index, arg);
        index++;
        break;
      case "--verifier-command":
        opts.verifierCommand = requireValue(argv, ++index, arg);
        index++;
        break;
      case "--out":
        opts.out = requireValue(argv, ++index, arg);
        index++;
        break;
      case "--max-runner-invocations":
        opts.maxRunnerInvocations = parsePositiveInt(requireValue(argv, ++index, arg), arg);
        index++;
        break;
      case "--runner":
        opts.runner = requireValue(argv, ++index, arg);
        index++;
        break;
      case "--effort":
        opts.effort = parseEffort(requireValue(argv, ++index, arg), arg);
        index++;
        break;
      case "--json":
        opts.json = true;
        index++;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      default:
        throw new CliError(`contract-run: unknown argument ${arg}`, 2);
    }
  }

  if (!opts.contract) {
    throw new CliError("contract-run: --contract is required", 2);
  }
  if (opts.mode === "run" && (!opts.workerCommand || !opts.verifierCommand)) {
    throw new CliError("contract-run: run requires --worker-command and --verifier-command", 2);
  }
  return opts;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new CliError(`contract-run: ${flag} requires a value`, 2);
  }
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CliError(`contract-run: ${flag} must be a positive integer`, 2);
  }
  return parsed;
}

// Closed effort-tier vocabulary shared in spirit with buildFamilyEffortMap() in
// scripts/install-agent-fleet.sh; that copy lives inside an embedded Node.js heredoc in a
// bash script, not an importable module, so this is a local literal list rather than a
// shared import.
const EFFORT_TIERS = ["low", "medium", "high", "xhigh", "max"] as const;

function parseEffort(value: string, flag: string): string {
  if (!(EFFORT_TIERS as readonly string[]).includes(value)) {
    throw new CliError(`contract-run: ${flag} must be one of ${EFFORT_TIERS.join(", ")}`, 2);
  }
  return value;
}

class CliError extends Error {
  constructor(message: string, readonly exitCode: number) {
    super(message);
  }
}

function repoPath(repo: string, path: string): string {
  return isAbsolute(path) ? path : join(repo, path);
}

function repoRelative(repo: string, path: string): string {
  const rel = relative(repo, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function stripTicks(value: string): string {
  return value.trim().replace(/^`/, "").replace(/`$/, "");
}

function readHeader(markdown: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.+)$`, "m"));
  return match ? stripTicks(match[1]) : "";
}

function fencedYamlBlock(markdown: string, key: string): string {
  const fence = /```yaml\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown)) !== null) {
    if (new RegExp(`(^|\\n)${key}:`).test(match[1])) {
      return match[1];
    }
  }
  return "";
}

function parseScalar(block: string, key: string): string | null {
  const match = block.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  if (!match) return null;
  const value = match[1].trim();
  return value === "null" ? null : value.replace(/^["']|["']$/g, "");
}

function parseNullableNumber(block: string, key: string): number | null {
  const value = parseScalar(block, key);
  if (value === null || value === "null") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseList(block: string, key: string): string[] {
  const lines = block.split("\n");
  const values: string[] = [];
  let inList = false;
  const keyPattern = new RegExp(`^\\s*${key}:\\s*$`);
  for (const line of lines) {
    if (keyPattern.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    if (/^\S/.test(line) || /^\s+[a-zA-Z0-9_-]+:/.test(line)) break;
    const match = line.match(/^\s*-\s*(.+)$/);
    if (match) values.push(match[1].trim().replace(/^["']|["']$/g, ""));
  }
  return values;
}

// Parses a list of nested objects shaped like `key:\n  - path: value` (for example
// exit_criteria.tests_pass) and returns just the path values. Plain parseList cannot
// decompose these: each list entry is a one-key object rather than a bare scalar, so it
// would return the raw "path: value" string as a single item instead of the value alone.
function parseNestedPathList(block: string, key: string): string[] {
  const lines = block.split("\n");
  const values: string[] = [];
  let inList = false;
  const keyPattern = new RegExp(`^\\s*${key}:\\s*$`);
  for (const line of lines) {
    if (keyPattern.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    if (/^\S/.test(line) || /^\s+[a-zA-Z0-9_-]+:/.test(line)) break;
    const match = line.match(/^\s*-\s*path:\s*(.+)$/);
    if (match) values.push(match[1].trim().replace(/^["']|["']$/g, ""));
  }
  return values;
}

function parseRoles(block: string): Record<string, DelegationRole> {
  const roles: Record<string, DelegationRole> = {};
  let inRoles = false;
  let currentRole = "";
  for (const line of block.split("\n")) {
    if (/^\s*roles:\s*$/.test(line)) {
      inRoles = true;
      continue;
    }
    if (!inRoles) continue;
    if (/^\S/.test(line)) break;
    const scalar = line.match(/^\s{4}([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (scalar) {
      roles[scalar[1]] = { mode: scalar[2].trim(), purpose: scalar[2].trim() };
      currentRole = scalar[1];
      continue;
    }
    const nested = line.match(/^\s{4}([a-zA-Z0-9_-]+):\s*$/);
    if (nested) {
      currentRole = nested[1];
      roles[currentRole] = roles[currentRole] ?? { mode: "", purpose: "" };
      continue;
    }
    const field = line.match(/^\s{6}(mode|purpose):\s*(.+)$/);
    if (field && currentRole) {
      roles[currentRole] = {
        ...roles[currentRole],
        [field[1]]: field[2].trim().replace(/^["']|["']$/g, ""),
      };
    }
  }
  return roles;
}

function parseDelegation(markdown: string): DelegationContract {
  const block = fencedYamlBlock(markdown, "delegation");
  return {
    budget: {
      tokens: parseNullableNumber(block, "tokens"),
      runner_invocations: parseNullableNumber(block, "runner_invocations"),
      wall_time_minutes: parseNullableNumber(block, "wall_time_minutes"),
    },
    permission_scope: {
      mode: parseScalar(block, "mode") ?? "inherit_allowed_paths",
      writable_paths: parseList(block, "writable_paths"),
      network: parseScalar(block, "network") ?? "inherited",
    },
    roles: {
      parent: { mode: "narrate_and_gatekeep", purpose: "approval_checkpoint_owner" },
      explorer: { mode: "read_only", purpose: "codebase_research" },
      worker: { mode: "edit_within_allowed_paths", purpose: "implementation" },
      verifier: { mode: "read_only", purpose: "exit_criteria_review" },
      ...parseRoles(block),
    },
    runner: parseRunner(block),
  };
}

// The budget field was renamed tool_calls -> runner_invocations (the old name counted
// worker/verifier process launches, not model tool calls, and never had an enforcement
// story attached to the name it claimed). No alias: a contract that still declares
// tool_calls must fail closed instead of silently parsing as an unset runner_invocations
// budget, which would drop the author's intended limit without any signal.
function hasLegacyToolCallsField(markdown: string): boolean {
  const block = fencedYamlBlock(markdown, "delegation");
  return /^\s*tool_calls\s*:/m.test(block);
}

// Enforce-or-reject for every delegation constraint contract-run cannot yet make true:
// wall_time_minutes rides the existing bounded process runner deadline (see runChild), so
// it is mechanically enforced rather than checked here. tokens, a non-'inherited' network,
// and a writable_paths narrowing have no enforcement mechanism in this runner, so a non-null
// declaration is rejected at preflight instead of silently parsing to a no-op -- a declared
// constraint the runner cannot honor is a false safety claim.
function checkUnenforceableDelegationConstraints(delegation: DelegationContract): string[] {
  const issues: string[] = [];
  if (delegation.budget.tokens !== null) {
    issues.push(
      `Delegation budget.tokens is set to ${delegation.budget.tokens}, but contract-run has no token-budget enforcement mechanism; set it to null instead of declaring a limit that will not be checked.`,
    );
  }
  if (delegation.permission_scope.network !== "inherited") {
    issues.push(
      `Delegation permission_scope.network is '${delegation.permission_scope.network}', but contract-run cannot restrict network access beyond the inherited environment; set it to 'inherited' instead of declaring a restriction that will not be enforced.`,
    );
  }
  if (delegation.permission_scope.writable_paths.length > 0) {
    issues.push(
      `Delegation permission_scope.writable_paths narrows to [${delegation.permission_scope.writable_paths.join(", ")}], but contract-run does not enforce a writable-path boundary narrower than allowed_paths; leave it empty instead of declaring a narrowing that will not be enforced.`,
    );
  }
  return issues;
}

function parseRunner(block: string): RunnerContract {
  const preferred = parseList(block, "preferred");
  const fallback = parseScalar(block, "fallback");
  const briefAuthoritative = parseScalar(block, "brief_is_authoritative");
  return {
    preferred: preferred.length > 0 ? preferred : ["subagent"],
    fallback: fallback && fallback !== "null" ? fallback : null,
    brief_is_authoritative: briefAuthoritative === null ? true : briefAuthoritative === "true",
  };
}

function sectionBody(markdown: string, heading: string): string {
  const headingPattern = new RegExp(`^##\\s+${heading}\\s*$`);
  const lines = markdown.split("\n");
  const body: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (headingPattern.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s/.test(line)) break;
    if (inSection) body.push(line);
  }
  return body.join("\n");
}

function isConcreteBrief(text: string): boolean {
  const body = text.trim();
  if (!body) return false;
  if (/\{\{[^}]+\}\}/.test(body)) return false;
  const withoutPlaceholders = body
    .replace(/Describe the exact outcome this task must deliver\./g, "")
    .replace(/^\s*-\s*In scope:\s*$/gm, "")
    .replace(/^\s*-\s*Out of scope:\s*$/gm, "")
    .replace(/Why this task matters and what breaks downstream if it ships wrong or is skipped\./g, "")
    .trim();
  return withoutPlaceholders.length > 0;
}

// Scans a `## Scope` section body for a top-level `- <label>:` bullet and returns its
// content, whether that content sits inline after the colon (`- In scope: foo`) or as
// nested bullets on the following indented lines. A line that starts a new top-level
// bullet (no leading indentation) ends the scan, so `In scope:` and `Out of scope:` are
// judged independently even though they share one Scope section.
function scopeBulletBody(scopeSection: string, label: "In scope" | "Out of scope"): string {
  const lines = scopeSection.split("\n");
  const startPattern = new RegExp(`^-\\s*${label}:\\s*(.*)$`);
  const otherTopLevelBullet = /^-\s/;
  const collected: string[] = [];
  let collecting = false;
  for (const line of lines) {
    const start = line.match(startPattern);
    if (start) {
      collecting = true;
      if (start[1].trim()) collected.push(start[1].trim());
      continue;
    }
    if (!collecting) continue;
    if (otherTopLevelBullet.test(line)) break;
    if (line.trim()) collected.push(line.trim());
  }
  return collected.join(" ").trim();
}

function isConcreteScopeBullet(scopeSection: string, label: "In scope" | "Out of scope"): boolean {
  const bullet = scopeBulletBody(scopeSection, label);
  return bullet.length > 0 && !/\{\{[^}]+\}\}/.test(bullet);
}

type RootCauseField = "root_cause" | "repro" | "regression_guard" | "pre_fix_failure_artifact";

// Verbatim placeholder text from the contract template's `## Root Cause Evidence`
// section (assets/templates/contract.template.md and its mirrors). A field counts as
// still-a-placeholder when its value equals this text, the same idiom isConcreteBrief
// uses for the Goal/Why placeholder sentences above.
const ROOT_CAUSE_PLACEHOLDER: Record<RootCauseField, string> = {
  root_cause: 'one sentence naming file:line/condition (testable, not "a state issue").',
  repro: "the command or UI path that reproduces the symptom.",
  regression_guard:
    "path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).",
  pre_fix_failure_artifact:
    'path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see H2/H3).',
};

function parseRootCauseField(section: string, field: RootCauseField): string {
  const match = section.match(new RegExp(`^-\\s*${field}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function isConcreteRootCauseField(value: string, field: RootCauseField): boolean {
  if (!value) return false;
  if (/\{\{[^}]+\}\}/.test(value)) return false;
  return value !== ROOT_CAUSE_PLACEHOLDER[field];
}

// Evaluates the bugfix-only pre-fix failure evidence gate: all four fields must be
// concrete, regression_guard must also be listed under exit_criteria.tests_pass, and
// pre_fix_failure_artifact must exist and show a genuine pre-fix failure (a non-zero
// PRE_FIX_EXIT= line — not a "fail" substring match, since a passing bun run's own
// summary text contains "0 fail") that references the regression_guard path.
function checkRootCauseEvidence(markdown: string, repo: string): string[] {
  const issues: string[] = [];
  const section = sectionBody(markdown, "Root Cause Evidence");

  const rootCause = parseRootCauseField(section, "root_cause");
  const repro = parseRootCauseField(section, "repro");
  const regressionGuard = parseRootCauseField(section, "regression_guard");
  const preFixArtifact = parseRootCauseField(section, "pre_fix_failure_artifact");

  if (!isConcreteRootCauseField(rootCause, "root_cause")) {
    issues.push("Root Cause Evidence: root_cause is empty or still a template placeholder");
  }
  if (!isConcreteRootCauseField(repro, "repro")) {
    issues.push("Root Cause Evidence: repro is empty or still a template placeholder");
  }

  const regressionGuardConcrete = isConcreteRootCauseField(regressionGuard, "regression_guard");
  if (!regressionGuardConcrete) {
    issues.push("Root Cause Evidence: regression_guard is empty or still a template placeholder");
  }

  const preFixArtifactConcrete = isConcreteRootCauseField(preFixArtifact, "pre_fix_failure_artifact");
  if (!preFixArtifactConcrete) {
    issues.push("Root Cause Evidence: pre_fix_failure_artifact is empty or still a template placeholder");
  }

  if (regressionGuardConcrete) {
    const testsPassPaths = parseNestedPathList(fencedYamlBlock(markdown, "exit_criteria"), "tests_pass");
    if (!testsPassPaths.includes(regressionGuard)) {
      issues.push(
        `Root Cause Evidence: regression_guard ${regressionGuard} is not listed under exit_criteria.tests_pass`,
      );
    }
  }

  if (preFixArtifactConcrete) {
    const artifactPath = repoPath(repo, preFixArtifact);
    if (!existsSync(artifactPath)) {
      issues.push(`Root Cause Evidence: pre_fix_failure_artifact does not exist: ${preFixArtifact}`);
    } else {
      const artifactContent = readFileSync(artifactPath, "utf-8");
      const exitMatch = artifactContent.match(/^PRE_FIX_EXIT=(\d+)\s*$/m);
      if (!exitMatch || Number(exitMatch[1]) === 0) {
        issues.push(
          `Root Cause Evidence: pre_fix_failure_artifact is missing a non-zero PRE_FIX_EXIT= line: ${preFixArtifact}`,
        );
      }
      if (regressionGuardConcrete && !artifactContent.includes(regressionGuard)) {
        issues.push(
          `Root Cause Evidence: pre_fix_failure_artifact does not reference the regression_guard path ${regressionGuard}`,
        );
      }
    }
  }

  return issues;
}

function runBriefPreflight(markdown: string, repo: string): BriefPreflight {
  const baseIssues: string[] = [];
  if (!isConcreteBrief(sectionBody(markdown, "Goal"))) {
    baseIssues.push("Goal section is empty or still a template placeholder");
  }
  const scopeSection = sectionBody(markdown, "Scope");
  if (!isConcreteScopeBullet(scopeSection, "In scope")) {
    baseIssues.push("Scope section is missing a concrete 'In scope:' item");
  }
  if (!isConcreteScopeBullet(scopeSection, "Out of scope")) {
    baseIssues.push("Scope section is missing a concrete 'Out of scope:' item");
  }
  if (!isConcreteBrief(sectionBody(markdown, "Why"))) {
    baseIssues.push("Why section is empty or still a template placeholder");
  }
  if (parseList(fencedYamlBlock(markdown, "allowed_paths"), "allowed_paths").length === 0) {
    baseIssues.push("Allowed Paths is empty");
  }
  if (!fencedYamlBlock(markdown, "exit_criteria").trim()) {
    baseIssues.push("Exit Criteria block is missing");
  }

  const rootCauseIssues =
    readHeader(markdown, "Task Profile") === "bugfix" ? checkRootCauseEvidence(markdown, repo) : [];

  const legacyFieldIssues = hasLegacyToolCallsField(markdown)
    ? [
        "Delegation budget uses the retired field name 'tool_calls'; rename it to 'runner_invocations'. No alias is supported, so the old name is rejected rather than silently ignored.",
      ]
    : [];

  const delegationConstraintIssues = checkUnenforceableDelegationConstraints(parseDelegation(markdown));

  const issues = [...baseIssues, ...rootCauseIssues, ...legacyFieldIssues, ...delegationConstraintIssues];
  const failureClass: BriefPreflight["failure_class"] =
    baseIssues.length > 0
      ? "incomplete_brief"
      : rootCauseIssues.length > 0
        ? "incomplete_root_cause"
        : legacyFieldIssues.length > 0
          ? "legacy_delegation_field"
          : delegationConstraintIssues.length > 0
            ? "unenforceable_delegation_constraint"
            : null;

  return { ok: issues.length === 0, issues, failure_class: failureClass };
}

// Sentinel exit code the bounded runner writes when the deadline fires (see
// scripts/run-bounded-verifier-command.ts). Surfaced separately so a timeout reads as
// "wall_time_minutes exceeded" in the manifest instead of a generic child failure.
const BOUNDED_RUNNER_TIMEOUT_EXIT_CODE = 124;

function runChild(
  role: "worker" | "verifier",
  command: string,
  repo: string,
  runDir: string,
  env: NodeJS.ProcessEnv,
  deadlineMs: number | null,
): ChildResult {
  const stdoutPath = join(runDir, `${role}.stdout.log`);
  const stderrPath = join(runDir, `${role}.stderr.log`);
  const childEnv = { ...process.env, ...env, CONTRACT_RUN_ROLE: role };

  if (deadlineMs !== null) {
    // wall_time_minutes is non-null: ride the existing bounded process runner instead of
    // reimplementing deadline/process-group termination here. It writes combined
    // stdout+stderr to one log (its own process-group-aware kill logic needs a single
    // stream), so stderr_path stays present but empty in this branch.
    const boundedResultPath = join(runDir, `${role}.bounded-result.json`);
    const boundedRunner = join(SCRIPT_DIR, "run-bounded-verifier-command.ts");
    const wrapper = spawnSync(
      process.execPath,
      [
        boundedRunner,
        "--deadline-ms",
        String(deadlineMs),
        "--log",
        stdoutPath,
        "--result",
        boundedResultPath,
        "--",
        "/bin/sh",
        "-c",
        command,
      ],
      { cwd: repo, encoding: "utf-8", env: childEnv },
    );
    if (!existsSync(stdoutPath)) writeFileSync(stdoutPath, "");
    writeFileSync(stderrPath, "");
    let exitCode: number | null = wrapper.status;
    let timedOut = false;
    if (existsSync(boundedResultPath)) {
      try {
        const bounded = JSON.parse(readFileSync(boundedResultPath, "utf-8")) as {
          exit_code: number;
          timed_out: boolean;
        };
        exitCode = bounded.exit_code;
        timedOut = bounded.timed_out === true;
      } catch {
        // Keep the wrapper's own exit status if the result artifact is unreadable.
      }
    }
    return {
      role,
      command,
      exit_code: exitCode,
      stdout_path: repoRelative(repo, stdoutPath),
      stderr_path: repoRelative(repo, stderrPath),
      timed_out: timedOut || exitCode === BOUNDED_RUNNER_TIMEOUT_EXIT_CODE,
    };
  }

  const result = spawnSync(command, {
    cwd: repo,
    shell: true,
    encoding: "utf-8",
    env: childEnv,
  });
  writeFileSync(stdoutPath, result.stdout ?? "");
  writeFileSync(stderrPath, result.stderr ?? "");
  return {
    role,
    command,
    exit_code: result.status,
    stdout_path: repoRelative(repo, stdoutPath),
    stderr_path: repoRelative(repo, stderrPath),
    timed_out: false,
  };
}

function writePrompt(path: string, title: string, lines: string[]) {
  writeFileSync(path, [`# ${title}`, "", ...lines, ""].join("\n"));
}

function buildRun(opts: Options) {
  const repo = resolve(opts.repo);
  const contractPath = repoPath(repo, opts.contract);
  if (!existsSync(contractPath)) {
    throw new CliError(`contract-run: contract not found: ${opts.contract}`, 2);
  }

  const contractText = readFileSync(contractPath, "utf-8");
  const plan = readHeader(contractText, "Plan");
  const reviewFile = readHeader(contractText, "Review File");
  const notesFile = readHeader(contractText, "Notes File");
  const exemplar = readHeader(contractText, "Exemplar");
  const why = sectionBody(contractText, "Why");
  const goal = sectionBody(contractText, "Goal");
  const scope = sectionBody(contractText, "Scope");
  const stopConds = sectionBody(contractText, "Stop Conditions");
  const exitCriteria = fencedYamlBlock(contractText, "exit_criteria");
  const delegation = parseDelegation(contractText);
  const allowedPaths = parseList(fencedYamlBlock(contractText, "allowed_paths"), "allowed_paths");
  const briefPreflight = runBriefPreflight(contractText, repo);

  if (opts.mode === "preflight") {
    const manifest = {
      version: 1,
      kind: "repo-harness-contract-run",
      status: briefPreflight.ok ? "preflight_pass" : "fail",
      failure_class: briefPreflight.failure_class,
      repo,
      contract: repoRelative(repo, contractPath),
      brief_preflight: briefPreflight,
    };
    return { manifest, manifestPath: "" };
  }

  const runnerInvocationLimit = opts.maxRunnerInvocations ?? delegation.budget.runner_invocations;
  // wall_time_minutes rides the existing bounded process runner deadline (runChild),
  // shared across worker and verifier so it bounds the whole delegated task's wall clock,
  // matching how verify-contract.sh computes one verification_deadline_ms for its run.
  const wallTimeDeadlineMs =
    delegation.budget.wall_time_minutes !== null ? Date.now() + delegation.budget.wall_time_minutes * 60_000 : null;
  const slug = contractPath
    .split("/")
    .pop()!
    .replace(/\.contract\.md$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
  const runDir = repoPath(
    repo,
    opts.out ?? `.ai/harness/runs/contract-run-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}-${slug}`,
  );
  mkdirSync(runDir, { recursive: true });

  const workerPrompt = join(runDir, "worker-prompt.md");
  const verifierPrompt = join(runDir, "verifier-prompt.md");
  const stopCondLines = stopConds
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `  ${line}`);
  writePrompt(workerPrompt, "Contract Worker Task", [
    `Contract: ${repoRelative(repo, contractPath)}`,
    `Plan: ${plan || "(none)"}`,
    `Notes: ${notesFile || "(none)"}`,
    ...(exemplar ? [`Exemplar: ${exemplar}`] : []),
    `Role mode: ${delegation.roles.worker?.mode ?? "edit_within_allowed_paths"}`,
    `Role purpose: ${delegation.roles.worker?.purpose ?? "implementation"}`,
    `Permission scope: ${delegation.permission_scope.mode}`,
    `Writable paths: ${(delegation.permission_scope.writable_paths.length ? delegation.permission_scope.writable_paths : allowedPaths).join(", ") || "(none)"}`,
    "",
    "## Why this task matters",
    "",
    why.trim(),
    "",
    "Implement only the contract scope. Do not widen it. Do not mark the task done; the verifier owns the verdict.",
    "",
    "## Before you finish (mandatory self-verification)",
    "",
    "Run every command listed under exit_criteria.commands_succeed and every test under exit_criteria.tests_pass yourself, in this worktree, before reporting. Paste the exact command line and its output/exit status into your final report. Do not report a criterion as satisfied if you did not run it. If a command fails and you cannot fix it within scope, STOP and report the failure instead of claiming completion. If the contract lists no tests_pass or commands_succeed items, state that explicitly in your report instead of inventing checks.",
    "",
    "## Record what you learned",
    "",
    "Before finishing, append to the Notes file above: Design Decisions, Deviations From Plan Or Spec, Tradeoffs Considered, and Open Questions. List anything reusable beyond this task under Promotion Candidates.",
    "",
    "## Stop / escalate",
    "",
    "Hand back to the parent (do not improvise) if the contract Goal, Scope, Allowed Paths, or Exit Criteria are missing or contradictory, if the work requires editing a path outside Allowed Paths, or if any condition under \"Stop Conditions\" in the contract triggers.",
    ...stopCondLines,
    "",
    "## Execution boundary",
    "",
    EXECUTION_BOUNDARY,
    "",
    "## Contract",
    "",
    contractText,
  ]);
  writePrompt(verifierPrompt, "Contract Verifier Task", [
    `Contract: ${repoRelative(repo, contractPath)}`,
    `Review file: ${reviewFile || "(none)"}`,
    `Role mode: ${delegation.roles.verifier?.mode ?? "read_only"}`,
    `Role purpose: ${delegation.roles.verifier?.purpose ?? "exit_criteria_review"}`,
    "",
    "## Intent (context only)",
    "",
    `Goal: ${goal.trim()}`,
    `Scope: ${scope.trim()}`,
    ...(why.trim() ? [`Why: ${why.trim()}`] : []),
    "",
    "Use the Intent above only to understand what the worker was asked to do. Score PASS or FAIL strictly against the Exit Criteria below; do not invent another rubric or grade work outside these criteria. Before scoring, confirm from the worker's report that it actually ran the tests_pass and commands_succeed items; re-run any item whose evidence you cannot confirm.",
    "",
    "## Exit Criteria",
    "",
    exitCriteria || "(none)",
  ]);

  const children: ChildResult[] = [];
  let runnerInvocations = 0;
  let status: "dry_run" | "pass" | "fail" = opts.mode === "dry-run" ? "dry_run" : "pass";
  let failureClass = "";

  const manifestPath = join(runDir, "manifest.json");
  const baseEnv = {
    CONTRACT_RUN_CONTRACT: repoRelative(repo, contractPath),
    CONTRACT_RUN_PLAN: plan,
    CONTRACT_RUN_REVIEW: reviewFile,
    CONTRACT_RUN_NOTES: notesFile,
    CONTRACT_RUN_DIR: repoRelative(repo, runDir),
    CONTRACT_RUN_WORKER_PROMPT: repoRelative(repo, workerPrompt),
    CONTRACT_RUN_VERIFIER_PROMPT: repoRelative(repo, verifierPrompt),
    CONTRACT_RUN_ALLOWED_PATHS: allowedPaths.join("\n"),
    CONTRACT_RUN_VERIFIER_RUBRIC: exitCriteria,
  };

  const consume = (role: "worker" | "verifier") => {
    if (runnerInvocationLimit !== null && runnerInvocations + 1 > runnerInvocationLimit) {
      status = "fail";
      failureClass = "budget_exceeded";
      children.push({
        role,
        command: role === "worker" ? opts.workerCommand ?? "" : opts.verifierCommand ?? "",
        exit_code: null,
        stdout_path: "",
        stderr_path: "",
        skipped: true,
      });
      return false;
    }
    runnerInvocations++;
    return true;
  };

  if (opts.mode === "run" && !briefPreflight.ok) {
    status = "fail";
    failureClass = briefPreflight.failure_class ?? "incomplete_brief";
  }

  if (opts.mode === "run" && briefPreflight.ok) {
    if (consume("worker")) {
      const worker = runChild(
        "worker",
        opts.workerCommand!,
        repo,
        runDir,
        { ...baseEnv, CONTRACT_RUN_PROMPT: baseEnv.CONTRACT_RUN_WORKER_PROMPT },
        wallTimeDeadlineMs,
      );
      children.push(worker);
      if (worker.exit_code !== 0) {
        status = "fail";
        failureClass = worker.timed_out ? "wall_time_exceeded" : "worker_failed";
      }
    }
    if (status === "pass" && consume("verifier")) {
      const verifier = runChild(
        "verifier",
        opts.verifierCommand!,
        repo,
        runDir,
        { ...baseEnv, CONTRACT_RUN_PROMPT: baseEnv.CONTRACT_RUN_VERIFIER_PROMPT },
        wallTimeDeadlineMs,
      );
      children.push(verifier);
      if (verifier.exit_code !== 0) {
        status = "fail";
        failureClass = verifier.timed_out ? "wall_time_exceeded" : "verifier_failed";
      } else if (reviewFile && !existsSync(repoPath(repo, reviewFile))) {
        status = "fail";
        failureClass = "missing_review";
      }
    }
  }

  const usedRunner = opts.runner ?? delegation.runner.preferred[0];
  const offPolicy = !delegation.runner.preferred.includes(usedRunner) && usedRunner !== delegation.runner.fallback;
  const onWorkerFallback = delegation.runner.fallback !== null && usedRunner === delegation.runner.fallback;
  const workerProfile = usedRunner === "main-thread"
    ? "sol-high"
    : (usedRunner === "codex-subagent" || usedRunner === "codex-exec" ? usedRunner : "fast-worker");
  const effortUsed = opts.effort ?? (onWorkerFallback ? "high" : null);

  const manifest = {
    version: 1,
    kind: "repo-harness-contract-run",
    status,
    failure_class: failureClass || null,
    brief_preflight: briefPreflight,
    repo,
    contract: repoRelative(repo, contractPath),
    plan,
    review_file: reviewFile,
    notes_file: notesFile,
    run_dir: repoRelative(repo, runDir),
    prompts: {
      worker: repoRelative(repo, workerPrompt),
      verifier: repoRelative(repo, verifierPrompt),
    },
    delegation,
    runner_usage: {
      used: usedRunner,
      off_policy: offPolicy,
      path: onWorkerFallback ? "worker_fallback" : "worker_preferred",
      effort: effortUsed,
    },
    delegation_plan: {
      parent_owner: delegation.roles.parent,
      explorer: delegation.roles.explorer,
      worker: delegation.roles.worker,
      verifier: delegation.roles.verifier,
      allowed_paths: allowedPaths,
      verifier_rubric: "contract exit_criteria",
      budget_semantics: "null uses session default; wall_time_minutes is mechanically enforced via the bounded process runner deadline; a non-null tokens, a non-'inherited' network, or a non-empty writable_paths narrowing fails preflight instead of parsing to a silent no-op",
      permission_semantics: "explorer and verifier are read-only; worker is constrained to allowed_paths or narrower writable_paths",
      role_profiles: {
        parent: "orchestrator",
        explorer: "explorer",
        worker: workerProfile,
        verifier: "gatekeeper",
      },
    },
    budget_usage: {
      runner_invocations: runnerInvocations,
      runner_invocation_limit: runnerInvocationLimit,
    },
    children,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { manifest, manifestPath };
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const { manifest, manifestPath } = buildRun(opts);
  if (opts.json) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log(`[ContractRun] ${manifest.status}: ${manifest.contract}`);
    if (manifestPath) {
      console.log(`[ContractRun] manifest: ${repoRelative(resolve(opts.repo), manifestPath)}`);
    }
    if (manifest.failure_class) console.log(`[ContractRun] failure_class: ${manifest.failure_class}`);
  }
  process.exit(manifest.status === "fail" ? 1 : 0);
} catch (err) {
  const error = err as Error & { exitCode?: number };
  console.error(error.message);
  process.exit(error.exitCode ?? 1);
}
