/**
 * `repo-harness doctor` — read-only readiness diagnostics.
 *
 * Built-in checks: PATH resolution, CLI version, per-host install detection,
 * Codex user-level trust state count, and target-aware CodeGraph readiness.
 * Never mutates.
 */

import { bunGlobalPackageRoot, expectedSkillProjections, skillLinkMatches, type SkillProjection } from '../installer/skill-projection';
import { defaultPluginSelection, enabledPlugins, installStateStatus, managedInstallSurfaceIsCurrent, readInstallState, type InstallState } from '../installer/install-profile';
import { installSelectionCommand, type PluginId, type PluginSelection } from '../../core/skill-surface/plugin-manifest';
import { hashManagedTree, installedCopyTreeOptions } from '../../effects/managed-tree';
import { parseSkillSurfaceCatalog } from '../../core/skill-surface/catalog';
import type { SkillProjectionState } from '../../core/skill-surface/projection-state';
import { MIN_PI_VERSION, piVersionSupported, type PiCapability, type PiHostUnavailableCode } from '../../pi/compat';
import { piPackagePresent } from '../installer/pi-package';
import { piExecutable, piExecutableIssue } from '../../effects/pi-executable';
import { probeInstalledPi } from '../../effects/setup/pi-host-probe';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ALL_TARGETS } from '../installer/targets/registry';
import { CLI_VERSION, formatManagedHookProjectionMismatch, inspectManagedProjection } from './status';
import { runSecurityScan, type SecurityScanReport } from './security';
import { isOptIn, resolveRepoRoot } from '../hook/runtime';
import { ROUTES } from '../hook/route-registry';
import { inspectWorkflowMarker } from '../../effects/adoption/workflow-marker';
import { architecturePort, isArchitectureUnavailable, type ArchitectureDoctorCheck } from '../../core/architecture/contracts';
import { globalArchitectureSectionPresent } from '../../effects/configuration/global-configuration';
import { capabilitySourceMode, loadRegistryAuthority, readWorkflowPolicy } from '../../effects/state/resolve-effective-state';
import { readText } from '../../effects/state/collect-state-inputs';

const TRUST_STATE_LINE = /^\[hooks\.state\."[^"]+\/\.codex\/hooks\.json:/;
const PACKAGE_NAME = 'repo-harness';
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIN_CODEX_CLI_VERSION = '0.144.0';
const UPDATE_CHECK_ENV = 'REPO_HARNESS_CHECK_UPDATES';
const LATEST_VERSION_ENV = 'REPO_HARNESS_LATEST_VERSION';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'na';
export type DoctorTarget = 'codex' | 'claude' | 'both';

export interface DoctorCheckResult {
  id: string;
  describe: string;
  status: CheckStatus;
  detail: string;
  /** `skill-projection` only: the typed per-skill judgments that `detail` is generated from. */
  skills?: SkillProjectionRow[];
  /** Parsed host CLI version when measured. */
  version?: string;
  capability?: { state: PiCapability['state']; code?: PiHostUnavailableCode };
}

/** One per-skill judgment of the skill projection check. Paths stay in the CLI text only. */
export interface SkillProjectionRow {
  host: SkillProjection['host'];
  name: string;
  state: SkillProjectionState;
  /** No problem for this skill: an ok state and no install ledger drift. */
  ok: boolean;
}

export interface DoctorCheck {
  id: string;
  describe: string;
  run(): Omit<DoctorCheckResult, 'id' | 'describe'>;
}

/** Plugin checks that the composition root (src/cli/index.ts) passes in. */
export interface DoctorPorts {
  /** The Herdr notify relay check (read-only, one `hc ls`). */
  readonly notifyRelayCheck: () => DoctorCheckResult;
  /** The board attention watcher check of the repository at `cwd` (read-only: `hc ls` and `hc get` of the watcher terminals, then `gh api` for the repository id only when a watcher terminal exists). */
  readonly attentionWatchCheck: (cwd: string) => DoctorCheckResult;
}

export interface DoctorReport {
  checks: DoctorCheckResult[];
  summary: { ok: number; warn: number; fail: number; na: number };
}

