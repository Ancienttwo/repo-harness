/**
 * The one-shot move of body dependency lines (`Depends on #n`, `依赖 #n`) to
 * GitHub blocked-by links (#1504). After the move the templates carry no
 * dependency section, and nothing reads the old lines. The parser accepts a
 * closed grammar and refuses every other line in a dependency position, so
 * the run stops before it guesses an edge.
 */

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

export interface DependencyLinesV1 {
  readonly edges: readonly DependencyLineV1[];
  readonly skipped: readonly SkippedLineV1[];
}

export class DependencyLineError extends Error {
  constructor(readonly issue: number, readonly line_number: number, readonly line: string, reason: string) {
    super(`#${issue} line ${line_number} is not a dependency line (${reason}): ${line}`);
    this.name = 'DependencyLineError';
  }
}

const SECTION = /^#{2,3}\s*(?:依赖|depends on)(?:\s*\/\s*(?:依赖|depends on))?\s*$/iu;
// Any other heading or bold line that names dependencies stops the run instead of opening a section.
const DEPENDENCY_TITLE = /^(?:#{1,6}\s*|\*\*|__)?\s*(?:依赖|depends on|dependencies)(?:\s*\/\s*(?:依赖|depends on|dependencies))*\s*[:：]?\s*(?:\*\*|__)?$/iu;
const HEADING = /^#{1,6}\s/u;
// CommonMark: a fence closes only with the same character and at least the opening length.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/u;
const INDENTED_CODE = /^(?: {4}|\t)/u;
const LIST_ITEM = /^ {0,3}(?:[-*+]|[0-9]{1,9}[.)])(?:\s|$)/u;
const LEAD = /^(?:depends on|依赖)(?=$|[\s:：#])/iu;
const DEPENDENCY = /^(?:depends on|依赖)\s*[:：]?\s*#([1-9][0-9]*)(?:\s+(.*))?$/iu;
const NONE = /^(?:无|none|—)[。.]?$/iu;
const BREAK = /^(?:-{3,}|\*{3,}|_{3,})$/u;
// A risk line is the tier, which is a label set by hand; it names no blocker.
const RISK = /^(?:风险|risk)\s*[:：]/iu;
const REFERENCE = /^#([1-9][0-9]*)\s*(?:（[^）]*）|\([^)]*\))?/u;
const JOIN = /^\s*(?:、|；|;|,|，|和|and)\s*(?=#)/iu;
const EARLY_START = /^early start\s*:/iu;
const LIST_MARK = /^(?:[-*+]|[0-9]{1,9}[.)])\s+/u;

/** The blockers of a section line that starts with `#<n>`: a list joined by `、；;,，和 and`, each with an optional `（…）` note. */
function leadingReferences(line: string, fail: (reason: string) => never): number[] {
  const blockers: number[] = [];
  let rest = line;
  for (;;) {
    const reference = REFERENCE.exec(rest) ?? fail('expected an issue reference after a separator');
    blockers.push(Number(reference[1]));
    rest = rest.slice(reference[0].length);
    if (/#[0-9]/u.test(reference[0].slice(1))) fail('an issue reference inside a note');
    const join = JOIN.exec(rest);
    if (join === null) break;
    rest = rest.slice(join[0].length);
  }
  if (/#[0-9]/u.test(rest)) fail('an issue reference after the leading list');
  return blockers;
}

/**
 * The dependency lines of one issue body. A line counts when it starts with
 * `Depends on` or `依赖` followed by a space, `#`, `:`, `：` or the line end,
 * whatever its argument is, or when it stands in a `## 依赖` /
 * `## Depends on` section; a heading or `---` ends the section.
 * A section line may also start with a list of `#<n>` references
 * (`leadingReferences`). Inside a section, an empty line, a "none" line, an
 * `Early start:` line and a `风险：` / `Risk:` line without a reference carry
 * no edge. Every other line in those positions throws `DependencyLineError`.
 * Fenced and indented code is not read. A heading or bold line that names
 * dependencies in another form (`#### 依赖`, `## Dependencies`, `**依赖**`)
 * also throws: only the template headings open a section.
 */
export function parseDependencyLines(issue: number, body: string): DependencyLinesV1 {
  const result: DependencyLineV1[] = [];
  const skipped: SkippedLineV1[] = [];
  let inSection = false;
  let fence: string | null = null;
  let inList = false;
  body.replace(/\r\n/gu, '\n').split('\n').forEach((raw, index) => {
    if (fence !== null) {
      const close = FENCE_OPEN.exec(raw);
      if (close !== null && close[1]![0] === fence[0] && close[1]!.length >= fence.length && raw.slice(close[0].length).trim() === '') fence = null;
      return;
    }
    const open = FENCE_OPEN.exec(raw);
    if (open !== null) {
      fence = open[1]!;
      return;
    }
    const text = raw.trim();
    if (text === '') return;
    if (INDENTED_CODE.test(raw)) {
      if (!inList) return;
    } else {
      inList = LIST_ITEM.test(raw);
    }
    const fail = (reason: string): never => {
      throw new DependencyLineError(issue, index + 1, raw, reason);
    };
    if (SECTION.test(text)) {
      inSection = true;
      return;
    }
    if (DEPENDENCY_TITLE.test(text)) fail('only "## 依赖" or "## Depends on" opens a dependency section');
    if (HEADING.test(text) || (inSection && BREAK.test(text))) {
      inSection = false;
      return;
    }
    const line = text.replace(LIST_MARK, '');
    if (!inSection && !LEAD.test(line)) return;
    if (inSection && (NONE.test(line) || EARLY_START.test(line))) return;
    if (inSection && RISK.test(line) && !/#[0-9]/u.test(line)) {
      skipped.push(Object.freeze({ issue, line_number: index + 1, line: raw }));
      return;
    }
    let blockers: number[];
    if (inSection && line.startsWith('#')) {
      blockers = leadingReferences(line, fail);
    } else {
      const match = DEPENDENCY.exec(line) ?? fail('expected "Depends on #<n>", "依赖 #<n>" or a leading "#<n>" list');
      if (/#[0-9]/u.test(match[2] ?? '')) fail('more than one issue reference');
      blockers = [Number(match[1])];
    }
    for (const blocker of blockers) {
      if (blocker === issue) fail('an issue cannot block itself');
      result.push(Object.freeze({ issue, blocker, line_number: index + 1, line: raw }));
    }
  });
  return Object.freeze({ edges: Object.freeze(result), skipped: Object.freeze(skipped) });
}
