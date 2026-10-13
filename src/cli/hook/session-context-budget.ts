import { createHash } from 'crypto';

export const SESSION_CONTEXT_TOKEN_BUDGET = 1_500;

export interface SessionContextSection {
  readonly id: string;
  /** Lower values come first. */
  readonly priority: number;
  readonly content: string;
  /** A mandatory section is always kept verbatim. */
  readonly mandatory: boolean;
  /** Where the full content lives. An optional section that does not fit becomes a pointer to it. */
  readonly source: string;
}

/** A stable digest of an error that does not expose its message. */
export function errorHash(error: unknown): string {
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `sha256:${createHash('sha256').update(`${errorName}\0${errorMessage}`).digest('hex')}`;
}

function estimatedTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, 'utf-8') / 4);
}

/**
 * Apply one budget to the complete SessionStart payload. Sections are ordered
 * by priority. Mandatory sections are kept verbatim and count first. Each
 * optional section is kept while it fits; otherwise it becomes
 * `[ContextRef:<id>] <source>`, so no section disappears without a pointer.
 */
export function budgetSessionContext(sections: readonly SessionContextSection[]): string {
  const ordered = sections
    .map((section) => ({ ...section, content: section.content.trim() }))
    .filter((section) => section.content.length > 0)
    .sort((left, right) => left.priority - right.priority);
  let used = estimatedTokens(ordered.filter(({ mandatory }) => mandatory).map(({ content }) => content).join('\n'));
  const chunks = ordered.map((section) => {
    if (section.mandatory) return section.content;
    const cost = estimatedTokens(`\n${section.content}`);
    if (used + cost <= SESSION_CONTEXT_TOKEN_BUDGET) {
      used += cost;
      return section.content;
    }
    const pointer = `[ContextRef:${section.id}] ${section.source}`;
    used += estimatedTokens(`\n${pointer}`);
    return pointer;
  });
  return chunks.join('\n');
}