const REGISTERED_CHECKS: DoctorCheck[] = [];

export function registerCheck(check: DoctorCheck): void {
  REGISTERED_CHECKS.push(check);
}

/** Test seam — Phase 1C tests reset after each. */
export function clearRegisteredChecks(): void {
  REGISTERED_CHECKS.length = 0;
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

function findCommandOnPath(command: string): string | null {
  const pathValue = process.env.PATH ?? '';
  const pathExt = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of pathExt) {
      const candidate = path.join(dir, `${command}${ext}`);
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        if (process.platform !== 'win32') {
          fs.accessSync(candidate, fs.constants.X_OK);
        }
        return candidate;
      } catch {
        // Keep scanning PATH.
      }
    }
  }
  return null;
}

function checkPath(): DoctorCheckResult {
  const id = 'cli-on-path';
  const describe = 'repo-harness and repo-harness-hook resolvable via PATH';
  const resolved = findCommandOnPath('repo-harness');
  const hook = findCommandOnPath('repo-harness-hook');
  if (resolved && hook) {
    return { id, describe, status: 'ok', detail: `${resolved}; repo-harness-hook: ${hook}` };
  }
  return {
    id,
    describe,
    status: 'warn',
    detail: `${[!resolved && 'repo-harness', !hook && 'repo-harness-hook'].filter(Boolean).join(' and ')} not on PATH; reinstall the repo-harness package. Opted-in repositories require repo-harness-hook.`,
  };
}

export function checkPiHost(env: NodeJS.ProcessEnv = process.env): DoctorCheckResult[] {
  const executable = piExecutable(env);
  const resolutionError = executable ? null : piExecutableIssue(env);
  const checks: DoctorCheckResult[] = [{ id: 'pi-path', describe: 'Pi on PATH', status: resolutionError ? 'fail' : executable ? 'ok' : 'na', detail: resolutionError ?? executable ?? 'pi not found on PATH' }];
  if (!executable) {
    for (const id of ['pi-cli-version', 'pi-capability', 'pi-package']) checks.push({ id, describe: id, status: 'na', detail: resolutionError ?? 'pi not found on PATH' });
    return checks;
  }
  try {
    const { version, ...capability } = probeInstalledPi(executable, env);
    checks.push({ id: 'pi-cli-version', describe: 'Pi CLI version', status: piVersionSupported(version) ? 'ok' : 'fail',
      detail: piVersionSupported(version) ? `${version} >= ${MIN_PI_VERSION}` : `PI_HOST_UNSUPPORTED_VERSION: ${version}; minimum ${MIN_PI_VERSION}`,
      ...(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) ? { version } : {}) });
    checks.push({ id: 'pi-capability', describe: 'Pi path resolver capability', status: capability.state === 'ready' ? 'ok' : 'fail',
      detail: capability.state === 'ready' ? capability.state : `${capability.state}: ${capability.code}`, capability });
  } catch (error) {
    for (const id of ['pi-cli-version', 'pi-capability']) checks.push({ id, describe: id, status: 'fail', detail: (error as Error).message });
  }
  try {
    const source = bunGlobalPackageRoot(env);
    const present = source !== null && piPackagePresent(source, env);
    const directoryMissing = source !== null && !fs.existsSync(source);
    checks.push({ id: 'pi-package', describe: 'Pi repo-harness package entry', status: present && !directoryMissing ? 'ok' : 'warn',
      detail: directoryMissing ? `package directory missing: ${source}; run: repo-harness install`
        : present ? `present: ${source}` : 'missing; run: repo-harness install' });
  } catch (error) {
    checks.push({ id: 'pi-package', describe: 'Pi repo-harness package entry', status: 'fail', detail: String((error as Error).message) });
  }
  return checks;
}

function checkVersion(): DoctorCheckResult {
  return { id: 'cli-version', describe: 'repo-harness CLI version', status: 'ok', detail: CLI_VERSION };
}

const VERSION_SHAPE = /^v?\d+\.\d+\.\d+(?:[-+].*)?$/;

