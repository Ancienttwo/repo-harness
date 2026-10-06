import { markdownHeader, parseIsoOrLocalTimestamp, planContractRelationshipConflicts } from '../state/artifact-parsers';

export const DOCS_GRAPH_SCHEMA = 'repo-harness.docs-graph.v1' as const;
export const DOCS_GRAPH_MAX_NODES = 2000;
export type DocsGraphScope = 'active' | 'all';
export type DocsNodeKind = 'prd' | 'sprint' | 'plan' | 'contract' | 'review' | 'notes' | 'capability' | 'spec';
export interface DocsCommit { commit: string; time: string }
export interface DocsSource {
  path: string;
  blob_oid: string;
  last_commit: DocsCommit | null;
}
export interface DocsDocument extends DocsSource {
  content: string | null;
  error?: 'unsupported_file_mode';
}
export interface DocsCapability extends DocsSource { id: string }
export interface DocsStaleThresholds {
  executing_hint_hours: number;
  executing_escalated_hours: number;
  active_days: number;
}
export const DEFAULT_DOCS_STALE_THRESHOLDS: Readonly<DocsStaleThresholds> = Object.freeze({
  executing_hint_hours: 24, executing_escalated_hours: 72, active_days: 7,
});
export interface DocsGraphNode {
  id: string;
  kind: DocsNodeKind;
  status: string | null;
  activation: 'active' | 'deferred' | 'unknown';
  updated: string | null;
  updated_source: 'header' | 'commit' | null;
  waiting_on: 'approval' | 'external' | null;
  source: DocsSource;
}
export interface DocsGraphEdge {
  source: string;
  target: string;
  label: string;
  header_node: string;
  header: string;
  slot: string | null;
  declared_status: string | null;
}
export interface DocsGraphIssue {
  kind: 'broken_link' | 'relationship_conflict' | 'status_conflict' | 'stale';
  node: string;
  detail: string;
  target?: string;
  severity?: 'hint' | 'escalated';
  check_prompt?: string;
}
export interface DocsGraphUnknown { node: string; field: string; reason: string }
export interface DocsGraphV1 {
  schema_version: typeof DOCS_GRAPH_SCHEMA;
  commit: string;
  scope: DocsGraphScope;
  archived_count: number;
  nodes: DocsGraphNode[];
  edges: DocsGraphEdge[];
  issues: DocsGraphIssue[];
  unknowns: DocsGraphUnknown[];
  observation: { evaluated_at: string; thresholds: DocsStaleThresholds; omitted_count: number };
}
export interface DocsGraphInput {
  commit: string;
  documents: readonly DocsDocument[];
  capabilities?: readonly DocsCapability[];
  scope?: DocsGraphScope;
  now: string;
  thresholds?: Partial<DocsStaleThresholds>;
  max_nodes?: number;
}

