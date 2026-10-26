import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { isLegacyPathSafe, legacyPathSnapshot, type LeftoverItem, type LegacyPathSnapshot } from './legacy-inventory';

/** Tracked operator decisions for project upgrade items that have no ownership proof. */
export const UPGRADE_DECISIONS_PATH = '.ai/harness/upgrade-decisions.json';

export type UpgradeDecisionKind = 'keep' | 'remove';

export interface UpgradeDecision {
  readonly path: string;
  readonly decision: UpgradeDecisionKind;
  readonly contentHash: string;
}

export interface DecidedUpgradePlan {
  readonly items: LeftoverItem[];
  readonly operatorKept: LeftoverItem[];
}

const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

function decisionFileError(detail: string): Error {
  return new Error(`invalid upgrade decision file ${UPGRADE_DECISIONS_PATH}: ${detail}`);
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

export function isRepoRelativeDecisionPath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0')
    && !/^[A-Za-z]:/.test(path) && !path.split('/').some((part) => ['', '.', '..'].includes(part));
}

export function repoRelativeDecisionPath(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join('/');
}

export function parseUpgradeDecisions(text: string): UpgradeDecision[] {
  let value: unknown;
  try { value = JSON.parse(text); } catch (error) {
    throw decisionFileError(`not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!exactKeys(value, ['decisions', 'version'])) throw decisionFileError('the top level must have exactly "version" and "decisions"');
  if (value.version !== 1) throw decisionFileError('"version" must be 1');
  if (!Array.isArray(value.decisions)) throw decisionFileError('"decisions" must be an array');
  const seen = new Set<string>();
  return value.decisions.map((entry: unknown, index: number): UpgradeDecision => {
    const at = `decisions[${index}]`;
    if (!exactKeys(entry, ['contentHash', 'decision', 'path'])) throw decisionFileError(`${at} must have exactly "path", "decision" and "contentHash"`);
    const { path, decision, contentHash } = entry;
    if (typeof path !== 'string' || !isRepoRelativeDecisionPath(path)) throw decisionFileError(`${at}.path must be a repo-relative POSIX path`);
    if (decision !== 'keep' && decision !== 'remove') throw decisionFileError(`${at}.decision must be "keep" or "remove"`);
    if (typeof contentHash !== 'string' || !CONTENT_HASH.test(contentHash)) throw decisionFileError(`${at}.contentHash must be sha256:<64 hex>`);
    if (seen.has(path)) throw decisionFileError(`duplicate decision for ${path}`);
    seen.add(path);
    return { path, decision, contentHash };
  });
}

/** A missing file means no decisions. Any other unreadable or invalid file fails closed. */
export function readUpgradeDecisions(cwd: string): UpgradeDecision[] {
  const path = join(cwd, UPGRADE_DECISIONS_PATH);
  if (!isLegacyPathSafe(cwd, path, false)) throw decisionFileError('the path has a symlink or non-directory component');
  const snapshot = legacyPathSnapshot(path);
  if (!snapshot) return [];
  if (snapshot.kind !== 'file') throw decisionFileError('it must be a regular file');
  return parseUpgradeDecisions(readFileSync(path, 'utf8'));
}

/** Later entries replace earlier entries for the same path. The result is sorted by path. */
export function mergeUpgradeDecisions(existing: readonly UpgradeDecision[], updates: readonly UpgradeDecision[]): UpgradeDecision[] {
  const byPath = new Map<string, UpgradeDecision>();
  for (const decision of [...existing, ...updates]) byPath.set(decision.path, decision);
  return [...byPath.values()].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export function decisionSnapshot(cwd: string, item: LeftoverItem): LegacyPathSnapshot | null {
  return isLegacyPathSafe(cwd, item.path) ? legacyPathSnapshot(item.path) : null;
}

/**
 * Remove uses the project rollback, which restores regular files only.
 * A document that refers to a retired path is user prose, so only keep is valid.
 */
export function upgradeDecisionRejection(
  item: LeftoverItem, decision: UpgradeDecisionKind, snapshot: LegacyPathSnapshot | null,
): string | undefined {
  if (item.location !== 'project' || item.action !== 'report') return 'Path is not a current project upgrade report item.';
  if (snapshot?.contentHash === undefined) return 'A decision needs a file or directory with a content hash.';
  if (decision === 'remove' && (item.surface !== 'file' || snapshot.kind !== 'file')) return 'Remove is valid only for a regular file; use keep.';
  if (decision === 'remove' && item.retiredBy === 'retired-script-reference') return 'Remove is not valid for a document that refers to a retired path; use keep.';
  return undefined;
}

/**
 * Apply decisions to project report items only. A decision applies when its
 * content hash matches the current bytes. Other items pass through unchanged.
 */
export function applyUpgradeDecisions(
  items: readonly LeftoverItem[], decisions: readonly UpgradeDecision[], cwd: string,
): DecidedUpgradePlan {
  const byPath = new Map(decisions.map((decision) => [decision.path, decision]));
  const planned: LeftoverItem[] = [];
  const operatorKept: LeftoverItem[] = [];
  for (const item of items) {
    const decision = item.location === 'project' && item.action === 'report'
      ? byPath.get(repoRelativeDecisionPath(cwd, item.path)) : undefined;
    if (!decision) { planned.push(item); continue; }
    const snapshot = decisionSnapshot(cwd, item);
    const rejection = upgradeDecisionRejection(item, decision.decision, snapshot);
    if (rejection) {
      planned.push({ ...item, operatorDecision: { decision: decision.decision, status: 'rejected' },
        reason: `Operator ${decision.decision} decision rejected: ${rejection}${item.reason ? ` ${item.reason}` : ''}` });
    } else if (snapshot!.contentHash !== decision.contentHash) {
      planned.push({ ...item, operatorDecision: { decision: decision.decision, status: 'stale' },
        reason: `Operator ${decision.decision} decision is stale: the content changed after the decision. Record a new decision.${item.reason ? ` ${item.reason}` : ''}` });
    } else if (decision.decision === 'keep') {
      operatorKept.push({ ...item, operatorDecision: { decision: 'keep', status: 'applied' }, expectedContentHash: decision.contentHash,
        reason: `Operator decision: keep (${UPGRADE_DECISIONS_PATH}).` });
    } else {
      planned.push({ ...item, action: 'remove', operatorDecision: { decision: 'remove', status: 'applied' }, expectedContentHash: decision.contentHash,
        reason: `Operator decision: remove (${UPGRADE_DECISIONS_PATH}). Apply backs up the file first.` });
    }
  }
  return { items: planned, operatorKept };
}
