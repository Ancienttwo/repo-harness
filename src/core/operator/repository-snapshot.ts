export const OPERATOR_REPOSITORY_PROTOCOL = 1 as const;
export const OPERATOR_REPOSITORY_SNAPSHOT_KIND = 'operator_repository_snapshot' as const;
export type RepositorySourceObservation<T> =
  | { readonly status: 'observed'; readonly observed_at: string; readonly snapshot: T }
  | { readonly status: 'unavailable'; readonly observed_at: string; readonly code: 'source_unavailable' };
export interface OperatorRepositorySnapshotV1 {
  readonly protocol: typeof OPERATOR_REPOSITORY_PROTOCOL;
  readonly kind: typeof OPERATOR_REPOSITORY_SNAPSHOT_KIND;
  readonly repository_id: string;
  readonly planning: RepositorySourceObservation<import('./planning-snapshot').OperatorPlanningSnapshot>;
  readonly organization: RepositorySourceObservation<import('./organization-snapshot').OperatorOrganizationSnapshot>;
}