/** Only canonical, repository-relative artifact paths enter this graph. */
export function docsDocumentKind(path: string): Exclude<DocsNodeKind, 'capability'> | null {
  if (!path || path.startsWith('/') || /[\\:\s\x00-\x1f\x7f?#%]/u.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) return null;
  if (path === 'docs/spec.md' || /^docs\/specs\/.+\.md$/u.test(path)) return 'spec';
  if (path.startsWith('plans/')) {
    if (path.endsWith('.prd.md')) return 'prd';
    if (path.endsWith('.sprint.md') || path.startsWith('plans/sprints/') && path.endsWith('.md')) return 'sprint';
    if (/\/plan-[^/]+\.md$/u.test(path)) return 'plan';
  }
  if (/^tasks\/(?:contracts|archive)\/.+\.contract\.md$/u.test(path)) return 'contract';
  if (/^tasks\/(?:reviews|archive)\/.+\.review\.md$/u.test(path)) return 'review';
  if (/^tasks\/(?:notes|archive)\/.+\.notes\.md$/u.test(path)) return 'notes';
  return null;
}
export const isArchivedDoc = (path: string): boolean => /^(?:plans|tasks)\/archive\//u.test(path);
export const isDocsCapabilityId = (value: string): boolean => /^capability\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const byJson = <T>(values: T[]): T[] => values.sort((a, b) => order(JSON.stringify(a), JSON.stringify(b)));

/** Date-only and legacy unzoned headers use UTC, independent of the host TZ. */
export function docsTimestamp(value: string | null): string | null {
  if (!value) return null;
  let normalized = value;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) normalized += 'T00:00:00Z';
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/u.test(normalized)) normalized = normalized.replace(' ', 'T') + 'Z';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalized)) return null;
  const day = normalized.slice(0, 10);
  const calendar = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) return null;
  const parsed = parseIsoOrLocalTimestamp(normalized);
  return parsed === null ? null : new Date(parsed).toISOString();
}
export function docsStaleThresholds(overrides: Partial<DocsStaleThresholds> = {}): DocsStaleThresholds {
  const thresholds = { ...DEFAULT_DOCS_STALE_THRESHOLDS, ...overrides };
  if (Object.keys(overrides).some(key => !(key in DEFAULT_DOCS_STALE_THRESHOLDS))
    || Object.values(thresholds).some(value => !Number.isFinite(value) || value <= 0)
    || thresholds.executing_escalated_hours < thresholds.executing_hint_hours) throw new Error('Invalid docs stale thresholds');
  return thresholds;
}
interface Header { label: string; value: string; raw: string }
function headers(content: string): Header[] {
  const result: Header[] = [];
  // Body examples are not metadata. Reuse the shared parser for each full label.
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim() || /^# [^#]/u.test(line)) continue;
    const match = /^> \*\*([^*]+)\*\*:/u.exec(line);
    if (!match) break;
    result.push({ label: match[1]!, value: markdownHeader(line, match[1]!) ?? '', raw: line });
  }
  return result;
}
function activation(value: string | null): DocsGraphNode['activation'] {
  if (/^Active(?:\s|$)/iu.test(value ?? '')) return 'active';
  if (/^Deferred(?:\s|$)/iu.test(value ?? '')) return 'deferred';
  return 'unknown';
}
const RELATION_LABELS = new Set(['parent prd', 'source prd', 'depends on', 'plan', 'task contract', 'capability id', 'review file', 'notes file', 'source spec']);
function linkValue(value: string): string {
  const markdown = /^\[[^\]]*\]\(([^\s)]+)\)$/u.exec(value);
  return markdown?.[1] ?? value.replace(/^`|`$/gu, '').trim();
}

