/**
 * Why an open PR has no complete file list: gh gave no list or count
 * (`files_missing`), fewer files than the PR changed (`files_truncated`, gh
 * lists at most 100), or a path that is not a public repository path.
 */
export const PULL_REQUEST_FILES_REASONS = ['files_missing', 'files_truncated', 'files_invalid'] as const;
export type PullRequestFilesReason = typeof PULL_REQUEST_FILES_REASONS[number];
export type PullRequestFiles =
  | { state: 'ok'; paths: string[] }
  | { state: 'unavailable'; reason: PullRequestFilesReason };
