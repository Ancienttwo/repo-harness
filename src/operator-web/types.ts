/** Browser projections import their transport types from the core authority. */
export type {
  OperatorFleetCardV1,
  OperatorFleetColumn,
  OperatorFleetCountsV1,
  OperatorFleetErrorV1,
  OperatorFleetFeedbackSummaryV1,
  OperatorFleetInboxSummaryV1,
  OperatorFleetRepositoryV1,
  OperatorFleetSnapshotConsistency,
  OperatorFleetSnapshotV1,
} from '../core/operator/fleet-snapshot';

import type {
  OperatorFleetCardV1,
  OperatorFleetColumn,
  OperatorFleetRepositoryV1,
  OperatorFleetSnapshotConsistency,
  OperatorFleetSnapshotV1,
} from '../core/operator/fleet-snapshot';

export interface OperatorApiErrorV1 {
  readonly code: string;
  readonly message: string;
  readonly next_action: string;
}

export interface OperatorApiErrorEnvelopeV1 {
  readonly error: OperatorApiErrorV1;
}

export type OperatorSnapshotViewState =
  | { readonly kind: 'loading'; readonly previous: OperatorFleetSnapshotV1 | null }
  | { readonly kind: 'stable'; readonly snapshot: OperatorFleetSnapshotV1 }
  | { readonly kind: 'empty'; readonly snapshot: OperatorFleetSnapshotV1 }
  | { readonly kind: 'repo-degraded'; readonly snapshot: OperatorFleetSnapshotV1 }
  | { readonly kind: 'changed-during-read'; readonly snapshot: OperatorFleetSnapshotV1 }
  | {
      readonly kind: 'stale';
      readonly snapshot: OperatorFleetSnapshotV1;
      readonly error: OperatorApiErrorV1;
    }
  | { readonly kind: 'fatal'; readonly error: OperatorApiErrorV1 };

export const OPERATOR_COLUMNS: readonly { readonly id: OperatorFleetColumn; readonly label: string }[] = [
  { id: 'available', label: 'Available' },
  { id: 'working', label: 'Working' },
  { id: 'in_review', label: 'In review' },
  { id: 'ready_to_merge', label: 'Ready to merge' },
  { id: 'done', label: 'Done' },
];

export function snapshotViewKind(snapshot: OperatorFleetSnapshotV1): Exclude<OperatorSnapshotViewState['kind'], 'loading' | 'stale' | 'fatal'> {
  if (snapshot.repositories.length === 0) return 'empty';
  if (
    snapshot.snapshot_consistency === 'changed_during_read'
    || snapshot.repositories.some((repository) => repository.snapshot_consistency === 'changed_during_read')
  ) return 'changed-during-read';
  if (
    snapshot.snapshot_consistency === 'degraded'
    || snapshot.repositories.some((repository) => repository.status === 'unreadable' || repository.snapshot_consistency === 'degraded')
  ) return 'repo-degraded';
  return 'stable';
}

export function projectSnapshotViewState(snapshot: OperatorFleetSnapshotV1): OperatorSnapshotViewState {
  const kind = snapshotViewKind(snapshot);
  return { kind, snapshot } as OperatorSnapshotViewState;
}

export function cardsForColumn(
  snapshot: OperatorFleetSnapshotV1,
  column: OperatorFleetColumn,
): readonly OperatorFleetCardV1[] {
  return snapshot.repositories.flatMap((repository) =>
    repository.cards.filter((card) => card.column === column),
  );
}

export function attentionCards(snapshot: OperatorFleetSnapshotV1): readonly OperatorFleetCardV1[] {
  return snapshot.repositories.flatMap((repository) =>
    repository.cards.filter((card) => card.attention_owner !== 'none'),
  );
}

export function allCards(snapshot: OperatorFleetSnapshotV1): readonly OperatorFleetCardV1[] {
  return snapshot.repositories.flatMap((repository) => repository.cards);
}

export function formatObservedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}
