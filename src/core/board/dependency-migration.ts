/**
 * The one-shot move of body dependency lines (`Depends on #n`, `依赖 #n`) to
 * GitHub blocked-by links (#1504). After the move the templates carry no
 * dependency section, and nothing reads the old lines. The parser accepts a
 * closed grammar and refuses every other line in a dependency position, so
 * the run stops before it guesses an edge.
 */

import { sha256Prefixed } from '../evidence/sha256';

/** The plan tier labels (`templates.md`, Plan data). */
export const TIER_LABELS = Object.freeze([
  { name: 'tier:low', color: '0e8a16', description: 'Plan tier low (repo-harness-issue-flow)' },
  { name: 'tier:medium', color: 'fbca04', description: 'Plan tier medium (repo-harness-issue-flow)' },
  { name: 'tier:high', color: 'b60205', description: 'Plan tier high (repo-harness-issue-flow)' },
] as const);

export interface DependencyLineV1 {
  readonly issue: number;
  readonly blocker: number;
  /** 1-based line number in the issue body. */
  readonly line_number: number;
  readonly line: string;
}

/** A `风险：` / `Risk:` line in a dependency section: it names no blocker and is reported as skipped. */
export interface SkippedLineV1 {
  readonly issue: number;
  readonly line_number: number;
  readonly line: string;
}

/** A declaration-like line in a possible code position: it makes no edge, and the run stops on it. */
export interface AmbiguousLineV1 {
  readonly issue: number;
  readonly line_number: number;
  readonly line: string;
}

/** A line in a dependency position that the grammar does not accept. */
export interface UnparsedLineV1 {
  readonly issue: number;
  readonly line_number: number;
  readonly line: string;
  readonly reason: string;
}

/** One scan of one body. A caller writes nothing while `ambiguous` or `unparsed` is not empty. */
export interface DependencyLinesV1 {
  readonly edges: readonly DependencyLineV1[];
  readonly skipped: readonly SkippedLineV1[];
  readonly ambiguous: readonly AmbiguousLineV1[];
  readonly unparsed: readonly UnparsedLineV1[];
}

/** Module-private: carries the reason of one rejected line to the scan loop, which records it. */
class LineRejected extends Error {}