/** Semver precedence of two x.y.z versions, pre-release included; null when either is not one. */
export function compareVersions(a: string, b: string): number | null {
  const left = a.trim();
  const right = b.trim();
  if (!VERSION_SHAPE.test(left) || !VERSION_SHAPE.test(right)) return null;
  return Bun.semver.order(left, right);
}

function checkCodexCliVersion(): DoctorCheckResult {
  const id = 'codex-cli-version';
  const describe = `Codex CLI supports generated GPT-5.6 agent profiles (>= ${MIN_CODEX_CLI_VERSION})`;
  const resolved = findCommandOnPath('codex');
  if (!resolved) {
    return { id, describe, status: 'na', detail: 'codex not found on PATH' };
  }

  const result = spawnSync(resolved, ['--version'], {
    encoding: 'utf-8',
    timeout: 5000,
    env: process.env,
  });
  if (result.status !== 0 || result.error) {
    const error = result.stderr || result.stdout || String(result.error?.message ?? result.error ?? 'codex --version failed');
    return { id, describe, status: 'warn', detail: `path=${resolved}; ${error.trim()}` };
  }

  const output = result.stdout.trim();
  const match = output.match(/^codex-cli (\d+\.\d+\.\d+)$/);
  const version = match?.[1] ?? '';
  const comparison = compareVersions(version, MIN_CODEX_CLI_VERSION);
  if (comparison === null) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `path=${resolved}; unable to parse version from ${JSON.stringify(output)}`,
    };
  }
  if (comparison < 0) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `path=${resolved}; current=${version}; minimum=${MIN_CODEX_CLI_VERSION}`,
      version,
    };
  }
  return {
    id,
    describe,
    status: 'ok',
    detail: `path=${resolved}; current=${version}; minimum=${MIN_CODEX_CLI_VERSION}`,
    version,
  };
}

export function readLatestPackageVersion(env?: NodeJS.ProcessEnv): { version?: string; error?: string } {
  const activeEnv = env ?? process.env;
  if (activeEnv[LATEST_VERSION_ENV]) {
    return { version: activeEnv[LATEST_VERSION_ENV] };
  }

  const result = spawnSync(process.execPath, [
    'pm',
    'view',
    PACKAGE_NAME,
    'version',
    '--json',
    '--registry=https://registry.npmjs.org',
  ], {
    encoding: 'utf-8',
    timeout: 5000,
    cwd: PACKAGE_ROOT,
    env: activeEnv,
  });
  if (result.status !== 0 || result.error) {
    return { error: result.stderr || result.stdout || String(result.error?.message ?? result.error ?? 'npm view failed') };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return { version: typeof parsed === 'string' ? parsed : String(parsed) };
  } catch {
    return { version: result.stdout.trim().replace(/^"|"$/g, '') };
  }
}

function checkCliUpdate(target: DoctorTarget): DoctorCheckResult {
  const id = 'cli-update';
  const describe = 'repo-harness latest version advisory';
  if (process.env[UPDATE_CHECK_ENV] !== '1') {
    return {
      id,
      describe,
      status: 'na',
      detail: `disabled; Agent can run ${UPDATE_CHECK_ENV}=1 repo-harness doctor --json before updating`,
    };
  }

  const latest = readLatestPackageVersion();
  if (!latest.version) {
    return { id, describe, status: 'na', detail: `latest unavailable; ${latest.error ?? 'unknown error'}` };
  }

  const comparison = compareVersions(CLI_VERSION, latest.version);
  if (comparison === null) {
    return { id, describe, status: 'warn', detail: `current=${CLI_VERSION}; latest=${latest.version}; unable to compare versions` };
  }
  if (comparison < 0) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `current=${CLI_VERSION}; latest=${latest.version}; agent_action=repo-harness update --target ${target}`,
    };
  }
  return { id, describe, status: 'ok', detail: `current=${CLI_VERSION}; latest=${latest.version}` };
}

