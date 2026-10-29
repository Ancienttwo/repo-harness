import type { DocCitationV1 } from '../core/operator/doc-citation';
import { DOC_SESSION_MAX_CITATIONS } from '../core/operator/doc-session-api';

/**
 * The doc session being composed. The Home composer and the Docs page share
 * one draft, so a citation added on one page is in the other. A session names
 * one repository, so the draft takes it from its first citation.
 */
export interface DocDraft {
  readonly instruction: string;
  /** The runtime the user picked; null follows the saved default. */
  readonly runtime: string | null;
  readonly repositoryId: string | null;
  readonly citations: readonly DocCitationV1[];
}

export const EMPTY_DOC_DRAFT: DocDraft = Object.freeze({ instruction: '', runtime: null, repositoryId: null, citations: Object.freeze([]) });

const same = (left: DocCitationV1, right: DocCitationV1) =>
  left.path === right.path && left.start_line === right.start_line && left.end_line === right.end_line && left.commit === right.commit;

/** Whether `citation` of `repositoryId` would be refused for lack of room. */
export function draftFull(draft: DocDraft, repositoryId: string): boolean {
  return draft.repositoryId === repositoryId && draft.citations.length >= DOC_SESSION_MAX_CITATIONS;
}

/**
 * Adds a citation. A citation from another repository starts a new set: the
 * earlier citations belong to a session in a repository this one is not in.
 * The same range at the same commit is added once.
 */
export function withCitation(draft: DocDraft, repositoryId: string, citation: DocCitationV1): DocDraft {
  if (draft.repositoryId !== repositoryId) return { ...draft, repositoryId, citations: [citation] };
  if (draft.citations.some(existing => same(existing, citation)) || draftFull(draft, repositoryId)) return draft;
  return { ...draft, citations: [...draft.citations, citation] };
}

export function withoutCitation(draft: DocDraft, index: number): DocDraft {
  const citations = draft.citations.filter((_, position) => position !== index);
  return { ...draft, citations, repositoryId: citations.length === 0 ? null : draft.repositoryId };
}
