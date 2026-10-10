import { allCards, type OperatorFleetCardV1, type OperatorFleetRepositoryV1, type OperatorFleetSnapshotV1 } from './types';

/**
 * Selection identity deliberately excludes `task_revision`: a refresh that only
 * re-writes the task definition must keep the pane open and say so, not drop
 * the operator's place on the board.
 */
export function taskKey(card: OperatorFleetCardV1): string {
  return `${card.repository_id}:${card.task_id}`;
}

/** The human label is authority; the id prefix is the fallback, never a guess. */
export function taskDisplayLabel(card: OperatorFleetCardV1): { readonly text: string; readonly isLabel: boolean } {
  if (card.task_label) return { text: card.task_label, isLabel: true };
  return { text: card.task_id.slice(0, 12), isLabel: false };
}

export type MergeBlocker = NonNullable<OperatorFleetCardV1['merge_readiness']>['blockers'][number];
export type ReadinessBlocker = NonNullable<OperatorFleetCardV1['readiness_blockers']>[number];
type BlockerOwner = MergeBlocker['attention_owner'];

export function cardBlockers(card: OperatorFleetCardV1): readonly MergeBlocker[] {
  return card.merge_readiness?.blockers ?? [];
}

export type WorklistCause =
  | { readonly kind: 'blocker'; readonly blocker: MergeBlocker }
  | { readonly kind: 'readiness'; readonly blocker: ReadinessBlocker }
  | { readonly kind: 'no_progress' }
  | { readonly kind: 'unread'; readonly count: number };

/**
 * One row shows one reason. The order is the operator's routing order: a
 * blocker you own outranks a stalled agent, which outranks a wait on someone
 * else, which outranks an unread message.
 */
export function primaryCause(card: OperatorFleetCardV1): WorklistCause | null {
  const preExecution = card.task_state === 'pending' && (card.placement.kind !== 'column' || card.placement.column === 'available');
  if (preExecution && card.readiness_blockers?.length) {
    const blocker = card.readiness_blockers.find(blocker => blocker.attention_owner === 'user')
      ?? card.readiness_blockers.find(blocker => blocker.attention_owner === 'external')
      ?? card.readiness_blockers[0]!;
    return { kind: 'readiness', blocker };
  }
  const blockers = cardBlockers(card);
  const owned = (owner: BlockerOwner) => blockers.find((blocker) => blocker.attention_owner === owner);
  const userBlocker = owned('user');
  if (userBlocker) return { kind: 'blocker', blocker: userBlocker };
  if (card.feedback.no_progress) return { kind: 'no_progress' };
  const externalBlocker = owned('external');
  if (externalBlocker) return { kind: 'blocker', blocker: externalBlocker };
  const agentBlocker = owned('agent');
  if (agentBlocker) return { kind: 'blocker', blocker: agentBlocker };
  if (card.inbox.unread_count > 0) return { kind: 'unread', count: card.inbox.unread_count };
  return null;
}

export type WorklistGroupId =
  | 'needs_you'
  | 'ready_to_merge'
  | 'unreadable'
  | 'unclassified'
  | 'claimed'
  | 'available'
  | 'preparation'
  | 'external'
  | 'done';

export const WORKLIST_GROUP_ORDER: readonly WorklistGroupId[] = [
  'needs_you',
  'ready_to_merge',
  'unreadable',
  'unclassified',
  'preparation',
  'available',
  'claimed',
  'external',
  'done',
];

/**
 * Assignment order is not the display order. `unclassified` is claimed before
 * `external` so a card Fleet could not classify can never land in a group the
 * board collapses by default.
 */
function groupForCard(card: OperatorFleetCardV1): Exclude<WorklistGroupId, 'unreadable'> {
  if (card.attention_owner === 'user') return 'needs_you';
  if (card.placement.kind === 'unclassified') return 'unclassified';
  if (card.placement.kind === 'preparation' || card.placement.kind === 'alternate_workflow') return 'preparation';
  if (card.placement.column === 'available') return 'available';
  if (card.placement.column === 'ready_to_merge') return 'ready_to_merge';
  if (card.attention_owner === 'external') return 'external';
  if (card.placement.column === 'done') return 'done';
  return 'claimed';
}

function compareCards(left: OperatorFleetCardV1, right: OperatorFleetCardV1): number {
  if (left.repository_id !== right.repository_id) return left.repository_id < right.repository_id ? -1 : 1;
  const leftIndex = left.task_index ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = right.task_index ?? Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.task_id < right.task_id ? -1 : left.task_id > right.task_id ? 1 : 0;
}

export interface WorklistGroup {
  readonly id: WorklistGroupId;
  readonly cards: readonly OperatorFleetCardV1[];
  readonly repositories: readonly OperatorFleetRepositoryV1[];
  readonly count: number;
}

export function groupWorklist(snapshot: Pick<OperatorFleetSnapshotV1, 'repositories'>): readonly WorklistGroup[] {
  const buckets = new Map<WorklistGroupId, OperatorFleetCardV1[]>(
    WORKLIST_GROUP_ORDER.map((id) => [id, []]),
  );
  for (const card of allCards(snapshot)) {
    buckets.get(groupForCard(card))?.push(card);
  }
  const unreadable = snapshot.repositories.filter((repository) => repository.status === 'unreadable');
  return WORKLIST_GROUP_ORDER.map((id) => {
    const cards = (buckets.get(id) ?? []).slice().sort(compareCards);
    const repositories = id === 'unreadable' ? unreadable : [];
    return { id, cards, repositories, count: cards.length + repositories.length };
  });
}

/** Start with one useful group open; zero-count and lower-priority groups stay out of the first viewport. */
export function defaultCollapsedGroups(groups: readonly WorklistGroup[]): readonly WorklistGroupId[] {
  const firstNonEmpty = groups.find((group) => group.count > 0)?.id ?? null;
  return groups.filter((group) => group.id !== firstNonEmpty).map((group) => group.id);
}