function checkTargetInstall(target: (typeof ALL_TARGETS)[number]): DoctorCheckResult {
  const det = target.detect('global');
  const id = `${target.id}-adapter`;
  const describe = `${target.displayName} global adapter`;
  if (!det.installed) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `${target.displayName} host not detected; install when host is set up`,
    };
  }
  if (!det.alreadyConfigured) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `host detected but repo-harness not installed (run: repo-harness install --target ${target.id} --location global)`,
    };
  }
  const projection = inspectManagedProjection(det.configPath, target.id);
  if (projection.status === 'drift') {
    return {
      id, describe, status: 'warn',
      detail: `projection mismatch: ${projection.mismatches.map(formatManagedHookProjectionMismatch).join('; ')}. Reinstall hooks: repo-harness install --target ${target.id} --location global. Replace hook-lib path callers with repo-harness run <helper>.`,
    };
  }
  return { id, describe, status: 'ok', detail: `installed at ${det.configPath}` };
}

function checkCodexTrustState(): DoctorCheckResult {
  const id = 'codex-trust-state';
  const describe = 'Codex user-level trust hash registration (~/.codex/config.toml)';
  const configPath = path.join(homeDir(), '.codex', 'config.toml');
  if (!fs.existsSync(configPath)) {
    return { id, describe, status: 'na', detail: 'Codex config.toml not found' };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    let count = 0;
    for (const line of raw.split('\n')) {
      if (TRUST_STATE_LINE.test(line)) count++;
    }
    if (count === 0) {
      return {
        id,
        describe,
        status: 'warn',
        detail: 'no user-level trust hashes registered (restart Codex and accept the trust prompt)',
      };
    }
    return {
      id,
      describe,
      status: 'ok',
      detail: `${count} user-level trust hash entries`,
    };
  } catch (err) {
    return { id, describe, status: 'fail', detail: `error reading config.toml: ${(err as Error).message}` };
  }
}

function checkSecurityConfig(report: SecurityScanReport): DoctorCheckResult {
  const id = 'security-config';
  const describe = 'Local hook and VS Code automatic task security scan';
  const reviewed = report.reviewedFindings.length;
  if (report.status === 'ok') {
    return {
      id,
      describe,
      status: 'ok',
      detail: `scanned ${report.scannedFiles.length} files; no active findings${reviewed > 0 ? `; ${reviewed} reviewed exception(s)` : ''}`,
    };
  }

  const high = report.findings.filter((finding) => finding.severity === 'high').length;
  const fail = report.findings.filter((finding) => finding.severity === 'fail').length;
  const warn = report.findings.filter((finding) => finding.severity === 'warn').length;
  const first = report.findings[0];
  return {
    id,
    describe,
    status: report.status === 'fail' ? 'fail' : 'warn',
    detail: `${report.findings.length} finding(s): ${high} high, ${warn} warn, ${fail} fail${reviewed > 0 ? `; ${reviewed} reviewed exception(s)` : ''}; first=${first.ruleId} at ${first.filePath}`,
  };
}

function checkTypedHookRoutes(cwd: string): DoctorCheckResult {
  const id = 'typed-hook-routes';
  const describe = 'Every public hook route has exactly one typed handler';
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) {
    return { id, describe, status: 'na', detail: 'not in a git repository' };
  }
  if (!isOptIn(repoRoot)) {
    return {
      id,
      describe,
      status: 'na',
      detail: 'repo is not opted in (.ai/harness/workflow-contract.json missing)',
    };
  }

  return {
    id,
    describe,
    status: 'ok',
    detail: `all ${ROUTES.length} public routes bind one typed in-process handler`,
  };
}

