import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "fs";
import { homedir, tmpdir } from "os";
import { delimiter, dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { ARCHCONTEXT_NODE_RANGE, productVersionManifest } from "archctx-contracts";
import { configureBrainRoot, defaultBrainRootChoice, expandHomePath } from "./brain-root";
import {
  syncCrossReviewSkills,
  type InitRuntimeDependencies,
} from "./init";
import { runInstall, type InstallTargetSpec } from "./install";
import { compareVersions, readLatestPackageVersion } from "./doctor";
import { configureCodegraph } from "../tools/codegraph";
import { runProcess as runBoundedProcess } from "../../effects/process-runner";
import { commitVerifiedSkillTree, skillTreeSha256 } from "../../effects/skill-tree-integrity";
import { PROFILE_COMPONENTS, managedInstallSurfaceIsCurrent, readInstalledProfile, type InstallProfile } from "../installer/install-profile";
import {
  parseSkillSurfaceCatalog,
  requiredExplicitExternalDependencyInstallGroups,
  requiredExplicitExternalSkillInstallGroup,
  type SkillSurfaceCatalog,
} from "../../core/skill-surface/catalog";
import { archctxCapabilities } from "../../effects/architecture/archctx-provider";

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
  obsidianSkills?: boolean;
  reverseSkill?: boolean;
  codegraph?: boolean;
  brainRoot?: string;
  profile?: InstallProfile;
  updateMode?: boolean;
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
const CODEGRAPH_VERSION = productVersionManifest().runtime.codeGraph.requiredVersion;
const CODEGRAPH_PACKAGE = `@colbymchenry/codegraph@${CODEGRAPH_VERSION}`;
const ARCHCTX_PACKAGES = ["archctx", "archctx-contracts"] as const;
const WAZA_SHARED_RULES = ["anti-patterns.md", "chinese.md", "durable-context.md", "english.md"] as const;

/**
 * Reads and parses sourceRoot's skill-surface manifest. Parameterized by
 * sourceRoot (mirrors init.ts's identically-purposed helper; duplicated
 * rather than shared, matching this file's existing pattern of keeping its
 * own small local copies of init.ts-shaped helpers like hostAgents/hostIds/
 * homeDir/withProcessEnv). Does not pass an `exists` callback (pre-catalog
 * behavior here never checked package source paths on disk either).
 */
function loadSkillSurfaceCatalog(sourceRoot: string): SkillSurfaceCatalog {
  const manifestPath = join(sourceRoot, "assets", "skill-commands", "manifest.json");
  const source = existsSync(manifestPath) ? readFileSync(manifestPath, "utf-8") : null;
  const resolution = parseSkillSurfaceCatalog(source, { declared: true, profileComponents: PROFILE_COMPONENTS });
  if (resolution.status !== "valid") {
    const detail = resolution.diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`).join("; ");
    throw new Error(`invalid skill-surface catalog at ${manifestPath}: ${detail}`);
  }
  return resolution.catalog;
}

/** Groups external catalog packages by provider for the managed Waza/Mermaid refresh path. */
function externalSkillGroupsFromCatalog(catalog: SkillSurfaceCatalog): ReadonlyMap<string, readonly string[]> {
  const groups = new Map<string, string[]>();
  for (const pkg of catalog.packages) {
    if (pkg.kind !== "external" || pkg.provider === null) continue;
    const list = groups.get(pkg.provider) ?? [];
    list.push(pkg.name);
    groups.set(pkg.provider, list);
  }
  return groups;
}

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
    ...(env ?? process.env),
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

function finalizeRuntimeResult(steps: GlobalRuntimeStep[]): GlobalRuntimeResult {
  const lines = steps.flatMap(renderStep);
  const failed = steps.filter((step) => step.status === "failed");
  return {
    exitCode: failed.length > 0 ? 1 : 0,
    steps,
    lines,
    stdout: lines.join("\n"),
    stderr: failed.map((step) => step.stderr ?? "").filter(Boolean).join("\n"),
  };
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

function targetFromHostIds(hosts: readonly ("codex" | "claude")[]): InstallTargetSpec {
  return hosts.length === 2 ? "both" : hosts[0]!;
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
  if (!isNpxCacheSource(sourceRoot)) return env;
  if (env?.AGENTIC_DEV_LINK_INSTALLED_COPIES !== undefined) return env;
  return { ...(env ?? process.env), AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" };
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

interface PackageManifest {
  name?: unknown;
  version?: unknown;
  dependencies?: unknown;
  engines?: unknown;
}

interface ManagedRuntimeReadback {
  status: "ready" | "package-mismatch" | "runtime-mismatch";
  detail: string;
}

function readPackageManifest(packageRoot: string): PackageManifest {
  return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf-8")) as PackageManifest;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function findInstalledPackageRoot(consumerRoot: string, packageName: string): string | null {
  let current = resolve(consumerRoot);
  while (true) {
    const candidate = join(current, "node_modules", packageName);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readManagedRuntime(
  globalPackageRoot: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  expectedHarnessVersion: string | null,
): ManagedRuntimeReadback {
  if (!existsSync(join(globalPackageRoot, "package.json"))) {
    return { status: "package-mismatch", detail: `installed repo-harness package is missing: ${globalPackageRoot}` };
  }
  const harness = readPackageManifest(globalPackageRoot);
  if (expectedHarnessVersion !== null && harness.version !== expectedHarnessVersion) {
    return { status: "package-mismatch", detail: `repo-harness version mismatch: expected ${expectedHarnessVersion}, got ${String(harness.version)}` };
  }
  const dependencies = recordValue(harness.dependencies);
  const versions: string[] = [`repo-harness@${String(harness.version)}`];
  for (const packageName of ARCHCTX_PACKAGES) {
    const expected = dependencies[packageName];
    if (typeof expected !== "string") {
      return { status: "package-mismatch", detail: `installed repo-harness does not declare mandatory dependency ${packageName}` };
    }
    const packageRoot = findInstalledPackageRoot(globalPackageRoot, packageName);
    if (packageRoot === null) {
      return { status: "package-mismatch", detail: `mandatory dependency is missing: ${packageName}@${expected}` };
    }
    const actual = readPackageManifest(packageRoot).version;
    if (actual !== expected) {
      return { status: "package-mismatch", detail: `mandatory dependency mismatch: expected ${packageName}@${expected}, got ${String(actual)}` };
    }
    versions.push(`${packageName}@${actual}`);
  }

  const archctxRoot = findInstalledPackageRoot(globalPackageRoot, "archctx")!;
  const archctx = readPackageManifest(archctxRoot);
  const nodeRange = recordValue(archctx.engines).node;
  if (nodeRange !== ARCHCONTEXT_NODE_RANGE) {
    return { status: "package-mismatch", detail: `archctx Node runtime contract mismatch: expected ${ARCHCONTEXT_NODE_RANGE}, got ${String(nodeRange)}` };
  }
  const codegraphVersion = recordValue(archctx.dependencies)["@colbymchenry/codegraph"];
  if (typeof codegraphVersion !== "string") {
    return { status: "package-mismatch", detail: "archctx does not declare mandatory package-local CodeGraph" };
  }
  const codegraphRoot = findInstalledPackageRoot(archctxRoot, "@colbymchenry/codegraph");
  const actualCodegraph = codegraphRoot === null ? null : readPackageManifest(codegraphRoot).version;
  if (actualCodegraph !== codegraphVersion) {
    return { status: "package-mismatch", detail: `archctx package-local CodeGraph mismatch: expected ${codegraphVersion}, got ${String(actualCodegraph)}` };
  }

  try {
    archctxCapabilities(cwd, {
      consumerRoot: globalPackageRoot,
      env,
      policy: {
        provider: "archctx",
        applyMode: "manual",
        failureGate: "advisory",
        requiredVersion: String(dependencies.archctx),
        timeoutMs: 10_000,
      },
    });
  } catch (error) {
    return { status: "runtime-mismatch", detail: error instanceof Error ? error.message : String(error) };
  }
  versions.push(`@colbymchenry/codegraph@${actualCodegraph}`, `node=${ARCHCONTEXT_NODE_RANGE}`);
  return { status: "ready", detail: versions.join("; ") };
}

function safeReadManagedRuntime(
  globalPackageRoot: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  expectedHarnessVersion: string | null,
): ManagedRuntimeReadback {
  try {
    return readManagedRuntime(globalPackageRoot, cwd, env, expectedHarnessVersion);
  } catch (error) {
    return { status: "package-mismatch", detail: `managed dependency readback failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function reconcileManagedRuntime(
  cwd: string,
  bunExecutable: string,
  env: NodeJS.ProcessEnv,
  installSpec: string,
): GlobalRuntimeStep {
  const globalPackageRoot = bunGlobalPackageRoot(env);
  if (globalPackageRoot === null) {
    return { step: "verify managed runtime dependencies", status: "failed", detail: "unable to resolve Bun global package root" };
  }
  const requested = installSpec.startsWith("repo-harness@") ? installSpec.slice("repo-harness@".length) : null;
  const expectedHarnessVersion = requested && requested !== "latest" && requested !== "next" ? requested : null;
  const initial = safeReadManagedRuntime(globalPackageRoot, cwd, env, expectedHarnessVersion);
  if (initial.status === "ready") {
    return { step: "verify managed runtime dependencies", status: "ok", detail: initial.detail };
  }
  if (initial.status === "runtime-mismatch") {
    return { step: "verify managed runtime dependencies", status: "failed", detail: initial.detail };
  }
  return {
    step: "verify managed runtime dependencies",
    status: "failed",
    detail: `managed runtime mismatch: ${initial.detail}`,
    stderr: `Automatic remove/reinstall is disabled because a failed reinstall could remove the working CLI. Run \`${bunExecutable} remove -g repo-harness\`, then \`${bunExecutable} add -g ${installSpec}\`, and rerun repo-harness update.`,
  };
}

export function verifyInstalledManagedRuntime(
  opts: Pick<GlobalRuntimeOptions, 'sourceRoot' | 'cwd' | 'env'> = {},
): GlobalRuntimeStep {
  const sourceRoot = opts.sourceRoot ?? defaultSourceRoot();
  const version = packageVersion(sourceRoot);
  if (!version) {
    return { step: 'verify managed runtime dependencies', status: 'failed', detail: `package version is unavailable from ${sourceRoot}` };
  }
  const cwd = opts.cwd ?? process.cwd();
  const bunExecutable = resolveBunExecutable(opts.env);
  const env = bindBunRuntimeEnv(commandEnv(sourceRoot, opts.env), bunExecutable);
  return reconcileManagedRuntime(cwd, bunExecutable, env, `repo-harness@${version}`);
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

function externalSkillStepName(provider: string): string {
  if (provider === "tw93/Waza") return "configure Waza skills";
  if (provider === "BfdCampos/dotfiles") return "configure Mermaid skill";
  if (provider.startsWith("zhaoxuya520/reverse-skill@")) return "configure Reverse Skill";
  if (provider.startsWith("kepano/obsidian-skills@")) return "configure Obsidian companion Skills";
  return `configure external skills ${provider}`;
}

function installExternalSkillGroup(
  sourceRoot: string,
  target: InstallTargetSpec,
  provider: string,
  skills: readonly string[],
  integrityBySkill: Readonly<Record<string, string | null>>,
  env?: NodeJS.ProcessEnv,
  refresh = false,
): GlobalRuntimeStep {
  const stepName = externalSkillStepName(provider);
  const home = homeDir(env);
  const skillsRoot = join(home, '.agents', 'skills');
  const canonicalSkillsRoot = join(realpathSync(home), '.agents', 'skills');
  const committedIntegritySkills = new Set<string>();
  const replacementBackupRoot = mkdtempSync(join(tmpdir(), "repo-harness-skill-replace-"));
  const replacedIntegritySkills = new Set<string>();
  const restoreReplacedSkills = (): void => {
    for (const skill of replacedIntegritySkills) {
      const installed = join(skillsRoot, skill);
      rmSync(installed, { recursive: true, force: true });
      cpSync(join(replacementBackupRoot, skill), installed, {
        recursive: true,
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
      });
    }
  };
  const fail = (result: GlobalRuntimeStep): GlobalRuntimeStep => {
    for (const skill of committedIntegritySkills) {
      rmSync(join(skillsRoot, skill), { recursive: true, force: true });
    }
    restoreReplacedSkills();
    rmSync(replacementBackupRoot, { recursive: true, force: true });
    return result;
  };
  const preflight = preflightStagedSkillProjection(skills, target, env, stepName);
  if (preflight) return fail(preflight);
  const missing = skills.filter((skill) => !existsSync(join(skillsRoot, skill, 'SKILL.md')));
  const selected = refresh ? skills : missing;
  const ordinaryMissing = selected.filter((skill) => integrityBySkill[skill] == null);
  if (ordinaryMissing.length > 0) {
    const agents = hostAgents(target);
    const step = runProcess(
      "bunx",
      [
        "skills",
        "add",
        provider,
        "-g",
        "-a",
        ...agents,
        "-s",
        ...ordinaryMissing,
        "-y",
      ],
      sourceRoot,
      env,
    );
    if (step.status === 'failed') {
      return fail(withStepName(step, stepName, `target=${target}; missing=${ordinaryMissing.join(',')}`));
    }
  }

  const integrityMissing = selected.filter((skill) => integrityBySkill[skill] != null);
  if (integrityMissing.length > 0) {
    const isolatedHome = mkdtempSync(join(tmpdir(), "repo-harness-skill-stage-"));
    const isolatedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...(env ?? {}),
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      XDG_CONFIG_HOME: join(isolatedHome, ".config"),
      XDG_CACHE_HOME: join(isolatedHome, ".cache"),
      BUN_INSTALL: join(isolatedHome, ".bun"),
      BUN_INSTALL_CACHE_DIR: join(isolatedHome, ".bun", "install", "cache"),
      NPM_CONFIG_CACHE: join(isolatedHome, ".npm"),
      npm_config_cache: join(isolatedHome, ".npm"),
    };
    // Custom host roots would defeat isolation even with HOME redirected.
    for (const key of ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "AGENTS_HOME", "SKILLS_HOME"]) {
      delete isolatedEnv[key];
    }
    try {
      const step = runProcess(
        "bunx",
        [
          "skills",
          "add",
          provider,
          "-g",
          "-a",
          ...hostAgents(target),
          "-s",
          ...integrityMissing,
          "-y",
        ],
        sourceRoot,
        isolatedEnv,
      );
      if (step.status === "failed") {
        return fail(withStepName(step, stepName, `isolated target=${target}; missing=${integrityMissing.join(',')}`));
      }

      for (const skill of integrityMissing) {
        const expected = integrityBySkill[skill]!;
        const isolatedSkill = join(isolatedHome, ".agents", "skills", skill);
        let actual: string;
        try {
          actual = skillTreeSha256(isolatedSkill);
        } catch (error) {
          return fail({
            step: stepName,
            status: "failed",
            detail: `cannot verify isolated staging integrity for ${skill}: ${(error as Error).message}`,
          });
        }
        if (actual !== expected) {
          return fail({
            step: stepName,
            status: "failed",
            detail: `isolated staging integrity mismatch for ${skill}: expected=${expected}; actual=${actual}`,
          });
        }
      }

      for (const skill of integrityMissing) {
        const installed = join(skillsRoot, skill);
        if (existsSync(installed)) {
          const state = readInstalledProfile(env);
          const receipt = state?.ownership_manifest.find((surface) => surface.path === installed);
          if (!state || receipt === undefined || !managedInstallSurfaceIsCurrent(receipt)) {
            return fail({
              step: stepName,
              status: "failed",
              detail: `refusing to refresh unowned or drifted staging skill ${installed}`,
            });
          }
          cpSync(installed, join(replacementBackupRoot, skill), {
            recursive: true,
            force: false,
            errorOnExist: true,
            verbatimSymlinks: true,
          });
          rmSync(installed, { recursive: true, force: true });
          replacedIntegritySkills.add(skill);
        }
        const committed = commitVerifiedSkillTree(
          join(isolatedHome, ".agents", "skills", skill),
          join(skillsRoot, skill),
          integrityBySkill[skill]!,
          { expectedCanonicalParent: canonicalSkillsRoot },
        );
        if (committed.status === "failed") {
          return fail({ step: stepName, status: "failed", detail: committed.detail });
        }
        committedIntegritySkills.add(skill);
      }
    } finally {
      rmSync(isolatedHome, { recursive: true, force: true });
    }
  }
  for (const skill of skills) {
    const expected = integrityBySkill[skill];
    if (expected === null || expected === undefined) continue;
    const installed = join(skillsRoot, skill);
    try {
      const stat = lstatSync(installed);
      const canonicalRoot = realpathSync(skillsRoot);
      if (
        canonicalRoot !== canonicalSkillsRoot
        || !stat.isDirectory()
        || stat.isSymbolicLink()
        || realpathSync(installed) !== join(canonicalRoot, skill)
      ) {
        return fail({
          step: stepName,
          status: "failed",
          detail: `refusing non-canonical integrity staging root for ${skill}: ${installed}`,
        });
      }
      const actual = skillTreeSha256(installed);
      if (actual !== expected) {
        return fail({
          step: stepName,
          status: "failed",
          detail: `staging integrity mismatch for ${skill}: expected=${expected}; actual=${actual}`,
        });
      }
    } catch (error) {
      return fail({
        step: stepName,
        status: "failed",
        detail: `cannot verify staging integrity for ${skill}: ${(error as Error).message}`,
      });
    }
  }
  const projection = projectStagedSkills(skills, target, env, stepName);
  if (projection.status === "failed") return fail(projection);
  rmSync(replacementBackupRoot, { recursive: true, force: true });
  return projection;
}

function installWazaSkills(sourceRoot: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv, refresh = false): GlobalRuntimeStep {
  const agents = hostAgents(target);
  const wazaSkills = externalSkillGroupsFromCatalog(loadSkillSurfaceCatalog(sourceRoot)).get("tw93/Waza") ?? [];
  const skillsRoot = join(homeDir(env), '.agents', 'skills');
  const selected = refresh ? wazaSkills : wazaSkills.filter((skill) => !existsSync(join(skillsRoot, skill, 'SKILL.md')));
  const preflight = preflightStagedSkillProjection(wazaSkills, target, env, 'configure Waza skills');
  if (preflight) return preflight;
  if (selected.length > 0) {
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
        ...selected,
        "-y",
      ],
      sourceRoot,
      env,
    );
    if (step.status === 'failed') {
      return withStepName(step, "configure Waza skills", `target=${target}; selected=${selected.join(',')}`);
    }
  }
  return projectStagedSkills(wazaSkills, target, env, 'configure Waza skills');
}

