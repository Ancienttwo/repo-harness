/** Stop renders the recovery views; it never grants publication permission. */
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { execFileSync } from 'child_process';
import { publishCheckpointFromLedger } from '../../effects/evidence/checkpoint-store';
import {
  buildRecoveryContext,
  renderRecoveryHandoff,
  renderRecoveryResume,
  resolveRecoveryEvidence,
} from '../../effects/evidence/recovery-materializer';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import { resolveCapabilityOwnership } from '../../effects/state/resolve-effective-state';
import { payloadValue, type HookIdentity, type HookPayload } from './hook-input';
import { owedCapabilities, renderOwedCapabilities } from '../../effects/state/owed-capabilities';

export type StopCollector = Pick<StateInputCollector, 'getRepoRoot' | 'getWorktreeOwnership' | 'getActivePlanMarker'>;

export interface StopProjectionTarget {
  /** `owed-signal` is the delivery marker of the owed-architecture line; it is not a projection phase. */
  readonly kind: 'handoff' | 'resume' | 'owed-signal';
  readonly path: string;
}

export interface StopHandlerDependencies {
  readonly now?: () => Date;
  readonly observeProjectionWrite?: (target: StopProjectionTarget) => void;
  /** Narrow post-commit fault/observation seam; never driven by an env flag. */
  readonly afterProjectionWrite?: (target: StopProjectionTarget) => void;
}

export interface StopHandlerInput {
  readonly collector: StopCollector;
  readonly payload: HookPayload;
  readonly identity: HookIdentity;
  readonly env?: NodeJS.ProcessEnv;
  readonly dependencies?: StopHandlerDependencies;
}

export interface StopHandlerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function assertSafeRepoWritePath(repoRoot: string, path: string): void {
  const root = resolve(repoRoot);
  const target = resolve(path);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`stop-handler: write path escapes repository: ${path}`);
  }
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) continue;
    const entry = lstatSync(current);
    if (entry.isSymbolicLink()) throw new Error(`stop-handler: symlinked write path is forbidden: ${current}`);
    if (current !== target && !entry.isDirectory()) {
      throw new Error(`stop-handler: non-directory write ancestor: ${current}`);
    }
  }
}

function atomicWrite(repoRoot: string, path: string, content: string): void {
  assertSafeRepoWritePath(repoRoot, path);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    assertSafeRepoWritePath(repoRoot, temporary);
    writeFileSync(temporary, content, { mode: 0o600 });
    assertSafeRepoWritePath(repoRoot, path);
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // No temporary file was committed, or another fault already removed it.
    }
    throw error;
  }
}

/** Writes handoff then resume; each write replaces the whole file, so a retry converges. */
function writeRecoveryViews(
  repoRoot: string,
  activePlan: string | null,
  env: NodeJS.ProcessEnv,
  identity: HookIdentity,
  now: Date,
  dependencies: StopHandlerDependencies,
): void {
  const context = buildRecoveryContext(repoRoot, activePlan, env, { reason: 'session-stop', now: () => now, runId: identity.runId });
  const evidence = resolveRecoveryEvidence(repoRoot);
  const contractPath = context.artifacts.contract;
  const views: readonly [StopProjectionTarget, string][] = [
    [{ kind: 'handoff', path: context.paths.handoff }, renderRecoveryHandoff(context, evidence, contractPath)],
    [{ kind: 'resume', path: context.paths.resume }, renderRecoveryResume(context, evidence, contractPath)],
  ];
  for (const [target, content] of views) {
    atomicWrite(repoRoot, join(repoRoot, target.path), content);
    dependencies.observeProjectionWrite?.(target);
    dependencies.afterProjectionWrite?.(target);
  }
}

const OWED_SIGNAL_MARKER = '.ai/harness/state/stop-owed-signal';

/**
 * The owed-architecture line for Claude Stop, once per branch, manifest change
 * and owed set.
 * Stop additionalContext continues the turn, so the marker keeps a repeated
 * Stop from asking again; `stop_hook_active` already ended this run earlier.
 * Codex Stop stays silent. Architecture diagnostics never block, so any
 * failure only drops the line.
 */
function owedStopSignal(
  repoRoot: string,
  host: HookIdentity['host'],
  observeWrite?: (target: StopProjectionTarget) => void,
): string {
  if (host !== 'claude') return '';
  try {
    const ownership = resolveCapabilityOwnership(repoRoot);
    if (!ownership) return '';
    const owed = owedCapabilities(repoRoot, ownership);
    const content = renderOwedCapabilities(owed);
    if (!content || !owed) return '';
    const branch = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000,
    }).trim();
    // The manifest change bounds one obligation: after a projection refresh,
    // a new change to the same capability is a new owed set.
    const key = createHash('sha256').update(JSON.stringify([
      branch,
      owed.manifest_change,
      owed.capabilities.map((capability) => capability.id),
    ])).digest('hex');
    const marker = join(repoRoot, OWED_SIGNAL_MARKER);
    if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === key) return '';
    atomicWrite(repoRoot, marker, `${key}\n`);
    observeWrite?.({ kind: 'owed-signal', path: OWED_SIGNAL_MARKER });
    return `${content}\n`;
  } catch {
    return '';
  }
}

/**
 * Stop publishes the evidence checkpoint and renders handoff.md and resume.md.
 * A recovery write that would leave the repository or follow a symlink throws.
 */
export function runStopHandler(opts: StopHandlerInput): StopHandlerResult {
  const repoRoot = opts.collector.getRepoRoot();
  const env = opts.env ?? process.env;
  const dependencies = opts.dependencies ?? {};
  const now = dependencies.now?.() ?? new Date();
  const stopHookActive = payloadValue(opts.payload, 'stop_hook_active');
  if (stopHookActive === true || stopHookActive === 'true') {
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  const ownership = opts.collector.getWorktreeOwnership();
  const activePlan = ownership.owner === null || ownership.ownedByCurrent
    ? opts.collector.getActivePlanMarker() : null;
  // The views name the checkpoint they read, so a failed publish renders the
  // last published one.
  try { publishCheckpointFromLedger(repoRoot, () => now); } catch { /* see above */ }
  writeRecoveryViews(repoRoot, activePlan, env, opts.identity, now, dependencies);
  return { exitCode: 0, stdout: owedStopSignal(repoRoot, opts.identity.host, dependencies.observeProjectionWrite), stderr: '' };
}
