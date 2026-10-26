import { createHash } from 'crypto';
import { lstatSync, readFileSync } from 'fs';
import { join } from 'path';
import { makeOperationId, type AdoptionPlan, type WriteFileOperation } from '../../core/adoption/operations';
import { summarizeOperations } from '../../core/adoption/summary';
import { DEFAULT_WORKTREE_TEMPLATE } from '../../core/worktree-location.mjs';
import { applyAdoptionPlan } from '../fs-transaction';

const POLICY_PATH = '.ai/harness/policy.json';
const TEMPLATE_KEY = 'worktree_dir_template';
/** Exact pre-#600 values. Any other template is a deliberate choice and is never rewritten. */
const LEGACY_TEMPLATES: readonly string[] = ['../{{repo}}-wt-{{slug}}', '/tmp/{{repo}}-wt-{{slug}}'];

export interface WorktreeTemplateItem {
  readonly path: string;
  readonly action: 'rewrite' | 'report';
  readonly current?: string;
  readonly replacement?: string;
  readonly reason: string;
}

export interface WorktreeTemplatePlan {
  readonly item?: WorktreeTemplateItem;
  /** Present only for a rewrite: the full new bytes and the hash of the bytes they were planned from. */
  readonly write?: { readonly content: string; readonly expectedContentHash: string };
}

export interface WorktreeTemplateOutcome {
  readonly item?: WorktreeTemplateItem;
  readonly applied: boolean;
  /** Repo-relative manifest; `repo-harness init rollback --transaction <path>` restores the policy. */
  readonly transactionManifestPath?: string;
  readonly error?: string;
}

function report(current: string | undefined, reason: string): WorktreeTemplatePlan {
  return { item: { path: POLICY_PATH, action: 'report', ...(current === undefined ? {} : { current }), reason } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Read-only. The rewrite swaps one string literal in the existing bytes, so the
 * file keeps its formatting and every other value. The result must parse to the
 * same document with only the template changed, or the item stays report-only.
 */
export function planWorktreeTemplate(repoRoot: string): WorktreeTemplatePlan {
  const path = join(repoRoot, POLICY_PATH);
  let text: string;
  try {
    if (!lstatSync(path).isFile()) return report(undefined, 'Policy is not a regular file.');
    text = readFileSync(path, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return report(undefined, `Policy is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  let policy: unknown;
  try { policy = JSON.parse(text); }
  catch (error) { return report(undefined, `Policy is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  const strategy = isRecord(policy) ? policy.worktree_strategy : undefined;
  const current = isRecord(strategy) ? strategy[TEMPLATE_KEY] : undefined;
  if (current === undefined) return {};
  if (typeof current !== 'string') return report(undefined, `${TEMPLATE_KEY} is not a string.`);
  if (current === DEFAULT_WORKTREE_TEMPLATE) return {};
  if (!LEGACY_TEMPLATES.includes(current)) return report(current, 'Custom template kept; change it by hand if the old location is not wanted.');

  const replacement = DEFAULT_WORKTREE_TEMPLATE;
  const literal = new RegExp(`("${TEMPLATE_KEY}"\\s*:\\s*)${escapeRegExp(JSON.stringify(current))}`, 'g');
  if ((text.match(literal) ?? []).length !== 1) return report(current, `Cannot rewrite ${TEMPLATE_KEY} byte-exact.`);
  const content = text.replace(literal, (_match, key: string) => `${key}${JSON.stringify(replacement)}`);
  const expected = JSON.parse(text) as Record<string, Record<string, unknown>>;
  expected.worktree_strategy![TEMPLATE_KEY] = replacement;
  if (JSON.stringify(JSON.parse(content)) !== JSON.stringify(expected)) return report(current, `Cannot rewrite ${TEMPLATE_KEY} byte-exact.`);
  return {
    item: { path: POLICY_PATH, action: 'rewrite', current, replacement,
      reason: 'Legacy template; existing worktrees stay where they are.' },
    write: { content, expectedContentHash: `sha256:${createHash('sha256').update(text).digest('hex')}` },
  };
}

/**
 * One adoption writeFile operation: the executor backs up the original, writes
 * atomically and records the manifest that `init rollback` reads. It checks the
 * planned bytes again under the target lock, so a concurrent edit fails the write.
 */
function applyWorktreeTemplate(repoRoot: string, write: NonNullable<WorktreeTemplatePlan['write']>): WorktreeTemplateOutcome {
  const operation: WriteFileOperation = {
    id: makeOperationId('writeFile', POLICY_PATH, 'worktree-template'),
    kind: 'writeFile',
    path: POLICY_PATH,
    content: write.content,
    reason: 'Move the legacy worktree template to the portable system temp root',
    risk: 'medium',
    status: 'planned',
    expectedContentHash: write.expectedContentHash,
    rollback: { strategy: 'restore-or-delete-file', backup: 'runtime-fs-transaction', description: 'Restore the original policy bytes.' },
  };
  const operations = [operation];
  const plan: AdoptionPlan = { protocol: 1, command: 'init', repoRoot, mode: 'standard', apply: true, operations,
    summary: summarizeOperations(operations), warnings: [] };
  const result = applyAdoptionPlan(plan);
  const failed = result.results.find((entry) => entry.status === 'failed');
  const applied = result.ok && result.results.some((entry) => entry.id === operation.id && entry.status === 'applied');
  return { applied, ...(result.transactionManifestPath ? { transactionManifestPath: result.transactionManifestPath } : {}),
    ...(failed ? { error: failed.error ?? 'policy write failed' } : applied ? {} : { error: 'policy write was skipped' }) };
}

/** The single entry point: plan, and write only when `write` is true. */
export function runWorktreeTemplateMigration(repoRoot: string, write: boolean, beforeWrite?: () => void): WorktreeTemplateOutcome {
  try {
    const plan = planWorktreeTemplate(repoRoot);
    if (!write || !plan.write) return { item: plan.item, applied: false };
    beforeWrite?.();
    return { item: plan.item, ...applyWorktreeTemplate(repoRoot, plan.write) };
  } catch (error) {
    return { applied: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function formatWorktreeTemplateOutcome(outcome: WorktreeTemplateOutcome, apply: boolean): string[] {
  const { item } = outcome;
  if (!item) return outcome.error ? [`Worktree template failed: ${outcome.error}`] : [];
  const subject = `Worktree template ${item.path}: ${item.current ?? 'unreadable'}`;
  if (item.action === 'report') return [`${subject}; report only; ${item.reason}`];
  const lines: string[] = [];
  if (outcome.applied) {
    lines.push(`${subject} -> ${item.replacement}; rewritten.`);
    if (outcome.transactionManifestPath) lines.push(`Policy rollback: repo-harness init rollback --transaction ${outcome.transactionManifestPath}`);
  } else if (outcome.error) {
    lines.push(`${subject} -> ${item.replacement}; failed: ${outcome.error}`);
  } else {
    lines.push(`${subject} -> ${item.replacement}; ${apply ? 'not written' : 'planned'}; add ${apply ? '' : '--apply '}--migrate-worktree-template to rewrite.`);
  }
  return lines;
}
