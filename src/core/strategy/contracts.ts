/** Strategy data is inert. No function here grants execution authority. */
export type StrategyAction = 'continue' | 'investigate' | 'adjust' | 'request_owner_decision' | 'suggest_pause';
export type ClaimKind = 'fact' | 'assumption' | 'unknown';
export interface Evidence { path: string; sha256: string; revision: string }
export interface Claim { text: string; kind: ClaimKind; evidence: string[] }
export interface Constraint { key: string; value: string; evidence: string[] }
export interface MemoryItem {
  id: string; summary: string; kind: 'long_term' | 'current' | 'error';
  lifecycle: 'active' | 'stale' | 'superseded' | 'archived' | 'tombstoned';
  body: Evidence | null; provenance: string[]; applicability: string[];
  expiresAt: string | null; reviewOnRevision: string | null;
  reviewConditions: string[]; supersededBy: string | null;
}
export interface StrategyDocument {
  version: 1; goal: Claim; owner: string; intendedResults: Claim[];
  realityConstraints: Constraint[]; observedOutcomes: Claim[]; gaps: Claim[];
  architecture: Claim[]; evidence: Evidence[]; memory: MemoryItem[];
}
export interface StrategyPacket {
  version: 1; mode: 'context_packet_only'; executionAuthorized: false;
  repository: string; revision: string; stateRevision: string;
  sources: Evidence[]; document: Omit<StrategyDocument, 'memory'>;
  memory: Array<MemoryItem & { authority: 'unverified_summary' }>;
  bodies: Array<{ id: string; text: string; sha256: string; truncated: boolean }>;
  unknowns: string[]; truncated: boolean; digest: string;
}
export interface StrategyProposal {
  version: 1; contextDigest: string; action: StrategyAction; rationale: string;
  evidence: string[]; constraints: Array<{ key: string; value: string }>;
}
export interface Validation {
  status: 'invalid' | 'stale' | 'blocked' | 'reviewable';
  executionAuthorized: false; reasons: string[]; semanticConsistency: 'unknown';
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function exact(o: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(o).sort().join(',') !== keys.sort().join(',')) throw new Error('Unexpected or missing fields');
}
function text(v: unknown, max = 2000): asserts v is string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('Invalid bounded text');
}
function array(v: unknown, max = 64): asserts v is unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new Error('Invalid bounded array');
}
function strings(v: unknown): asserts v is string[] { array(v); v.forEach(x => text(x, 500)); }
function hash(v: unknown): void { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) throw new Error('Invalid SHA256'); }
function revision(v: unknown): void { if (typeof v !== 'string' || !/^[a-f0-9]{40}$/.test(v)) throw new Error('Invalid Git revision'); }
function evidence(v: unknown): asserts v is Evidence {
  const o = object(v); exact(o, ['path', 'sha256', 'revision']); text(o.path, 500); hash(o.sha256); revision(o.revision);
}
function claim(v: unknown): asserts v is Claim {
  const o = object(v); exact(o, ['text', 'kind', 'evidence']); text(o.text); strings(o.evidence);
  if (typeof o.kind !== 'string' || !['fact', 'assumption', 'unknown'].includes(o.kind)) throw new Error('Invalid claim kind');
}
// Date.parse rolls impossible calendar values forward (02-30 becomes 03-02),
// so only a value that round-trips to the same canonical string is valid.
function isCanonicalInstant(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}
export function parseStrategyDocument(v: unknown): StrategyDocument {
  const o = object(v);
  exact(o, ['version', 'goal', 'owner', 'intendedResults', 'realityConstraints', 'observedOutcomes', 'gaps', 'architecture', 'evidence', 'memory']);
  if (o.version !== 1) throw new Error('Unsupported strategy document');
  text(o.owner, 500); claim(o.goal);
  for (const key of ['intendedResults', 'observedOutcomes', 'gaps', 'architecture']) { array(o[key]); o[key].forEach(claim); }
  array(o.realityConstraints);
  o.realityConstraints.forEach(v => { const c = object(v); exact(c, ['key', 'value', 'evidence']); text(c.key, 100); text(c.value, 500); strings(c.evidence); });
  array(o.evidence); o.evidence.forEach(evidence);
  array(o.memory, 128);
  o.memory.forEach(v => {
    const m = object(v);
    exact(m, ['id', 'summary', 'kind', 'lifecycle', 'body', 'provenance', 'applicability', 'expiresAt', 'reviewOnRevision', 'reviewConditions', 'supersededBy']);
    text(m.id, 100); text(m.summary, 1000); strings(m.provenance); strings(m.applicability); strings(m.reviewConditions);
    if (typeof m.kind !== 'string' || !['long_term', 'current', 'error'].includes(m.kind) || typeof m.lifecycle !== 'string' || !['active', 'stale', 'superseded', 'archived', 'tombstoned'].includes(m.lifecycle)) throw new Error('Invalid memory classification');
    if (m.body !== null) evidence(m.body);
    if (m.expiresAt !== null && (typeof m.expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.expiresAt) || !isCanonicalInstant(m.expiresAt))) throw new Error('Invalid expiry');
    if (m.reviewOnRevision !== null) revision(m.reviewOnRevision);
    if (m.supersededBy !== null) text(m.supersededBy, 100);
  });
  const doc = v as StrategyDocument;
  for (const values of [doc.memory.map(m => m.id), doc.evidence.map(e => e.path), doc.realityConstraints.map(c => c.key)]) {
    if (new Set(values).size !== values.length) throw new Error('Duplicate identity');
  }
  const paths = new Set(doc.evidence.map(e => e.path));
  for (const refs of [doc.goal.evidence, ...doc.intendedResults.map(c => c.evidence), ...doc.observedOutcomes.map(c => c.evidence), ...doc.gaps.map(c => c.evidence), ...doc.architecture.map(c => c.evidence), ...doc.realityConstraints.map(c => c.evidence), ...doc.memory.map(m => m.provenance)]) {
    if (refs.some(p => !paths.has(p))) throw new Error('Unknown evidence reference');
  }
  return doc;
}

