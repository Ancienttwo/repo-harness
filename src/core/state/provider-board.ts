import { createHash } from 'node:crypto';
import { canonicalize } from '../evidence/canonical-json';
import type { ExternalSourceProjectionV1 } from '../external-sources/projection';
import type { ProviderIssueObservationV1 } from '../external-sources/issue-observation';
import type { AdmittedTaskSession, AdmittedTaskSessions } from '../sessions/task-sessions';

/** Provider issue state and admitted execution evidence remain separate authorities. */
export interface ProviderBoardInputsV2 {
  readonly registered_repository_id: string;
  readonly issues: ExternalSourceProjectionV1;
  readonly sessions: AdmittedTaskSessions | null;
  readonly session_error: 'unavailable' | 'stale' | 'too_large' | null;
}
export interface ProviderBoardCardV2 {
  readonly provider_repository_id: string;
  readonly provider_issue_id: string;
  readonly issue: ProviderIssueObservationV1 | null;
  readonly sessions: readonly AdmittedTaskSession[];
  readonly issue_status: 'observed' | 'unavailable';
  readonly execution_status: 'observed' | 'unavailable';
  readonly execution_error: ProviderBoardInputsV2['session_error'];
}
export interface ProviderBoardV2 {
  readonly protocol: 2;
  readonly kind: 'repo-harness-provider-board';
  readonly registered_repository_id: string;
  readonly revision: string;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
  readonly source_status: 'observed' | 'unavailable';
  readonly cards: readonly ProviderBoardCardV2[];
}

export function projectProviderBoard(input: ProviderBoardInputsV2): ProviderBoardV2 {
  if (input.issues.registered_repository_id !== input.registered_repository_id
    || (input.sessions !== null && input.sessions.repository_id !== input.registered_repository_id)
    || (input.sessions === null) !== (input.session_error !== null)) throw new Error('provider_board_identity_invalid');
  const key = (repository: string, issue: string) => `${repository}\0${issue}`;
  const identities = new Map<string, { repository: string; issue: string }>();
  for (const issue of input.issues.issues) identities.set(key(issue.provider_repository_id, issue.provider_issue_id), { repository: issue.provider_repository_id, issue: issue.provider_issue_id });
  for (const session of input.sessions?.sessions ?? []) identities.set(key(session.selector.provider_repository_id, session.selector.issue_id), { repository: session.selector.provider_repository_id, issue: session.selector.issue_id });
  const complete = input.issues.latest_attempt?.outcome === 'complete' ? input.issues.latest_attempt : null;
  const cards = [...identities.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, identity]): ProviderBoardCardV2 => {
    const issue = input.issues.issues.find(item => item.provider_repository_id === identity.repository && item.provider_issue_id === identity.issue)?.latest_observation ?? null;
    const sessions = (input.sessions?.sessions ?? []).filter(session => session.selector.provider_repository_id === identity.repository && session.selector.issue_id === identity.issue)
      .slice().sort((a, b) => a.selector.session_binding_sha256.localeCompare(b.selector.session_binding_sha256));
    return Object.freeze({ provider_repository_id: identity.repository, provider_issue_id: identity.issue, issue,
      sessions: Object.freeze(sessions), issue_status: issue !== null && complete?.source_revisions.includes(issue.source_revision) ? 'observed' : 'unavailable',
      execution_status: input.sessions === null ? 'unavailable' : 'observed', execution_error: input.session_error });
  });
  const basis = { registered_repository_id: input.registered_repository_id, cards,
    source_receipt: input.issues.latest_attempt?.receipt_sha256 ?? null, session_error: input.session_error };
  return Object.freeze({ protocol: 2, kind: 'repo-harness-provider-board', registered_repository_id: input.registered_repository_id,
    revision: `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(basis)))).digest('hex')}`,
    snapshot_consistency: 'stable', source_status: complete === null ? 'unavailable' : 'observed', cards: Object.freeze(cards) });
}
