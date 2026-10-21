import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchitectureDebtReportV1 } from 'archctx-contracts';
import type { CapabilityOwnership } from '../../core/state/types';
import { ARCHCONTEXT_MANIFEST, ArchctxClientError, capabilitySource, checkpointArchitectureDebt, type ArchctxProviderOptions } from '../../effects/architecture/archctx-provider';
import { readGlobalArchitectureConfiguration } from '../../effects/architecture/projection-config';
import { assertSafeRepoWritePath, writeHookStateFile } from '../../effects/hook-state-file';
import { boundedHookDiagnostic } from './hook-protocol';

const MARKER = '.ai/harness/state/agent-notice';
const STATUS_MARKER = '.ai/harness/state/agent-notice-status';
const COMMAND = 'repo-harness architecture-debt --json';
const STATUS_COMMAND = 'repo-harness architecture-projection status --json';
const MAX_BYTES = 800;
const MAX_MESSAGE_BYTES = 200;
// The codes that archctx 0.9.0 checkpoint and package resolution throw for a setup step
// that the operator has not done. They are not faults.
const INACTIVE_CODES: ReadonlySet<string> = new Set([
  'AC_MODEL_ADOPTION_REQUIRED', 'AC_CODE_FACTS_UNAVAILABLE', 'AC_CODE_FACTS_NOT_READY', 'RH_ARCHCTX_PACKAGE_MISSING',
]);
const REGISTRY_FILE = '.ai/context/capabilities.json';
const singleLine = (text: string) => text.replace(/[\r\n\t]+/g, ' ');
const clip = (text: string, bytes: number) => Buffer.from(text).subarray(0, bytes).toString('utf8').replace(/\uFFFD$/u, '');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const errorText = (error: unknown) => singleLine(error instanceof Error ? error.message : String(error));
const noticeItems = (report: ArchitectureDebtReportV1) => report.items.filter(item => ['unowned-path', 'ambiguous-owner', 'stale-anchor'].includes(item.kind));

export interface AgentNotice {
  readonly content?: string;
  readonly systemMessage?: string;
  readonly diagnostics?: string;
}

export interface NoticeBlock {
  readonly content: string;
  readonly systemMessage: string;
}

type Status =
  | { readonly kind: 'active' }
  | { readonly kind: 'disabled' }
  | { readonly kind: 'inactive'; readonly cause: string }
  | { readonly kind: 'failure'; readonly error: unknown };

interface Observation {
  readonly status: Status;
  readonly unowned: { readonly paths: readonly string[]; readonly block: NoticeBlock } | null;
  readonly debt: { readonly branch: string; readonly ids: readonly string[]; readonly block: NoticeBlock } | null;
}

/** Up to three rows and an exact overflow count. The overflow line is never cut. */
function boundedBlock(header: string, rows: readonly string[], total: number, overflow: (count: number) => string): string {
  const lines: string[] = [];
  for (const row of rows.slice(0, 3)) {
    const remainder = total - lines.length - 1;
    const candidate = [header, ...lines, row, ...(remainder > 0 ? [overflow(remainder)] : [])].join('\n');
    if (Buffer.byteLength(candidate, 'utf8') > MAX_BYTES) break;
    lines.push(row);
  }
  const more = total - lines.length;
  const content = [header, ...lines, ...(more > 0 ? [overflow(more)] : [])].join('\n');
  // An upstream identifier can exceed the entire budget. Keep the command intact.
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) throw new Error('architecture notice identity exceeds the output budget');
  return content;
}

/** The checkpoint fallback has no severity or base classification. Only scoped ownership and citation debt reaches this renderer. */
export function renderAgentNotice(report: ArchitectureDebtReportV1): NoticeBlock | null {
  const items = noticeItems(report);
  if (items.length === 0) return null;
  const itemCapabilities = items.map(item => item.capabilityIds.length > 0 ? item.capabilityIds : [report.scope.capabilityIds[0] ?? 'unowned']);
  const capabilities = [...new Set(itemCapabilities.flat())];
  const rest = capabilities.length > 1 ? ` (+${capabilities.length - 1} capabilities)` : '';
  const capability = `${singleLine(capabilities[0]!)}${rest}`;
  const rows = items.slice(0, 3).map(item => {
    const field = typeof item.details.modelField === 'string' ? item.details.modelField
      : item.details.origin === 'node-summary' ? 'summary'
      : item.details.origin === 'node-responsibility' ? `responsibilities[${item.details.responsibilityIndex}]`
      : 'human citations';
    return `- ${item.kind} ${singleLine(item.capabilityIds[0] ?? report.scope.capabilityIds[0] ?? 'unowned')}; ${singleLine(field)}. Run: ${singleLine(item.action)}`;
  });
  return {
    content: boundedBlock(`[ArchitectureDebt] ${items.length} new in ${capability}`, rows, items.length, count => `(+${count} more: ${COMMAND})`),
    systemMessage: `Architecture: ${items.length} debt ${items.length === 1 ? 'item' : 'items'} in ${capability}; run ${COMMAND}.`,
  };
}

