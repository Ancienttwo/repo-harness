import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "fs";
import { homedir } from "os";
import { delimiter, dirname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { configureBrainRoot, defaultBrainRootChoice, expandHomePath } from "./brain-root";
import {
  syncCrossReviewSkills,
  type InitRuntimeDependencies,
} from "./init";
import { runInstall, type InstallTargetSpec } from "./install";
import { compareVersions, readLatestPackageVersion } from "./doctor";
import { configureCodegraph } from "../tools/codegraph";
import { runProcess as runBoundedProcess } from "../../effects/process-runner";
import { readInstalledProfile, type InstallProfile } from "../installer/install-profile";

export interface GlobalRuntimeOptions {
  sourceRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  target?: InstallTargetSpec;
  installCli?: boolean;
  installSpec?: string;
  syncSkill?: boolean;
  hostAdapters?: boolean;
  externalSkills?: boolean;
  codegraph?: boolean;
  brainRoot?: string;
  profile?: InstallProfile;
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
const MIN_BUN_VERSION = "1.1.35";
const CODEGRAPH_PACKAGE = "@colbymchenry/codegraph@latest";
const WAZA_SKILLS = ["think", "hunt", "check", "health"] as const;
const WAZA_SHARED_RULES = ["anti-patterns.md", "chinese.md", "durable-context.md", "english.md"] as const;

function defaultSourceRoot(): string {
  return join(SCRIPT_DIR, "..", "..", "..");
}

function runProcess(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const result = runBoundedProcess(command, args, { cwd, env });

  return {
    step: "",
    status: result.ok ? "ok" : "failed",
    command: [...result.command],
    stdout: result.stdout,
    stderr: result.stderr || result.error,
  };
}

function withStepName(step: GlobalRuntimeStep, name: string, detail?: string): GlobalRuntimeStep {
  return { ...step, step: name, detail: detail ?? step.detail };
}

function resolveBunExecutable(env?: NodeJS.ProcessEnv): string {
  const explicit = env?.REPO_HARNESS_BUN_EXECUTABLE ?? process.env.REPO_HARNESS_BUN_EXECUTABLE;
  if (explicit) return resolve(explicit);
  if (env?.PATH) {
    const extensions = process.platform === "win32"
      ? (env.PATHEXT ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];
    for (const directory of env.PATH.split(delimiter)) {
      if (!directory) continue;
      for (const extension of extensions) {
        const candidate = join(directory, `bun${extension}`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return process.execPath;
}

function bindBunRuntimeEnv(env: NodeJS.ProcessEnv | undefined, bunExecutable: string): NodeJS.ProcessEnv {
  const activePath = env?.PATH ?? process.env.PATH ?? "";
  return {
    ...(env ?? {}),
    PATH: [dirname(bunExecutable), activePath].filter(Boolean).join(delimiter),
  };
}

function realPathOrResolved(pathValue: string): string {
  try {
    return realpathSync(pathValue);
  } catch (_error) {
    return resolve(pathValue);
  }
}

function pathIsWithin(candidate: string, root: string): boolean {
  const normalize = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  const normalizedCandidate = normalize(realPathOrResolved(candidate));
  const normalizedRoot = normalize(realPathOrResolved(root));
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function isSelfManagedBun(bunExecutable: string, env?: NodeJS.ProcessEnv): boolean {
  const bunInstall = env?.BUN_INSTALL ?? process.env.BUN_INSTALL ?? join(homeDir(env), ".bun");
  return pathIsWithin(bunExecutable, join(bunInstall, "bin"));
}

function packageManagerUpgradeInstruction(bunExecutable: string): string {
  const normalized = realPathOrResolved(bunExecutable).replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/cellar/bun/")) return "run `brew upgrade bun`, then retry";
  if (normalized.includes("/scoop/apps/bun/")) return "run `scoop update bun`, then retry";
  if (normalized.includes("/node_modules/bun/")) return "run `npm install -g bun`, then retry";
  return `upgrade Bun with the package manager that owns ${bunExecutable}, then retry`;
}

function ensureSupportedBunRuntime(
  cwd: string,
  env: NodeJS.ProcessEnv | undefined,
  bunExecutable: string,
): GlobalRuntimeStep {
  const current = runProcess(bunExecutable, ["--version"], cwd, env);
  const currentVersion = current.stdout?.trim().split(/\s+/)[0] ?? "";
  const comparison = compareVersions(currentVersion, MIN_BUN_VERSION);
  if (current.status === "ok" && comparison !== null && comparison >= 0) {
    return {
      ...current,
      step: "ensure Bun runtime",
      status: "skipped",
      detail: `current=${currentVersion}; minimum=${MIN_BUN_VERSION}`,
    };
  }

  if (current.status === "failed" || comparison === null) {
    return {
      ...current,
      step: "ensure Bun runtime",
      status: "failed",
      detail: `unable to verify Bun runtime; minimum=${MIN_BUN_VERSION}; executable=${bunExecutable}`,
    };
  }

  if (!isSelfManagedBun(bunExecutable, env)) {
    const instruction = packageManagerUpgradeInstruction(bunExecutable);
    return {
      ...current,
      step: "ensure Bun runtime",
      status: "failed",
      detail: `upgrade required; current=${currentVersion}; minimum=${MIN_BUN_VERSION}; executable=${bunExecutable}`,
      stderr: appendOutput(current.stderr, `Bun is not owned by the Bun self-installer; ${instruction}.`),
    };
  }

  const upgrade = runProcess(bunExecutable, ["upgrade"], cwd, env);
  if (upgrade.status === "failed") {
    return withStepName(upgrade, "ensure Bun runtime", `upgrade required; current=${currentVersion}; minimum=${MIN_BUN_VERSION}`);
  }

  const readback = runProcess(bunExecutable, ["--version"], cwd, env);
  const upgradedVersion = readback.stdout?.trim().split(/\s+/)[0] ?? "";
  const upgradedComparison = compareVersions(upgradedVersion, MIN_BUN_VERSION);
  if (readback.status === "failed" || upgradedComparison === null || upgradedComparison < 0) {
    return {
      ...readback,
      step: "ensure Bun runtime",
      status: "failed",
      detail: `upgrade did not reach minimum=${MIN_BUN_VERSION}; found=${upgradedVersion || "unknown"}`,
    };
  }

  return {
    ...upgrade,
    step: "ensure Bun runtime",
    status: "ok",
    detail: `upgraded=${upgradedVersion}; minimum=${MIN_BUN_VERSION}`,
    stdout: appendOutput(upgrade.stdout, readback.stdout),
    stderr: appendOutput(upgrade.stderr, readback.stderr),
  };
}

function renderStep(step: GlobalRuntimeStep): string[] {
  const lines = [`[runtime] ${step.status}: ${step.step}${step.detail ? ` - ${step.detail}` : ""}`];
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

function hostIds(target: InstallTargetSpec): Array<"codex" | "claude"> {
  if (target === "codex") return ["codex"];
  if (target === "claude") return ["claude"];
  return ["claude", "codex"];
}

function homeDir(env?: NodeJS.ProcessEnv): string {
  return env?.HOME ?? process.env.HOME ?? homedir();
}

function hostRulesDir(host: "codex" | "claude", env?: NodeJS.ProcessEnv): string {
  return join(homeDir(env), host === "codex" ? ".codex" : ".claude", "rules");
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

function packageName(sourceRoot: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf-8"));
    return typeof pkg.name === "string" ? pkg.name : null;
  } catch (_error) {
    return null;
  }
}

function isBunDependencyLoop(step: GlobalRuntimeStep): boolean {
  return /DependencyLoop|dependency loop/i.test(`${step.stdout ?? ""}\n${step.stderr ?? ""}`);
}

function parsePackedTarballFilename(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    return typeof entry?.filename === "string" ? entry.filename : null;
  } catch (_error) {
    return null;
  }
}

function appendOutput(...values: Array<string | undefined>): string | undefined {
  const output = values.filter((value) => value && value.trim()).join("\n");
  return output || undefined;
}

function bunGlobalPackageRoot(env?: NodeJS.ProcessEnv): string | null {
  const bunInstall = env?.BUN_INSTALL ?? process.env.BUN_INSTALL;
  const home = env?.HOME ?? process.env.HOME ?? process.env.USERPROFILE;
  const bunRoot = bunInstall ? resolve(bunInstall) : home ? join(resolve(home), ".bun") : null;
  return bunRoot ? join(bunRoot, "install", "global", "node_modules", "repo-harness") : null;
}

function isBunGlobalPackageSource(sourceRoot: string, env?: NodeJS.ProcessEnv): boolean {
  const globalPackageRoot = bunGlobalPackageRoot(env);
  if (globalPackageRoot === null) return false;
  if (resolve(sourceRoot) === globalPackageRoot) return true;
  try {
    return realpathSync(join(sourceRoot, "package.json")) === realpathSync(join(globalPackageRoot, "package.json"));
  } catch (_error) {
    return false;
  }
}

// Best-effort: readLatestPackageVersion() already swallows offline/npm-missing/
// timeout failures into `.error`, so any lookup failure just yields no hint —
// this must never turn the "skipped" step into a "failed" one.
function updateAvailableHint(version: string | null, env?: NodeJS.ProcessEnv): string {
  if (!version) return "";
  const activeEnv = env ?? process.env;
  if (activeEnv.REPO_HARNESS_CHECK_UPDATES !== "1") return "";
  const latest = readLatestPackageVersion(env);
  if (!latest.version) return "";
  const comparison = compareVersions(version, latest.version);
  if (comparison === null || comparison >= 0) return "";
  return `; latest=${latest.version} available — run: repo-harness update`;
}

function installCli(
  sourceRoot: string,
  cwd: string,
  bunExecutable: string,
  env?: NodeJS.ProcessEnv,
  installSpec?: string,
): GlobalRuntimeStep {
  const version = packageVersion(sourceRoot);
  const name = packageName(sourceRoot);
  if (installSpec === undefined && isBunGlobalPackageSource(sourceRoot, env)) {
    const base = version
      ? `already installed from Bun global package source; version=${version}`
      : "already installed from Bun global package source";
    return {
      step: "install repo-harness CLI",
      status: "skipped",
      detail: `${base}${updateAvailableHint(version, env)}`,
    };
  }
  const spec = installSpec ?? (existsSync(join(sourceRoot, "package.json")) ? sourceRoot : "repo-harness");
  const step = runProcess(bunExecutable, ["add", "-g", spec], cwd, env);
  if (installSpec === undefined && name === "repo-harness" && step.status === "failed" && isBunDependencyLoop(step)) {
    return installCliFromPackedTarball(sourceRoot, cwd, bunExecutable, env, version, step);
  }
  return withStepName(
    step,
    "install repo-harness CLI",
    installSpec ? `spec=${installSpec}` : version ? `version=${version}` : undefined,
  );
}

function installCliFromPackedTarball(
  sourceRoot: string,
  cwd: string,
  bunExecutable: string,
  env: NodeJS.ProcessEnv | undefined,
  version: string | null,
  dependencyLoopStep: GlobalRuntimeStep,
): GlobalRuntimeStep {
  const packDir = join(homeDir(env), ".repo-harness", "packages");
  const detailPrefix = version ? `version=${version}; ` : "";
  mkdirSync(packDir, { recursive: true });

  const pack = runProcess("npm", ["pack", "--json", "--pack-destination", packDir], sourceRoot, env);
  if (pack.status !== "ok") {
    return withStepName(
      {
        ...pack,
        stderr: appendOutput(dependencyLoopStep.stderr, pack.stderr),
      },
      "install repo-harness CLI",
      `${detailPrefix}dependency-loop repair pack failed`,
    );
  }
  const filename = parsePackedTarballFilename(pack.stdout ?? "");
  if (filename === null) {
    return {
      step: "install repo-harness CLI",
      status: "failed",
      command: pack.command,
      detail: `${detailPrefix}dependency-loop repair pack output invalid`,
      stdout: dependencyLoopStep.stdout,
      stderr: appendOutput(dependencyLoopStep.stderr, pack.stderr, "npm pack --json did not return a tarball filename"),
    };
  }
  const remove = runProcess(bunExecutable, ["remove", "-g", "repo-harness"], cwd, env);
  if (remove.status !== "ok") {
    return withStepName(
      {
        ...remove,
        stdout: appendOutput(dependencyLoopStep.stdout, remove.stdout),
        stderr: appendOutput(dependencyLoopStep.stderr, pack.stderr, remove.stderr),
      },
      "install repo-harness CLI",
      `${detailPrefix}dependency-loop repair remove failed`,
    );
  }
  const add = runProcess(bunExecutable, ["add", "-g", join(packDir, filename)], cwd, env);
  return withStepName(add, "install repo-harness CLI", `${detailPrefix}repaired=packed-tarball`);
}

function syncRuntimeSkill(sourceRoot: string, profile: InstallProfile, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const script = join(sourceRoot, "scripts", "sync-codex-installed-copies.sh");
  if (!existsSync(script)) {
    return {
      step: "sync repo-harness skill runtime",
      status: "skipped",
      detail: `script not found: ${script}`,
    };
  }
  return withStepName(
    runProcess("bash", [script], sourceRoot, { ...env, REPO_HARNESS_INSTALL_PROFILE: profile }),
    "sync repo-harness skill runtime",
  );
}

function installHostAdapters(target: InstallTargetSpec, profile: InstallProfile, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const installed = withProcessEnv(env, () => runInstall({ target, location: "global", profile }));
  return {
    step: "install host adapters",
    status: installed.exitCode === 0 ? "ok" : "failed",
    detail: installed.lines.join("; "),
  };
}

function installAgentFleet(sourceRoot: string, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const script = join(sourceRoot, 'scripts', 'install-agent-fleet.sh');
  if (!existsSync(script)) {
    return { step: 'install agent fleet', status: 'failed', detail: `script not found: ${script}` };
  }
  return withStepName(runProcess('bash', [script], sourceRoot, env), 'install agent fleet');
}

function installWazaSkills(sourceRoot: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const agents = hostAgents(target);
  const skillsRoot = join(homeDir(env), '.agents', 'skills');
  const missing = WAZA_SKILLS.filter((skill) => !existsSync(join(skillsRoot, skill, 'SKILL.md')));
  if (missing.length > 0) {
    const step = runProcess(
      "bunx",
      [
        "skills",
        "add",
        "tw93/Waza",
        "-g",
        "-a",
        ...agents,
        "-s",
        ...missing,
        "-y",
      ],
      sourceRoot,
      env,
    );
    if (step.status === 'failed') {
      return withStepName(step, "configure Waza skills", `target=${target}; missing=${missing.join(',')}`);
    }
  }
  return projectStagedSkills(WAZA_SKILLS, target, env, 'configure Waza skills');
}

function projectStagedSkills(
  skills: readonly string[],
  target: InstallTargetSpec,
  env: NodeJS.ProcessEnv | undefined,
  step: string,
): GlobalRuntimeStep {
  const home = homeDir(env);
  const roots = hostIds(target).map((host) => join(home, host === 'codex' ? '.codex' : '.claude', 'skills'));
  const projected: string[] = [];
  for (const skill of skills) {
    const source = join(home, '.agents', 'skills', skill);
    if (!existsSync(join(source, 'SKILL.md'))) {
      return { step, status: 'failed', detail: `staging skill missing after install: ${source}` };
    }
    for (const root of roots) {
      const destination = join(root, skill);
      mkdirSync(root, { recursive: true });
      if (existsSync(destination)) {
        try {
          if (realpathSync(destination) === realpathSync(source)) {
            projected.push(destination);
            continue;
          }
        } catch { /* the fail-closed error below owns unreadable projections */ }
        return { step, status: 'failed', detail: `refusing to overwrite unowned host skill ${destination}` };
      }
      symlinkSync(source, destination, 'dir');
      projected.push(destination);
    }
  }
  return { step, status: 'ok', detail: `projected ${projected.length} host skills` };
}

function syncWazaSharedRules(target: InstallTargetSpec, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const sourceDir = join(homeDir(env), ".agents", "rules");
  if (!existsSync(sourceDir)) {
    return {
      step: "sync Waza shared rules",
      status: "skipped",
      detail: `staging rules not found: ${sourceDir}`,
    };
  }

  const synced: string[] = [];
  const missing: string[] = [];
  for (const host of hostIds(target)) {
    const destDir = hostRulesDir(host, env);
    mkdirSync(destDir, { recursive: true });
    for (const rule of WAZA_SHARED_RULES) {
      const source = join(sourceDir, rule);
      if (!existsSync(source)) {
        missing.push(rule);
        continue;
      }
      const destination = join(destDir, rule);
      if (existsSync(destination) && readFileSync(destination, 'utf-8') !== readFileSync(source, 'utf-8')) {
        return {
          step: 'sync Waza shared rules',
          status: 'failed',
          detail: `refusing to overwrite unowned rule ${destination}`,
        };
      }
      copyFileSync(source, destination);
      synced.push(`${host}:${rule}`);
    }
  }

  return {
    step: "sync Waza shared rules",
    status: missing.length > 0 ? "failed" : "ok",
    detail: missing.length > 0 ? `missing ${missing.join(", ")}` : `synced ${synced.length} files`,
  };
}

function installMermaidSkill(sourceRoot: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const installed = join(homeDir(env), '.agents', 'skills', 'mermaid', 'SKILL.md');
  if (!existsSync(installed)) {
    const agents = hostAgents(target);
    const step = runProcess(
      "bunx",
      [
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
    if (step.status === 'failed') return withStepName(step, "configure Mermaid skill", `target=${target}`);
  }
  return projectStagedSkills(['mermaid'], target, env, 'configure Mermaid skill');
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

function ensureCodegraphCli(cwd: string, bunExecutable: string, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const check = runProcess("codegraph", ["--version"], cwd, env);
  if (check.status === "ok") return withStepName(check, "ensure CodeGraph CLI", "present");
  const install = runProcess(bunExecutable, ["add", "-g", CODEGRAPH_PACKAGE], cwd, env);
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

export function runGlobalRuntimeSetup(
  opts: GlobalRuntimeOptions = {},
  dependencies?: InitRuntimeDependencies,
): GlobalRuntimeResult {
  const sourceRoot = opts.sourceRoot ?? defaultSourceRoot();
  const cwd = opts.cwd ?? process.cwd();
  const target = opts.target ?? "both";
  const bunExecutable = resolveBunExecutable(opts.env);
  const env = bindBunRuntimeEnv(commandEnv(sourceRoot, opts.env), bunExecutable);
  const profile = opts.profile ?? readInstalledProfile(env)?.profile ?? "minimal";
  const steps: GlobalRuntimeStep[] = [];

  const bunRuntime = ensureSupportedBunRuntime(cwd, env, bunExecutable);
  steps.push(bunRuntime);
  if (bunRuntime.status === "failed") {
    const lines = steps.flatMap(renderStep);
    return {
      exitCode: 1,
      steps,
      lines,
      stdout: lines.join("\n"),
      stderr: bunRuntime.stderr ?? "",
    };
  }

  if (opts.installCli !== false) steps.push(installCli(sourceRoot, cwd, bunExecutable, env, opts.installSpec));
  else steps.push({ step: "install repo-harness CLI", status: "skipped", detail: "disabled" });

  if (opts.syncSkill !== false) steps.push(syncRuntimeSkill(sourceRoot, profile, env));
  else steps.push({ step: "sync repo-harness skill runtime", status: "skipped", detail: "disabled" });

  if (opts.hostAdapters !== false) steps.push(installHostAdapters(target, profile, env));
  else steps.push({ step: "install host adapters", status: "skipped", detail: "disabled" });

  if (profile === 'strict') steps.push(installAgentFleet(sourceRoot, env));
  else steps.push({ step: 'install agent fleet', status: 'skipped', detail: 'disabled by install profile' });

  if (opts.externalSkills === true) {
    const waza = installWazaSkills(sourceRoot, target, env);
    steps.push(waza);
    steps.push(waza.status === "ok"
      ? syncWazaSharedRules(target, env)
      : { step: "sync Waza shared rules", status: "skipped", detail: "Waza install failed" });
    steps.push(installMermaidSkill(sourceRoot, target, env));
  } else {
    steps.push({ step: "configure Waza skills", status: "skipped", detail: "disabled" });
    steps.push({ step: "configure Mermaid skill", status: "skipped", detail: "disabled" });
  }

  if (profile === 'strict') {
    steps.push(...syncCrossReviewSkills(sourceRoot, target, env));
  } else {
    steps.push({ step: "cross-review skills", status: "skipped", detail: "disabled by install profile" });
  }

  if (opts.brainRoot || profile === 'product-planning') steps.push(configureBrain(opts.brainRoot, env));
  else steps.push({ step: "configure brain root", status: "skipped", detail: "disabled by install profile" });

  if (opts.codegraph === true) {
    const ensure = ensureCodegraphCli(cwd, bunExecutable, env);
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