function skillProjectionState(projection: SkillProjection, contract: Parameters<typeof installedCopyTreeOptions>[1]): SkillProjectionState {
  const { destination, source, name, staged } = projection;
  let stat: fs.Stats;
  try { stat = fs.lstatSync(destination); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
  if (stat.isSymbolicLink()) {
    if (!fs.existsSync(destination)) return 'dangling link';
    return skillLinkMatches(destination, source) ? 'ok link' : 'wrong link';
  }
  if (!stat.isDirectory()) return 'invalid path type';
  if (!fs.existsSync(path.join(source, 'SKILL.md'))) return 'source missing';
  const sourceHash = hashManagedTree(source, installedCopyTreeOptions(name === 'repo-harness' ? 'canonical-skill' : 'command-facade', contract));
  if (hashManagedTree(destination) !== sourceHash) return 'stale copy';
  return staged ? 'unowned real directory' : 'ok copy';
}

/** One per-skill judgment. The public row omits every path; the CLI line adds them. */
interface SkillProjectionJudgment {
  readonly row: SkillProjectionRow;
  readonly projection: SkillProjection;
  readonly ledgerDrift: boolean;
}

/** CLI text projection of one judgment. Only `ok link` names its target. */
function formatSkillProjectionJudgment({ row, projection, ledgerDrift }: SkillProjectionJudgment, selection: PluginSelection): string {
  const { destination, source } = projection;
  // The repair reinstalls the recorded selection on the default target; one broken projection narrows neither.
  const fix = installSelectionCommand(selection);
  const problems: string[] = [];
  if (!row.state.startsWith('ok ')) {
    const preserve = row.state === 'missing' || row.state === 'source missing' ? '' : `preserve or move ${destination}, then `;
    problems.push(`expected ${source}; ${preserve}run: ${fix}`);
  }
  if (ledgerDrift) problems.push(`ledger drift; inspect: repo-harness install --state; then run: ${fix}`);
  const state = row.state === 'ok link' ? `ok link -> ${source}` : row.state;
  return `${destination}: ${state}${problems.length > 0 ? '; ' + problems.join('; ') : ''}`;
}

/** The package root whose catalog and skills the projection check reads. */
export function skillProjectionSourceRoot(env: NodeJS.ProcessEnv = process.env): string {
  const globalRoot = bunGlobalPackageRoot(env);
  return globalRoot && fs.existsSync(path.join(globalRoot, 'package.json')) ? globalRoot : PACKAGE_ROOT;
}

/** Read all selected host projections and the recorded install ownership. */
export function checkSkillProjection(target: DoctorTarget = 'both', env: NodeJS.ProcessEnv = process.env): DoctorCheckResult {
  const id = 'skill-projection';
  const describe = 'Host skills match their source and install ledger';
  try {
    const home = env.HOME ?? env.USERPROFILE ?? os.homedir();
    const installed = readInstallState(env);
    const plugins = judgedPlugins(installed, env);
    // Without a ledger the install default is `all`.
    const selection: PluginSelection = installed?.selection ?? 'all';
    const sourceRoot = skillProjectionSourceRoot(env);
    const contractPath = path.join(sourceRoot, 'assets', 'workflow-contract.v1.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    for (const field of ['installedCopyExcludes', 'installedCopyIncludes']) {
      if (sourceRoot !== PACKAGE_ROOT && contract[field] === undefined) {
        return { id, describe, status: 'warn', detail: `global package contract at ${contractPath} lacks ${field}; run: repo-harness update; then run: repo-harness upgrade` };
      }
    }
    if (!Array.isArray(contract.installedCopyExcludes) || !contract.installedCopyExcludes.every((value: unknown) => typeof value === 'string')) {
      throw new Error('invalid installed copy exclusions');
    }
    const manifestPath = path.join(sourceRoot, 'assets', 'skill-commands', 'manifest.json');
    const catalog = parseSkillSurfaceCatalog(fs.readFileSync(manifestPath, 'utf8'), { declared: true });
    if (catalog.status !== 'valid') throw new Error(`invalid skill catalog: ${manifestPath}`);
    const judgments: SkillProjectionJudgment[] = [];
    const details: string[] = [];
    for (const projection of expectedSkillProjections(catalog.catalog, sourceRoot, home, plugins, env)) {
      if (target !== 'both' && target !== projection.host) continue;
      const state = skillProjectionState(projection, contract);
      const records = installed?.ownership_manifest.filter(surface => surface.path === projection.destination) ?? [];
      // The ledger has no install target, so a single-target install leaves the other hosts' paths absent and unowned.
      // Without a ledger no install sets the hosts, so every projection is judged.
      if (installed && state === 'missing' && records.length === 0) {
        details.push(`${projection.destination}: na; not in the install ledger`);
        continue;
      }
      const ledgerDrift = records.some(surface => !managedInstallSurfaceIsCurrent(surface, env));
      const judgment: SkillProjectionJudgment = {
        row: { host: projection.host, name: projection.name, state, ok: state.startsWith('ok ') && !ledgerDrift },
        projection,
        ledgerDrift,
      };
      judgments.push(judgment);
      details.push(formatSkillProjectionJudgment(judgment, selection));
    }
    let warning = judgments.some(judgment => !judgment.row.ok);
    if (installed) {
      const drift = installStateStatus(installed, env).drift;
      if (drift.status === 'drift') warning = true;
      details.push(`install ledger: ${JSON.stringify(drift)}${drift.status === 'drift' ? `; inspect: repo-harness install --state; run: ${installSelectionCommand(selection)}` : ''}`);
    } else {
      warning = true;
      details.push('install ledger: missing; run: repo-harness install');
    }
    return { id, describe, status: warning ? 'warn' : 'ok', detail: details.join('\n'), skills: judgments.map(judgment => judgment.row) };
  } catch (error) {
    return { id, describe, status: 'fail', detail: `${String((error as Error).message ?? error)}; inspect: repo-harness install --state` };
  }

}

/**
 * Loads the repository capability authority with this installed runtime,
 * through the selected authority. A model that this runtime cannot
 * parse fails here and not only in every hook. Node files that exist are not
 * proof that they load.
 */
function checkCapabilityRegistry(cwd: string): DoctorCheckResult {
  const id = 'capability-registry';
  const describe = 'This repo-harness runtime loads the repository capability model';
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) return { id, describe, status: 'na', detail: 'not in a git repository' };
  if (!isOptIn(repoRoot)) {
    return { id, describe, status: 'na', detail: 'repo is not opted in (.ai/harness/workflow-contract.json missing)' };
  }
  // A declared newer minimum explains a parse error before the parser reports it.
  const gate = inspectWorkflowMarker(repoRoot);
  if (gate) return { id, describe, status: 'fail', detail: gate.message };
  const next = `Next: run repo-harness run capability-resolver validate --repo ${repoRoot} --format text; fix the model, or run repo-harness update when the model uses a shape that this runtime cannot read.`;
  try {
    const policy = readWorkflowPolicy(repoRoot);
    const mode = capabilitySourceMode(policy);
    const readSource = (relPath: string) => readText(repoRoot, relPath);
    const ownership = mode === 'archcontext' ? architecturePort('ownership') : null;
    if (ownership && isArchitectureUnavailable(ownership)) return { id, describe, status: 'fail', detail: `${mode} authority does not load: ${ownership.message}. ${next}` };
    const resolution = ownership
      ? ownership.readAuthority(repoRoot)
      : loadRegistryAuthority(repoRoot, policy, readSource);
    if (resolution.status === 'absent') return { id, describe, status: 'na', detail: 'no capability registry is declared' };
    if (resolution.status === 'invalid') {
      return { id, describe, status: 'fail', detail: `${mode} authority does not load: ${resolution.diagnostics.map((entry) => entry.message).join('; ')}. ${next}` };
    }
    return { id, describe, status: 'ok', detail: `${mode} authority loads ${resolution.registry.capabilities.length} capabilities` };
  } catch (error) {
    return { id, describe, status: 'fail', detail: `${(error as Error).message}. ${next}` };
  }
}