function preflightStagedSkillProjection(
  skills: readonly string[],
  target: InstallTargetSpec,
  env: NodeJS.ProcessEnv | undefined,
  step: string,
): GlobalRuntimeStep | null {
  const home = homeDir(env);
  const canonicalHome = realpathSync(home);
  const roots = hostIds(target).map((host) => {
    const hostRoot = host === 'codex' ? '.codex' : '.claude';
    return {
      path: join(home, hostRoot, 'skills'),
      expected: join(canonicalHome, hostRoot, 'skills'),
    };
  });
  for (const root of roots) {
    const invalid = invalidProjectionRoot(root.path, root.expected);
    if (invalid) return { step, status: 'failed', detail: invalid };
  }
  for (const skill of skills) {
    const source = join(home, '.agents', 'skills', skill);
    for (const root of roots) {
      const destination = join(root.path, skill);
      if (!pathEntryExists(destination)) continue;
      try {
        if (existsSync(join(source, 'SKILL.md')) && realpathSync(destination) === realpathSync(source)) continue;
      } catch { /* the fail-closed result below owns unreadable projections */ }
      return { step, status: 'failed', detail: `refusing to refresh unowned host skill ${destination}` };
    }
  }
  return null;
}

function projectStagedSkills(
  skills: readonly string[],
  target: InstallTargetSpec,
  env: NodeJS.ProcessEnv | undefined,
  step: string,
): GlobalRuntimeStep {
  const home = homeDir(env);
  const canonicalHome = realpathSync(home);
  const roots = hostIds(target).map((host) => {
    const hostRoot = host === 'codex' ? '.codex' : '.claude';
    return {
      path: join(home, hostRoot, 'skills'),
      expected: join(canonicalHome, hostRoot, 'skills'),
    };
  });
  const projected: string[] = [];
  const created: string[] = [];
  const fail = (detail: string): GlobalRuntimeStep => {
    for (const destination of created.reverse()) rmSync(destination, { recursive: true, force: true });
    return { step, status: 'failed', detail };
  };
  for (const skill of skills) {
    const source = join(home, '.agents', 'skills', skill);
    if (!existsSync(join(source, 'SKILL.md'))) {
      return fail(`staging skill missing after install: ${source}`);
    }
    for (const root of roots) {
      const destination = join(root.path, skill);
      try {
        const invalidBefore = invalidProjectionRoot(root.path, root.expected);
        if (invalidBefore) return fail(invalidBefore);
        mkdirSync(root.path, { recursive: true });
        const invalidAfter = invalidProjectionRoot(root.path, root.expected);
        if (invalidAfter) return fail(invalidAfter);
        if (pathEntryExists(destination)) {
          if (realpathSync(destination) === realpathSync(source)) {
            projected.push(destination);
            continue;
          }
          return fail(`refusing to overwrite unowned host skill ${destination}`);
        }
        symlinkSync(source, destination, 'dir');
      } catch (error) {
        return fail(`cannot project staged skill ${destination}: ${(error as Error).message}`);
      }
      created.push(destination);
      projected.push(destination);
    }
  }
  return { step, status: 'ok', detail: `projected ${projected.length} host skills` };
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function prospectiveCanonicalPath(path: string): string {
  let ancestor = path;
  while (!pathEntryExists(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error(`cannot resolve an existing ancestor for ${path}`);
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), relative(ancestor, path));
}

function invalidProjectionRoot(root: string, expected: string): string | null {
  let actual: string;
  try {
    actual = prospectiveCanonicalPath(root);
  } catch (error) {
    return `cannot resolve host skill root ${root}: ${(error as Error).message}`;
  }
  if (actual !== expected) {
    return `refusing non-canonical host skill root: expected=${expected}; actual=${actual}`;
  }
  if (!pathEntryExists(root)) return null;
  const stat = lstatSync(root);
  return stat.isDirectory() && !stat.isSymbolicLink()
    ? null
    : `refusing non-directory host skill root ${root}`;
}

function captureWazaSharedRules(env?: NodeJS.ProcessEnv): ReadonlyMap<string, string> {
  const sourceDir = join(homeDir(env), ".agents", "rules");
  const captured = new Map<string, string>();
  for (const rule of WAZA_SHARED_RULES) {
    const source = join(sourceDir, rule);
    if (existsSync(source)) captured.set(rule, readFileSync(source, "utf-8"));
  }
  return captured;
}

function syncWazaSharedRules(
  target: InstallTargetSpec,
  env?: NodeJS.ProcessEnv,
  previousRules: ReadonlyMap<string, string> = new Map(),
): GlobalRuntimeStep {
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
    for (const rule of WAZA_SHARED_RULES) {
      const source = join(sourceDir, rule);
      if (!existsSync(source)) {
        missing.push(rule);
        continue;
      }
      const destination = join(destDir, rule);
      if (!existsSync(destination)) continue;
      const destinationValue = readFileSync(destination, "utf-8");
      const sourceValue = readFileSync(source, "utf-8");
      const previousValue = previousRules.get(rule);
      if (destinationValue !== sourceValue && destinationValue !== previousValue) {
        return {
          step: 'sync Waza shared rules',
          status: 'failed',
          detail: `refusing to overwrite unowned rule ${destination}`,
        };
      }
    }
  }
  if (missing.length > 0) {
    return { step: "sync Waza shared rules", status: "failed", detail: `missing ${[...new Set(missing)].join(", ")}` };
  }

  for (const host of hostIds(target)) {
    const destDir = hostRulesDir(host, env);
    mkdirSync(destDir, { recursive: true });
    for (const rule of WAZA_SHARED_RULES) {
      const source = join(sourceDir, rule);
      if (!existsSync(source)) continue;
      const destination = join(destDir, rule);
      copyFileSync(source, destination);
      synced.push(`${host}:${rule}`);
    }
  }

  return {
    step: "sync Waza shared rules",
    status: "ok",
    detail: `synced ${synced.length} files`,
  };
}