const SECTION = /^#{2,3}\s*(?:依赖|depends on)(?:\s*\/\s*(?:依赖|depends on))?\s*$/iu;
// Any other heading or bold line that names dependencies stops the run instead of opening a section.
const DEPENDENCY_TITLE = /^(?:#{1,6}\s*|\*\*|__)?\s*(?:依赖|depends on|dependencies)(?:\s*\/\s*(?:依赖|depends on|dependencies))*\s*[:：]?\s*(?:\*\*|__)?$/iu;
const HEADING = /^#{1,6}\s/u;
// Owner rule M24: the parser does not reason about Markdown positions. A body with a code or HTML
// marker anywhere refuses all its declaration-like lines; so does a declaration-like line with
// leading whitespace or with more than one space (or a tab) after its list marker.
const CODE_MARKER = /```|~~~|<pre|<!--/iu;
const LIST_MARKER = /^(?:[-*+]|[0-9]{1,9}[.)])([ \t]+)/u;
const LEAD = /^(?:depends on|依赖)(?=$|[\s:：#])/iu;
const DEPENDENCY = /^(?:depends on|依赖)\s*[:：]?\s*#([1-9][0-9]*)(?:\s+(.*))?$/iu;
const NONE = /^(?:无|none|—)[。.]?$/iu;
const BREAK = /^(?:-{3,}|\*{3,}|_{3,})$/u;
// A risk line is the tier, which is a label set by hand; it names no blocker.
const RISK = /^(?:风险|risk)\s*[:：]/iu;
const REFERENCE = /^#([1-9][0-9]*)\s*(?:（[^）]*）|\([^)]*\))?/u;
const JOIN = /^\s*(?:、|；|;|,|，|和|and)\s*(?=#)/iu;
const EARLY_START = /^early start\s*:/iu;

function reject(reason: string): never {
  throw new LineRejected(reason);
}

/** The blockers of a section line that starts with `#<n>`: a list joined by `、；;,，和 and`, each with an optional `（…）` note. */
function leadingReferences(line: string): number[] {
  const blockers: number[] = [];
  let rest = line;
  for (;;) {
    const reference = REFERENCE.exec(rest) ?? reject('expected an issue reference after a separator');
    blockers.push(Number(reference[1]));
    rest = rest.slice(reference[0].length);
    if (/#[0-9]/u.test(reference[0].slice(1))) reject('an issue reference inside a note');
    const join = JOIN.exec(rest);
    if (join === null) break;
    rest = rest.slice(join[0].length);
  }
  if (/#[0-9]/u.test(rest)) reject('an issue reference after the leading list');
  return blockers;
}

/** The blockers of one declaration line outside a code position. */
function declarationBlockers(issue: number, line: string, inSection: boolean): number[] {
  let blockers: number[];
  if (inSection && line.startsWith('#')) {
    blockers = leadingReferences(line);
  } else {
    const match = DEPENDENCY.exec(line) ?? reject('expected "Depends on #<n>", "依赖 #<n>" or a leading "#<n>" list');
    if (/#[0-9]/u.test(match[2] ?? '')) reject('more than one issue reference');
    blockers = [Number(match[1])];
  }
  if (blockers.includes(issue)) reject('an issue cannot block itself');
  return blockers;
}

/**
 * The dependency lines of one issue body. Declaration-like lines are: a line
 * that starts with `Depends on` or `依赖` (after an optional list marker),
 * followed by a space, `#`, `:`, `：` or the line end, whatever its argument
 * is; a dependency heading; and inside a `## 依赖` / `## Depends on` section
 * any line with `#<digit>`. A heading or `---` ends the section.
 *
 * A declaration-like line goes to `ambiguous` and makes no edge when the
 * body holds a code or HTML marker (`CODE_MARKER`) anywhere, when the line
 * has leading whitespace, or when it has a list marker in any form other
 * than `- #n` in a section. Otherwise only the template forms at column 0
 * parse: `Depends on #n` / `依赖：#n` with no list marker, and inside a
 * section a line that starts with a `#<n>` list (`leadingReferences`), bare
 * or after `- `. Inside a section, a "none" line, an `Early start:` line and a
 * `风险：` / `Risk:` line without a reference carry no edge. Every other line
 * in a dependency position goes to `unparsed`, and so does a heading or bold
 * line that names dependencies in another form (`#### 依赖`,
 * `## Dependencies`, `**依赖**`): only the template headings open a section.
 */
export function parseDependencyLines(issue: number, body: string): DependencyLinesV1 {
  const edges: DependencyLineV1[] = [];
  const skipped: SkippedLineV1[] = [];
  const ambiguous: AmbiguousLineV1[] = [];
  const unparsed: UnparsedLineV1[] = [];
  const refuseBody = CODE_MARKER.test(body);
  let inSection = false;
  body.replace(/\r\n/gu, '\n').split('\n').forEach((raw, index) => {
    const text = raw.trim();
    if (text === '') return;
    const at = { issue, line_number: index + 1, line: raw };
    const marker = LIST_MARKER.exec(text);
    const line = marker === null ? text : text.slice(marker[0].length);
    const heading = SECTION.test(text) || DEPENDENCY_TITLE.test(text);
    const declarationLike = LEAD.test(line) || heading || (inSection && /#[0-9]/u.test(text));
    // Owner rule M24 item 5: the only list form that parses is `- #n` (dash, one space) in a section.
    const templateMarker = marker === null || (inSection && marker[0] === '- ' && line.startsWith('#'));
    if (declarationLike && (refuseBody || raw !== raw.trimStart() || !templateMarker)) {
      ambiguous.push(Object.freeze(at));
      if (SECTION.test(text)) inSection = true;
      else if (HEADING.test(text)) inSection = false;
      return;
    }
    if (SECTION.test(text)) {
      inSection = true;
      return;
    }
    try {
      if (DEPENDENCY_TITLE.test(text)) reject('only "## 依赖" or "## Depends on" opens a dependency section');
      if (HEADING.test(text) || (inSection && BREAK.test(text))) {
        inSection = false;
        return;
      }
      if (!inSection && !LEAD.test(line)) return;
      if (inSection && (NONE.test(line) || EARLY_START.test(line))) return;
      if (inSection && RISK.test(line) && !/#[0-9]/u.test(line)) {
        skipped.push(Object.freeze(at));
        return;
      }
      for (const blocker of declarationBlockers(issue, line, inSection)) edges.push(Object.freeze({ ...at, blocker }));
    } catch (error) {
      if (!(error instanceof LineRejected)) throw error;
      unparsed.push(Object.freeze({ ...at, reason: error.message }));
    }
  });
  return Object.freeze({ edges: Object.freeze(edges), skipped: Object.freeze(skipped), ambiguous: Object.freeze(ambiguous), unparsed: Object.freeze(unparsed) });
}

export interface PlannedLabelV1 {
  readonly name: string;
  readonly color: string;
  readonly description: string;
  readonly action: 'create' | 'exists';
}

export interface PlannedEdgeV1 extends DependencyLineV1 {
  readonly action: 'create' | 'exists';
  readonly issue_id: string;
  readonly blocker_id: string;
}

/** The stop that a `--write` run raises before its first write. */
export interface DependencyMigrationStopV1 {
  readonly code: 'dependency_line_ambiguous' | 'dependency_line_unparsed';
  readonly message: string;
}

/** Everything a `--write` run would write, read from GitHub with no write. A person checks it first. */
export interface DependencyMigrationPlanV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness.dependency-migration-plan';
  readonly parent: number;
  readonly repository: string;
  readonly labels: readonly PlannedLabelV1[];
  readonly edges: readonly PlannedEdgeV1[];
  readonly skipped: readonly SkippedLineV1[];
  readonly ambiguous: readonly AmbiguousLineV1[];
  readonly unparsed: readonly UnparsedLineV1[];
  readonly stop: DependencyMigrationStopV1 | null;
  /** `sha256:<hex>` over the checked items; `--write --plan <digest>` refuses a plan that differs. */
  readonly digest: string;
}

/**
 * The digest of what a person checks: every label and link with its action
 * and source line, every skip, refusal and parse error, in plan order. Node
 * ids are not part of it, because the printed list does not show them.
 */
export function dependencyPlanDigest(plan: Omit<DependencyMigrationPlanV1, 'digest'>): string {
  const items = [
    plan.parent,
    plan.repository,
    plan.labels.map(label => [label.name, label.action]),
    plan.edges.map(edge => [edge.issue, edge.blocker, edge.line_number, edge.line, edge.action]),
    plan.skipped.map(line => [line.issue, line.line_number, line.line]),
    plan.ambiguous.map(line => [line.issue, line.line_number, line.line]),
    plan.unparsed.map(line => [line.issue, line.line_number, line.line, line.reason]),
  ];
  return sha256Prefixed(JSON.stringify(items));
}

/** Refusals stop first and name every refused line; otherwise parse errors stop and name every line. */
export function dependencyMigrationStop(ambiguous: readonly AmbiguousLineV1[], unparsed: readonly UnparsedLineV1[]): DependencyMigrationStopV1 | null {
  if (ambiguous.length > 0) {
    return Object.freeze({ code: 'dependency_line_ambiguous' as const, message: `dependency lines that are not a template form (a code or HTML marker in the body, leading whitespace, or a list marker other than "- #n" in a section); delete each refused line from the body (add the link by hand if it is needed), then run again: ${
      ambiguous.map(entry => `#${entry.issue} line ${entry.line_number}: ${entry.line.trim()}`).join('; ')}` });
  }
  if (unparsed.length > 0) {
    return Object.freeze({ code: 'dependency_line_unparsed' as const, message: `lines that are not dependency lines: ${
      unparsed.map(entry => `#${entry.issue} line ${entry.line_number} (${entry.reason}): ${entry.line.trim()}`).join('; ')}` });
  }
  return null;
}

/** The plan as text: one line per planned write, existing item, skip, refusal and parse error, then the `--write` outcome. */
export function renderDependencyMigrationPlan(plan: DependencyMigrationPlanV1): string {
  const writes = plan.labels.filter(label => label.action === 'create').length + plan.edges.filter(edge => edge.action === 'create').length;
  return [
    ...plan.labels.map(label => `${label.action} label ${label.name}`),
    ...plan.edges.map(edge => `${edge.action} #${edge.issue} blocked by #${edge.blocker} (line ${edge.line_number}: ${edge.line.trim()})`),
    ...plan.skipped.map(line => `skip #${line.issue} line ${line.line_number}: ${line.line.trim()}`),
    ...plan.ambiguous.map(line => `refuse #${line.issue} line ${line.line_number}: ${line.line.trim()}`),
    ...plan.unparsed.map(line => `unparsed #${line.issue} line ${line.line_number} (${line.reason}): ${line.line.trim()}`),
    plan.stop === null ? `--write makes ${writes} writes` : `--write stops before any write: ${plan.stop.code}`,
    `plan digest: ${plan.digest} (apply with --write --plan ${plan.digest})`,
  ].join('\n') + '\n';
}