/** Changed implementation paths that no registry capability owns. The ownership answer holds them; no checkpoint is needed. */
function unownedBlock(paths: readonly string[]): NoticeBlock | null {
  if (paths.length === 0) return null;
  const subject = `unowned changed ${paths.length === 1 ? 'path' : 'paths'}`;
  const rows = paths.slice(0, 3).map(path => `- unowned-path ${singleLine(path)}; no capability owns it. Fix: add an owner in ${REGISTRY_FILE}`);
  return {
    content: boundedBlock(`[ArchitectureDebt] ${paths.length} ${subject}`, rows, paths.length, count => `(+${count} more unowned changed paths)`),
    systemMessage: `Architecture: ${paths.length} ${subject}; add an owner in ${REGISTRY_FILE}.`,
  };
}

function inactiveBlock(cause: string): NoticeBlock {
  return {
    content: `[Architecture] inactive: ${cause}. Run: ${STATUS_COMMAND}`,
    systemMessage: `Architecture: inactive (${cause}); run ${STATUS_COMMAND}.`,
  };
}

const failureCode = (error: unknown) => error instanceof ArchctxClientError ? singleLine(error.code) : 'error';

function failureBlock(error: unknown): NoticeBlock {
  const code = failureCode(error);
  const text = error instanceof ArchctxClientError ? singleLine(error.providerMessage) : errorText(error);
  return {
    content: `[Architecture] notice unavailable (${code}): ${clip(text, MAX_MESSAGE_BYTES)}`,
    systemMessage: `Architecture: notice unavailable (${code}); run ${COMMAND}.`,
  };
}

function statusOf(error: unknown): Status {
  if (!(error instanceof ArchctxClientError) || !INACTIVE_CODES.has(error.code)) return { kind: 'failure', error };
  return { kind: 'inactive', cause: singleLine(error.action ? `${error.code}, action ${error.action}` : error.code) };
}

/** Setup state before any archctx call, so a session without a diff still learns that the loop is off. */
function readiness(repoRoot: string, env: NodeJS.ProcessEnv | undefined): Status {
  const global = readGlobalArchitectureConfiguration(env);
  if (global.initialized && global.policy.provider === 'disabled') return { kind: 'disabled' };
  // archctx 0.9.0 checkpoint refuses a repository without this file (AC_MODEL_ADOPTION_REQUIRED, model-missing).
  if (!existsSync(join(repoRoot, ARCHCONTEXT_MANIFEST))) return { kind: 'inactive', cause: `no ArchContext model (${ARCHCONTEXT_MANIFEST} is missing)` };
  if (!global.initialized) return { kind: 'inactive', cause: 'global architecture configuration is missing; run repo-harness update' };
  return { kind: 'active' };
}

function observe(repoRoot: string, ownership: (options: ArchctxProviderOptions) => CapabilityOwnership | null, options: ArchctxProviderOptions): Observation | null {
  let source: ReturnType<typeof capabilitySource>;
  try { source = capabilitySource(repoRoot); }
  catch (error) { return { status: statusOf(error), unowned: null, debt: null }; }
  if (source === 'unadopted') return null;
  const now = options.nowMs ?? Date.now;
  let owned: CapabilityOwnership | null;
  // Ownership and checkpoint each get one bounded call. SessionStart reuses ownership.
  try { owned = ownership({ ...options, deadlineMs: Math.min(options.deadlineMs ?? Infinity, now() + 3_000) }); }
  catch (error) { return { status: statusOf(error), unowned: null, debt: null }; }
  // No declared capability authority: the architecture loop does not apply (#737).
  if (!owned) return null;
  let unowned: Observation['unowned'] = null;
  try {
    // Only the registry is its own unowned-path authority. Under archcontext,
    // archctx counts a path as unowned only inside declared source roots, so
    // the broader resolver list would give the same fact a second meaning.
    const paths = source === 'registry' ? [...owned.unowned_paths].sort() : [];
    const ownerBlock = unownedBlock(paths);
    unowned = ownerBlock && { paths, block: ownerBlock };
    const status = readiness(repoRoot, options.env);
    if (status.kind !== 'active') return { status, unowned, debt: null };
    const measured = checkpointArchitectureDebt(repoRoot, owned, options);
    const debtBlock = measured && renderAgentNotice(measured.report);
    const debt = measured && debtBlock ? { branch: measured.branch, ids: noticeItems(measured.report).map(item => item.id).sort(), block: debtBlock } : null;
    return { status, unowned, debt };
  } catch (error) { return { status: statusOf(error), unowned, debt: null }; }
}