function installMermaidSkill(sourceRoot: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv, refresh = false): GlobalRuntimeStep {
  const mermaidSkills = externalSkillGroupsFromCatalog(loadSkillSurfaceCatalog(sourceRoot)).get("BfdCampos/dotfiles") ?? [];
  const installed = join(homeDir(env), '.agents', 'skills', 'mermaid', 'SKILL.md');
  const preflight = preflightStagedSkillProjection(mermaidSkills, target, env, 'configure Mermaid skill');
  if (preflight) return preflight;
  if (refresh || !existsSync(installed)) {
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
        ...mermaidSkills,
        "-y",
      ],
      sourceRoot,
      env,
    );
    if (step.status === 'failed') return withStepName(step, "configure Mermaid skill", `target=${target}`);
  }
  return projectStagedSkills(mermaidSkills, target, env, 'configure Mermaid skill');
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

function ensureCodegraphCli(cwd: string, bunExecutable: string, env?: NodeJS.ProcessEnv, refresh = false): GlobalRuntimeStep {
  const check = runProcess("codegraph", ["--version"], cwd, env);
  if (!refresh && check.status === "ok") return withStepName(check, "ensure CodeGraph CLI", "present");
  const install = runProcess(bunExecutable, ["add", "-g", CODEGRAPH_PACKAGE], cwd, env);
  if (install.status !== "ok") return withStepName(install, "ensure CodeGraph CLI", CODEGRAPH_PACKAGE);
  const recheck = runProcess("codegraph", ["--version"], cwd, env);
  if (recheck.status === "ok") {
    if (refresh) {
      let installedVersion: unknown = null;
      try {
        const globalPackageRoot = bunGlobalPackageRoot(env);
        const codegraphRoot = globalPackageRoot === null
          ? null
          : findInstalledPackageRoot(globalPackageRoot, "@colbymchenry/codegraph");
        installedVersion = codegraphRoot === null ? null : readPackageManifest(codegraphRoot).version;
      } catch (error) {
        return {
          ...recheck,
          step: "ensure CodeGraph CLI",
          status: "failed",
          detail: `CodeGraph package readback failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (installedVersion !== CODEGRAPH_VERSION) {
        return {
          ...recheck,
          step: "ensure CodeGraph CLI",
          status: "failed",
          detail: `CodeGraph readback mismatch: expected ${CODEGRAPH_VERSION}, got ${String(installedVersion)}`,
        };
      }
    }
    return withStepName(recheck, "ensure CodeGraph CLI", refresh ? `updated=${CODEGRAPH_VERSION}` : "installed");
  }
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
  const profile = opts.profile ?? readInstalledProfile(env)?.profile ?? "full";
  const updateMode = opts.updateMode === true;
  const steps: GlobalRuntimeStep[] = [];

  const bunRuntime = ensureSupportedBunRuntime(cwd, env, bunExecutable);
  steps.push(bunRuntime);
  if (bunRuntime.status === "failed") {
    return finalizeRuntimeResult(steps);
  }

  if (opts.installCli !== false) {
    const install = installCli(sourceRoot, cwd, bunExecutable, env, opts.installSpec);
    steps.push(install);
    if (updateMode && install.status === "ok" && opts.installSpec) {
      steps.push(reconcileManagedRuntime(cwd, bunExecutable, env, opts.installSpec));
    }
    if (updateMode && steps.some((step) => step.status === "failed")) return finalizeRuntimeResult(steps);
  }
  else {
    steps.push({ step: "install repo-harness CLI", status: "skipped", detail: "disabled" });
    if (updateMode && opts.installSpec) steps.push(reconcileManagedRuntime(cwd, bunExecutable, env, opts.installSpec));
    if (updateMode && steps.some((step) => step.status === "failed")) return finalizeRuntimeResult(steps);
  }

  if (opts.syncSkill !== false) steps.push(syncRuntimeSkill(sourceRoot, profile, env));
  else steps.push({ step: "sync repo-harness skill runtime", status: "skipped", detail: "disabled" });

  if (opts.hostAdapters !== false) steps.push(installHostAdapters(target, profile, env));
  else steps.push({ step: "install host adapters", status: "skipped", detail: "disabled" });

  if (profile === 'full') steps.push(installAgentFleet(sourceRoot, env));
  else steps.push({ step: 'install agent fleet', status: 'skipped', detail: 'disabled by install profile' });

  const refreshExternalSkills = opts.externalSkills === true;
  if (refreshExternalSkills) {
    const previousWazaRules = captureWazaSharedRules(env);
    const waza = installWazaSkills(sourceRoot, target, env, updateMode);
    steps.push(waza);
    if (waza.status === "failed") return finalizeRuntimeResult(steps);
    steps.push(waza.status === "ok"
      ? syncWazaSharedRules(target, env, previousWazaRules)
      : { step: "sync Waza shared rules", status: "skipped", detail: "Waza install failed" });
    if (steps.at(-1)?.status === "failed") return finalizeRuntimeResult(steps);
    const mermaid = installMermaidSkill(sourceRoot, target, env, updateMode);
    steps.push(mermaid);
    if (mermaid.status === "failed") return finalizeRuntimeResult(steps);
  } else {
    steps.push({ step: "configure Waza skills", status: "skipped", detail: "disabled" });
    steps.push({ step: "configure Mermaid skill", status: "skipped", detail: "disabled" });
  }

  if (opts.reverseSkill === true) {
    const catalog = loadSkillSurfaceCatalog(sourceRoot);
    const selection = requiredExplicitExternalSkillInstallGroup(
      catalog,
      "reverse-skill-router",
      hostIds(target),
    );
    if (selection.status !== "selected") {
      steps.push({
        step: "configure Reverse Skill",
        status: "failed",
        detail: selection.status === "missing"
          ? "required explicit catalog package reverse-skill-router is missing for the selected host target"
          : selection.status === "not_explicit_only"
            ? "catalog package reverse-skill-router must remain explicit-only"
            : "catalog package reverse-skill-router requires a pinned tree integrity digest",
      });
    } else {
      const { provider, hosts, skills, integrityBySkill } = selection.group;
      steps.push(installExternalSkillGroup(
        sourceRoot,
        targetFromHostIds(hosts),
        provider,
        skills,
        integrityBySkill,
        env,
      ));
    }
  } else {
    steps.push({
      step: "configure Reverse Skill",
      status: "skipped",
      detail: "requires explicit --with-reverse-skill opt-in",
    });
  }

  if (opts.obsidianSkills === true) {
    const catalog = loadSkillSurfaceCatalog(sourceRoot);
    const selection = requiredExplicitExternalDependencyInstallGroups(
      catalog,
      "obsidian-memory",
      hostIds(target),
    );
    if (selection.status !== "selected") {
      steps.push({
        step: "configure Obsidian companion Skills",
        status: "failed",
        detail: selection.status === "missing"
          ? `required Obsidian dependency ${selection.name} is missing for the selected host target`
          : selection.status === "not_explicit_only"
            ? `catalog package ${selection.name} must remain explicit-only`
            : `catalog package ${selection.name} requires a pinned tree integrity digest`,
      });
    } else {
      for (const { provider, hosts, skills, integrityBySkill } of selection.groups) {
        steps.push(installExternalSkillGroup(
          sourceRoot,
          targetFromHostIds(hosts),
          provider,
          skills,
          integrityBySkill,
          env,
          updateMode,
        ));
        if (steps.at(-1)?.status === "failed") break;
      }
    }
  } else {
    steps.push({
      step: "configure Obsidian companion Skills",
      status: "skipped",
      detail: "requires explicit --with-obsidian-skills opt-in",
    });
  }

  if (profile === 'full') {
    steps.push(...syncCrossReviewSkills(sourceRoot, target, env));
  } else {
    steps.push({ step: "cross-review skills", status: "skipped", detail: "disabled by install profile" });
  }

  if (opts.brainRoot || profile === 'full') steps.push(configureBrain(opts.brainRoot, env));
  else steps.push({ step: "configure brain root", status: "skipped", detail: "disabled by install profile" });

  const refreshCodegraph = opts.codegraph ?? updateMode;
  if (refreshCodegraph) {
    const ensure = ensureCodegraphCli(cwd, bunExecutable, env, updateMode);
    steps.push(ensure);
    if (ensure.status === "ok") steps.push(configureCodegraphMcp(cwd, target, env));
    else steps.push({ step: "configure CodeGraph MCP", status: "skipped", detail: "CodeGraph CLI install failed" });
  } else {
    steps.push({ step: "ensure CodeGraph CLI", status: "skipped", detail: "disabled" });
    steps.push({ step: "configure CodeGraph MCP", status: "skipped", detail: "disabled" });
  }

  return finalizeRuntimeResult(steps);
}
