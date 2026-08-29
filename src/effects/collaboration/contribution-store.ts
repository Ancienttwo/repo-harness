/**
 * The append-only `CollaborationContributionCommitV1` store — the visibility
 * boundary of the collaboration plane.
 *
 * Sprint row C4. Store mechanics come from `record-store.ts`; this module is the
 * commit-specific part, which is almost entirely one property: a projection may
 * read a contribution only through here, and a commit exists only after every
 * candidate it names is already on disk.
 *
 * The shard is `contribution-commits/`, which is on D9's frozen list. There is
 * no drafts shard and no candidates shard: candidates are ordinary signals and
 * handoffs in their own stores, and what makes them a *contribution* is being
 * named by a commit. That is why `listContributedSignalIds()` below is a filter
 * over commits rather than a flag on a signal — a flag would be a second
 * authority that could disagree with the commit.
 *
 * Zero delivery-plane write (D1).
 */
import { realpathSync } from 'fs';

import { validateCollaborationRecordId } from '../../core/collaboration/common';
import {
  canonicalCollaborationContributionCommitBytes,
  collaborationContributionCommitId,
  deriveCollaborationContributionCommitId,
  validateCollaborationContributionCommit,
  type CollaborationContributionCommitV1,
} from '../../core/collaboration/contribution';
import {
  COLLABORATION_STORE_RELATIVE_ROOT,
  collaborationStorePaths,
  listCollaborationRecords,
  readCollaborationRecord,
  type CollaborationRecordCodec,
  type CollaborationStorePaths,
} from './record-store';

export const COLLABORATION_CONTRIBUTIONS_SHARD = 'contribution-commits';
export const COLLABORATION_CONTRIBUTIONS_RELATIVE_ROOT =
  `${COLLABORATION_STORE_RELATIVE_ROOT}/${COLLABORATION_CONTRIBUTIONS_SHARD}`;

/**
 * The commit carries no id field, so its identity is recomputed from the run
 * reference in its own bytes and compared with the filename it was read from. A
 * commit filed under a name it does not derive is a corrupt store.
 */
export const CONTRIBUTION_COMMIT_CODEC: CollaborationRecordCodec<CollaborationContributionCommitV1> = {
  label: 'contribution commit',
  validate: validateCollaborationContributionCommit,
  identityOf: collaborationContributionCommitId,
  canonicalBytes: canonicalCollaborationContributionCommitBytes,
};

export function contributionStorePaths(repoRoot: string): CollaborationStorePaths {
  return collaborationStorePaths(repoRoot, COLLABORATION_CONTRIBUTIONS_SHARD);
}

/** The commit one delegated run published, or `null` if it has not committed. */
export function readCollaborationContributionCommit(
  repoRoot: string,
  workerRunRefSha256: string,
): CollaborationContributionCommitV1 | null {
  const commitId = deriveCollaborationContributionCommitId(workerRunRefSha256);
  return readCollaborationRecord(
    contributionStorePaths(realpathSync(repoRoot)),
    CONTRIBUTION_COMMIT_CODEC,
    commitId,
    'contribution_commit_id',
  );
}

export function readCollaborationContributionCommitById(
  repoRoot: string,
  commitId: string,
): CollaborationContributionCommitV1 | null {
  validateCollaborationRecordId(commitId, 'contribution_commit_id');
  return readCollaborationRecord(
    contributionStorePaths(realpathSync(repoRoot)),
    CONTRIBUTION_COMMIT_CODEC,
    commitId,
    'contribution_commit_id',
  );
}

export function listCollaborationContributionCommits(
  repoRoot: string,
): readonly CollaborationContributionCommitV1[] {
  return listCollaborationRecords(
    contributionStorePaths(realpathSync(repoRoot)),
    CONTRIBUTION_COMMIT_CODEC,
    'contribution_commit_id',
  );
}

/**
 * Every signal id a committed contribution made visible.
 *
 * This is the read a projection filters on. A candidate signal that is on disk
 * but named by no commit is deliberately absent from this set: it was written
 * before its transaction finished, and a reader must not be able to tell the
 * difference between "not yet committed" and "never written".
 */
export function listContributedSignalIds(repoRoot: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const commit of listCollaborationContributionCommits(repoRoot)) {
    for (const ref of commit.signal_refs) ids.add(ref.signal_id);
  }
  return ids;
}

/** Every handoff id a committed contribution made visible, on the same rule. */
export function listContributedHandoffIds(repoRoot: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const commit of listCollaborationContributionCommits(repoRoot)) {
    if (commit.handoff_ref !== null) ids.add(commit.handoff_ref.handoff_id);
  }
  return ids;
}