export function activeMemory(doc: StrategyDocument, nowMs: number, head: string, topics: string[]): MemoryItem[] {
  return doc.memory.filter(m => m.lifecycle === 'active' && !m.supersededBy && m.body !== null
    && (m.expiresAt === null || Date.parse(m.expiresAt) > nowMs)
    && (m.reviewOnRevision === null || m.reviewOnRevision === head)
    && (topics.length === 0 || m.applicability.some(t => topics.includes(t))))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

export function validateProposal(value: unknown, packet: StrategyPacket): Validation {
  const result = (status: Validation['status'], ...reasons: string[]): Validation => ({ status, executionAuthorized: false, reasons, semanticConsistency: 'unknown' });
  try {
    const p = object(value); exact(p, ['version', 'contextDigest', 'action', 'rationale', 'evidence', 'constraints']);
    if (p.version !== 1) throw new Error('Unsupported proposal');
    hash(p.contextDigest); text(p.rationale); strings(p.evidence); array(p.constraints);
    if (typeof p.action !== 'string' || !['continue', 'investigate', 'adjust', 'request_owner_decision', 'suggest_pause'].includes(p.action)) throw new Error('Invalid action');
    p.constraints.forEach(v => { const c = object(v); exact(c, ['key', 'value']); text(c.key, 100); text(c.value, 500); });
    const proposal = value as StrategyProposal;
    if (proposal.contextDigest !== packet.digest) return result('stale', 'Context or source revision changed');
    const authoritative = new Set(packet.sources.map(e => e.path));
    if (proposal.evidence.length === 0 || proposal.evidence.some(p => !authoritative.has(p))) return result('invalid', 'Missing or forged provenance');
    const constraints = new Map(packet.document.realityConstraints.map(c => [c.key, c.value]));
    if (new Set(proposal.constraints.map(c => c.key)).size !== proposal.constraints.length) return result('invalid', 'Duplicate constraint');
    if (proposal.constraints.some(c => !constraints.has(c.key))) return result('invalid', 'Unknown constraint');
    if (proposal.constraints.some(c => constraints.get(c.key) !== c.value)) return result('blocked', 'Structured constraint contradiction');
    if (packet.unknowns.length || packet.truncated) return result('blocked', 'Context evidence is incomplete');
    return result('reviewable', 'Owner and Bot review required; semantic consistency remains unknown');
  } catch (error) { return result('invalid', error instanceof Error ? error.message : String(error)); }
}
