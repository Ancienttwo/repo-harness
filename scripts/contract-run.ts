#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { spawnSync } from "child_process";

type Mode = "dry-run" | "run";

interface Options {
  mode: Mode;
  repo: string;
  contract: string;
  workerCommand?: string;
  verifierCommand?: string;
  out?: string;
  json: boolean;
  maxToolCalls?: number;
}

interface DelegationBudget {
  tokens: number | null;
  tool_calls: number | null;
  wall_time_minutes: number | null;
}

interface DelegationContract {
  budget: DelegationBudget;
  permission_scope: {
    mode: string;
    writable_paths: string[];
    network: string;
  };
  roles: Record<string, DelegationRole>;
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
}

function usage(): string {
  return [
    "Usage:",
    "  bun scripts/contract-run.ts dry-run --contract <contract-file> [--repo <path>] [--out <dir>] [--json]",
    "  bun scripts/contract-run.ts run --contract <contract-file> --worker-command <cmd> --verifier-command <cmd> [--repo <path>] [--out <dir>] [--max-tool-calls <n>] [--json]",
  ].join("\n");
}

function parseArgs(argv: string[]): Options {
  let mode: Mode = "dry-run";
  let index = 0;
  if (argv[0] === "run" || argv[0] === "dry-run") {
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
      case "--max-tool-calls":
        opts.maxToolCalls = parsePositiveInt(requireValue(argv, ++index, arg), arg);
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
      tool_calls: parseNullableNumber(block, "tool_calls"),
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
  };
}

function runChild(
  role: "worker" | "verifier",
  command: string,
  repo: string,
  runDir: string,
  env: NodeJS.ProcessEnv,
): ChildResult {
  const stdoutPath = join(runDir, `${role}.stdout.log`);
  const stderrPath = join(runDir, `${role}.stderr.log`);
  const result = spawnSync(command, {
    cwd: repo,
    shell: true,
    encoding: "utf-8",
    env: {
      ...process.env,
      ...env,
      CONTRACT_RUN_ROLE: role,
    },
  });
  writeFileSync(stdoutPath, result.stdout ?? "");
  writeFileSync(stderrPath, result.stderr ?? "");
  return {
    role,
    command,
    exit_code: result.status,
    stdout_path: repoRelative(repo, stdoutPath),
    stderr_path: repoRelative(repo, stderrPath),
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
  const exitCriteria = fencedYamlBlock(contractText, "exit_criteria");
  const delegation = parseDelegation(contractText);
  const allowedPaths = parseList(fencedYamlBlock(contractText, "allowed_paths"), "allowed_paths");
  const toolLimit = opts.maxToolCalls ?? delegation.budget.tool_calls;
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
  writePrompt(workerPrompt, "Contract Worker Task", [
    `Contract: ${repoRelative(repo, contractPath)}`,
    `Plan: ${plan || "(none)"}`,
    `Notes: ${notesFile || "(none)"}`,
    `Role mode: ${delegation.roles.worker?.mode ?? "edit_within_allowed_paths"}`,
    `Role purpose: ${delegation.roles.worker?.purpose ?? "implementation"}`,
    `Permission scope: ${delegation.permission_scope.mode}`,
    `Writable paths: ${(delegation.permission_scope.writable_paths.length ? delegation.permission_scope.writable_paths : allowedPaths).join(", ") || "(none)"}`,
    "",
    "Implement only the contract scope. Do not mark the task done; the verifier owns review.",
    "",
    "## Contract",
    contractText,
  ]);
  writePrompt(verifierPrompt, "Contract Verifier Task", [
    `Contract: ${repoRelative(repo, contractPath)}`,
    `Review file: ${reviewFile || "(none)"}`,
    `Role mode: ${delegation.roles.verifier?.mode ?? "read_only"}`,
    `Role purpose: ${delegation.roles.verifier?.purpose ?? "exit_criteria_review"}`,
    "",
    "Review only against the contract exit criteria. Do not invent another rubric.",
    "",
    "## Exit Criteria",
    exitCriteria || "(none)",
  ]);

  const children: ChildResult[] = [];
  let toolCalls = 0;
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
    if (toolLimit !== null && toolCalls + 1 > toolLimit) {
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
    toolCalls++;
    return true;
  };

  if (opts.mode === "run") {
    if (consume("worker")) {
      const worker = runChild("worker", opts.workerCommand!, repo, runDir, {
        ...baseEnv,
        CONTRACT_RUN_PROMPT: baseEnv.CONTRACT_RUN_WORKER_PROMPT,
      });
      children.push(worker);
      if (worker.exit_code !== 0) {
        status = "fail";
        failureClass = "worker_failed";
      }
    }
    if (status === "pass" && consume("verifier")) {
      const verifier = runChild("verifier", opts.verifierCommand!, repo, runDir, {
        ...baseEnv,
        CONTRACT_RUN_PROMPT: baseEnv.CONTRACT_RUN_VERIFIER_PROMPT,
      });
      children.push(verifier);
      if (verifier.exit_code !== 0) {
        status = "fail";
        failureClass = "verifier_failed";
      } else if (reviewFile && !existsSync(repoPath(repo, reviewFile))) {
        status = "fail";
        failureClass = "missing_review";
      }
    }
  }

  const manifest = {
    version: 1,
    kind: "repo-harness-contract-run",
    status,
    failure_class: failureClass || null,
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
    delegation_plan: {
      parent_owner: delegation.roles.parent,
      explorer: delegation.roles.explorer,
      worker: delegation.roles.worker,
      verifier: delegation.roles.verifier,
      allowed_paths: allowedPaths,
      verifier_rubric: "contract exit_criteria",
      budget_semantics: "null uses session default; explicit numbers are enforced where the runner supports that dimension",
      permission_semantics: "explorer and verifier are read-only; worker is constrained to allowed_paths or narrower writable_paths",
    },
    budget_usage: {
      tool_calls: toolCalls,
      tool_call_limit: toolLimit,
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
    console.log(`[ContractRun] manifest: ${repoRelative(resolve(opts.repo), manifestPath)}`);
    if (manifest.failure_class) console.log(`[ContractRun] failure_class: ${manifest.failure_class}`);
  }
  process.exit(manifest.status === "fail" ? 1 : 0);
} catch (err) {
  const error = err as Error & { exitCode?: number };
  console.error(error.message);
  process.exit(error.exitCode ?? 1);
}