interface Reference { owner: string; label: string; target: string; declared: string | null }
function projectNodes(
  visible: ReadonlySet<string>, documentMap: ReadonlyMap<string, DocsDocument>,
  caps: ReadonlyMap<string, DocsCapability>, unknowns: DocsGraphUnknown[],
) {
  const metadata = new Map<string, Header[]>();
  const single = (id: string, label: string): string | null => {
    const values = metadata.get(id)?.filter(header => header.label.toLowerCase() === label.toLowerCase()) ?? [];
    if (values.length > 1) { unknowns.push({ node: id, field: label, reason: 'ambiguous_header' }); return null; }
    return values[0]?.value || null;
  };
  const nodes: DocsGraphNode[] = [];
  for (const id of visible) {
    const doc = documentMap.get(id), source = doc ?? caps.get(id)!;
    metadata.set(id, doc?.content === null ? [] : doc ? headers(doc.content!) : []);
    if (doc?.content === null) unknowns.push({ node: id, field: 'source', reason: doc.error ?? 'unavailable' });
    const status = doc ? single(id, 'Status') : null;
    const rawUpdated = doc ? single(id, 'Updated') : null;
    const hasUpdated = metadata.get(id)!.some(header => header.label.toLowerCase() === 'updated');
    const updated = docsTimestamp(hasUpdated ? rawUpdated : source.last_commit?.time ?? null);
    if (!updated) unknowns.push({ node: id, field: 'updated', reason: hasUpdated ? 'invalid_header' : 'missing_commit_time' });
    const waiting = status?.toLowerCase();
    nodes.push({ id, kind: doc ? docsDocumentKind(id)! : 'capability', status,
      activation: doc ? activation(single(id, 'Activation')) : 'unknown', updated,
      updated_source: updated ? hasUpdated ? 'header' : 'commit' : null,
      waiting_on: waiting === 'waiting-on-approval' ? 'approval' : waiting === 'waiting-on-external' ? 'external' : null,
      source: { path: source.path, blob_oid: source.blob_oid, last_commit: source.last_commit ? { ...source.last_commit } : null },
    });
  }
  return { nodes, metadata };
}
function projectRelations(
  metadata: ReadonlyMap<string, Header[]>, documentMap: ReadonlyMap<string, DocsDocument>,
  caps: ReadonlyMap<string, DocsCapability>, visible: ReadonlySet<string>,
  issues: DocsGraphIssue[], unknowns: DocsGraphUnknown[],
) {
  const edges: DocsGraphEdge[] = [];
  const references: Reference[] = [];
  for (const [id, entries] of metadata) {
    const labels = new Map<string, Header[]>();
    for (const header of entries) {
      const label = header.label.toLowerCase();
      if (!RELATION_LABELS.has(label) && !/^child prd /u.test(label)) continue;
      labels.set(label, [...labels.get(label) ?? [], header]);
    }
    for (const [label, matches] of labels) {
      if (matches.length !== 1) { unknowns.push({ node: id, field: matches[0]!.label, reason: 'ambiguous_header' }); continue; }
      const header = matches[0]!;
      const child = /^Child PRD (\S+) \((.+)\)$/iu.exec(header.label);
      if (label.startsWith('child prd ') && !child) { unknowns.push({ node: id, field: header.label, reason: 'invalid_child_label' }); continue; }
      const values = label === 'depends on' ? header.value.split(/\s*[,;]\s*/u) : [header.value];
      for (const value of values) {
        const target = linkValue(value);
        // Free-form dependency prose is not a path claim.
        if (label === 'depends on' && !/^(?:plans\/|tasks\/|docs\/|\.\.?\/|\/)/u.test(target)) continue;
        const valid = label === 'capability id' ? isDocsCapabilityId(target) : docsDocumentKind(target) !== null;
        if (!valid) { issues.push({ kind: 'broken_link', node: id, detail: 'Invalid or disallowed header path.' }); continue; }
        const exists = label === 'capability id' ? caps.has(target) : documentMap.has(target);
        const readable = label === 'capability id' || documentMap.get(target)?.content !== null;
        if (!exists || !readable) issues.push({ kind: 'broken_link', node: id, detail: exists ? 'The target is not a regular file.' : 'The header target does not exist.', target });
        if (exists && !visible.has(target)) continue;
        const reverse = ['parent prd', 'source prd', 'plan', 'source spec', 'capability id'].includes(label);
        edges.push({ source: reverse ? target : id, target: reverse ? id : target, label: header.label,
          header_node: id, header: header.raw, slot: child?.[1] ?? null, declared_status: child?.[2] ?? null });
        references.push({ owner: id, label, target, declared: child?.[2] ?? null });
      }
    }
  }
  return { edges, references };
}
function relationshipIssues(nodes: readonly DocsGraphNode[], references: readonly Reference[], unknowns: DocsGraphUnknown[]): DocsGraphIssue[] {
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const issues: DocsGraphIssue[] = [];
  const compared = new Set<string>();
  for (const reference of references) {
    const owner = nodeMap.get(reference.owner), target = nodeMap.get(reference.target);
    if (!owner || !target) continue;
    if (reference.declared !== null) {
      const declared = activation(reference.declared);
      if (declared !== 'unknown' && target.activation === 'unknown') unknowns.push({ node: owner.id, field: 'child_activation', reason: `Activation is unknown for ${target.id}.` });
      else if (declared !== 'unknown' && target.activation !== declared) issues.push({ kind: 'status_conflict', node: owner.id, target: target.id, detail: 'Child PRD activation disagrees with its declared activation.' });
    }
    const pair = owner.kind === 'contract' && reference.label === 'plan' && target.kind === 'plan' ? [target, owner]
      : owner.kind === 'plan' && reference.label === 'task contract' && target.kind === 'contract' ? [owner, target] : null;
    if (!pair) continue;
    const [plan, contract] = pair as [DocsGraphNode, DocsGraphNode];
    const key = JSON.stringify([plan.id, contract.id]);
    if (compared.has(key)) continue;
    compared.add(key);
    // The shared parser compares raw path fields; use only unambiguous, parsed relationships.
    const planTarget = references.find(ref => ref.owner === plan.id && ref.label === 'task contract')?.target;
    const contractTarget = references.find(ref => ref.owner === contract.id && ref.label === 'plan')?.target;
    for (const conflict of planContractRelationshipConflicts(plan.id, contract.id,
      planTarget ? `> **Task Contract**: ${planTarget}` : null, contractTarget ? `> **Plan**: ${contractTarget}` : null)) {
      issues.push({ kind: 'relationship_conflict', node: contract.id, target: plan.id, detail: conflict });
    }
    if (contractTarget === plan.id && contract.status?.toLowerCase() === 'active'
      && ['draft', 'approved'].includes(plan.status?.toLowerCase() ?? '')) issues.push({ kind: 'status_conflict', node: contract.id, target: plan.id, detail: 'The active contract points to a plan that is not executing.' });
  }
  return issues;
}
function staleIssues(nodes: readonly DocsGraphNode[], now: string, thresholds: DocsStaleThresholds, unknowns: DocsGraphUnknown[]): DocsGraphIssue[] {
  const issues: DocsGraphIssue[] = [];
  const nowMs = Date.parse(now);
  for (const node of nodes) {
    if (node.waiting_on || !node.updated) continue;
    const age = nowMs - Date.parse(node.updated);
    if (age < 0) { unknowns.push({ node: node.id, field: 'freshness', reason: 'updated_in_future' }); continue; }
    const status = node.status?.toLowerCase();
    const severity = status === 'executing' && age >= thresholds.executing_escalated_hours * 3_600_000 ? 'escalated'
      : status === 'executing' && age >= thresholds.executing_hint_hours * 3_600_000 || status === 'active' && age >= thresholds.active_days * 86_400_000 ? 'hint' : null;
    if (severity) issues.push({ kind: 'stale', node: node.id, detail: 'No document update within the configured interval.', severity,
      check_prompt: `Check the current progress and waiting state for ${node.id}. The recorded update is ${node.updated}. Report evidence before proposing any change.` });
  }
  return issues;
}

