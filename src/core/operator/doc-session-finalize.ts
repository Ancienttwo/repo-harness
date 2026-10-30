/** Closed request contracts for #1023. Transport adds request_id separately. */
export interface DocSessionCommitInput {
  readonly expected_head: string;
  readonly expected_diff_sha256: string;
  readonly message: string;
}
export interface DocSessionDiscardInput {
  readonly expected_head: string;
  readonly expected_loss_sha256: string;
}
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const HASH = /^[0-9a-f]{64}$/u;
function fields(value: Readonly<Record<string, unknown>>, keys: string[]): void {
  if (Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw new Error('finalize fields');
  if (typeof value.expected_head !== 'string' || !OID.test(value.expected_head)) throw new Error('finalize head');
}
export function decodeDocSessionCommit(value: Readonly<Record<string, unknown>>): DocSessionCommitInput {
  fields(value, ['expected_head', 'expected_diff_sha256', 'message']);
  if (typeof value.expected_diff_sha256 !== 'string' || !HASH.test(value.expected_diff_sha256)
    || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 8000 || value.message.includes('\0')) throw new Error('finalize commit');
  return { expected_head: value.expected_head as string, expected_diff_sha256: value.expected_diff_sha256, message: value.message };
}
export function decodeDocSessionDiscard(value: Readonly<Record<string, unknown>>): DocSessionDiscardInput {
  fields(value, ['expected_head', 'expected_loss_sha256']);
  if (typeof value.expected_loss_sha256 !== 'string' || !HASH.test(value.expected_loss_sha256)) throw new Error('finalize loss');
  return { expected_head: value.expected_head as string, expected_loss_sha256: value.expected_loss_sha256 };
}

export interface DocSessionPublicationTarget {
  /** Server-selected remote and GitHub base, never request fields. */
  readonly remote: string;
  readonly repository: string;
  readonly base_branch: string;
}
export interface DocSessionDraftPr {
  readonly url: string;
  readonly number: number;
}
export type DocSessionPrCreateResult =
  | { readonly state: 'created'; readonly pr: DocSessionDraftPr }
  | { readonly state: 'not_created' }
  | { readonly state: 'unknown' };