function checkLegacyWorkflowState(cwd: string): DoctorCheckResult {
  const id = 'legacy-workflow-state';
  const describe = 'Repository keeps no legacy operator library copy';
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) return { id, describe, status: 'na', detail: 'not in a git repository' };
  const legacy = path.join(repoRoot, '.ai/hooks/lib/workflow-state.sh');
  try {
    fs.lstatSync(legacy);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { id, describe, status: 'ok', detail: 'no legacy workflow-state.sh copy' };
    }
    return { id, describe, status: 'warn', detail: `cannot inspect ${legacy}: ${String(error)}` };
  }
  return {
    id, describe, status: 'warn',
    detail: `Legacy copy: ${legacy}. The package no longer ships an operator library. Change callers to repo-harness run <helper>. Test callers, back up the copy, then remove it manually. Keep edited copies until their changes are reviewed. Init and upgrade preserve this file.`,
  };
}

/** The ledger's plugins; without a ledger no install chose a selection, so the install default. */
function judgedPlugins(installed: InstallState | null, env: NodeJS.ProcessEnv): readonly PluginId[] {
  return installed ? enabledPlugins(installed) : defaultPluginSelection('both', env).plugins;
}

/**
 * The CodeGraph readiness, MCP host and index checks, in report order, from
 * the CodeGraph port. CodeGraph follows the architecture plugin, so
 * without it one `na` row stands for them and nothing runs.
 */
