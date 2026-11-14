/**
 * Declared workflow job dependencies (repo-harness issues #1256, #2749).
 *
 * The provider job list carries no workflow job id or dependency edge. The
 * collector reads the workflow definition and maps a provider job name to a
 * workflow job only when no other job can produce that name. The reader never
 * reads matrix values: each job contributes the literal prefix of its display
 * name, and a job can produce a name when one of the two starts with the
 * other. A workflow shape outside the closed name domain gives no graph, and
 * the collector keeps its fail-closed path.
 */

interface WorkflowJobNameV1 {
  readonly id: string;
  /** The static name, or the name text before the first `${{`. */
  readonly prefix: string;
  /** The display name of a non-matrix job with a static name; null otherwise. */
  readonly exact: string | null;
}

export interface WorkflowGraphV1 {
  readonly jobs: readonly WorkflowJobNameV1[];
  /** Workflow job id -> declared needs. */
  readonly needs: ReadonlyMap<string, readonly string[]>;
}

/**
 * Where a failed provider job sits relative to the required job's needs graph:
 * a declared need, outside the full graph, or neither proven.
 */
export type FailedJobPlacementV1 = 'needed' | 'outside' | 'unknown';

export interface RequiredJobPlacementV1 {
  /** The required job declares no needs. */
  readonly direct: boolean;
  readonly failed: ReadonlyMap<string, FailedJobPlacementV1>;
}

const JOB_ID = /^[A-Za-z_][A-Za-z0-9_-]*$/u;
/** Plain text that Bun.YAML and GitHub read as the same string. */
const NAME_TEXT = /^[A-Za-z][A-Za-z0-9 ()/._-]*$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The job's name prefix and exact name; null outside the closed name domain. */
function jobName(id: string, job: Record<string, unknown>): WorkflowJobNameV1 | null {
  const name = job.name ?? id;
  if (typeof name !== 'string') return null;
  const template = name.indexOf('${{');
  const prefix = template < 0 ? name : name.slice(0, template);
  if (!NAME_TEXT.test(prefix) || prefix.includes('  ') || (template < 0 && prefix.endsWith(' '))) return null;
  const matrix = job.strategy !== undefined && (!isRecord(job.strategy) || job.strategy.matrix !== undefined);
  return { id, prefix, exact: template < 0 && !matrix ? name : null };
}

function declaredNeeds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every(need => typeof need === 'string')) return value as string[];
  return null;
}

/**
 * Parses a workflow into its job names and needs. Returns null for invalid
 * YAML, a needs value that is not a string or a list of strings, a job id or
 * name outside its domain, a reusable-workflow job (its callee jobs have
 * names the workflow does not declare), or a duplicate exact name. The YAML
 * reader keeps the last of duplicate mapping keys; GitHub rejects such a
 * workflow, so no run reaches this reader with one.
 */
export function parseWorkflowGraph(text: string): WorkflowGraphV1 | null {
  let parsed: unknown;
  try { parsed = Bun.YAML.parse(text); }
  catch { return null; }
  if (!isRecord(parsed) || !isRecord(parsed.jobs)) return null;
  const jobs: WorkflowJobNameV1[] = [];
  const needs = new Map<string, readonly string[]>();
  for (const [id, job] of Object.entries(parsed.jobs)) {
    if (!JOB_ID.test(id) || !isRecord(job) || job.uses !== undefined) return null;
    const jobNeeds = declaredNeeds(job.needs);
    const name = jobName(id, job);
    if (jobNeeds === null || name === null) return null;
    if (name.exact !== null && jobs.some(other => other.exact === name.exact)) return null;
    jobs.push(name);
    needs.set(id, Object.freeze([...jobNeeds]));
  }
  if (needs.size === 0) return null;
  return Object.freeze({ jobs: Object.freeze(jobs), needs });
}

/** The one job that produces the provider name; null when none or more than one job can. */
function resolveJob(graph: WorkflowGraphV1, name: string): WorkflowJobNameV1 | null {
  const producers = graph.jobs.filter(job => name.startsWith(job.prefix) || job.prefix.startsWith(name));
  if (producers.length !== 1) return null;
  const [job] = producers;
  return (job!.exact === null ? name.startsWith(job!.prefix) : name === job!.exact) ? job! : null;
}

/** The ids the root job reaches through `needs`; null on a missing need or a cycle. */
function needsClosure(graph: WorkflowGraphV1, root: string): ReadonlySet<string> | null {
  const reached = new Set<string>();
  const visit = (id: string, path: ReadonlySet<string>): boolean => {
    for (const need of graph.needs.get(id)!) {
      if (path.has(need) || !graph.needs.has(need)) return false;
      if (reached.has(need)) continue;
      reached.add(need);
      if (!visit(need, new Set([...path, need]))) return false;
    }
    return true;
  };
  return visit(root, new Set([root])) ? reached : null;
}

/**
 * Places each failed provider job against the full needs graph of the
 * required job. Returns null when the required name or its graph does not
 * resolve. A failed job is `outside` only when it is the exact name of one
 * non-matrix job outside the graph; an unresolved name or a transitive need
 * is `unknown`.
 */
export function placeFailedJobs(
  graph: WorkflowGraphV1,
  requiredName: string,
  failedNames: readonly string[],
): RequiredJobPlacementV1 | null {
  const root = resolveJob(graph, requiredName)?.id;
  if (root === undefined) return null;
  const closure = needsClosure(graph, root);
  if (closure === null) return null;
  const declared = graph.needs.get(root)!;
  const failed = new Map<string, FailedJobPlacementV1>();
  for (const name of failedNames) {
    const job = resolveJob(graph, name);
    failed.set(name, job === null || job.id === root ? 'unknown'
      : declared.includes(job.id) ? 'needed'
      : !closure.has(job.id) && job.exact === name ? 'outside' : 'unknown');
  }
  return Object.freeze({ direct: declared.length === 0, failed });
}