/** Pure projection. It never guesses links from filenames, body text, or status. */
export function buildDocsGraph(input: DocsGraphInput): DocsGraphV1 {
  const now = docsTimestamp(input.now);
  const scope = input.scope ?? 'active';
  const maxNodes = input.max_nodes ?? DOCS_GRAPH_MAX_NODES;
  if (!now || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(input.commit)
    || !['active', 'all'].includes(scope) || !Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > DOCS_GRAPH_MAX_NODES) throw new Error('Invalid docs graph input');
  const thresholds = docsStaleThresholds(input.thresholds);
  const issues: DocsGraphIssue[] = [], unknowns: DocsGraphUnknown[] = [];
  const documentMap = new Map<string, DocsDocument>();
  for (const document of input.documents) {
    if (!docsDocumentKind(document.path) || documentMap.has(document.path)) throw new Error('Invalid or duplicate docs source');
    documentMap.set(document.path, document);
  }
  const caps = new Map<string, DocsCapability>();
  for (const capability of input.capabilities ?? []) {
    if (!isDocsCapabilityId(capability.id) || !/^\.archcontext\/model\/nodes\/[a-zA-Z0-9._-]+\.ya?ml$/u.test(capability.path) || caps.has(capability.id)) throw new Error('Invalid or duplicate docs capability');
    caps.set(capability.id, capability);
  }
  const allIds = [...documentMap.keys(), ...caps.keys()].filter(id => scope === 'all' || !isArchivedDoc(id)).sort(order);
  const visible = new Set(allIds.slice(0, maxNodes));
  const { nodes, metadata } = projectNodes(visible, documentMap, caps, unknowns);
  const { edges, references } = projectRelations(metadata, documentMap, caps, visible, issues, unknowns);
  issues.push(...relationshipIssues(nodes, references, unknowns), ...staleIssues(nodes, now, thresholds, unknowns));
  return { schema_version: DOCS_GRAPH_SCHEMA, commit: input.commit, scope,
    archived_count: input.documents.filter(doc => isArchivedDoc(doc.path)).length,
    nodes, edges: byJson(edges), issues: byJson(issues), unknowns: byJson(unknowns),
    observation: { evaluated_at: now, thresholds, omitted_count: allIds.length - visible.size } };
}