export function codegraphDoctorChecks(cwd: string): readonly ArchitectureDoctorCheck[] {
  const port = architecturePort('codegraph');
  if (isArchitectureUnavailable(port)) {
    return [{ id: 'codegraph', describe: 'CodeGraph checks', status: port.code === 'ARCHITECTURE_PLUGIN_NOT_SELECTED' ? 'na' : 'fail', detail: port.message }];
  }
  return port.checks(cwd);
}

/** Only an unselected plugin has this row: the host projection section stays inert, and the row says whether it exists. */
export function checkArchitectureProjectionSelection(env: NodeJS.ProcessEnv): DoctorCheckResult[] {
  const setup = architecturePort('setup');
  if (!isArchitectureUnavailable(setup) || setup.code !== 'ARCHITECTURE_PLUGIN_NOT_SELECTED') return [];
  const id = 'architecture-projection';
  const describe = 'Host architecture projection configuration';
  try {
    const section = globalArchitectureSectionPresent(env);
    return [{ id, describe, status: 'na', detail: `${section.present ? `configured, not selected (${section.path})` : 'not selected'}; ${setup.message}` }];
  } catch (error) {
    return [{ id, describe, status: 'warn', detail: `${(error as Error).message}; ${setup.message}` }];
  }
}

export function runDoctor(ports: DoctorPorts, cwd: string = process.cwd(), target: DoctorTarget = 'both'): DoctorReport {
  const checks: DoctorCheckResult[] = [];
  const codegraphChecks = codegraphDoctorChecks(cwd);
  const securityReport = runSecurityScan({ cwd });
  checks.push(checkPath());
  checks.push(checkVersion());
  checks.push(checkSkillProjection(target));
  checks.push(checkCodexCliVersion());
  if (target === 'both') checks.push(...checkPiHost());
  checks.push(checkCliUpdate(target));
  for (const target of ALL_TARGETS) {
    if (target.supportsLocation('global')) {
      checks.push(checkTargetInstall(target));
    }
  }
  checks.push(checkCodexTrustState());
  checks.push(...codegraphChecks);
  checks.push(...checkArchitectureProjectionSelection(process.env));
  checks.push(checkSecurityConfig(securityReport));
  checks.push(checkTypedHookRoutes(cwd));
  checks.push(checkCapabilityRegistry(cwd));
  checks.push(checkLegacyWorkflowState(cwd));
  checks.push(ports.notifyRelayCheck());
  checks.push(ports.attentionWatchCheck(cwd));
  for (const plugin of REGISTERED_CHECKS) {
    const r = plugin.run();
    checks.push({ id: plugin.id, describe: plugin.describe, ...r });
  }
  const summary = { ok: 0, warn: 0, fail: 0, na: 0 };
  for (const c of checks) summary[c.status]++;
  return { checks, summary };
}

export function formatDoctor(report: DoctorReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines: string[] = [];
  for (const c of report.checks) {
    const icon = c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : c.status === 'fail' ? '✗' : '-';
    lines.push(`${icon} ${c.id}: ${c.detail}`);
  }
  lines.push('');
  lines.push(
    `Summary: ${report.summary.ok} ok, ${report.summary.warn} warn, ${report.summary.fail} fail, ${report.summary.na} n/a`,
  );
  return lines.join('\n');
}
