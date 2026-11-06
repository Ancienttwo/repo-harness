/**
 * Typed contracts of the publication writes that plugins use. A plugin does not
 * write GitHub directly: it calls these operations in `src/effects/publication/`.
 */

export interface PublicationRepository {
  /** The canonical `owner/name` that the provider returned. */
  readonly repository: string;
  readonly base_branch: string;
}

/** One exact head commit on one branch of the base repository. */
export interface DraftPullRequestHead extends PublicationRepository {
  readonly head_branch: string;
  readonly commit: string;
}

export interface DraftPullRequestDraft extends DraftPullRequestHead {
  readonly title: string;
  readonly body: string;
}

export interface DraftPullRequest {
  readonly url: string;
  readonly number: number;
}

/** `not_created`: no POST ran. `unknown`: a POST ran and its outcome is not proven. */
export type DraftPullRequestResult =
  | { readonly state: 'created'; readonly pr: DraftPullRequest }
  | { readonly state: 'not_created' }
  | { readonly state: 'unknown' };

export interface RemoteRefAddress {
  /** A local repository that holds the commit. */
  readonly checkout: string;
  readonly remote_url: string;
  /** A full `refs/heads/` name. */
  readonly ref: string;
}

export interface NewRemoteRefPush extends RemoteRefAddress {
  readonly commit: string;
}

/**
 * `pushed`: a read of the remote ref shows the commit. `not_pushed`: no push ran.
 * `refused`: the remote ref holds another commit, and no push ran. `unknown`: a
 * push ran and its outcome is not proven.
 */
export type NewRemoteRefPushResult =
  | { readonly state: 'pushed' }
  | { readonly state: 'not_pushed' }
  | { readonly state: 'refused' }
  | { readonly state: 'unknown' };

export interface AppHookConfig {
  url: string;
  content_type: 'json';
  secret: string;
  insecure_ssl: '0';
}

export function checkAppHookConfig(config: AppHookConfig): void {
  let url: URL;
  try { url = new URL(config.url); } catch { throw new Error('The GitHub App hook URL must be an HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('The GitHub App hook URL must be an HTTPS URL without user information.');
  }
  if (config.content_type !== 'json') throw new Error('The GitHub App hook content type must be json.');
  if (!config.secret || /[\x00-\x1f\x7f]/.test(config.secret)) throw new Error('The GitHub App hook secret is missing or invalid.');
  if (config.insecure_ssl !== '0') throw new Error('The GitHub App hook must verify SSL.');
}

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export const validPublicationCommit = (commit: string): boolean => OID.test(commit);

export function validPublicationBranchRef(ref: string): boolean {
  const name = /^refs\/heads\/(.+)$/u.exec(ref)?.[1];
  return name !== undefined && /^[A-Za-z0-9._/-]+$/u.test(name) && !name.startsWith('-') && !name.startsWith('/') && !name.endsWith('/')
    && !name.includes('..') && !name.includes('//') && !name.endsWith('.lock') && !name.split('/').some(part => part.startsWith('.'));
}
