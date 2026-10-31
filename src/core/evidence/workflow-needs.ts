/**
 * Declared workflow job dependencies (repo-harness issue #1256).
 *
 * A summary required job fails because one of its declared needs failed. The
 * provider job list carries no workflow job id or dependency edge, so the
 * collector reads the workflow definition at the run revision and resolves the
 * declared needs from it.
 *
 * The reader accepts the small YAML subset that GitHub workflow job blocks use
 * for `name` and `needs`. Any shape it cannot read fails closed with `null`;
 * the collector then records an unknown association instead of inventing one.
 */

export interface WorkflowJobV1 {
  readonly id: string;
  readonly name: string;
  readonly needs: readonly string[];
}

export interface WorkflowJobsV1 {
  readonly jobs: readonly WorkflowJobV1[];
}

const JOB_ID = /^[A-Za-z_][A-Za-z0-9_-]*$/u;

function stripComment(value: string): string {
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1);
    if (end < 0) return value.trim();
    return value.slice(0, end + 1).trim();
  }
  const comment = /\s#/u.exec(value);
  return (comment ? value.slice(0, comment.index) : value).trim();
}

function scalarValue(raw: string): string | null {
  const value = stripComment(raw);
  if (value === '') return null;
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    if (value.length < 2 || value[value.length - 1] !== quote) return null;
    return value.slice(1, -1);
  }
  return value;
}

function flowNeeds(value: string): string[] | null {
  if (!value.startsWith('[')) return JOB_ID.test(value) ? [value] : null;
  if (!value.endsWith(']')) return null;
  const inner = value.slice(1, -1).trim();
  if (inner === '') return [];
  const ids = inner.split(',').map((entry) => entry.trim());
  if (ids.some((id) => !JOB_ID.test(id))) return null;
  return ids;
}

function blockNeed(line: string): string | null {
  const match = /^\s*-\s*([A-Za-z_][A-Za-z0-9_-]*)\s*(?:#.*)?$/u.exec(line);
  return match ? match[1]! : null;
}

/**
 * Parses the top-level `jobs` mapping. Returns null when the document has no
 * readable jobs block or a job's `name`/`needs` shape is ambiguous. Nested
 * keys, steps and expressions stay opaque: expressions are matched as
 * placeholders later, never evaluated.
 */
export function parseWorkflowJobs(text: string): WorkflowJobsV1 | null {
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  const start = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/u.test(line));
  if (start < 0) return null;
  const jobs: { id: string; name: string; needs: string[] }[] = [];
  let current: { id: string; name: string; needs: string[] } | null = null;
  let blockNeeds: string[] | null = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || /^\s*#/u.test(line)) continue;
    if (!/^\s/u.test(line)) break;
    const indent = line.length - line.trimStart().length;
    if (blockNeeds !== null) {
      const need = blockNeed(line);
      if (need !== null) {
        blockNeeds.push(need);
        continue;
      }
      blockNeeds = null;
    }
    if (indent === 2) {
      const match = /^  ([A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$/u.exec(line);
      if (!match) return null;
      current = { id: match[1]!, name: match[1]!, needs: [] };
      jobs.push(current);
      continue;
    }
    if (current === null || indent < 4) return null;
    if (indent > 4) continue;
    const property = /^    ([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/u.exec(line);
    if (!property) return null;
    const [, key, raw] = property;
    if (key === 'name') {
      const name = scalarValue(raw!);
      if (name === null) return null;
      current.name = name;
    } else if (key === 'needs') {
      const value = stripComment(raw!);
      if (value === '') {
        blockNeeds = [];
        current.needs = blockNeeds;
      } else {
        const needs = flowNeeds(value);
        if (needs === null) return null;
        current.needs = needs;
      }
    }
  }
  if (jobs.length === 0) return null;
  if (new Set(jobs.map((job) => job.id)).size !== jobs.length) return null;
  return Object.freeze({ jobs: Object.freeze(jobs.map((job) => Object.freeze({
    id: job.id, name: job.name, needs: Object.freeze([...job.needs]),
  }))) });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** True when a provider job name equals the workflow job id or its display name. */
export function workflowJobMatchesName(job: WorkflowJobV1, providerName: string): boolean {
  const name = providerName.trim();
  if (job.id === name || job.name === name) return true;
  const parts = job.name.split(/\$\{\{[^}]*\}\}/u);
  if (parts.length === 1) return false;
  return new RegExp(`^${parts.map(escapeRegExp).join('.+?')}$`, 'u').test(name);
}

/** The workflow entry for one provider job name; null when it is absent or ambiguous. */
export function resolveWorkflowJob(workflow: WorkflowJobsV1, providerName: string): WorkflowJobV1 | null {
  const exact = workflow.jobs.filter((job) => job.name === providerName.trim() || job.id === providerName.trim());
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  const templates = workflow.jobs.filter((job) => workflowJobMatchesName(job, providerName));
  return templates.length === 1 ? templates[0]! : null;
}