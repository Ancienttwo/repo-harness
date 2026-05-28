/**
 * `agentic-dev init` — one-shot existing-repo harness bootstrap.
 *
 * This is the CLI equivalent of the `agentic-dev-init` skill facade: default
 * the target repo to cwd, install/refresh the machine runtime pieces, apply the
 * repo-local workflow migration, then verify the installed harness.
 */

import { spawnSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { runInstall, type InstallTargetSpec } from "./install";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..", "..");
const WAZA_SKILLS = ["check", "design", "health", "hunt", "learn", "read", "think", "write"];

export interface InitCommandOptions {
  repo?: string;
  sourceRoot?: string;
  apply?: boolean;
  verify?: boolean;
  syncSkill?: boolean;
  hostAdapters?: boolean;
  externalSkills?: boolean;
  target?: InstallTargetSpec;
  env?: NodeJS.ProcessEnv;
}

export interface InitStep {
  step: string;
  status: "ok" | "skipped" | "failed";
  command?: string[];
  detail?: string;
  stdout?: string;
  stderr?: string;
}

export interface InitCommandResult {
  exitCode: number;
  repoRoot: string;
  steps: InitStep[];
  lines: string[];
}

function runProcess(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): InitStep {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, ...(env ?? {}) },
  });

  return {
    step: "",
    status: result.status === 0 && !result.error ? "ok" : "failed",
    command: [command, ...args],
    stdout: result.stdout ?? "",
    stderr: result.stderr || (result.error ? String(result.error) : ""),
  };
}

function isNpxCacheSource(sourceRoot: string): boolean {
  return /[\\/]_npx[\\/]/.test(sourceRoot);
}

function initCommandEnv(sourceRoot: string, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined {
  if (!isNpxCacheSource(sourceRoot)) return env;
  if (env?.AGENTIC_DEV_LINK_INSTALLED_COPIES !== undefined) return env;
  return { ...(env ?? {}), AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" };
}

function withStepName(step: InitStep, name: string, detail?: string): InitStep {
  return { ...step, step: name, detail: detail ?? step.detail };
}

function renderStep(step: InitStep): string[] {
  const lines = [`[init] ${step.status}: ${step.step}${step.detail ? ` - ${step.detail}` : ""}`];
  if (step.status === "failed" && step.stderr?.trim()) {
    lines.push(step.stderr.trim());
  }
  return lines;
}

function withProcessEnv<T>(env: NodeJS.ProcessEnv | undefined, fn: () => T): T {
  if (!env) return fn();
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function hostAgents(target: InstallTargetSpec): string[] {
  if (target === "codex") return ["codex"];
  if (target === "claude") return ["claude-code"];
  return ["claude-code", "codex"];
}

function homeDir(env?: NodeJS.ProcessEnv): string | null {
  return env?.HOME ?? process.env.HOME ?? null;
}

function skillRoots(target: InstallTargetSpec, env?: NodeJS.ProcessEnv): string[] {
  const home = homeDir(env);
  if (!home) return [];
  const roots: string[] = [];
  if (target === "codex" || target === "both") roots.push(join(home, ".codex", "skills"));
  if (target === "claude" || target === "both") roots.push(join(home, ".claude", "skills"));
  return roots;
}

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

function findDiagramDesignSource(target: InstallTargetSpec, env?: NodeJS.ProcessEnv): string | null {
  if (env?.AGENTIC_DEV_DIAGRAM_DESIGN_SOURCE) return env.AGENTIC_DEV_DIAGRAM_DESIGN_SOURCE;
  const home = homeDir(env);
  if (!home) return null;
  const candidates = [
    join(home, ".codex", "skills", "diagram-design"),
    join(home, ".claude", "skills", "diagram-design"),
    join(home, ".agents", "skills", "diagram-design"),
  ];
  for (const root of skillRoots(target, env)) {
    candidates.push(join(root, "diagram-design"));
  }
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "SKILL.md"))) return candidate;
  }
  return null;
}