function currentBranch(repoRoot: string, env: NodeJS.ProcessEnv | undefined): string {
  return execFileSync('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8', env: env ?? process.env, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3_000,
  }).trim();
}

/** True when the key is new. The key is written before delivery, so a failed write delivers nothing. */
function claim(repoRoot: string, path: string, key: string, env: NodeJS.ProcessEnv | undefined): boolean {
  const marker = join(repoRoot, path);
  assertSafeRepoWritePath(repoRoot, marker);
  try { if (readFileSync(marker, 'utf8').trim() === key) return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  execFileSync('git', ['-C', repoRoot, 'check-ignore', '-q', '--', path], { env: env ?? process.env, stdio: 'ignore', timeout: 3_000 });
  writeHookStateFile(repoRoot, marker, `${key}\n`);
  return true;
}

/** One line per readiness change. A failure never touches the debt marker, so a later success still delivers the debt. */
function statusNotice(repoRoot: string, env: NodeJS.ProcessEnv | undefined, status: Status): NoticeBlock | null {
  switch (status.kind) {
    case 'disabled': return null;
    case 'active':
      // The active key ends the previous state, so a cause that returns prints again.
      if (existsSync(join(repoRoot, STATUS_MARKER))) claim(repoRoot, STATUS_MARKER, digest(['active']), env);
      return null;
    case 'inactive': return claim(repoRoot, STATUS_MARKER, digest(['inactive', status.cause]), env) ? inactiveBlock(status.cause) : null;
    case 'failure': {
      const key = digest(['failure', currentBranch(repoRoot, env), failureCode(status.error)]);
      return claim(repoRoot, STATUS_MARKER, key, env) ? failureBlock(status.error) : null;
    }
  }
}

/** Ownership and citation debt share one marker. Their key changes when a debt item or an unowned path changes. */
function debtNotice(repoRoot: string, env: NodeJS.ProcessEnv | undefined, observation: Observation): NoticeBlock[] {
  const { unowned, debt } = observation;
  // A failed checkpoint has no measured set. Claiming the unowned paths alone would
  // make every recovery print them again.
  if (observation.status.kind === 'failure' || (!unowned && !debt)) return [];
  const key = digest([debt?.branch ?? currentBranch(repoRoot, env), debt?.ids ?? [], unowned?.paths ?? []]);
  if (!claim(repoRoot, MARKER, key, env)) return [];
  return [unowned?.block, debt?.block].filter((block): block is NoticeBlock => block !== undefined);
}

/** Shared by all host delivery points. The status and debt markers fail independently. */
export function collectAgentNotice(repoRoot: string, ownership: (options: ArchctxProviderOptions) => CapabilityOwnership | null, options: ArchctxProviderOptions = {}): AgentNotice {
  const observation = observe(repoRoot, ownership, options);
  if (!observation) return {};
  const blocks: NoticeBlock[] = [];
  const problems: string[] = observation.status.kind === 'failure' ? [errorText(observation.status.error)] : [];
  try {
    const block = statusNotice(repoRoot, options.env, observation.status);
    if (block) blocks.push(block);
  } catch (error) { problems.push(errorText(error)); }
  try { blocks.push(...debtNotice(repoRoot, options.env, observation)); }
  catch (error) { problems.push(errorText(error)); }
  return {
    ...(blocks.length > 0 ? { content: blocks.map(block => block.content).join('\n'), systemMessage: blocks.map(block => block.systemMessage).join('\n') } : {}),
    ...(problems.length > 0 ? { diagnostics: `${boundedHookDiagnostic(`repo-harness: architecture notice unavailable: ${problems.join('; ')}`)}\n` } : {}),
  };
}
