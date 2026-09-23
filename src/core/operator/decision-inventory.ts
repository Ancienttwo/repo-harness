import type { DecisionRequestV1, DecisionRequestCurrentV1 } from '../engineers/verified-context';

export interface OperatorOpenDecision {
  readonly decision_id: string;
  readonly question: string;
  readonly task_fence: DecisionRequestV1['task_fence'];
  readonly binding_fence: DecisionRequestV1['binding_fence'];
  readonly previous_assertion_sha256: string | null;
  readonly request_sha256: string;
  readonly current_digest: string;
  readonly current_event_sha256: string;
}
export interface OperatorDecisionInventory {
  readonly protocol: 1;
  readonly kind: 'operator_decision_inventory';
  readonly repository_id: string;
  readonly query: { readonly after: string | null; readonly limit: number };
  readonly entries: readonly OperatorOpenDecision[];
  readonly directory_revision: string;
  readonly coverage: {
    readonly complete: boolean;
    readonly reason: 'complete' | 'output_limit' | 'scan_limit' | 'byte_limit';
    readonly scanned: number;
    readonly bytes_read: number;
    readonly next_after: string | null;
  };
}

/** Values come from the canonical store's validated open inventory. This
 * transport projection copies fences and questions without exposing storage
 * coordinates or inferring whether an old fence is executable today. */
export function projectOperatorDecisionInventory(repositoryId: string, inventory: {
  readonly query: OperatorDecisionInventory['query'];
  readonly entries: readonly { readonly request: DecisionRequestV1; readonly current: DecisionRequestCurrentV1 }[];
  readonly directory_revision: string;
  readonly coverage: OperatorDecisionInventory['coverage'];
}): OperatorDecisionInventory {
  return decodeOperatorDecisionInventory({
    protocol: 1, kind: 'operator_decision_inventory', repository_id: repositoryId,
    query: inventory.query, directory_revision: inventory.directory_revision, coverage: inventory.coverage,
    entries: inventory.entries.map(({ request, current }) => {
      if (current.state !== 'open' || current.decision_id !== request.decision_id || current.request_sha256 !== request.request_sha256) throw new Error('invalid open Decision source');
      return { decision_id: request.decision_id, question: request.question,
        task_fence: request.task_fence, binding_fence: request.binding_fence,
        previous_assertion_sha256: request.previous_assertion_sha256, request_sha256: request.request_sha256,
        current_digest: current.current_digest, current_event_sha256: current.current_event_sha256 };
    }),
  }, repositoryId, inventory.query.after);
}

export function isDecisionCursor(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

/** Wire validation is deliberately browser-safe; canonical digest validation
 * belongs to the store before projection, not a second browser authority. */
export function decodeOperatorDecisionInventory(value: unknown, repositoryId: string, after: string | null): OperatorDecisionInventory {
  const invalid = (): never => { throw new Error('invalid scoped Decision inventory'); };
  const record = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== keys.sort().join(',')) return invalid();
    return v as Record<string, unknown>;
  };
  const str = (v: unknown, pattern: RegExp): string => typeof v === 'string' && pattern.test(v) ? v : invalid();
  const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : invalid();
  const sha = (v: unknown) => str(v, /^sha256:[0-9a-f]{64}$/u);
  const uuid = (v: unknown) => str(v, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  const digest = (v: unknown) => str(v, /^[0-9a-f]{64}$/u);
  if (!isDecisionCursor(after) || new TextEncoder().encode(JSON.stringify(value)).length > 2 * 1024 * 1024) return invalid();
  const v = record(value, ['protocol', 'kind', 'repository_id', 'query', 'entries', 'directory_revision', 'coverage']);
  if (v.protocol !== 1 || v.kind !== 'operator_decision_inventory' || v.repository_id !== repositoryId) return invalid();
  const q = record(v.query, ['after', 'limit']);
  if (q.after !== after) return invalid();
  const limit = integer(q.limit, 1, 100);
  if (!Array.isArray(v.entries) || v.entries.length > limit) return invalid();
  const ids = new Set<string>();
  const entries = v.entries.map(raw => {
    const e = record(raw, ['decision_id', 'question', 'task_fence', 'binding_fence', 'previous_assertion_sha256', 'request_sha256', 'current_digest', 'current_event_sha256']);
    const decision_id = uuid(e.decision_id);
    if (ids.has(decision_id)) return invalid();
    ids.add(decision_id);
    if (typeof e.question !== 'string' || e.question.trim().length === 0 || /[\u0000-\u001f\u007f]/u.test(e.question) || new TextEncoder().encode(e.question).length > 16 * 1024) return invalid();
    const t = record(e.task_fence, ['task_id', 'task_revision', 'claim_id', 'lease_generation']);
    const b = record(e.binding_fence, ['engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision']);
    return { decision_id, question: e.question,
      task_fence: { task_id: digest(t.task_id), task_revision: digest(t.task_revision), claim_id: uuid(t.claim_id), lease_generation: integer(t.lease_generation, 0) },
      binding_fence: { engineer_id: str(b.engineer_id, /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u), binding_id: uuid(b.binding_id), binding_generation: integer(b.binding_generation, 1), engineer_contract_revision: sha(b.engineer_contract_revision) },
      previous_assertion_sha256: e.previous_assertion_sha256 === null ? null : sha(e.previous_assertion_sha256), request_sha256: sha(e.request_sha256), current_digest: sha(e.current_digest), current_event_sha256: sha(e.current_event_sha256) };
  });
  const c = record(v.coverage, ['complete', 'reason', 'scanned', 'bytes_read', 'next_after']);
  const scanned = integer(c.scanned, entries.length, 200), bytes_read = integer(c.bytes_read, 0, 8 * 1024 * 1024);
  if (typeof c.complete !== 'boolean' || !['complete', 'output_limit', 'scan_limit', 'byte_limit'].includes(c.reason as string) || !isDecisionCursor(c.next_after)) return invalid();
  if (c.complete !== (c.reason === 'complete') || (c.complete ? c.next_after !== null : c.next_after === null || scanned === 0 || after !== null && c.next_after <= after)) return invalid();
  if (c.reason === 'output_limit' && entries.length !== limit || c.reason === 'scan_limit' && scanned !== 200) return invalid();
  return { protocol: 1, kind: 'operator_decision_inventory', repository_id: repositoryId, query: { after, limit }, entries,
    directory_revision: sha(v.directory_revision), coverage: { complete: c.complete, reason: c.reason as OperatorDecisionInventory['coverage']['reason'], scanned, bytes_read, next_after: c.next_after } };
}
