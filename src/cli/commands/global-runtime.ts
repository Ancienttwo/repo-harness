import { configureRequiredHerdrSkill } from "./herdr-skill";
import type { RuntimeTransactionContext } from '../../effects/locking/runtime-transaction-lock';
import { bunGlobalPackageRoot, isBunGlobalPackageSource, skillLinkMatches } from "../installer/skill-projection";
import { installPiPackage } from '../installer/pi-package';
import { realPathOrResolved } from '../../effects/path-identity';
import type { SkillHost } from '../../effects/host-skill-roots';
import type { ManagedInstallSurface } from '../installer/install-profile';
import { architecturePort, isArchitectureUnavailable } from '../../core/architecture/contracts';
import { globalConfigurationWriter, mutateGlobalConfiguration } from '../../effects/configuration/global-configuration';
import { DEFAULT_SEATS_CONFIG, ROUTING_CLASSES, SeatsConfigMigrationRequiredError, decodeSeatsConfig } from '../../core/board/seats-settings';
import { checkSeatRoutingModels, seatsRanges } from '../../effects/board/seats-configuration';
import { chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { upsertManagedBlock } from "../../core/adoption/managed-block";
import { assertConfigurationPath } from "../installer/configuration-ownership";
import { runtimeStateIgnoreOperation, userExcludesFilePath } from "../../effects/adoption/gitignore-plan";
import { sha256Hex } from "../../core/evidence/sha256";
import { homedir, tmpdir, userInfo } from "os";
import { delimiter, dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { syncWazaSharedRules, wazaStagingRulesAbsent } from "../installer/waza-rules";
import { applyGlobalContextRefresh, preflightGlobalContextRefresh, type ReportLanguageFlag } from "../installer/global-context";
import { configureBrainRoot, defaultBrainRootChoice, expandHomePath } from "./brain-root";
import { syncCrossReviewSkills } from "./init";
import { runInstall, type InstallTargetSpec } from "./install";
import { compareVersions, readLatestPackageVersion } from "./doctor";
import { DEFAULT_PROCESS_MAX_BUFFER_BYTES, redactProcessOutput, runProcess as runBoundedProcess } from "../../effects/process-runner";
import { gitChildEnv } from "../../effects/git/runner";
import { leftoverCheckWarning } from "./upgrade";
import { commitVerifiedSkillTree, skillTreeSha256 } from "../../effects/skill-tree-integrity";
import {
  managedInstallSurfaceIsCurrent,
  piPackageSurface,
  readInstallState,
  recordVerifiedAgentFleetOwnership,
  requireInstallState,
} from "../installer/install-profile";
import {
  enabledPlugins,
} from "../installer/install-state";
import { installSelectionCommand, OPERATOR_WEB_PACKAGE_NAME, ownerEnabled, type PluginId } from "../../core/skill-surface/plugin-manifest";
import { compareHcVersions, HC_MIN_VERSION, HC_RELEASE_ASSETS, type HcReleaseAsset } from "../../core/terminal/herdr-pin";
import {
  parseSkillSurfaceCatalog,
  requiredExplicitExternalDependencyInstallGroups,
  type SkillSurfaceCatalog,
} from "../../core/skill-surface/catalog";
import { loadMcpLocalConfig } from "../mcp/auth";
import { hostSkillRoot, stagedSkillRoot } from "../../effects/host-skill-roots";
import {
  discoverWindowsProtectedHelperContract,
  resolveProtectedHelperPlatform,
  writeWindowsProtectedHelperContract,
} from "../../effects/runtime/protected-helper-platform";
import {
  CANDIDATE_RECONCILIATION_PROTOCOL,
  candidatePackageIdentity,
  encodeCandidateRequest,
  parseCandidateReceipt,
  type CandidateReconciliationRequest,
} from './candidate-reconciliation';

export interface CandidateHandoffContext {
  /** Created by the parent transaction; never accepted from the public CLI. */
  readonly transactionId: string;
  readonly transactionBackupRoot: string;
  readonly parentToken: string;
}

export interface GlobalRuntimeOptions {
  runtimeLock?: RuntimeTransactionContext;
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
  codegraph?: boolean;
  brainRoot?: string;
  /** The plugin selection to project. Omitted, the recorded selection of the install state. */
  plugins?: readonly PluginId[];
  updateMode?: boolean;
  /** Render inputs for a Global Working Rules block that records none. A recorded header wins. */
  reportLanguage?: ReportLanguageFlag;
  /** Internal-only capability proving that the caller owns the outer transaction. */
  candidateHandoff?: CandidateHandoffContext;
}

export interface GlobalRuntimeStep {
  owned_surface?: ManagedInstallSurface;
  step: string;
  status: "ok" | "skipped" | "failed";
  command?: readonly string[];
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
export const MIN_BUN_VERSION = "1.4.0";
const PACKED_RELEASE_TARBALL = /^repo-harness-\d+\.\d+\.\d+\.tgz$/;
export const CANDIDATE_RECONCILE_STEP = 'reconcile installed candidate runtime';

export function bunVersionIsSupported(version: string | undefined): boolean {
  if (!version) return false;
  const comparison = compareVersions(version, MIN_BUN_VERSION);
  return comparison !== null && comparison >= 0;
}

/**
 * Reads and parses sourceRoot's skill-surface manifest. Parameterized by
 * sourceRoot (mirrors init.ts's identically-purposed helper; duplicated
 * rather than shared, matching this file's existing pattern of keeping its
 * own small local copies of init.ts-shaped helpers like hostIds/
 * homeDir/withProcessEnv). Does not pass an `exists` callback (pre-catalog
 * behavior here never checked package source paths on disk either).
 */
function loadSkillSurfaceCatalog(sourceRoot: string): SkillSurfaceCatalog {
  const manifestPath = join(sourceRoot, "assets", "skill-commands", "manifest.json");
  const source = existsSync(manifestPath) ? readFileSync(manifestPath, "utf-8") : null;
  const resolution = parseSkillSurfaceCatalog(source, { declared: true });
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

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
  inheritEnv = true,
): GlobalRuntimeStep {
  const result = runBoundedProcess(command, args, { cwd, env, inheritEnv });

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

/** The first `name` executable on `env.PATH`, or null. */
function findOnPath(name: string, env: NodeJS.ProcessEnv): string | null {
  if (!env.PATH) return null;
  const extensions = process.platform === "win32"
    ? (env.PATHEXT ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];
  for (const directory of env.PATH.split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveBunExecutable(env?: NodeJS.ProcessEnv): string {
  const explicit = env?.REPO_HARNESS_BUN_EXECUTABLE ?? process.env.REPO_HARNESS_BUN_EXECUTABLE;
  if (explicit) return resolve(explicit);
  return (env && findOnPath("bun", env)) ?? process.execPath;
}

function bindBunRuntimeEnv(env: NodeJS.ProcessEnv | undefined, bunExecutable: string): NodeJS.ProcessEnv {
  const activePath = env?.PATH ?? process.env.PATH ?? "";
  return {
    ...(env ?? process.env),
    PATH: [dirname(bunExecutable), activePath].filter(Boolean).join(delimiter),
  };
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
  if (current.status === "ok" && bunVersionIsSupported(currentVersion)) {
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

/**
 * The Skills CLI agent for every `skills add`. `codex` is a universal agent:
 * its global skills root is `stagedSkillRoot()`, so the provider writes the
 * staging copy in copy and symlink mode alike. `claude-code` alone selects
 * copy mode into `~/.claude/skills` and writes no staging copy.
 * `projectStagedSkills` links the host roots from staging.
 */
const STAGING_PROVIDER_AGENT = "codex";

function hostIds(target: InstallTargetSpec): Array<"codex" | "claude"> {
  if (target === "codex") return ["codex"];
  if (target === "claude") return ["claude"];
  return ["claude", "codex"];
}

function targetFromHostIds(hosts: readonly SkillHost[]): InstallTargetSpec {
  const first = hosts[0];
  if (first !== 'codex' && first !== 'claude') throw new Error('No install host selected');
  return hosts.includes('codex') && hosts.includes('claude') ? "both" : first;
}

function homeDir(env?: NodeJS.ProcessEnv): string {
  return env?.HOME ?? process.env.HOME ?? homedir();
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

export interface PackageManifest {
  name?: unknown;
  version?: unknown;
  dependencies?: unknown;
  engines?: unknown;
  bin?: unknown;
}

interface ManagedRuntimeReadback {
  status: "ready" | "package-mismatch" | "runtime-mismatch";
  detail: string;
}

export function readPackageManifest(packageRoot: string): PackageManifest {
  return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf-8")) as PackageManifest;
}

export function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function findInstalledPackageRoot(consumerRoot: string, packageName: string): string | null {
  let current = resolve(consumerRoot);
  while (true) {
    const candidate = join(current, "node_modules", packageName);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** The archctx part runs only when the architecture plugin runs in this setup. */
function readManagedRuntime(
  globalPackageRoot: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  expectedHarnessVersion: string | null,
  plugins: readonly PluginId[],
): ManagedRuntimeReadback {
  if (!existsSync(join(globalPackageRoot, "package.json"))) {
    return { status: "package-mismatch", detail: `installed repo-harness package is missing: ${globalPackageRoot}` };
  }
  const harness = readPackageManifest(globalPackageRoot);
  if (expectedHarnessVersion !== null && harness.version !== expectedHarnessVersion) {
    return { status: "package-mismatch", detail: `repo-harness version mismatch: expected ${expectedHarnessVersion}, got ${String(harness.version)}` };
  }
  const versions = [`repo-harness@${String(harness.version)}`];
  if (!plugins.includes('architecture')) return { status: "ready", detail: versions.join("; ") };
  const setup = architecturePort('setup');
  if (isArchitectureUnavailable(setup)) return { status: "runtime-mismatch", detail: setup.message };
  const archctx = setup.readManagedPackages(globalPackageRoot, cwd, env);
  if (archctx.status !== "ready") return archctx;
  return { status: "ready", detail: [...versions, ...archctx.versions].join("; ") };
}

function safeReadManagedRuntime(
  globalPackageRoot: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  expectedHarnessVersion: string | null,
  plugins: readonly PluginId[],
): ManagedRuntimeReadback {
  try {
    return readManagedRuntime(globalPackageRoot, cwd, env, expectedHarnessVersion, plugins);
  } catch (error) {
    return { status: "package-mismatch", detail: `managed dependency readback failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function reconcileManagedRuntime(
  cwd: string,
  bunExecutable: string,
  env: NodeJS.ProcessEnv,
  installSpec: string,
  plugins: readonly PluginId[],
  linkArchctx = false,
): GlobalRuntimeStep {
  const globalPackageRoot = bunGlobalPackageRoot(env);
  if (globalPackageRoot === null) {
    return { step: "verify managed runtime dependencies", status: "failed", detail: "unable to resolve Bun global package root" };
  }
  const requested = installSpec.startsWith("repo-harness@") ? installSpec.slice("repo-harness@".length) : null;
  const expectedHarnessVersion = requested && requested !== "latest" && requested !== "next" ? requested : null;
  const initial = safeReadManagedRuntime(globalPackageRoot, cwd, env, expectedHarnessVersion, plugins);
  if (initial.status === "ready") {
    if (linkArchctx && plugins.includes('architecture')) {
      const bunRoot = env.BUN_INSTALL ?? join(homeDir(env), '.bun');
      const link = join(bunRoot, 'bin', 'archctx');
      try {
        const root = findInstalledPackageRoot(globalPackageRoot, 'archctx');
        if (!root) throw new Error('managed archctx package is missing');
        const bin = recordValue(readPackageManifest(root).bin).archctx;
        if (typeof bin !== 'string') throw new Error('archctx does not declare bin.archctx');
        const target = realpathSync(join(root, bin));
        const version = recordValue(readPackageManifest(globalPackageRoot).dependencies).archctx;
        if (typeof version !== 'string') throw new Error('repo-harness does not pin archctx');
        const globalManifest = readPackageManifest(join(bunRoot, 'install', 'global'));
        const existing = lstatSync(link, { throwIfNoEntry: false });
        if (existing) {
          let linkTarget: string | null = null;
          try { linkTarget = realpathSync(link); } catch { /* A dangling link is also a conflict. */ }
          if (linkTarget !== target) return { step: 'verify managed runtime dependencies', status: 'failed', detail: `RH_ARCHCTX_BIN_CONFLICT: ${link} is not the managed archctx link. Move or remove it, then rerun repo-harness update.` };
          if (recordValue(globalManifest.dependencies).archctx === version) return { step: 'verify managed runtime dependencies', status: 'ok', detail: initial.detail };
        }
        const install = runProcess(bunExecutable, ['add', '-g', `archctx@${version}`], cwd, env);
        if (install.status !== 'ok') return withStepName(install, 'verify managed runtime dependencies', `archctx@${version}`);
        try {
          const installedRoot = findInstalledPackageRoot(globalPackageRoot, 'archctx');
          if (!installedRoot || readPackageManifest(installedRoot).version !== version || realpathSync(link) !== target) throw new Error('installed version or link target does not match');
        } catch (error) {
          return { step: 'verify managed runtime dependencies', status: 'failed', detail: `RH_ARCHCTX_BIN_READBACK: ${link}: ${error instanceof Error ? error.message : String(error)}` };
        }
        return { step: 'verify managed runtime dependencies', status: 'ok', detail: `${initial.detail}; archctx@${version}` };
      } catch (error) {
        return { step: 'verify managed runtime dependencies', status: 'failed', detail: `RH_ARCHCTX_BIN_INVALID: ${link}: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
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

function inspectManagedDaemonRuntime(cwd: string, env: NodeJS.ProcessEnv, plugins: readonly PluginId[]): GlobalRuntimeStep {
  const step = 'check shared ArchContext daemon';
  if (!plugins.includes('architecture')) return { step, status: 'skipped', detail: 'architecture plugin not selected' };
  const setup = architecturePort('setup');
  if (isArchitectureUnavailable(setup)) return { step, status: 'failed', detail: setup.message };
  try {
    setup.verifyDaemon(cwd, env);
    return { step, status: 'ok', detail: 'daemon is compatible or cleanly stopped' };
  } catch (error) {
    return { step, status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}

/** The global architecture projection section follows the architecture plugin; without it the section stays as it is. */
function configureArchitectureProjection(env: NodeJS.ProcessEnv, plugins: readonly PluginId[], runtimeLock: RuntimeTransactionContext | undefined): GlobalRuntimeStep {
  const step = 'global architecture projection';
  if (!plugins.includes('architecture')) return { step, status: 'skipped', detail: 'architecture plugin not selected' };
  const setup = architecturePort('setup');
  if (isArchitectureUnavailable(setup)) return { step, status: 'failed', detail: setup.message };
  return setup.ensureGlobalConfiguration(env, globalConfigurationWriter(env, runtimeLock));
}

export function verifyInstalledManagedRuntime(
  opts: Pick<GlobalRuntimeOptions, 'sourceRoot' | 'cwd' | 'env'> & { readonly plugins: readonly PluginId[] },
): GlobalRuntimeStep {
  const sourceRoot = opts.sourceRoot ?? defaultSourceRoot();
  const version = packageVersion(sourceRoot);
  if (!version) {
    return { step: 'verify managed runtime dependencies', status: 'failed', detail: `package version is unavailable from ${sourceRoot}` };
  }
  const cwd = opts.cwd ?? process.cwd();
  const bunExecutable = resolveBunExecutable(opts.env);
  const env = bindBunRuntimeEnv(commandEnv(sourceRoot, opts.env), bunExecutable);
  const packages = reconcileManagedRuntime(cwd, bunExecutable, env, `repo-harness@${version}`, opts.plugins);
  if (packages.status !== 'ok') return packages;
  const daemon = inspectManagedDaemonRuntime(cwd, env, opts.plugins);
  return daemon.status === 'failed' ? { ...packages, status: 'failed', detail: daemon.detail } : packages;
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

function isCheckoutSource(sourceRoot: string): boolean {
  return existsSync(join(sourceRoot, 'packages', 'operator-web', 'package.json'));
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
  if (installSpec === "repo-harness@latest" || installSpec === "repo-harness@next") {
    return installCliFromRegistry(cwd, bunExecutable, env, installSpec);
  }
  if (installSpec === undefined && !isCheckoutSource(sourceRoot)) {
    if (!version) return { step: 'install repo-harness CLI', status: 'failed', detail: `package version is unavailable from ${sourceRoot}` };
    const spec = `repo-harness@${version}`;
    const install = runProcess(bunExecutable, ['add', '-g', spec, '--no-cache'], cwd, env);
    if (install.status !== 'ok') return withStepName(install, 'install repo-harness CLI', `spec=${spec}`);
    const root = bunGlobalPackageRoot(env);
    const actual = root === null ? null : packageVersion(root);
    if (actual !== version) return withStepName({ ...install, status: 'failed' }, 'install repo-harness CLI', `installed CLI version mismatch: expected=${version}; actual=${actual ?? 'unavailable'}`);
    return withStepName(install, 'install repo-harness CLI', `spec=${spec}`);
  }
  const spec = installSpec ?? (existsSync(join(sourceRoot, "package.json")) ? sourceRoot : "repo-harness");
  const step = runProcess(bunExecutable, ["add", "-g", spec, ...(installSpec?.startsWith("repo-harness@") ? ["--no-cache"] : [])], cwd, env);
  if (installSpec === undefined && name === "repo-harness" && step.status === "failed" && isBunDependencyLoop(step)) {
    return installCliFromPackedTarball(sourceRoot, cwd, bunExecutable, env, version, step);
  }
  return withStepName(
    step,
    "install repo-harness CLI",
    installSpec ? `spec=${installSpec}` : version ? `version=${version}` : undefined,
  );
}

function installCliFromRegistry(
  cwd: string,
  bunExecutable: string,
  env: NodeJS.ProcessEnv | undefined,
  installSpec: string,
): GlobalRuntimeStep {
  const name = "install repo-harness CLI";
  const globalRoot = bunGlobalPackageRoot(env);
  if (globalRoot === null) return { step: name, status: "failed", detail: "unable to resolve Bun global package root" };
  // `bun pm view` exits non-zero in a directory without package.json, so the
  // lookup runs in the global package root that the install and readback use.
  const lookup = runProcess(bunExecutable, ["pm", "view", installSpec, "version", "--json", "--no-cache"], globalRoot, env);
  if (lookup.status !== "ok") return withStepName(lookup, name, `unable to resolve ${installSpec} from registry`);
  let expected: unknown;
  try {
    expected = JSON.parse(lookup.stdout ?? "");
  } catch {
    return withStepName({ ...lookup, status: "failed" }, name, `invalid registry version for ${installSpec}: expected a JSON version string`);
  }
  // Reject tags, ranges and paths before they can become an install argument.
  if (typeof expected !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(expected)) {
    return withStepName({ ...lookup, status: "failed" }, name, `invalid registry version for ${installSpec}: expected an exact version`);
  }
  const previous = packageVersion(globalRoot);
  const spec = `repo-harness@${expected}`;
  const install = runProcess(bunExecutable, ["add", "-g", spec, "--no-cache"], cwd, env);
  if (install.status !== "ok") return withStepName(install, name, `spec=${spec}`);

  const readback = runProcess(bunExecutable, [join(globalRoot, "src", "cli", "index.ts"), "--version"], cwd, env);
  const actual = readback.stdout?.trim();
  const packageReadback = packageVersion(globalRoot);
  if (readback.status !== "ok" || actual !== expected || packageReadback !== expected) {
    return withStepName({
      ...install,
      status: "failed",
      stderr: appendOutput(install.stderr, readback.stderr),
    }, name, `spec=${spec}; installed CLI version mismatch: expected=${expected}; actual=${actual || "unavailable"}; package=${packageReadback ?? "unavailable"}`);
  }
  const result = previous === actual ? `already at ${actual}` : `${previous ?? "unavailable"} -> ${actual}`;
  return withStepName(install, name, `spec=${spec}; ${result}`);
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
  if (add.status === "ok") removeSupersededPackedTarballs(packDir, filename);
  return withStepName(add, "install repo-harness CLI", `${detailPrefix}repaired=packed-tarball`);
}

/**
 * The global install references the tarball it installed, so that one stays.
 * Only release names that `npm pack` writes are removed; a suffixed name such
 * as a 0.10.0 archive has no ownership proof and stays for `upgrade`.
 */
function removeSupersededPackedTarballs(packDir: string, installed: string): void {
  for (const name of readdirSync(packDir)) {
    if (name === installed || !PACKED_RELEASE_TARBALL.test(name)) continue;
    const path = join(packDir, name);
    if (lstatSync(path).isFile()) rmSync(path);
  }
}

function syncRuntimeSkill(sourceRoot: string, plugins: readonly PluginId[], target: InstallTargetSpec, env?: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const script = join(sourceRoot, "scripts", "sync-codex-installed-copies.sh");
  if (!existsSync(script)) {
    return {
      step: "sync repo-harness skill runtime",
      status: "skipped",
      detail: `script not found: ${script}`,
    };
  }
  return withStepName(
    runProcess("bash", [script], sourceRoot, { ...env, REPO_HARNESS_INSTALL_PLUGINS: plugins.join(','), REPO_HARNESS_INCLUDE_PI: target === 'both' && plugins.includes('pi') ? '1' : '0' }),
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

function reconcileWithInstalledCandidate(
  opts: GlobalRuntimeOptions,
  cwd: string,
  bunExecutable: string,
  env: NodeJS.ProcessEnv,
  target: InstallTargetSpec,
): GlobalRuntimeStep {
  const handoff = opts.candidateHandoff;
  if (!handoff) {
    return {
      step: CANDIDATE_RECONCILE_STEP,
      status: 'failed',
      detail: 'candidate reconciliation requires an active parent runtime transaction',
    };
  }
  const candidateRoot = bunGlobalPackageRoot(env);
  if (candidateRoot === null) {
    return { step: CANDIDATE_RECONCILE_STEP, status: 'failed', detail: 'unable to resolve candidate package root' };
  }
  let candidate;
  try {
    candidate = candidatePackageIdentity(candidateRoot);
  } catch (error) {
    return {
      step: CANDIDATE_RECONCILE_STEP,
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const requested = opts.installSpec?.startsWith('repo-harness@') ? opts.installSpec.slice('repo-harness@'.length) : null;
  if (requested && requested !== 'latest' && requested !== 'next' && candidate.version !== requested) {
    return {
      step: CANDIDATE_RECONCILE_STEP,
      status: 'failed',
      detail: `repo-harness version mismatch: expected ${requested}, got ${candidate.version}`,
    };
  }
  const candidateEntrypoint = join(candidate.root, 'src', 'cli', 'index.ts');
  if (!existsSync(candidateEntrypoint)) {
    return {
      step: CANDIDATE_RECONCILE_STEP,
      status: 'failed',
      detail: `candidate entrypoint is missing: ${candidateEntrypoint}`,
    };
  }
  const request: CandidateReconciliationRequest = {
    protocol: CANDIDATE_RECONCILIATION_PROTOCOL,
    transaction_id: handoff.transactionId,
    transaction_backup_root: handoff.transactionBackupRoot,
    parent_token: handoff.parentToken,
    candidate,
    cwd,
    target,
    sync_skill: opts.syncSkill !== false,
    host_adapters: opts.hostAdapters !== false,
    external_skills: opts.externalSkills === true,
    obsidian_skills: opts.obsidianSkills === true,
    codegraph: opts.codegraph ?? true,
    brain_root: opts.brainRoot,
    report_language: opts.reportLanguage,
  };
  const child = runProcess(
    bunExecutable,
    [candidateEntrypoint, '__reconcile-installed-runtime', '--request', encodeCandidateRequest(request)],
    cwd,
    {
      ...env,
      REPO_HARNESS_RUNTIME_RECONCILIATION_PARENT: '1',
      REPO_HARNESS_RUNTIME_RECONCILIATION_TOKEN: handoff.parentToken,
    },
  );
  if (child.status === 'failed') return withStepName(child, CANDIDATE_RECONCILE_STEP, `candidate=${candidate.version}`);
  try {
    const receipt = parseCandidateReceipt(child.stdout ?? '');
    if (
      receipt.transaction_id !== handoff.transactionId
      || receipt.candidate_package_root !== candidate.root
      || receipt.candidate_version !== candidate.version
      || receipt.candidate_package_digest !== candidate.package_digest
      || receipt.selected_target !== target
    ) {
      throw new Error('candidate receipt binding mismatch');
    }
    const completeRequired = request.sync_skill && request.host_adapters;
    if (completeRequired && receipt.reconciliation_scope !== 'complete') {
      throw new Error('candidate receipt is partial while full reconciliation was requested');
    }
    if (completeRequired && receipt.ownership_manifest_digest === null) {
      throw new Error('candidate receipt omitted the ownership ledger digest');
    }
    return {
      step: CANDIDATE_RECONCILE_STEP,
      status: 'ok',
      detail: appendOutput(`candidate=${receipt.candidate_version}; scope=${receipt.reconciliation_scope}; receipt=${receipt.route_registry_digest}`, child.stderr),
      stderr: child.stderr,
    };
  } catch (error) {
    return {
      step: CANDIDATE_RECONCILE_STEP,
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
      stdout: child.stdout,
      stderr: child.stderr,
    };
  }
}

/**
 * Run the installed package's read-only `upgrade` check. Bun replaces the
 * package files in place, but the updater keeps its predecessor modules. Old
 * modules cannot be trusted to parse new assets or output shapes, so the
 * package that now owns the runtime runs the check. Output stays raw: a JSON
 * payload is parsed before any redaction or cap, because a path such as
 * token=x would otherwise lose its closing quote.
 */
function runInstalledUpgrade(args: readonly string[], cwd: string, installedCli: boolean, timeoutMs?: number):
  { readonly stdout: string; readonly stderr: string } | { readonly failure: string } {
  const bunExecutable = resolveBunExecutable();
  const env = bindBunRuntimeEnv(commandEnv(defaultSourceRoot()), bunExecutable);
  const packageRoot = installedCli ? bunGlobalPackageRoot(env) : defaultSourceRoot();
  if (packageRoot === null) return { failure: 'unable to resolve the installed package root' };
  const check = runBoundedProcess(bunExecutable, [join(realPathOrResolved(packageRoot), 'src', 'cli', 'index.ts'), 'upgrade', ...args], {
    cwd,
    env,
    redactions: [],
    maxOutputBytes: DEFAULT_PROCESS_MAX_BUFFER_BYTES,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return { stdout: check.stdout, stderr: (check.stderr || check.error || '').trim() };
}

/**
 * The installed package writes its own leftover summary line, and the updater
 * forwards it unparsed. The check exits 1 when work is pending, so only a
 * missing line is a failed check.
 */
export function updateLeftoverSummary(cwd: string, installedCli: boolean): string {
  const run = runInstalledUpgrade(['--summary-line'], cwd, installedCli);
  if ('failure' in run) return leftoverCheckWarning(run.failure);
  const line = run.stdout.trim();
  if (line === '') return leftoverCheckWarning(redactProcessOutput(run.stderr) || 'upgrade --summary-line printed no summary line');
  return line;
}

/** `update` must not wait the default two minutes on a hung git probe. */
const REGISTERED_PREVIEW_TIMEOUT_MS = 30_000;

/**
 * One read-only line: how many registered repos have pending project upgrade
 * work. It runs the `upgrade --registered` preview only and never fails update.
 * When the count cannot be computed, the line says so instead of a number.
 */
export function updateRegisteredUpgradeSummary(cwd: string, installedCli: boolean): string {
  const hint = 'Preview: repo-harness upgrade --registered';
  const unavailable = (reason: string) => `Registered repo upgrade check could not be computed: ${reason}. ${hint}`;
  const run = runInstalledUpgrade(['--registered', '--json'], cwd, installedCli, REGISTERED_PREVIEW_TIMEOUT_MS);
  if ('failure' in run) return unavailable(run.failure);
  let payload: unknown;
  try {
    payload = JSON.parse(run.stdout);
  } catch (_error) {
    payload = null;
  }
  const record = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as { repos?: unknown; error?: unknown } : null;
  const reportedError = typeof record?.error === 'string' ? record.error.trim() : '';
  if (!record || !Array.isArray(record.repos) || reportedError !== '') {
    return unavailable(redactProcessOutput(reportedError || run.stderr) || 'upgrade --registered --json returned no repo list');
  }
  const repos = record.repos.map((repo) => (repo !== null && typeof repo === 'object' ? repo : {}) as { status?: unknown; pending?: unknown });
  const pending = repos.filter((repo) => repo.status === 'ready' && repo.pending === true).length;
  const skipped = repos.filter((repo) => repo.status === 'skipped').length;
  const failed = repos.filter((repo) => repo.status === 'failed').length;
  return `Registered repos: ${pending} of ${repos.length} have pending project upgrade work`
    + `${skipped > 0 ? `; ${skipped} skipped` : ''}${failed > 0 ? `; ${failed} failed` : ''}. ${hint}`;
}

const AGENT_FLEET_STEP = 'install agent fleet';
export const GLOBAL_RULES_REFRESH_STEP = 'refresh global working rules';

export const RUNTIME_IGNORE_RULES_STEP = 'write runtime ignore rules';

/** Writes the runtime-state ignore block into the user-level Git excludes file; `core.excludesFile` is never set. */
function writeRuntimeIgnoreRules(env: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const step = RUNTIME_IGNORE_RULES_STEP;
  const target = userExcludesFilePath(env);
  if (!target.ok) return { step, status: 'failed', detail: target.error };
  try {
    // Uninstall refuses a symlinked excludes file, so update must not write a block through one.
    assertConfigurationPath(target.path, dirname(target.path));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { step, status: 'failed', detail: `${target.path}: ${reason}; set core.excludesFile to the real file, then run repo-harness update again` };
  }
  try {
    const existing = existsSync(target.path) ? readFileSync(target.path, 'utf-8') : '';
    const update = upsertManagedBlock(existing, runtimeStateIgnoreOperation(target.path));
    if (!update.ok) return { step, status: 'failed', detail: `${target.path}: ${update.error}` };
    if (!update.changed) return { step, status: 'ok', detail: `${target.path}: current` };
    mkdirSync(dirname(target.path), { recursive: true });
    writeFileSync(target.path, update.content!);
    return { step, status: 'ok', detail: `${target.path}: written` };
  } catch (error) {
    return { step, status: 'failed', detail: `${target.path}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function installAgentFleet(sourceRoot: string, bunExecutable: string, env: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const script = join(sourceRoot, 'scripts', 'install-agent-fleet.sh');
  if (!existsSync(script)) {
    return { step: AGENT_FLEET_STEP, status: 'failed', detail: `script not found: ${script}` };
  }
  return withStepName(
    runProcess('bash', [script], sourceRoot, { ...env, REPO_HARNESS_BUN_BIN: bunExecutable }),
    AGENT_FLEET_STEP,
  );
}

const WAZA_RULES_STEP = "sync Waza shared rules";

/**
 * The Skills CLI never writes ~/.agents/rules, so the setup step skips the
 * rules on a fresh install. The refresh path needs an install state to own
 * new rules. An install therefore runs it once after its state write.
 * That write renews existing receipts, so `priorReceipts` (the receipts from
 * before the transaction) judge whether a host rule may be overwritten.
 */
export function ownFreshWazaSharedRules(
  result: GlobalRuntimeResult,
  target: InstallTargetSpec,
  env: NodeJS.ProcessEnv,
  priorReceipts: readonly ManagedInstallSurface[],
): GlobalRuntimeResult {
  const index = result.steps.findIndex((step) => step.step === WAZA_RULES_STEP);
  const wazaInstalled = result.steps.some((step) => step.step === externalSkillStepName("tw93/Waza") && step.status === "ok");
  const home = homeDir(env);
  if (index < 0 || !wazaInstalled || !wazaStagingRulesAbsent(home)) return result;
  const owned: GlobalRuntimeStep = { step: WAZA_RULES_STEP, ...syncWazaSharedRules(home, hostIds(target), env, true, priorReceipts) };
  return finalizeRuntimeResult(result.steps.map((step, i) => (i === index ? owned : step)));
}

/** True when the installed candidate process ran the host writes and committed its own install state. */
export function reconciledByCandidate(result: Pick<GlobalRuntimeResult, 'steps'>): boolean {
  return result.steps.some((step) => step.step === CANDIDATE_RECONCILE_STEP);
}

/** True only when this run's fleet helper verified every agent target (see applyInstallSelection). */
export function agentFleetVerified(result: Pick<GlobalRuntimeResult, 'steps'>): boolean {
  return result.steps.some((step) => step.step === AGENT_FLEET_STEP && step.status === 'ok');
}

function recordAgentFleetOwnership(env: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const step = 'record agent fleet ownership';
  try {
    recordVerifiedAgentFleetOwnership(env);
    return { step, status: 'ok' };
  } catch (error) {
    return { step, status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}

function externalSkillStepName(provider: string): string {
  if (provider === "tw93/Waza") return "configure Waza skills";
  if (provider === "BfdCampos/dotfiles") return "configure Mermaid skill";
  if (provider.startsWith("kepano/obsidian-skills#")) return "configure Obsidian companion Skills";
  return `configure external skills ${provider}`;
}

function installExternalSkillGroup(
  sourceRoot: string,
  target: InstallTargetSpec,
  piSelected: boolean,
  provider: string,
  skills: readonly string[],
  integrityBySkill: Readonly<Record<string, string | null>>,
  env?: NodeJS.ProcessEnv,
  refresh = false,
): GlobalRuntimeStep {
  const stepName = externalSkillStepName(provider);
  const home = homeDir(env);
  const skillsRoot = stagedSkillRoot(home);
  const canonicalSkillsRoot = stagedSkillRoot(realpathSync(home));
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
  const preflight = preflightStagedSkillProjection(skills, target, piSelected, env, stepName);
  if (preflight) return fail(preflight);
  const missing = skills.filter((skill) => !existsSync(join(skillsRoot, skill, 'SKILL.md')));
  const selected = refresh ? skills : missing;
  const ordinaryMissing = selected.filter((skill) => integrityBySkill[skill] == null);
  if (ordinaryMissing.length > 0) {
    const step = runProcess(
      "bunx",
      [
        "skills",
        "add",
        provider,
        "-g",
        "-a",
        STAGING_PROVIDER_AGENT,
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
      XDG_STATE_HOME: join(isolatedHome, ".local", "state"),
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
          STAGING_PROVIDER_AGENT,
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
        const isolatedSkill = join(stagedSkillRoot(isolatedHome), skill);
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
          const state = readInstallState(env);
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
          join(stagedSkillRoot(isolatedHome), skill),
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
  const projection = projectStagedSkills(skills, target, piSelected, env, stepName);
  if (projection.status === "failed") return fail(projection);
  rmSync(replacementBackupRoot, { recursive: true, force: true });
  return projection;
}

function installWazaSkills(sourceRoot: string, target: InstallTargetSpec, piSelected: boolean, env?: NodeJS.ProcessEnv, refresh = false): GlobalRuntimeStep {
  const wazaSkills = externalSkillGroupsFromCatalog(loadSkillSurfaceCatalog(sourceRoot)).get("tw93/Waza") ?? [];
  const skillsRoot = stagedSkillRoot(homeDir(env));
  const selected = refresh ? wazaSkills : wazaSkills.filter((skill) => !existsSync(join(skillsRoot, skill, 'SKILL.md')));
  const preflight = preflightStagedSkillProjection(wazaSkills, target, piSelected, env, 'configure Waza skills');
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
        STAGING_PROVIDER_AGENT,
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
  return projectStagedSkills(wazaSkills, target, piSelected, env, 'configure Waza skills');
}

/**
 * Each selected host skill root, with the canonical path it must resolve to.
 * The ledger owns every Pi-root path under the `pi` plugin, so the Pi root is
 * a projection root only when `pi` runs.
 */
function stagedProjectionRoots(home: string, target: InstallTargetSpec, piSelected: boolean, env: NodeJS.ProcessEnv | undefined): Array<{ path: string; expected: string }> {
  const canonicalHome = realpathSync(home);
  const hosts = target === 'both' && piSelected ? [...hostIds(target), 'pi' as const] : hostIds(target);
  return hosts.map((host) => ({ path: hostSkillRoot(home, host, env), expected: hostSkillRoot(canonicalHome, host, env) }));
}

function preflightStagedSkillProjection(
  skills: readonly string[],
  target: InstallTargetSpec,
  piSelected: boolean,
  env: NodeJS.ProcessEnv | undefined,
  step: string,
): GlobalRuntimeStep | null {
  const home = homeDir(env);
  const roots = stagedProjectionRoots(home, target, piSelected, env);
  for (const root of roots) {
    const invalid = invalidProjectionRoot(root.path, root.expected);
    if (invalid) return { step, status: 'failed', detail: invalid };
  }
  for (const skill of skills) {
    const source = join(stagedSkillRoot(home), skill);
    for (const root of roots) {
      const destination = join(root.path, skill);
      if (!pathEntryExists(destination)) continue;
      if (skillLinkMatches(destination, source)) continue;
      return { step, status: 'failed', detail: `refusing to refresh unowned host skill ${destination}; preserve or move this path, then run: repo-harness install --target ${target}` };
    }
  }
  return null;
}

function projectStagedSkills(
  skills: readonly string[],
  target: InstallTargetSpec,
  piSelected: boolean,
  env: NodeJS.ProcessEnv | undefined,
  step: string,
): GlobalRuntimeStep {
  const home = homeDir(env);
  const roots = stagedProjectionRoots(home, target, piSelected, env);
  const projected: string[] = [];
  const created: string[] = [];
  const fail = (detail: string): GlobalRuntimeStep => {
    for (const destination of created.reverse()) rmSync(destination, { recursive: true, force: true });
    return { step, status: 'failed', detail };
  };
  for (const skill of skills) {
    const source = join(stagedSkillRoot(home), skill);
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
          if (skillLinkMatches(destination, source)) {
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

function installMermaidSkill(sourceRoot: string, target: InstallTargetSpec, piSelected: boolean, env?: NodeJS.ProcessEnv, refresh = false): GlobalRuntimeStep {
  const mermaidSkills = externalSkillGroupsFromCatalog(loadSkillSurfaceCatalog(sourceRoot)).get("BfdCampos/dotfiles") ?? [];
  const installed = join(stagedSkillRoot(homeDir(env)), 'mermaid', 'SKILL.md');
  const preflight = preflightStagedSkillProjection(mermaidSkills, target, piSelected, env, 'configure Mermaid skill');
  if (preflight) return preflight;
  if (refresh || !existsSync(installed)) {
    const step = runProcess(
      "bunx",
      [
        "skills",
        "add",
        "BfdCampos/dotfiles",
        "-g",
        "-a",
        STAGING_PROVIDER_AGENT,
        "-s",
        ...mermaidSkills,
        "-y",
      ],
      sourceRoot,
      env,
    );
    if (step.status === 'failed') return withStepName(step, "configure Mermaid skill", `target=${target}`);
  }
  return projectStagedSkills(mermaidSkills, target, piSelected, env, 'configure Mermaid skill');
}
function configureBrain(root: string | undefined, env?: NodeJS.ProcessEnv, runtimeLock?: RuntimeTransactionContext): GlobalRuntimeStep {
  try {
    const selected = root
      ? resolve(expandHomePath(root, env))
      : defaultBrainRootChoice({ env }).root;
    const configured = configureBrainRoot(selected, env, runtimeLock);
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

export function configureProtectedHelperPlatform(
  cwd: string,
  bunExecutable: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  runtimeLock?: RuntimeTransactionContext,
): GlobalRuntimeStep {
  if (platform !== 'win32') {
    return {
      step: 'configure protected helper platform',
      status: 'skipped',
      detail: `native ${platform} system toolchain`,
    };
  }
  try {
    const account = userInfo();
    const contract = discoverWindowsProtectedHelperContract({ env });
    const runtime = resolveProtectedHelperPlatform({
      platform,
      accountHome: account.homedir,
      accountUsername: account.username,
      bunExecutable,
      contract,
    });
    const probeEnv: NodeJS.ProcessEnv = {
      HOME: runtime.accountHome,
      USER: runtime.accountUsername,
      LOGNAME: runtime.accountUsername,
      OS: 'Windows_NT',
      USERPROFILE: runtime.accountHome,
      USERNAME: runtime.accountUsername,
      SystemRoot: runtime.systemRoot,
      WINDIR: runtime.systemRoot,
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
      PATH: runtime.pathEntries.join(runtime.pathDelimiter),
      TMPDIR: runtime.tempDir,
      TEMP: runtime.tempDir,
      TMP: runtime.tempDir,
    };
    const git = runProcess(contract.git_bin, ['--version'], cwd, gitChildEnv(['--version'], probeEnv), false);
    if (git.status !== 'ok') {
      return { ...git, step: 'configure protected helper platform', detail: 'Git for Windows probe failed' };
    }
    const bash = runProcess(contract.bash_bin, ['--version'], cwd, probeEnv, false);
    if (bash.status !== 'ok') {
      return { ...bash, step: 'configure protected helper platform', detail: 'Git for Windows Bash probe failed' };
    }
    const taskkill = runProcess(runtime.taskkillBin!, ['/?'], cwd, probeEnv, false);
    if (taskkill.status !== 'ok') {
      return { ...taskkill, step: 'configure protected helper platform', detail: 'Windows taskkill probe failed' };
    }
    const written = writeWindowsProtectedHelperContract(contract, account.homedir, runtimeLock);
    return {
      step: 'configure protected helper platform',
      status: 'ok',
      detail: `${written.changed ? 'pinned' : 'verified'} ${contract.distribution} at ${contract.git_root}`,
    };
  } catch (error) {
    return {
      step: 'configure protected helper platform',
      status: 'failed',
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function ensureOperatorConsole(sourceRoot: string, cwd: string, bunExecutable: string, env: NodeJS.ProcessEnv, registry: boolean): GlobalRuntimeStep {
  const step = 'ensure operator console';
  const localPackage = join(sourceRoot, 'packages', 'operator-web');
  if (!registry && !existsSync(join(localPackage, 'dist', 'index.html'))) {
    return { step, status: 'failed', detail: `console build missing; run bun run build:operator-web in ${sourceRoot}` };
  }
  const globalRoot = bunGlobalPackageRoot(env);
  let cliRoot: string;
  let cliVersion: unknown;
  try {
    if (globalRoot === null) return { step, status: 'failed', detail: 'unable to resolve Bun global package root' };
    cliRoot = dirname(realpathSync(join(globalRoot, 'package.json')));
    cliVersion = readPackageManifest(cliRoot).version;
  } catch (error) {
    return { step, status: 'failed', detail: `CLI readback failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (typeof cliVersion !== 'string' || !cliVersion) return { step, status: 'failed', detail: 'installed CLI version is unavailable' };
  let install: GlobalRuntimeStep = { step, status: 'ok' };
  try {
    if (registry) {
      const spec = `${OPERATOR_WEB_PACKAGE_NAME}@${cliVersion}`;
      install = runProcess(bunExecutable, ['add', '-g', spec, '--no-cache'], cwd, env);
      if (install.status !== 'ok') return withStepName(install, step, spec);
    } else {
      try {
        const modules = join(cliRoot, 'node_modules');
        const target = join(modules, OPERATOR_WEB_PACKAGE_NAME);
        mkdirSync(modules, { recursive: true });
        try {
          if (!lstatSync(target).isSymbolicLink()) return { step, status: 'failed', detail: `console path is not a symlink: ${target}` };
          rmSync(target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        symlinkSync(resolve(localPackage), target, 'dir');
      } catch (error) {
        return { step, status: 'failed', detail: `console link failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    const consoleRoot = findInstalledPackageRoot(cliRoot, OPERATOR_WEB_PACKAGE_NAME);
    const version = consoleRoot === null ? null : readPackageManifest(consoleRoot).version;
    if (version !== cliVersion) return { ...install, step, status: 'failed', detail: `console readback mismatch: expected ${cliVersion}, got ${String(version)}` };
    return withStepName(install, step, `version=${version}`);
  } catch (error) {
    return { ...install, step, status: 'failed', detail: `console readback failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function ensureCodegraphCli(cwd: string, bunExecutable: string, codegraphVersion: string, env?: NodeJS.ProcessEnv, refresh = false): GlobalRuntimeStep {
  const codegraphPackage = `@colbymchenry/codegraph@${codegraphVersion}`;
  const check = runProcess("codegraph", ["--version"], cwd, env);
  if (!refresh && check.status === "ok") return withStepName(check, "ensure CodeGraph CLI", "present");
  const install = runProcess(bunExecutable, ["add", "-g", codegraphPackage], cwd, env);
  if (install.status !== "ok") return withStepName(install, "ensure CodeGraph CLI", codegraphPackage);
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
      if (installedVersion !== codegraphVersion) {
        return {
          ...recheck,
          step: "ensure CodeGraph CLI",
          status: "failed",
          detail: `CodeGraph readback mismatch: expected ${codegraphVersion}, got ${String(installedVersion)}`,
        };
      }
    }
    return withStepName(recheck, "ensure CodeGraph CLI", refresh ? `updated=${codegraphVersion}` : "installed");
  }
  return {
    ...recheck,
    step: "ensure CodeGraph CLI",
    status: "failed",
    detail: `${codegraphPackage} installed, but codegraph is not on PATH`,
  };
}

export const HERDR_CORE_STEP = "ensure herdr-core (hc)";

/** Node `<platform>-<arch>` to the pin's release asset name. */
const HC_ASSET_NAMES: Readonly<Record<string, string>> = {
  "darwin-arm64": "macos-aarch64",
  "darwin-x64": "macos-x86_64",
  "linux-arm64": "linux-aarch64",
  "linux-x64": "linux-x86_64",
  "win32-x64": "windows-x86_64",
};

export interface HerdrCoreInstallInput {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** The command to rerun after a manual install. */
  readonly command: "install" | "update";
  /** Node `<platform>-<arch>`. */
  readonly platform: string;
  readonly minVersion: string;
  readonly assets: Readonly<Record<string, HcReleaseAsset>>;
}

function processFailure(result: { readonly stderr: string; readonly error?: string; readonly status: number | null }): string {
  return (result.stderr || result.error || "").trim() || `exit ${result.status}`;
}

function hcVersionOf(hc: string, cwd: string, env: NodeJS.ProcessEnv): { version: string } | { failure: string } {
  const result = runBoundedProcess(hc, ["--version"], { cwd, env, timeoutMs: 5_000 });
  const version = /^hc ([0-9]+\.[0-9]+\.[0-9]+)$/u.exec(result.stdout.trim())?.[1];
  if (result.ok && version !== undefined) return { version };
  return { failure: `${hc} --version failed: ${processFailure(result)}` };
}

/**
 * The official install layout of one platform (releases.herdr.dev/core
 * install.sh and install.ps1): the install directory, the archive members it
 * copies, and the hc link. Windows extracts the zip with its own tar.exe;
 * the Git Bash tar cannot open a zip.
 */
interface HcInstallLayout {
  readonly dir: string;
  readonly binary: string;
  readonly members: readonly string[];
  readonly link: string;
  readonly linkKind: "symlink" | "hardlink";
  readonly tar: string;
  /** Windows only: the PowerShell that adds `dir` to the user PATH (owner M62). Unix edits no shell profile. */
  readonly powershell: string | null;
}

function hcInstallLayout(assetName: string, env: NodeJS.ProcessEnv): HcInstallLayout | { failure: string } {
  if (assetName !== "windows-x86_64") {
    const dir = join(homeDir(env), ".local", "bin");
    return { dir, binary: "herdr-core", members: ["herdr-core"], link: "hc", linkKind: "symlink", tar: "tar", powershell: null };
  }
  if (!env.LOCALAPPDATA) return { failure: "LOCALAPPDATA is not set; it names the herdr-core install directory" };
  if (!env.SystemRoot) return { failure: "SystemRoot is not set; it names the Windows tar.exe that opens the herdr-core zip" };
  const tar = join(env.SystemRoot, "System32", "tar.exe");
  if (!existsSync(tar)) return { failure: `${tar} is missing; it opens the herdr-core zip (Windows 10 1803 or newer)` };
  const powershell = join(env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!existsSync(powershell)) return { failure: `${powershell} is missing; it adds the herdr-core directory to the user PATH` };
  return { dir: join(env.LOCALAPPDATA, "Programs", "herdr-core"), binary: "herdr-core.exe", members: ["herdr-core.exe", "conpty"], link: "hc.exe", linkKind: "hardlink", tar, powershell };
}

/**
 * The user PATH step of install.ps1: read the raw `HKCU\Environment` `Path`
 * (unexpanded), keep its value kind, append `dir` only when no entry matches
 * (no case, trailing backslash ignored), then set and clear a user variable so
 * running programs reread the environment. Not `setx`: it cuts the value at
 * 1024 characters. Prints `listed` or `added`.
 */
function addToWindowsUserPath(powershell: string, dir: string, cwd: string, env: NodeJS.ProcessEnv): { outcome: "listed" | "added" } | { failure: string } {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$dir = '${dir.replaceAll("'", "''")}'`,
    "$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)",
    "try {",
    "  $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
    "  if ($raw -split ';' | Where-Object { $_.Trim().TrimEnd('\\') -ieq $dir.TrimEnd('\\') }) { 'listed' } else {",
    "    $kind = if ($key.GetValueNames() -contains 'Path') { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }",
    "    $key.SetValue('Path', $(if ($raw) { \"$($raw.TrimEnd(';'));$dir\" } else { $dir }), $kind)",
    "    [Environment]::SetEnvironmentVariable('HC_INSTALLING', '1', 'User')",
    "    [Environment]::SetEnvironmentVariable('HC_INSTALLING', $null, 'User')",
    "    'added'",
    "  }",
    "} finally { $key.Close() }",
  ].join("\n");
  // UTF-16LE base64: Windows PowerShell 5.1 splits the quotes of a -Command argument.
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = runBoundedProcess(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { cwd, env, timeoutMs: 30_000 });
  const outcome = result.stdout.trim();
  if (result.ok && (outcome === "listed" || outcome === "added")) return { outcome };
  return { failure: `adding ${dir} to the user PATH failed: ${processFailure(result)}` };
}

export interface HerdrCoreInstallResult {
  readonly step: GlobalRuntimeStep;
  /** The install directory when it is not on PATH: the later steps of this run put it first on their PATH. */
  readonly pathEntry: string | null;
}

/**
 * Bring hc on PATH to the package floor. Missing: download the pinned asset,
 * check its sha256 and the downloaded hc, then install it in the official
 * layout. Below the floor: `hc update --version <floor>`. At or above: no
 * change. hc is a user tool after install: no ledger entry, and an existing
 * hc install file is never overwritten.
 */
export function ensureHerdrCore(input: HerdrCoreInstallInput): HerdrCoreInstallResult {
  const { cwd, env, minVersion } = input;
  const done = (step: Omit<GlobalRuntimeStep, "step">, pathEntry: string | null = null): HerdrCoreInstallResult => ({ step: { step: HERDR_CORE_STEP, ...step }, pathEntry });
  const fail = (detail: string): HerdrCoreInstallResult => done({ status: "failed", detail });
  const hc = findOnPath("hc", env);
  if (hc !== null) {
    const current = hcVersionOf(hc, cwd, env);
    if ("failure" in current) return fail(current.failure);
    if (compareHcVersions(current.version, minVersion) >= 0) {
      return done({ status: "ok", detail: `hc ${current.version} at ${hc} is at or above ${minVersion}; no change` });
    }
    const update = runBoundedProcess(hc, ["update", "--version", minVersion], { cwd, env, timeoutMs: 300_000 });
    if (!update.ok) return fail(`hc client ${current.version} is below the repo-harness floor ${minVersion}; hc update --version ${minVersion} failed: ${processFailure(update)}`);
    const updated = hcVersionOf(hc, cwd, env);
    if ("failure" in updated) return fail(updated.failure);
    if (compareHcVersions(updated.version, minVersion) < 0) return fail(`hc update --version ${minVersion} left hc client ${updated.version} below the repo-harness floor ${minVersion}`);
    return done({ status: "ok", detail: `hc client ${current.version} was below the repo-harness floor ${minVersion}; hc update --version ${minVersion} updated it to ${updated.version} at ${hc}` });
  }

  const assetName = HC_ASSET_NAMES[input.platform];
  const asset = assetName === undefined ? undefined : input.assets[assetName];
  if (assetName === undefined || asset === undefined) {
    return fail(`no herdr-core release asset for ${input.platform}; install hc >=${minVersion} manually (Herdr.app or a herdr-core release), then run repo-harness ${input.command}`);
  }
  const layout = hcInstallLayout(assetName, env);
  if ("failure" in layout) return fail(layout.failure);
  for (const name of [...layout.members, layout.link]) {
    const path = join(layout.dir, name);
    // An earlier run may have installed it into a dir that is still off PATH.
    if (pathEntryExists(path)) return fail(`hc is not on PATH, and ${path} exists; refusing to overwrite it; add ${layout.dir} to PATH, then rerun repo-harness ${input.command}`);
  }
  const scratch = mkdtempSync(join(tmpdir(), "repo-harness-hc-"));
  try {
    const archive = join(scratch, assetName === "windows-x86_64" ? "herdr-core.zip" : "herdr-core.tar.gz");
    const download = runBoundedProcess("curl", ["--fail", "--location", "--silent", "--show-error", "--output", archive, asset.url], { cwd, env, timeoutMs: 300_000 });
    if (!download.ok) return fail(`download of ${asset.url} failed: ${processFailure(download)}`);
    const actual = sha256Hex(readFileSync(archive));
    if (actual !== asset.sha256) return fail(`sha256 mismatch for ${asset.url}: expected ${asset.sha256}, got ${actual}; nothing installed`);
    const extract = join(scratch, "extract");
    mkdirSync(extract);
    const unpack = runBoundedProcess(layout.tar, ["-xf", archive, "-C", extract], { cwd, env });
    if (!unpack.ok) return fail(`extract of ${asset.url} failed: ${processFailure(unpack)}`);
    const missing = layout.members.filter(name => !existsSync(join(extract, name)));
    if (assetName === "windows-x86_64" && !existsSync(join(extract, "conpty", "conpty.dll"))) missing.push(join("conpty", "conpty.dll"));
    if (missing.length > 0) return fail(`${asset.url} holds no complete hc (missing ${missing.join(", ")}); nothing installed`);
    const downloaded = hcVersionOf(join(extract, layout.binary), cwd, env);
    if ("failure" in downloaded) return fail(`the downloaded hc does not run on this machine: ${downloaded.failure}`);
    if (downloaded.version !== minVersion) return fail(`the downloaded hc reports ${downloaded.version}, expected ${minVersion}; nothing installed`);

    mkdirSync(layout.dir, { recursive: true });
    const binary = join(layout.dir, layout.binary);
    const link = join(layout.dir, layout.link);
    for (const name of layout.members) cpSync(join(extract, name), join(layout.dir, name), { recursive: true, force: false, errorOnExist: true });
    chmodSync(binary, 0o755);
    if (layout.linkKind === "symlink") symlinkSync(layout.binary, link);
    else linkSync(binary, link);
    const installed = `installed hc ${downloaded.version} (sha256 verified) into ${layout.dir}: ${[...layout.members, layout.link].join(", ")}`;
    let pathNote: string | null = null;
    if (layout.powershell !== null) {
      const userPath = addToWindowsUserPath(layout.powershell, layout.dir, cwd, env);
      if ("failure" in userPath) return fail(`${installed}; ${userPath.failure}`);
      pathNote = userPath.outcome === "added" ? `added ${layout.dir} to the user PATH: new terminals have hc` : `${layout.dir} is already on the user PATH`;
    }
    // Windows paths compare without case, as install.ps1 does.
    const samePath = (left: string) => process.platform === "win32" ? resolve(left).toLowerCase() === resolve(layout.dir).toLowerCase() : resolve(left) === resolve(layout.dir);
    const onPath = (env.PATH ?? "").split(delimiter).some(entry => entry !== "" && samePath(entry));
    const runNote = onPath ? null : `${pathNote === null ? `add ${layout.dir} to PATH to use hc; ` : ""}this run uses it for its later steps`;
    return done({ status: "ok", detail: [installed, pathNote, runNote].filter(note => note !== null).join("; ") }, onPath ? null : layout.dir);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function withPlugin(plugins: readonly PluginId[], id: PluginId): readonly PluginId[] {
  return [...new Set([...plugins, id])].sort() as PluginId[];
}

/** Update is the only caller that fills introduced seats and removes the stored routing mode. */
export function migrateSeatsConfiguration(env: NodeJS.ProcessEnv, runtimeLock?: RuntimeTransactionContext): boolean {
  return mutateGlobalConfiguration(env, config => {
    try {
      decodeSeatsConfig(config.seats);
      return { value: false };
    } catch (error) {
      if (!(error instanceof SeatsConfigMigrationRequiredError)) throw error;
    }
    const { orchestrator: _orchestrator, advisor: _advisor, worker: _worker, ...introduced } = DEFAULT_SEATS_CONFIG;
    const stored = config.seats as Record<string, unknown>;
    let routing = stored.routing;
    if (typeof routing === 'object' && routing !== null && ('mode' in routing || 'hyper' in routing)) {
      const row = routing as Record<string, unknown>;
      const keys = [...ROUTING_CLASSES, 'mode', 'low_quota_explorer', 'hyper'];
      const invalid = (): never => { throw new Error('seats_config_invalid'); };
      if (keys.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !keys.includes(key))
        || (row.mode !== 'standard' && row.mode !== 'hyper')) invalid();
      const hyper = row.hyper as Record<string, unknown> | null;
      const targets = ['claude', 'advisor', 'codex'];
      if (typeof hyper !== 'object' || hyper === null || Array.isArray(hyper)
        || Object.keys(hyper).length !== targets.length || targets.some(key => !Object.hasOwn(hyper, key))) invalid();
      const ranges = seatsRanges([]);
      for (const target of targets) {
        const value = hyper![target] as Record<string, unknown> | null;
        const runtime = ranges.runtimes.find(runtime => runtime.id === (target === 'codex' ? 'codex' : 'claude'))!;
        if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).length !== 2
          || !Object.hasOwn(value, 'model') || !Object.hasOwn(value, 'effort')
          || value.model !== null && !runtime.models.includes(value.model as string)
          || value.effort !== null && !ranges.efforts.includes(value.effort as string)) invalid();
      }
      const { mode: _mode, hyper: _hyper, ...kept } = row;
      routing = { ...kept, claude_saving_below_remaining: DEFAULT_SEATS_CONFIG.routing.claude_saving_below_remaining,
        codex_hyper_at_or_above_remaining: DEFAULT_SEATS_CONFIG.routing.codex_hyper_at_or_above_remaining };
    }
    const seats = decodeSeatsConfig({ ...introduced, 'worker-light': null, ...stored, ...(routing === undefined ? {} : { routing }) });
    checkSeatRoutingModels(seats.routing);
    return { config: { ...config, seats }, value: true };
  }, { runtimeLock }).value;
}

/** Read-only. A refused file reports the loader's text only: the file holds local paths. */
function checkMcpLocalConfig(env: NodeJS.ProcessEnv): GlobalRuntimeStep {
  const step = 'check MCP local config';
  try {
    const config = withProcessEnv(env, loadMcpLocalConfig);
    return config === null
      ? { step, status: 'skipped', detail: 'No MCP local config.' }
      : { step, status: 'ok', detail: 'MCP local config is valid.' };
  } catch (error) {
    return { step, status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}

export function runGlobalRuntimeSetup(
  opts: GlobalRuntimeOptions = {},
): GlobalRuntimeResult {
  const sourceRoot = opts.sourceRoot ?? defaultSourceRoot();
  const cwd = opts.cwd ?? process.cwd();
  const target = opts.target ?? "both";
  const bunExecutable = resolveBunExecutable(opts.env);
  let env = bindBunRuntimeEnv(commandEnv(sourceRoot, opts.env), bunExecutable);
  const plugins = opts.plugins ?? enabledPlugins(requireInstallState(env));
  const piSelected = plugins.includes('pi');
  const updateMode = opts.updateMode === true;
  const steps: GlobalRuntimeStep[] = [];

  const bunRuntime = ensureSupportedBunRuntime(cwd, env, bunExecutable);
  steps.push(bunRuntime);
  if (bunRuntime.status === "failed") {
    return finalizeRuntimeResult(steps);
  }

  // Read-only plan before any host write. A file that cannot be synced is
  // reported as skipped and never stops the run, because an older parent CLI
  // hands update to this candidate without --report-language. The process
  // that reaches the host-write section below applies this plan.
  const globalRules = preflightGlobalContextRefresh(sourceRoot, homeDir(env), hostIds(target), opts.reportLanguage);

  if (updateMode) {
    const step = 'migrate seats configuration';
    try {
      const migrated = migrateSeatsConfiguration(env, opts.runtimeLock);
      steps.push({ step, status: migrated ? 'ok' : 'skipped', detail: migrated ? 'Wrote the complete seats section.' : 'No seats migration required.' });
    } catch (error) {
      steps.push({ step, status: 'failed', detail: error instanceof Error ? error.message : String(error) });
      return finalizeRuntimeResult(steps);
    }
  }

  const protectedHelperPlatform = configureProtectedHelperPlatform(cwd, bunExecutable, env, process.platform, opts.runtimeLock);
  steps.push(protectedHelperPlatform);
  if (protectedHelperPlatform.status === 'failed') return finalizeRuntimeResult(steps);

  if (opts.installCli !== false) {
    const install = installCli(sourceRoot, cwd, bunExecutable, env, opts.installSpec);
    steps.push(install);
    if (updateMode && install.status === 'failed') return finalizeRuntimeResult(steps);
    // The parent has loaded predecessor contracts. The installed candidate owns
    // dependency and daemon verification as well as later host writes.
    if (updateMode && install.status === 'ok' && opts.installSpec && opts.candidateHandoff) {
      steps.push(reconcileWithInstalledCandidate(opts, cwd, bunExecutable, env, target), checkMcpLocalConfig(env));
      return finalizeRuntimeResult(steps);
    }
    if (updateMode && install.status === "ok" && opts.installSpec) {
      steps.push(reconcileManagedRuntime(cwd, bunExecutable, env, opts.installSpec, plugins, true));
    }
    if (updateMode && steps.some((step) => step.status === "failed")) return finalizeRuntimeResult(steps);
  }
  else {
    steps.push({ step: "install repo-harness CLI", status: "skipped", detail: "disabled" });
    if (updateMode && opts.installSpec) steps.push(reconcileManagedRuntime(cwd, bunExecutable, env, opts.installSpec, plugins, true));
    if (updateMode && steps.some((step) => step.status === "failed")) return finalizeRuntimeResult(steps);
  }

  const consoleStep = plugins.includes('operator')
    ? ensureOperatorConsole(sourceRoot, cwd, bunExecutable, env, (opts.installSpec?.startsWith('repo-harness@') ?? false) || !isCheckoutSource(sourceRoot))
    : { step: 'ensure operator console', status: 'skipped' as const, detail: 'operator plugin not selected' };
  steps.push(consoleStep);
  if (consoleStep.status === 'failed') return finalizeRuntimeResult(steps);

  if (updateMode && opts.installSpec) {
    const daemon = inspectManagedDaemonRuntime(cwd, env, plugins);
    // Package installation succeeded. Shared-daemon maintenance must not roll
    // that candidate back and strand hoisted dependencies at a newer version.
    // The strict installed-runtime verifier above still fails on this state.
    steps.push(daemon.status === 'failed'
      ? { ...daemon, status: 'skipped', detail: `Daemon readiness pending; verified packages retained. ${daemon.detail}` }
      : daemon);
  }

  const architectureConfiguration = configureArchitectureProjection(env, plugins, opts.runtimeLock);
  steps.push(architectureConfiguration);
  if (architectureConfiguration.status === 'failed') return finalizeRuntimeResult(steps);

  if (opts.syncSkill !== false) steps.push(syncRuntimeSkill(sourceRoot, plugins, target, env));
  else steps.push({ step: "sync repo-harness skill runtime", status: "skipped", detail: "disabled" });

  if (opts.hostAdapters !== false) steps.push(installHostAdapters(target, env));
  else steps.push({ step: "install host adapters", status: "skipped", detail: "disabled" });

  steps.push(installAgentFleet(sourceRoot, bunExecutable, env));
  if (updateMode && agentFleetVerified({ steps })) steps.push(recordAgentFleetOwnership(env));

  steps.push({ step: GLOBAL_RULES_REFRESH_STEP, ...applyGlobalContextRefresh(globalRules, homeDir(env)) });
  if (steps.at(-1)?.status === "failed") return finalizeRuntimeResult(steps);

  const refreshExternalSkills = opts.externalSkills === true;
  if (refreshExternalSkills) {
    const waza = installWazaSkills(sourceRoot, target, piSelected, env, updateMode);
    steps.push(waza);
    if (waza.status === "failed") return finalizeRuntimeResult(steps);
    steps.push(waza.status === "ok"
      ? { step: WAZA_RULES_STEP, ...syncWazaSharedRules(homeDir(env), hostIds(target), env, updateMode) }
      : { step: WAZA_RULES_STEP, status: "skipped", detail: "Waza install failed" });
    if (steps.at(-1)?.status === "failed") return finalizeRuntimeResult(steps);
    const mermaid = installMermaidSkill(sourceRoot, target, piSelected, env, updateMode);
    steps.push(mermaid);
    if (mermaid.status === "failed") return finalizeRuntimeResult(steps);
  } else {
    steps.push({ step: "configure Waza skills", status: "skipped", detail: "disabled" });
    steps.push({ step: "configure Mermaid skill", status: "skipped", detail: "disabled" });
  }

  if (opts.obsidianSkills === true && !plugins.includes('strategy-memory')) {
    steps.push({
      step: "configure Obsidian companion Skills",
      status: "failed",
      detail: `--with-obsidian-skills needs the strategy-memory plugin; run: ${installSelectionCommand(withPlugin(plugins, 'strategy-memory'))} --with-obsidian-skills`,
    });
  } else if (opts.obsidianSkills === true) {
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
          piSelected,
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

  if (plugins.includes('cross-review') || plugins.includes('peer-runtime')) {
    steps.push(...syncCrossReviewSkills(sourceRoot, target, env, plugins));
  } else {
    steps.push({ step: "cross-review skills", status: "skipped", detail: "cross-review and peer-runtime plugins not selected" });
  }

  if (opts.brainRoot || plugins.includes('strategy-memory')) steps.push(configureBrain(opts.brainRoot, env, opts.runtimeLock));
  else steps.push({ step: "configure brain root", status: "skipped", detail: "strategy-memory plugin not selected" });

  // CodeGraph follows the architecture plugin; `codegraph` only allows it.
  if (!plugins.includes('architecture')) {
    steps.push({ step: "ensure CodeGraph CLI", status: "skipped", detail: "architecture plugin not selected" });
    steps.push({ step: "configure CodeGraph MCP", status: "skipped", detail: "architecture plugin not selected" });
  } else if (opts.codegraph ?? updateMode) {
    const setup = architecturePort('setup');
    const codegraphPort = architecturePort('codegraph');
    const ensure = isArchitectureUnavailable(setup)
      ? { step: "ensure CodeGraph CLI", status: "failed" as const, detail: setup.message }
      : isArchitectureUnavailable(codegraphPort)
        ? { step: "ensure CodeGraph CLI", status: "failed" as const, detail: codegraphPort.message }
        : ensureCodegraphCli(cwd, bunExecutable, setup.codegraphVersion, env, updateMode);
    steps.push(ensure);
    if (ensure.status === "ok" && !isArchitectureUnavailable(codegraphPort)) steps.push(codegraphPort.configureMcp(cwd, target, env));
    else steps.push({ step: "configure CodeGraph MCP", status: "skipped", detail: "CodeGraph CLI install failed" });
  } else {
    steps.push({ step: "ensure CodeGraph CLI", status: "skipped", detail: "disabled" });
    steps.push({ step: "configure CodeGraph MCP", status: "skipped", detail: "disabled" });
  }

  if (steps.every((step) => step.status !== "failed")) {
    const herdr = loadSkillSurfaceCatalog(sourceRoot).packages.find((pkg) => pkg.name === "herdr");
    if (herdr === undefined) steps.push({ step: HERDR_CORE_STEP, status: "failed", detail: "the skill-surface catalog has no herdr package" });
    else if (!ownerEnabled(herdr.owner, plugins)) steps.push({ step: HERDR_CORE_STEP, status: "skipped", detail: `no selected plugin needs hc (herdr owner ${herdr.owner})` });
    else {
      const hc = ensureHerdrCore({ cwd, env, command: updateMode ? "update" : "install", platform: `${process.platform}-${process.arch}`, minVersion: HC_MIN_VERSION, assets: HC_RELEASE_ASSETS });
      steps.push(hc.step);
      // The directory that this run wrote, never a searched one; the user PATH stays unchanged.
      if (hc.pathEntry !== null) env = { ...env, PATH: [hc.pathEntry, env.PATH].filter(Boolean).join(delimiter) };
    }
  }
  if (steps.every((step) => step.status !== "failed")) steps.push(configureRequiredHerdrSkill(target, env, undefined, piSelected));
  if (steps.every((step) => step.status !== 'failed')) {
    const pi = installPiPackage(bunGlobalPackageRoot(env)!, plugins.includes('pi') && target === 'both' && opts.hostAdapters !== false, env);
    steps.push({ ...pi, ...(pi.created ? { owned_surface: piPackageSurface(pi.source) } : {}) });
  }
  steps.push(writeRuntimeIgnoreRules(env));
  // Only the parent runs the check: the candidate reconciliation fails on any failed step and would roll the update back.
  if (updateMode && opts.candidateHandoff) steps.push(checkMcpLocalConfig(env));
  return finalizeRuntimeResult(steps);
}
