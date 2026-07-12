import { createHash } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const SESSION_CONTEXT_TOKEN_BUDGET = 1_500;
const EVIDENCE_PATH = '.ai/harness/state/session-context-budget.json';

export interface SessionContextSection {
  readonly id: string;
  readonly priority: 1 | 2 | 3 | 4 | 5 | 6;
  readonly content: string;
  readonly mandatory: boolean;
  readonly actionable: boolean;
  readonly reference?: string;
}

export interface SessionContextBudgetEvidence {
  readonly protocol: 1;
  readonly budget_tokens: number;
  readonly estimated_tokens: number;
  readonly output_bytes: number;
  readonly content_hash: string;
  readonly session_id: string | null;
  readonly deduped: boolean;
  readonly actionable: boolean;
  readonly included_sections: readonly string[];
  readonly dropped_sections: readonly { id: string; reason: 'no-actionable-state' | 'budget' | 'mandatory-compacted' }[];
  readonly within_budget: boolean;
}

export interface SessionContextBudgetResult {
  readonly context: string;
  readonly evidence: SessionContextBudgetEvidence;
}

function hash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function estimatedTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, 'utf-8') / 4);
}

function readPrevious(repoRoot: string): SessionContextBudgetEvidence | null {
  try {
    return JSON.parse(readFileSync(join(repoRoot, EVIDENCE_PATH), 'utf-8')) as SessionContextBudgetEvidence;
  } catch {
    return null;
  }
}

function writeEvidence(repoRoot: string, evidence: SessionContextBudgetEvidence): void {
  const target = join(repoRoot, EVIDENCE_PATH);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
}

function result(
  repoRoot: string,
  context: string,
  sessionId: string | null,
  contentHash: string,
  deduped: boolean,
  actionable: boolean,
  included: readonly string[],
  dropped: SessionContextBudgetEvidence['dropped_sections'],
): SessionContextBudgetResult {
  const evidence: SessionContextBudgetEvidence = {
    protocol: 1,
    budget_tokens: SESSION_CONTEXT_TOKEN_BUDGET,
    estimated_tokens: estimatedTokens(context),
    output_bytes: Buffer.byteLength(context, 'utf-8'),
    content_hash: contentHash,
    session_id: sessionId,
    deduped,
    actionable,
    included_sections: included,
    dropped_sections: dropped,
    within_budget: estimatedTokens(context) <= SESSION_CONTEXT_TOKEN_BUDGET,
  };
  writeEvidence(repoRoot, evidence);
  return { context, evidence };
}

/** Apply one budget to the complete SessionStart payload, after all scripts run. */
export function budgetSessionContext(
  repoRoot: string,
  sections: readonly SessionContextSection[],
  sessionId: string | null,
): SessionContextBudgetResult {
  const normalized = sections
    .map((section) => ({ ...section, content: section.content.trim() }))
    .filter((section) => section.content.length > 0)
    .sort((left, right) => left.priority - right.priority);
  const contentHash = hash(normalized.map(({ id, content }) => `${id}\0${content}`).join('\0'));
  const actionable = normalized.some((section) => section.actionable);
  if (!actionable) {
    return result(
      repoRoot,
      '',
      sessionId,
      contentHash,
      false,
      false,
      [],
      normalized.map(({ id }) => ({ id, reason: 'no-actionable-state' as const })),
    );
  }

  const previous = sessionId ? readPrevious(repoRoot) : null;
  if (sessionId && previous?.session_id === sessionId && previous.content_hash === contentHash) {
    return result(repoRoot, '', sessionId, contentHash, true, true, [], []);
  }

  const included: string[] = [];
  const dropped: Array<{ id: string; reason: 'budget' | 'mandatory-compacted' }> = [];
  const chunks: string[] = [];
  for (const section of normalized) {
    const next = [...chunks, section.content].join('\n');
    if (estimatedTokens(next) <= SESSION_CONTEXT_TOKEN_BUDGET) {
      chunks.push(section.content);
      included.push(section.id);
      continue;
    }
    dropped.push({ id: section.id, reason: section.mandatory ? 'mandatory-compacted' : 'budget' });
    const reference = section.reference?.trim();
    if (reference || section.mandatory) {
      const compact = `[ContextRef:${section.id}] ${reference || 'repo-harness state resolve --json'} content_hash=${hash(section.content)} estimated_tokens=${estimatedTokens(section.content)}`;
      const withReference = [...chunks, compact].join('\n');
      if (estimatedTokens(withReference) <= SESSION_CONTEXT_TOKEN_BUDGET) {
        chunks.push(compact);
      }
    }
  }

  return result(
    repoRoot,
    chunks.join('\n'),
    sessionId,
    contentHash,
    false,
    true,
    included,
    dropped,
  );
}
