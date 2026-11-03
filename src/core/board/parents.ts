import type { BoardOpenIssuesReadV1 } from './source';

/**
 * The parent list: the open issues of one repository that have at least one
 * sub-issue, with the count of live hc seats that name each one. It is the
 * entry of the Board page. GitHub and hc stay the authorities.
 */
export const BOARD_PARENTS_PROTOCOL = 1 as const;
export const BOARD_PARENTS_KIND = 'repo-harness.board-parents' as const;

export interface BoardParentV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly updated_at: string;
  /** `completed` counts the closed sub-issues. */
  readonly sub_issues: { readonly total: number; readonly completed: number };
  /** Live terminals with a seat label and this parent's label. */
  readonly seats: number;
}

export interface BoardParentsV1 {
  readonly protocol: typeof BOARD_PARENTS_PROTOCOL;
  readonly kind: typeof BOARD_PARENTS_KIND;
  readonly observed_at: string;
  readonly repository: string;
  /** Parents with live seats first, then the most recently updated. */
  readonly parents: readonly BoardParentV1[];
}

export interface BoardParentsInputV1 {
  readonly observed_at: string;
  readonly issues: BoardOpenIssuesReadV1;
  readonly terminals: readonly { readonly parent?: string; readonly seat?: string }[];
}

export function projectBoardParents(input: BoardParentsInputV1): BoardParentsV1 {
  const seats = new Map<string, number>();
  for (const terminal of input.terminals) {
    if (terminal.parent === undefined || terminal.seat === undefined || terminal.seat === '') continue;
    seats.set(terminal.parent, (seats.get(terminal.parent) ?? 0) + 1);
  }
  const parents = input.issues.issues
    .filter(issue => issue.sub_issues.total > 0)
    .map(issue => Object.freeze({ ...issue, seats: seats.get(String(issue.number)) ?? 0 }))
    .sort((left, right) => Number(right.seats > 0) - Number(left.seats > 0)
      || Date.parse(right.updated_at) - Date.parse(left.updated_at)
      || right.number - left.number);
  return Object.freeze({
    protocol: BOARD_PARENTS_PROTOCOL,
    kind: BOARD_PARENTS_KIND,
    observed_at: input.observed_at,
    repository: input.issues.repository.name_with_owner,
    parents: Object.freeze(parents),
  });
}

/** Refuse a parent list of another protocol or kind at a process boundary (Surface contract, docs/adr/ADR-0002). */
export function decodeBoardParents(value: unknown): BoardParentsV1 {
  const list = value as Partial<BoardParentsV1> | null;
  if (list?.protocol !== BOARD_PARENTS_PROTOCOL) throw new Error(`unsupported board parents protocol: ${String(list?.protocol)}`);
  if (list.kind !== BOARD_PARENTS_KIND) throw new Error(`unsupported board parents kind: ${String(list.kind)}`);
  return list as BoardParentsV1;
}
