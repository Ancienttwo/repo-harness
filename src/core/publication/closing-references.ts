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
  };

const REPOSITORY = '[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+';
// The issue URL form also closes issues on GitHub; parsing it only adds refusals.
const CLOSING_KEYWORD = new RegExp(
  `(?<![A-Za-z0-9_])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s*`
  + `(?:(${REPOSITORY})#(\\d+)|#(\\d+)|https://github\\.com/(${REPOSITORY})/issues/(\\d+))`,
  'giu',
);

function qualified(repository: string, number: number): string {
  return `${repository.toLowerCase()}#${number}`;
}

/** Repository-qualified `owner/repo#n` identifiers named by closing keywords in the text. */
export function parseClosingReferences(repository: string, text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(CLOSING_KEYWORD)) {
    if (match[3] !== undefined) found.add(qualified(repository, Number(match[3])));
    else if (match[1] !== undefined) found.add(qualified(match[1], Number(match[2])));
    else found.add(qualified(match[4]!, Number(match[5])));
  }
  return [...found].sort();
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
  const fromMessage = new Set(parseClosingReferences(input.repository, `${input.commit_headline}\n${input.commit_body}`));
  const linked = new Set(input.linked.references.map((reference) => qualified(reference.repository, reference.number)));
  const messageOnly = [...fromMessage].filter((reference) => !linked.has(reference)).sort();
  const linkedOnly = [...linked].filter((reference) => !fromMessage.has(reference)).sort();
  if (messageOnly.length > 0 || linkedOnly.length > 0) {
    return {
      ok: false,
      code: 'closing_references_mismatch',
      message: `commit message closes [${messageOnly.join(', ')}] that GitHub does not link; GitHub links [${linkedOnly.join(', ')}] that the commit message does not name`,
      message_only: messageOnly,
      linked_only: linkedOnly,
    };
  }
  return { ok: true, references: [...fromMessage].sort() };
}
