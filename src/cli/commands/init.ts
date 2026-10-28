import { bunGlobalPackageRoot, isBunGlobalPackageSource, skillLinkMatches } from "../installer/skill-projection";
import { readGlobalArchitectureConfiguration } from '../../effects/architecture/projection-config';
import { inspectArchitectureProjectionReadiness } from '../../effects/architecture/archctx-provider';
/**
 * Existing-repo harness adoption implementation.
 *
 * This backs the public `repo-harness init` command and
 * `repo-harness-setup`'s init mode: default the target repo to cwd, apply the
 * repo-local workflow migration, register the repo, then verify the installed
 * harness. Under HOME, init writes only the registry entry and, during verify,
 * the global Codex handoff packet. Install-managed host files belong to the
 * locked `install`/`update` transaction; init only reports what is missing.
 */

import { homedir, userInfo } from "os";
import { spawnSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  lstatSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { InstallTargetSpec } from "./install";
import {
  hostSkillPlacements as catalogHostSkillPlacements,
  parseSkillSurfaceCatalog,
  probeExpectations as catalogProbeExpectations,
  type SkillSurfaceCatalog,
} from "../../core/skill-surface/catalog";
import { hostSkillRoot } from "../../effects/host-skill-roots";
import { skillTreeSha256 } from "../../effects/skill-tree-integrity";
import { beginInstallHostTransaction, commitInstallHostTransaction, rollbackInstallHostTransaction, managedInstallSurfaceIsCurrent, readInstalledProfile, PROFILE_COMPONENTS } from "../installer/install-profile";
import { ensureCodegraph } from "../tools/codegraph";
import { runProcess as runBoundedProcess } from "../../effects/process-runner";
import { validateRepoAdoptionTarget } from "../repo-adoption/target";
import { runAdoptionApply, runAdoptionPlan } from "./adoption-plan";
import type { AdoptionMode } from "../../core/adoption/modes";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..", "..");

/**
 * Host-scoped skills bundled under `assets/skills/<skill>`. The cross-review
 * skill is host-aware; task-agent owns persistent plan consultation.
 */
type BundledHostSkill = { skill: string; host: "claude" | "codex"; step: string };

/**
 * Reads and parses sourceRoot's skill-surface manifest. Parameterized by
 * sourceRoot (not a fixed path) because this command backs `repo-harness
 * init`, which can target a package tree other than the currently-running
 * code (npx cache extraction, a different installed copy); tests routinely
 * override sourceRoot to a synthetic fixture tree for hermetic runs. Does
 * not pass an `exists` callback (pre-catalog behavior here never checked
 * package source paths on disk either), so behavior stays byte-identical to
 * the literals it replaces.
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

/**
 * The unconditional (no installed-profile concept in this init flow)
 * cross-review/external-brain bundle: repo-harness-cross-review on both
 * claude and codex (host-aware provider mode selection lives inside the
 * package). Step-name prefix mirrors the
 * catalog's cross-model-acceptance vs. adaptive-workflow component split
 * (the same split that separates "cross-review skill" from "external-brain
 * skill" naming below).
 */
function crossReviewSkillsFromCatalog(catalog: SkillSurfaceCatalog): ReadonlyArray<BundledHostSkill> {
  const crossModel = new Set(catalogProbeExpectations(catalog).crossModel);
  const placements = catalogHostSkillPlacements(catalog);
  const entries: BundledHostSkill[] = [];
  for (const host of ["claude", "codex"] as const) {
    for (const skill of placements[host]) {
      const step = crossModel.has(skill) ? `cross-review skill ${skill}` : `external-brain skill ${skill}`;
      entries.push({ skill, host, step });
    }
  }
  return entries;
}

export interface InitCommandOptions {
  repo?: string;
  sourceRoot?: string;
  apply?: boolean;
  verify?: boolean;
  codegraph?: boolean;
  syncCodegraph?: boolean;
  target?: InstallTargetSpec;
  mode?: AdoptionMode;
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

/** Internal dependency seam for filesystem-isolated tests. CLI callers use the OS account resolver. */
export interface InitRuntimeDependencies {
  authorityHome: () => string | null;
}

function runProcess(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): InitStep {
  const result = runBoundedProcess(command, args, { cwd, env });

  return {
    step: "",
    status: result.ok ? "ok" : "failed",
    command: [...result.command],
    stdout: result.stdout,
    stderr: result.stderr || result.error,
  };
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

function hostIds(target: InstallTargetSpec): Array<"codex" | "claude"> {
  if (target === "codex") return ["codex"];
  if (target === "claude") return ["claude"];
  return ["claude", "codex"];
}

function homeDir(env?: NodeJS.ProcessEnv): string | null {
  return env?.HOME ?? env?.USERPROFILE ?? process.env.HOME ?? process.env.USERPROFILE ?? homedir() ?? null;
}

/**
 * Adopted repos route agent collaboration through Herdr. The skill is a host
 * projection owned by the locked install/update transaction, so init only
 * reads it and names the command that projects it.
 */
function requiredHerdrSkillReadiness(target: InstallTargetSpec, env?: NodeJS.ProcessEnv): InitStep {
  const step = "required Herdr skill";
  const home = homeDir(env);
  const missing = hostIds(target).filter((host) =>
    !home || !existsSync(join(hostSkillRoot(home, host, env ?? process.env), "herdr", "SKILL.md")));
  if (missing.length === 0) return { step, status: "ok", detail: "present" };
  return {
    step,
    status: "skipped",
    detail: `missing for ${missing.join(",")}; run: repo-harness update --target ${target}`,
  };
}

export function resolveOsAccountHome(): string | null {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (process.platform === "darwin" && uid !== undefined) {
    const identity = spawnSync("/usr/bin/id", ["-un", String(uid)], { encoding: "utf-8" });
    const username = identity.status === 0 ? identity.stdout.trim() : "";
    if (!/^[A-Za-z0-9._-]+$/.test(username)) return null;
    const directory = spawnSync("/usr/bin/dscl", [".", "-read", `/Users/${username}`, "NFSHomeDirectory"], { encoding: "utf-8" });
    const match = directory.status === 0 ? directory.stdout.match(/^NFSHomeDirectory:\s*(.+)$/m) : null;
    return match?.[1]?.trim() || null;
  }
  if (process.platform === "linux" && uid !== undefined) {
    for (const getent of ["/usr/bin/getent", "/bin/getent"]) {
      if (!existsSync(getent)) continue;
      const account = spawnSync(getent, ["passwd", String(uid)], { encoding: "utf-8" });
      const accountHome = account.status === 0 ? account.stdout.trim().split(":")[5] : "";
      if (accountHome) return accountHome;
    }
    const account = readFileSync("/etc/passwd", "utf-8")
      .split("\n")
      .find((line) => line.split(":")[2] === String(uid));
    return account?.split(":")[5] || null;
  }
  return userInfo().homedir || null;
}

const DEFAULT_INIT_RUNTIME_DEPENDENCIES: InitRuntimeDependencies = { authorityHome: resolveOsAccountHome };

export { validateRepoAdoptionTarget } from "../repo-adoption/target";

/**
 * Install each bundled skill into its one declared host. Respects `target`, is
 * idempotent (identical SKILL.md → "already present"), and treats a missing
 * bundled source as `skipped`.
 */
function syncBundledItemsAtHome(
  sourceRoot: string,
  target: InstallTargetSpec,
  home: string | null,
  skills: ReadonlyArray<BundledHostSkill>,
  env?: NodeJS.ProcessEnv,
): InitStep[] {
  const steps: InitStep[] = [];
  const installed = home ? readInstalledProfile({ ...env, HOME: home }) : null;
  const globalRoot = bunGlobalPackageRoot(env);
  const globalSource = isBunGlobalPackageSource(sourceRoot, env);
  const useLinks = globalSource
    && (env ?? process.env).AGENTIC_DEV_LINK_INSTALLED_COPIES !== '0';
  for (const { skill, host, step } of skills) {
    if (target !== "both" && target !== host) continue;
    if (!home) {
      steps.push({ step, status: "failed", detail: "HOME is required to resolve host skill roots" });
      continue;
    }
    const source = join(sourceRoot, "assets", "skills", skill);
    const srcSkill = join(source, "SKILL.md");
    if (!existsSync(srcSkill)) {
      steps.push({ step, status: "skipped", detail: `bundled source not found at ${source}` });
      continue;
    }
    const root = hostSkillRoot(home, host, env ?? process.env);
    const dest = join(root, skill);
    const destSkill = join(dest, "SKILL.md");
    mkdirSync(root, { recursive: true });
    const correctGlobalLink = globalRoot !== null
      && skillLinkMatches(dest, join(globalRoot, 'assets', 'skills', skill));
    // Keep user links to the current checkout. Discovery does not own them.
    // A stable installed link remains valid when init runs from another source.
    if ((!globalSource && skillLinkMatches(dest, source))
      || (correctGlobalLink && (!globalSource || useLinks))) {
      steps.push({ step, status: 'ok', detail: 'already present' });
      continue;
    }
    let stat: ReturnType<typeof lstatSync> | null = null;
    try { stat = lstatSync(dest); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const identicalCopy = stat?.isDirectory() === true
      && existsSync(destSkill) && skillTreeSha256(dest) === skillTreeSha256(source);
    if (!useLinks && identicalCopy) {
      steps.push({ step, status: 'ok', detail: 'already present' });
      continue;
    }
    if (stat) {
      const owned = installed?.ownership_manifest.find(surface => surface.path === dest);
      if (!correctGlobalLink && !identicalCopy && (!owned || !managedInstallSurfaceIsCurrent(owned))) {
        steps.push({ step, status: 'failed', detail: `refusing to overwrite unowned or modified skill at ${dest}; preserve or move this path, then run: repo-harness install --target ${host}` });
        continue;
      }
    }
    const transaction = beginInstallHostTransaction([dest], { HOME: home });
    try {
      if (stat) rmSync(dest, { recursive: true });
      if (useLinks) symlinkSync(join(globalRoot!, 'assets', 'skills', skill), dest, 'dir');
      else cpSync(source, dest, { recursive: true });
      commitInstallHostTransaction(transaction);
      steps.push({ step, status: 'ok', detail: `synced ${dest}` });
    } catch (error) {
      rollbackInstallHostTransaction(transaction);
      steps.push({ step, status: 'failed', detail: `cannot update bundled skill ${dest}: ${String(error)}` });
    }
  }
  return steps;
}

export function syncCrossReviewSkills(
  sourceRoot: string,
  target: InstallTargetSpec,
  env?: NodeJS.ProcessEnv,
): InitStep[] {
  const catalog = loadSkillSurfaceCatalog(sourceRoot);
  return syncBundledItemsAtHome(sourceRoot, target, homeDir(env), crossReviewSkillsFromCatalog(catalog), env);
}

export function runInit(
  opts: InitCommandOptions = {},
  dependencies: InitRuntimeDependencies = DEFAULT_INIT_RUNTIME_DEPENDENCIES,
): InitCommandResult {
  const sourceRoot = resolve(opts.sourceRoot ?? REPO_ROOT);
  const repoRoot = resolve(opts.repo ?? process.cwd());
  const commandEnv = opts.env;
  const apply = opts.apply !== false;
  const verify = opts.verify !== false;
  const codegraph = opts.codegraph !== false;
  const syncCodegraph = opts.syncCodegraph === true;
  const target = opts.target ?? "both";
  const mode = opts.mode ?? "standard";
  const steps: InitStep[] = [];

  const targetError = validateRepoAdoptionTarget(repoRoot, opts.repo !== undefined, commandEnv);
  if (targetError) {
    const steps = [targetError];
    return {
      exitCode: 2,
      repoRoot,
      steps,
      lines: steps.flatMap(renderStep),
    };
  }

  steps.push(requiredHerdrSkillReadiness(target, commandEnv));

  const adoptionApply = apply
    ? runAdoptionApply({ repo: repoRoot, mode, explicitRepo: true, env: commandEnv })
    : undefined;
  const adoption = adoptionApply ?? runAdoptionPlan({ repo: repoRoot, mode, explicitRepo: true, env: commandEnv });
  const migrate: InitStep = {
    step: apply ? "apply repo harness" : "plan repo harness",
    status: adoption.exitCode === 0 ? "ok" : "failed",
    detail: repoRoot,
    stdout: adoption.output,
  };
  steps.push(migrate);

  const registration = adoptionApply?.report.registration;
  if (apply && migrate.status === "ok" && registration) {
    steps.push({
      step: "register repo harness repo",
      status: registration.registered ? "ok" : "skipped",
      detail: registration.registered ? registration.path : registration.reason,
    });
  } else {
    steps.push({
      step: "register repo harness repo",
      status: "skipped",
      detail: apply ? "repo harness did not apply cleanly or registry effect was unavailable" : "dry-run",
    });
  }

  if (codegraph && apply) {
    try {
      const cg = ensureCodegraph({ repoRoot, init: true, sync: syncCodegraph, env: commandEnv, host: target });
      const failedActions = cg.actions.filter((entry) => entry.status === "failed");
      const indexReady = cg.projectIndexStatus === "up-to-date";
      const cgFailed = failedActions.length > 0 || !indexReady;
      const actionDetail = cg.actions.map((entry) => `${entry.action}:${entry.status}`).join(", ");
      const indexDetail = `index ${cg.projectIndexStatus}`;
      const indexRemediation = cg.projectIndexStatus === "unavailable" && cg.resolution.source === "missing"
        ? `install with: ${cg.remediation.installCommand}; then run: ${cg.remediation.initCommand} && ${cg.remediation.syncCommand}`
        : cg.projectIndexStatus === "unavailable" || cg.projectIndexStatus === "unknown"
          ? `inspect with: ${cg.remediation.projectIndexCommand}`
          : cg.projectIndexStatus === "stale"
            ? `run: ${cg.remediation.syncCommand}`
            : `run: ${cg.remediation.initCommand} && ${cg.remediation.syncCommand}`;
      const failureDetail = [
        ...failedActions.map((entry) => entry.stderr || `${entry.action} failed`),
        ...(!indexReady
          ? [`CodeGraph is enabled, but the project index is ${cg.projectIndexStatus}; ${indexRemediation}`]
          : []),
      ].filter(Boolean).join("\n");
      steps.push({
        step: "ensure codegraph index",
        status: cgFailed ? "failed" : cg.actions.length === 0 ? "skipped" : "ok",
        detail: actionDetail ? `${actionDetail}; ${indexDetail}` : indexDetail,
        stderr: failureDetail || undefined,
      });

      const mcpHosts =
        (cg.raw as { mcp_hosts?: Record<string, { status?: string }> }).mcp_hosts ?? {};
      const mcpConfigured =
        cg.resolution.source !== "missing" &&
        ["codex", "claude"].every((host) => mcpHosts[host]?.status === "configured");

      if (cg.resolution.source !== "missing" && !mcpConfigured) {
        steps.push({
          step: "codegraph mcp",
          status: "skipped",
          detail:
            "not registered; run: repo-harness tools configure codegraph --target both --location global",
        });
      }
    } catch (error) {
      steps.push({
        step: "ensure codegraph index",
        status: "failed",
        detail: "CodeGraph readiness check failed",
        stderr: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    steps.push({
      step: "ensure codegraph index",
      status: "skipped",
      detail: codegraph ? "dry-run" : "disabled",
    });
  }

  if (apply && verify) {
    const verifyEnv = { ...(commandEnv ?? process.env), REPO_HARNESS_SOURCE_ROOT: sourceRoot };
    if (migrate.status === "ok") {
      const handoff = runProcess(
        "bun",
        [join(REPO_ROOT, "src/cli/index.ts"), "run", "prepare-codex-handoff", "--reason", "repo-harness-init-verify"],
        repoRoot,
        verifyEnv,
      );
      steps.push(
        withStepName(
          handoff,
          "refresh handoff packet",
          "repo-harness run prepare-codex-handoff --reason repo-harness-init-verify",
        ),
      );
    }
    const verifyStep = runProcess("bun", [join(REPO_ROOT, "src/cli/index.ts"), "run", "check-context-files"], repoRoot, verifyEnv);
    steps.push(withStepName(verifyStep, "verify repo harness", "repo-harness run check-context-files"));
  } else {
    steps.push({ step: "verify repo harness", status: "skipped" });
  }

  if (apply && adoption.exitCode === 0 && mode !== 'minimal') {
    try {
      const { initialized } = readGlobalArchitectureConfiguration(commandEnv);
      const readiness = inspectArchitectureProjectionReadiness(repoRoot, { env: commandEnv });
      const provider = readiness.projectionProvider;
      steps.push({
        step: 'architecture projection readiness',
        status: !initialized ? 'skipped' : provider.state === 'ready' || provider.state === 'disabled' ? 'ok' : 'failed',
        detail: !initialized ? 'global architecture is not initialized; run repo-harness update once for this account' : provider.state === 'ready' && !readiness.apply.enabled
          ? readiness.next
            ? `global provider ready; ${readiness.next}`
            : 'global provider ready; global architecture.projection_apply=disabled'
          : provider.reason,
      });
    } catch (error) {
      steps.push({ step: 'architecture projection readiness', status: 'failed', detail: error instanceof Error ? error.message : String(error) });
    }
  }

  const failed = steps.some((step) => step.status === "failed");
  return {
    exitCode: failed ? 1 : 0,
    repoRoot,
    steps,
    lines: steps.flatMap(renderStep),
  };
}
