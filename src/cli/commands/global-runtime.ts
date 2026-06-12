import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { configureBrainRoot, defaultBrainRootChoice, expandHomePath } from "./brain-root";
import { syncCrossReviewSkills } from "./init";
import { runInstall, type InstallTargetSpec } from "./install";
import { configureCodegraph } from "../tools/codegraph";

export interface GlobalRuntimeOptions {
  sourceRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  target?: InstallTargetSpec;
  installCli?: boolean;
  syncSkill?: boolean;
  hostAdapters?: boolean;
  externalSkills?: boolean;
  codegraph?: boolean;
  brainRoot?: string;
}

export interface GlobalRuntimeStep {
  step: string;
  status: "ok" | "skipped" | "failed";
  command?: string[];
  detail?: string;
  stdout?: string;
  stderr?: string;
}

export interface GlobalRuntimeResult {
  exitCode: number;
  steps: GlobalRuntimeStep[];
  lines: string[];
  stdout: string;
  stderr: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CODEGRAPH_PACKAGE = "@colbymchenry/codegraph";
const WAZA_SKILLS = ["think", "hunt", "check", "health"] as const;

function defaultSourceRoot(): string {
  return join(SCRIPT_DIR, "..", "..", "..");
}

function runProcess(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
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
    stderr: result.stderr || (result.error ? String(result.error.message || result.error) : ""),
  };
}

function withStepName(step: GlobalRuntimeStep, name: string, detail?: string): GlobalRuntimeStep {
  return { ...step, step: name, detail: detail ?? step.detail };
}