function syncDiagramDesign(target: InstallTargetSpec, env?: NodeJS.ProcessEnv): InitStep {
  const source = findDiagramDesignSource(target, env);
  if (!source) {
    return {
      step: "external skill diagram-design",
      status: "failed",
      detail: "source skill not found; set AGENTIC_DEV_DIAGRAM_DESIGN_SOURCE or install diagram-design once",
    };
  }

  const roots = skillRoots(target, env);
  if (roots.length === 0) {
    return {
      step: "external skill diagram-design",
      status: "failed",
      detail: "HOME is required to resolve host skill roots",
    };
  }

  const changed: string[] = [];
  for (const root of roots) {
    const dest = join(root, "diagram-design");
    mkdirSync(root, { recursive: true });
    if (existsSync(dest) && samePath(source, dest)) {
      continue;
    }
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    cpSync(source, dest, { recursive: true });
    changed.push(dest);
  }

  return {
    step: "external skill diagram-design",
    status: "ok",
    detail: changed.length > 0 ? `synced ${changed.join(", ")}` : "already present",
  };
}

function installExternalSkills(sourceRoot: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv): InitStep[] {
  const steps: InitStep[] = [];
  const agents = hostAgents(target);
  const waza = runProcess(
    "npx",
    [
      "-y",
      "skills",
      "add",
      "tw93/Waza",
      "-g",
      "-a",
      ...agents,
      "-s",
      ...WAZA_SKILLS,
      "-y",
    ],
    sourceRoot,
    env,
  );
  steps.push(withStepName(waza, "external skills Waza", `target=${target}`));
  steps.push(syncDiagramDesign(target, env));
  return steps;
}

export function runInit(opts: InitCommandOptions = {}): InitCommandResult {
  const sourceRoot = resolve(opts.sourceRoot ?? REPO_ROOT);
  const repoRoot = resolve(opts.repo ?? process.cwd());
  const commandEnv = initCommandEnv(sourceRoot, opts.env);
  const apply = opts.apply !== false;
  const verify = opts.verify !== false;
  const syncSkill = opts.syncSkill !== false;
  const hostAdapters = opts.hostAdapters !== false;
  const externalSkills = opts.externalSkills !== false;
  const target = opts.target ?? "both";
  const steps: InitStep[] = [];

  if (syncSkill && apply) {
    const step = runProcess("bash", [join(sourceRoot, "scripts", "sync-codex-installed-copies.sh")], sourceRoot, commandEnv);
    steps.push(withStepName(step, "sync agentic-dev skills", `target=${target}`));
  } else {
    steps.push({
      step: "sync agentic-dev skills",
      status: "skipped",
      detail: syncSkill ? "dry-run" : "disabled",
    });
  }

  if (hostAdapters && apply) {
    const installed = withProcessEnv(commandEnv, () => runInstall({ target, location: "global" }));
    steps.push({
      step: "install host adapters",
      status: installed.exitCode === 0 ? "ok" : "failed",
      detail: installed.lines.join("; "),
    });
  } else {
    steps.push({
      step: "install host adapters",
      status: "skipped",
      detail: hostAdapters ? "dry-run" : "disabled",
    });
  }

  const inspect = runProcess(
    process.execPath,
    [join(sourceRoot, "scripts", "inspect-project-state.ts"), "--repo", repoRoot, "--format", "text"],
    sourceRoot,
    commandEnv,
  );
  steps.push(withStepName(inspect, "inspect repo", repoRoot));

  const migrate = runProcess(
    "bash",
    [
      join(sourceRoot, "scripts", "migrate-project-template.sh"),
      "--repo",
      repoRoot,
      apply ? "--apply" : "--dry-run",
    ],
    sourceRoot,
    commandEnv,
  );
  steps.push(withStepName(migrate, apply ? "apply repo harness" : "plan repo harness", repoRoot));

  if (externalSkills && apply && migrate.status === "ok") {
    steps.push(...installExternalSkills(sourceRoot, target, commandEnv));
  } else {
    steps.push({
      step: "external skills",
      status: "skipped",
      detail: !externalSkills
        ? "disabled"
        : apply
          ? "repo harness did not apply cleanly"
          : "dry-run",
    });
  }

  if (apply && verify) {
    const verifyStep = runProcess("bash", ["scripts/check-task-workflow.sh", "--strict"], repoRoot, commandEnv);
    steps.push(withStepName(verifyStep, "verify repo harness", "scripts/check-task-workflow.sh --strict"));
  } else {
    steps.push({ step: "verify repo harness", status: "skipped" });
  }

  const failed = steps.some((step) => step.status === "failed");
  return {
    exitCode: failed ? 1 : 0,
    repoRoot,
    steps,
    lines: steps.flatMap(renderStep),
  };
}
