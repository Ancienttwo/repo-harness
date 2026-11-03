/**
 * Every refusal code of `GET /api/v1/repositories/<id>/board?parent=<n>`.
 * The route maps each one to one HTTP status; the browser names each one.
 */
export const BOARD_READ_FAILURES = [
  'board_parent_invalid',
  'registry_unavailable',
  'repository_not_found',
  'board_collect_failed',
  'board_source_invalid',
  'board_unavailable',
  'board_timeout',
  'board_invalid',
  'board_busy',
] as const;
export type BoardReadFailure = typeof BOARD_READ_FAILURES[number];

/**
 * Every refusal code of `GET /api/v1/repositories/<id>/board/parents`. The
 * GitHub read and the hc read fail with their own code; neither gives an
 * empty list.
 */
export const BOARD_PARENTS_READ_FAILURES = [
  'registry_unavailable',
  'repository_not_found',
  'parents_github_failed',
  'parents_source_invalid',
  'parents_hc_failed',
  'parents_unavailable',
  'parents_timeout',
  'parents_invalid',
  'parents_busy',
] as const;
export type BoardParentsReadFailure = typeof BOARD_PARENTS_READ_FAILURES[number];