function renderStep(step: GlobalRuntimeStep): string[] {
  const lines = [`[init] ${step.status}: ${step.step}${step.detail ? ` - ${step.detail}` : ""}`];
  if (step.status === "failed" && step.stderr?.trim()) lines.push(step.stderr.trim());
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

function isNpxCacheSource(sourceRoot: string): boolean {
  return /[\\/]_npx[\\/]/.test(sourceRoot);
}

function commandEnv(sourceRoot: string, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined {
  const next = { ...(env ?? {}) };
  if (isNpxCacheSource(sourceRoot) && next.AGENTIC_DEV_LINK_INSTALLED_COPIES === undefined) {
    next.AGENTIC_DEV_LINK_INSTALLED_COPIES = "0";
  }
  return Object.keys(next).length > 0 ? next : env;
}

function packageVersion(sourceRoot: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch (_error) {
    return null;
  }
}

function installCli(sourceRoot: string, cwd: string, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const spec = existsSync(join(sourceRoot, "package.json")) ? sourceRoot : "repo-harness";
  const step = runProcess("npm", ["install", "-g", spec], cwd, env);
  const version = packageVersion(sourceRoot);
  return withStepName(step, "install repo-harness CLI", version ? `version=${version}` : undefined);
}

function syncRuntimeSkill(sourceRoot: string, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const script = join(sourceRoot, "scripts", "sync-codex-installed-copies.sh");
  if (!existsSync(script)) {
    return {
      step: "sync repo-harness skill runtime",
      status: "skipped",
      detail: `script not found: ${script}`,
    };
  }
  return withStepName(
    runProcess("bash", [script], sourceRoot, env),
    "sync repo-harness skill runtime",
  );
}

function installHostAdapters(target: InstallTargetSpec, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const installed = withProcessEnv(env, () => runInstall({ target, location: "global" }));
  return {
    step: "install host adapters",
    status: installed.exitCode === 0 ? "ok" : "failed",
    detail: installed.lines.join("; "),
  };
}

function installWazaSkills(sourceRoot: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const agents = hostAgents(target);
  const step = runProcess(
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
  return withStepName(step, "configure Waza skills", `target=${target}`);
}

function installMermaidSkill(sourceRoot: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const agents = hostAgents(target);
  const step = runProcess(
    "npx",
    [
      "-y",
      "skills",
      "add",
      "BfdCampos/dotfiles",
      "-g",
      "-a",
      ...agents,
      "-s",
      "mermaid",
      "-y",
    ],
    sourceRoot,
    env,
  );
  return withStepName(step, "configure Mermaid skill", `target=${target}`);
}

function configureBrain(root: string | undefined, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  try {
    const selected = root
      ? resolve(expandHomePath(root, env))
      : defaultBrainRootChoice({ env }).root;
    const configured = configureBrainRoot(selected, env);
    return {
      step: "configure brain root",
      status: "ok",
      detail: `${configured.root} (${configured.path})`,
    };
  } catch (error) {
    return {
      step: "configure brain root",
      status: "failed",
      stderr: String((error as Error).message ?? error),
    };
  }
}

function ensureCodegraphCli(cwd: string, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const check = runProcess("codegraph", ["--version"], cwd, env);
  if (check.status === "ok") return withStepName(check, "ensure CodeGraph CLI", "present");
  const install = runProcess("npm", ["install", "-g", CODEGRAPH_PACKAGE], cwd, env);
  if (install.status !== "ok") return withStepName(install, "ensure CodeGraph CLI", CODEGRAPH_PACKAGE);
  const recheck = runProcess("codegraph", ["--version"], cwd, env);
  if (recheck.status === "ok") return withStepName(recheck, "ensure CodeGraph CLI", "installed");
  return {
    ...recheck,
    step: "ensure CodeGraph CLI",
    status: "failed",
    detail: `${CODEGRAPH_PACKAGE} installed, but codegraph is not on PATH`,
  };
}

function configureCodegraphMcp(cwd: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  try {
    const result = configureCodegraph({ repoRoot: cwd, target, location: "global", env });
    return {
      step: "configure CodeGraph MCP",
      status: result.actions.some((entry) => entry.status === "failed") ? "failed" : "ok",
      detail: result.actions.map((entry) => `${entry.action}:${entry.status}`).join(", "),
    };
  } catch (error) {
    return {
      step: "configure CodeGraph MCP",
      status: "failed",
      stderr: String((error as Error).message ?? error),
    };
  }
}

export function runGlobalRuntimeSetup(opts: GlobalRuntimeOptions = {}): GlobalRuntimeResult {
  const sourceRoot = opts.sourceRoot ?? defaultSourceRoot();
  const cwd = opts.cwd ?? process.cwd();
  const target = opts.target ?? "both";
  const env = commandEnv(sourceRoot, opts.env);
  const steps: GlobalRuntimeStep[] = [];

  if (opts.installCli !== false) steps.push(installCli(sourceRoot, cwd, env));
  else steps.push({ step: "install repo-harness CLI", status: "skipped", detail: "disabled" });

  if (opts.syncSkill !== false) steps.push(syncRuntimeSkill(sourceRoot, env));
  else steps.push({ step: "sync repo-harness skill runtime", status: "skipped", detail: "disabled" });

  if (opts.hostAdapters !== false) steps.push(installHostAdapters(target, env));
  else steps.push({ step: "install host adapters", status: "skipped", detail: "disabled" });

  if (opts.externalSkills !== false) {
    steps.push(installWazaSkills(sourceRoot, target, env));
    steps.push(installMermaidSkill(sourceRoot, target, env));
    steps.push(...syncCrossReviewSkills(sourceRoot, target, env));
  } else {
    steps.push({ step: "configure Waza skills", status: "skipped", detail: "disabled" });
    steps.push({ step: "configure Mermaid skill", status: "skipped", detail: "disabled" });
    steps.push({ step: "cross-review skills", status: "skipped", detail: "disabled" });
  }

  steps.push(configureBrain(opts.brainRoot, env));

  if (opts.codegraph !== false) {
    const ensure = ensureCodegraphCli(cwd, env);
    steps.push(ensure);
    if (ensure.status === "ok") steps.push(configureCodegraphMcp(cwd, target, env));
    else steps.push({ step: "configure CodeGraph MCP", status: "skipped", detail: "CodeGraph CLI install failed" });
  } else {
    steps.push({ step: "ensure CodeGraph CLI", status: "skipped", detail: "disabled" });
    steps.push({ step: "configure CodeGraph MCP", status: "skipped", detail: "disabled" });
  }

  const lines = steps.flatMap(renderStep);
  const failed = steps.some((step) => step.status === "failed");
  return {
    exitCode: failed ? 1 : 0,
    steps,
    lines,
    stdout: lines.join("\n"),
    stderr: steps.filter((step) => step.status === "failed").map((step) => step.stderr ?? "").filter(Boolean).join("\n"),
  };
}
