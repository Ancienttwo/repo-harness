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
  readonly dropped_sections: readonly {
    id: string;
    reason: 'no-actionable-state' | 'budget' | 'mandatory-compacted' | 'mandatory-overflow';
  }[];
  readonly mandatory_overflows: readonly MandatoryOverflowEvidence[];
  readonly within_budget: boolean;
}

export interface MandatoryOverflowEvidence {
  readonly id: string;
  readonly reason: 'critical-content-exceeds-budget' | 'unstructured-mandatory-content';
  readonly source_hash: string;
  readonly estimated_tokens: number;
  readonly required_action: string;
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
  mandatoryOverflows: readonly MandatoryOverflowEvidence[] = [],
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
    mandatory_overflows: mandatoryOverflows,
    within_budget: estimatedTokens(context) <= SESSION_CONTEXT_TOKEN_BUDGET,
  };
  writeEvidence(repoRoot, evidence);
  return { context, evidence };
}

type JsonRecord = Record<string, unknown>;

const HARNESS_STATE_PREFIX = '[HarnessState] ';
const CRITICAL_STATE_FIELDS = [
  'task_id',
  'phase',
  'state_version',
  'state_revision',
  'workflow_profile',
  'next_action',
  'blockers',
  'allowed_paths',
  'checks',
  'security_boundaries',
  'safety_boundaries',
  'forbidden_paths',
  'forbidden_actions',
] as const;

function jsonRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function parseHarnessState(content: string): JsonRecord | null {
  if (!content.startsWith(HARNESS_STATE_PREFIX)) return null;
  try {
    return jsonRecord(JSON.parse(content.slice(HARNESS_STATE_PREFIX.length)));
  } catch {
    return null;
  }
}

function boundedIdentity(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized !== undefined && estimatedTokens(serialized) <= 128) return value;
  return {
    overflow: true,
    content_hash: hash(serialized ?? 'undefined'),
    estimated_tokens: estimatedTokens(serialized ?? 'undefined'),
  };
}

function criticalFieldStats(state: JsonRecord): JsonRecord {
  const stats: JsonRecord = {};
  for (const field of CRITICAL_STATE_FIELDS) {
    if (!(field in state)) continue;
    const serialized = JSON.stringify(state[field]) ?? 'undefined';
    stats[field] = {
      estimated_tokens: estimatedTokens(serialized),
      content_hash: hash(serialized),
      ...(Array.isArray(state[field]) ? { entry_count: state[field].length } : {}),
    };
  }
  return stats;
}

function requiredAction(section: SessionContextSection): string {
  const reference = section.reference?.trim();
  return reference && estimatedTokens(reference) <= 128
    ? reference
    : 'repo-harness state resolve --json';
}

function mandatoryOverflow(
  section: SessionContextSection,
  reason: MandatoryOverflowEvidence['reason'],
  state: JsonRecord | null,
): { content: string; evidence: MandatoryOverflowEvidence } {
  const evidence: MandatoryOverflowEvidence = {
    id: section.id,
    reason,
    source_hash: hash(section.content),
    estimated_tokens: estimatedTokens(section.content),
    required_action: requiredAction(section),
  };
  const criticalIdentity = state
    ? {
        task_id: boundedIdentity(state.task_id),
        phase: boundedIdentity(state.phase),
        next_action: boundedIdentity(state.next_action),
      }
    : {};
  const payload = {
    fail_closed: true,
    section_id: section.id,
    reason,
    ...criticalIdentity,
    critical_fields: state ? criticalFieldStats(state) : null,
    source_hash: evidence.source_hash,
    source_estimated_tokens: evidence.estimated_tokens,
    required_action: evidence.required_action,
  };
  const content = `[HarnessContextOverflow] ${JSON.stringify(payload)}`;
  // The fixed-shape overflow is itself a safety boundary. If unusually many
  // critical fields make its statistics exceed the cap, retain only the
  // source-level proof and required fail-closed action.
  if (estimatedTokens(content) <= SESSION_CONTEXT_TOKEN_BUDGET) return { content, evidence };
  return {
    content: `[HarnessContextOverflow] ${JSON.stringify({
      fail_closed: true,
      section_id: section.id,
      reason,
      source_hash: evidence.source_hash,
      source_estimated_tokens: evidence.estimated_tokens,
      required_action: evidence.required_action,
    })}`,
    evidence,
  };
}

