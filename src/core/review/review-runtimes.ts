/**
 * The runtimes the review host can open. A runtime joins only with evidence
 * that its review session is isolated (G10). The review host and the
 * `agents.uses.review` setting both read this list.
 */
export const REVIEW_RUNTIME_IDS = Object.freeze(['claude', 'codex'] as const);
export type ReviewRuntimeId = typeof REVIEW_RUNTIME_IDS[number];

export function isReviewRuntimeId(value: string): value is ReviewRuntimeId {
  return (REVIEW_RUNTIME_IDS as readonly string[]).includes(value);
}
