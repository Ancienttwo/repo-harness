/**
 * Declared workflow job dependencies (repo-harness issues #1256, #2749).
 *
 * The provider job list carries no workflow job id or dependency edge. The
 * collector reads the workflow definition and maps each provider job name to
 * one workflow job by a closed name expansion: every display name the
 * workflow can produce is computed exactly, and a provider name maps only by
 * equality. A workflow shape whose names cannot be computed exactly gives no
 * graph, and the collector keeps its fail-closed path.
 */

export interface WorkflowGraphV1 {
  /** Expanded display name -> workflow job id. Every expanded name is unique. */
  readonly jobByName: ReadonlyMap<string, string>;
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

type MatrixValue = string | number | boolean;

const MATRIX_EXPRESSION = /\$\{\{\s*matrix\.([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}/gu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMatrixValue(value: unknown): value is MatrixValue {
  return (typeof value === 'string' && !value.includes('${{'))
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isSafeInteger(value));
}

/** A static matrix of plain lists in declaration order; undefined when the job has none, null when not static. */
function staticMatrix(strategy: unknown): [string, MatrixValue[]][] | undefined | null {
  if (strategy === undefined) return undefined;
  if (!isRecord(strategy)) return null;
  if (strategy.matrix === undefined) return undefined;
  if (!isRecord(strategy.matrix)) return null;
  const entries = Object.entries(strategy.matrix);
  if (entries.length === 0) return null;
  const axes: [string, MatrixValue[]][] = [];
  for (const [key, values] of entries) {
    // include, exclude and expressions add or remove instances the reader cannot compute.
    if (key === 'include' || key === 'exclude') return null;
    if (!Array.isArray(values) || values.length === 0 || !values.every(isMatrixValue)) return null;
    axes.push([key, values]);
  }
  return axes;
}

function combinations(axes: readonly [string, MatrixValue[]][]): Map<string, MatrixValue>[] {
  return axes.reduce<Map<string, MatrixValue>[]>((rows, [key, values]) =>
    rows.flatMap(row => values.map(value => new Map([...row, [key, value]]))), [new Map()]);
}

/** Every display name GitHub gives the job's instances; null when one cannot be computed exactly. */
function expandNames(id: string, job: Record<string, unknown>): string[] | null {
  if (job.name !== undefined && typeof job.name !== 'string') return null;
  const name = job.name ?? id;
  const axes = staticMatrix(job.strategy);
  if (axes === null) return null;
  const keys = [...name.matchAll(MATRIX_EXPRESSION)].map(match => match[1]!);
  if (name.replace(MATRIX_EXPRESSION, '').includes('${{')) return null;
  if (axes === undefined) return keys.length === 0 ? [name] : null;
  const axisKeys = new Set(axes.map(([key]) => key));
  if (keys.some(key => !axisKeys.has(key))) return null;
  return combinations(axes).map(row => keys.length > 0
    ? name.replace(MATRIX_EXPRESSION, (_, key: string) => String(row.get(key)))
    : `${name} (${[...row.values()].map(String).join(', ')})`);
}

function declaredNeeds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every(need => typeof need === 'string')) return value as string[];
  return null;
}

/**
 * Parses a workflow into its expanded job names and needs. Returns null for
 * invalid YAML, a needs value that is not a string or a list of strings, a
 * name or matrix the expansion cannot compute, a reusable-workflow job (its
 * callee jobs have names the workflow does not declare), or a duplicate
 * expanded name.
 */
export function parseWorkflowGraph(text: string): WorkflowGraphV1 | null {
  let parsed: unknown;
  try { parsed = Bun.YAML.parse(text); }
  catch { return null; }
  if (!isRecord(parsed) || !isRecord(parsed.jobs)) return null;
  const jobByName = new Map<string, string>();
  const needs = new Map<string, readonly string[]>();
  for (const [id, job] of Object.entries(parsed.jobs)) {
    if (!isRecord(job) || job.uses !== undefined) return null;
    const jobNeeds = declaredNeeds(job.needs);
    const names = expandNames(id, job);
    if (jobNeeds === null || names === null) return null;
    for (const name of names) {
      if (jobByName.has(name)) return null;
      jobByName.set(name, id);
    }
    needs.set(id, Object.freeze([...jobNeeds]));
  }
  if (needs.size === 0) return null;
  return Object.freeze({ jobByName, needs });
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
 * resolve. A failed name that equals no expanded name, or a transitive need,
 * is `unknown`.
 */
export function placeFailedJobs(
  graph: WorkflowGraphV1,
  requiredName: string,
  failedNames: readonly string[],
): RequiredJobPlacementV1 | null {
  const root = graph.jobByName.get(requiredName);
  if (root === undefined) return null;
  const closure = needsClosure(graph, root);
  if (closure === null) return null;
  const declared = graph.needs.get(root)!;
  const failed = new Map<string, FailedJobPlacementV1>();
  for (const name of failedNames) {
    const id = graph.jobByName.get(name);
    failed.set(name, id === undefined || id === root ? 'unknown'
      : declared.includes(id) ? 'needed' : closure.has(id) ? 'unknown' : 'outside');
  }
  return Object.freeze({ direct: declared.length === 0, failed });
}