function compactMandatorySection(section: SessionContextSection): {
  content: string;
  overflow: MandatoryOverflowEvidence | null;
} {
  const state = parseHarnessState(section.content);
  if (!state) {
    const overflow = mandatoryOverflow(section, 'unstructured-mandatory-content', null);
    return { content: overflow.content, overflow: overflow.evidence };
  }

  const critical: JsonRecord = {};
  for (const field of CRITICAL_STATE_FIELDS) {
    if (field in state) critical[field] = state[field];
  }
  const omittedFields = Object.keys(state)
    .filter((field) => !CRITICAL_STATE_FIELDS.includes(field as typeof CRITICAL_STATE_FIELDS[number]))
    .sort();
  const compact = `${HARNESS_STATE_PREFIX}${JSON.stringify({
    ...critical,
    context_compaction: {
      source_hash: hash(section.content),
      source_estimated_tokens: estimatedTokens(section.content),
      omitted_fields: omittedFields,
      reference: requiredAction(section),
    },
  })}`;
  if (estimatedTokens(compact) <= SESSION_CONTEXT_TOKEN_BUDGET) {
    return { content: compact, overflow: null };
  }
  const overflow = mandatoryOverflow(section, 'critical-content-exceeds-budget', state);
  return { content: overflow.content, overflow: overflow.evidence };
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
  const contentHash = hash(normalized.map((section) => JSON.stringify({
    id: section.id,
    priority: section.priority,
    mandatory: section.mandatory,
    actionable: section.actionable,
    reference: section.reference?.trim() ?? null,
    content: section.content,
  })).join('\0'));
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
  const dropped: Array<{
    id: string;
    reason: 'budget' | 'mandatory-compacted' | 'mandatory-overflow';
  }> = [];
  const mandatoryOverflows: MandatoryOverflowEvidence[] = [];
  const mandatoryRepresentations = new Map<string, {
    content: string;
    disposition: 'verbatim' | 'mandatory-compacted' | 'mandatory-overflow';
    overflow: MandatoryOverflowEvidence | null;
  }>();
  for (const section of normalized.filter(({ mandatory }) => mandatory)) {
    if (estimatedTokens(section.content) <= SESSION_CONTEXT_TOKEN_BUDGET) {
      mandatoryRepresentations.set(section.id, {
        content: section.content,
        disposition: 'verbatim',
        overflow: null,
      });
      continue;
    }
    const compacted = compactMandatorySection(section);
    mandatoryRepresentations.set(section.id, {
      content: compacted.content,
      disposition: compacted.overflow ? 'mandatory-overflow' : 'mandatory-compacted',
      overflow: compacted.overflow,
    });
  }

  const mandatorySections = normalized.filter(({ mandatory }) => mandatory);
  const mandatoryContext = mandatorySections
    .map((section) => mandatoryRepresentations.get(section.id)!.content)
    .join('\n');
  if (estimatedTokens(mandatoryContext) > SESSION_CONTEXT_TOKEN_BUDGET) {
    const overflowEvidence = mandatorySections.map((section) => mandatoryOverflow(
      section,
      parseHarnessState(section.content)
        ? 'critical-content-exceeds-budget'
        : 'unstructured-mandatory-content',
      parseHarnessState(section.content),
    ).evidence);
    const aggregate = `[HarnessContextOverflow] ${JSON.stringify({
      fail_closed: true,
      reason: 'combined-mandatory-content-exceeds-budget',
      sections: overflowEvidence.map((entry) => ({
        id: entry.id,
        source_hash: entry.source_hash,
        source_estimated_tokens: entry.estimated_tokens,
        required_action: entry.required_action,
      })),
      required_action: 'resolve every listed authoritative section before continuing',
    })}`;
    const boundedAggregate = estimatedTokens(aggregate) <= SESSION_CONTEXT_TOKEN_BUDGET
      ? aggregate
      : `[HarnessContextOverflow] ${JSON.stringify({
          fail_closed: true,
          reason: 'combined-mandatory-content-exceeds-budget',
          section_count: overflowEvidence.length,
          section_set_hash: hash(overflowEvidence.map(({ id, source_hash }) => `${id}\0${source_hash}`).join('\0')),
          required_action: 'repo-harness state resolve --json',
        })}`;
    return result(
      repoRoot,
      boundedAggregate,
      sessionId,
      contentHash,
      false,
      true,
      [],
      normalized.map(({ id, mandatory }) => ({
        id,
        reason: mandatory ? 'mandatory-overflow' as const : 'budget' as const,
      })),
      overflowEvidence,
    );
  }

  const chunks: string[] = [];
  for (const section of normalized) {
    if (section.mandatory) {
      const representation = mandatoryRepresentations.get(section.id)!;
      chunks.push(representation.content);
      if (representation.disposition === 'verbatim') included.push(section.id);
      else dropped.push({ id: section.id, reason: representation.disposition });
      if (representation.overflow) mandatoryOverflows.push(representation.overflow);
      continue;
    }
    const next = [...chunks, section.content].join('\n');
    if (estimatedTokens(next) <= SESSION_CONTEXT_TOKEN_BUDGET) {
      chunks.push(section.content);
      included.push(section.id);
      continue;
    }
    dropped.push({ id: section.id, reason: 'budget' });
    const reference = section.reference?.trim();
    if (reference) {
      const compact = `[ContextRef:${section.id}] ${reference} content_hash=${hash(section.content)} estimated_tokens=${estimatedTokens(section.content)}`;
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
    mandatoryOverflows,
  );
}
