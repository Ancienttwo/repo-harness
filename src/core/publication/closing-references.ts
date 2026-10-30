/**
 * GitHub closes issues from closing keywords in the squash commit message and
 * from the links that `closingIssuesReferences` reports. The executor sends an
 * explicit commit message, so both sets must be the same before it merges.
 */

export interface ClosingIssueReference {
  readonly repository: string;
  readonly number: number;
}

export interface LinkedClosingReferences {
  readonly references: readonly ClosingIssueReference[];
  readonly has_next_page: boolean;
}

export type ClosingReferenceCheck =
  | { readonly ok: true; readonly references: readonly string[] }
  | { readonly ok: false; readonly code: 'closing_references_incomplete'; readonly message: string }
  | {
    readonly ok: false;
    readonly code: 'closing_references_mismatch';
    readonly message: string;
    readonly message_only: readonly string[];
    readonly linked_only: readonly string[];
    /** Closing keywords that name a GitHub URL other than an issue, such as a pull request. */
    readonly unsupported: readonly string[];
  };

const REPOSITORY = '[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+';
// A keyword followed by any github.com URL is captured: an issue URL closes that
// issue, and any other target (a pull request, with or without a fragment) is refused.
const CLOSING_KEYWORD = new RegExp(
  `(?<![A-Za-z0-9_])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s*`
  + `(?:(${REPOSITORY})#(\\d+)|#(\\d+)|(https?://(?:www\\.)?github\\.com/\\S+))`,
  'giu',
);
const ISSUE_URL = new RegExp(`^https?://(?:www\\.)?github\\.com/(${REPOSITORY})/issues/(\\d+)(?![0-9])`, 'iu');

function qualified(repository: string, number: number): string {
  return `${repository.toLowerCase()}#${number}`;
}

export interface ParsedClosingReferences {
  /** Repository-qualified `owner/repo#n` issue identifiers. */
  readonly references: readonly string[];
  /** URLs after a closing keyword that do not name an issue. */
  readonly unsupported: readonly string[];
}

/** Everything that closing keywords in the text name. */
export function parseClosingReferences(repository: string, text: string): ParsedClosingReferences {
  const references = new Set<string>();
  const unsupported = new Set<string>();
  for (const match of text.matchAll(CLOSING_KEYWORD)) {
    if (match[3] !== undefined) references.add(qualified(repository, Number(match[3])));
    else if (match[1] !== undefined) references.add(qualified(match[1], Number(match[2])));
    else {
      const issue = ISSUE_URL.exec(match[4]!);
      if (issue) references.add(qualified(issue[1]!, Number(issue[2])));
      else unsupported.add(match[4]!);
    }
  }
  return { references: [...references].sort(), unsupported: [...unsupported].sort() };
}

/** Compare the commit message references with the provider's closing links. */
export function checkClosingReferences(input: {
  readonly repository: string;
  readonly commit_headline: string;
  readonly commit_body: string;
  readonly linked: LinkedClosingReferences;
}): ClosingReferenceCheck {
  if (input.linked.has_next_page) {
    return { ok: false, code: 'closing_references_incomplete', message: 'closingIssuesReferences has more than 100 entries' };
  }
  const parsed = parseClosingReferences(input.repository, `${input.commit_headline}\n${input.commit_body}`);
  const fromMessage = new Set(parsed.references);
  const linked = new Set(input.linked.references.map((reference) => qualified(reference.repository, reference.number)));
  const messageOnly = [...fromMessage].filter((reference) => !linked.has(reference)).sort();
  const linkedOnly = [...linked].filter((reference) => !fromMessage.has(reference)).sort();
  if (messageOnly.length > 0 || linkedOnly.length > 0 || parsed.unsupported.length > 0) {
    const unsupported = parsed.unsupported.length > 0
      ? `; closing keywords name unsupported targets [${parsed.unsupported.join(', ')}]`
      : '';
    return {
      ok: false,
      code: 'closing_references_mismatch',
      message: `commit message closes [${messageOnly.join(', ')}] that GitHub does not link; GitHub links [${linkedOnly.join(', ')}] that the commit message does not name${unsupported}`,
      message_only: messageOnly,
      linked_only: linkedOnly,
      unsupported: parsed.unsupported,
    };
  }
  return { ok: true, references: parsed.references };
}
