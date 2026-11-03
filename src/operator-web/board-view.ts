import { useCallback, useState } from 'react';
import { evaluateBoardAttention, type BoardAttentionV1, type BoardFindingV1 } from '../core/board/attention';
import { decodeBoard, type BoardItemV1, type BoardPullRequestV1, type BoardTerminalV1, type BoardV1 } from '../core/board/board';
import { BOARD_READ_FAILURES, type BoardReadFailure } from '../core/operator/board-read';
import { asApiError } from './operator-api-error';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of `GET /api/v1/repositories/<id>/board?parent=<n>`. The board
 * and its attention rules belong to core: this module decodes the body with
 * the core decoder, runs the core rules on it, and only groups and orders the
 * rows that the Main board and the Task drawer show.
 */
/** `unreachable` covers a request with no typed answer: no response, or a code this bundle does not know. */
export type BoardReason = BoardReadFailure | 'unreachable';
export type BoardRead =
  | { readonly state: 'ok'; readonly board: BoardV1 }
  | { readonly state: 'unavailable'; readonly reason: BoardReason };
export type BoardReader = (subject: BoardSubject, signal: AbortSignal) => Promise<BoardRead>;

/** One repository and one parent issue: the board has no default for either. */
export interface BoardSubject {
  readonly repository_id: string;
  readonly parent: number;
}

function boardReason(code: string): BoardReason {
  return (BOARD_READ_FAILURES as readonly string[]).includes(code) ? code as BoardReadFailure : 'unreachable';
}

export async function fetchBoard(subject: BoardSubject, signal: AbortSignal): Promise<BoardRead> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/repositories/${encodeURIComponent(subject.repository_id)}/board?parent=${subject.parent}`, {
      signal, cache: 'no-store', headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { state: 'unavailable', reason: boardReason(asApiError(body).code) };
  try { return { state: 'ok', board: decodeBoard(body) }; } catch { return { state: 'unavailable', reason: 'board_invalid' }; }
}

/**
 * Failures of transport or collection: the last board of the subject stays,
 * marked stale. A validation refusal, a missing repository or a bad request
 * drops it (ADR-0002 Versions: no last good copy after a refusal).
 */
const STALE_BOARD_KEPT: ReadonlySet<BoardReason> = new Set<BoardReason>([
  'unreachable', 'board_busy', 'board_timeout', 'board_unavailable', 'board_collect_failed', 'registry_unavailable',
]);

/** A failed refresh keeps the last board of the same subject only for the failures in STALE_BOARD_KEPT. */
export type BoardView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: BoardReason }
  | { readonly kind: 'ready'; readonly board: BoardV1; readonly attention: BoardAttentionV1; readonly refreshFailed: BoardReason | null };

/** Null without a subject; otherwise loading until the first read of this subject settles. */
export function useBoard(read: BoardReader, subject: BoardSubject | null, generation: number): BoardView | null {
  const key = subject === null ? null : `${subject.repository_id}#${subject.parent}`;
  const [state, setState] = useState<{ readonly key: string; readonly view: BoardView } | null>(null);
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (subject === null || key === null) return false;
    const result = await read({ repository_id: subject.repository_id, parent: subject.parent }, signal);
    if (signal.aborted) return false;
    if (result.state === 'ok') {
      setState({ key, view: { kind: 'ready', board: result.board, attention: evaluateBoardAttention(result.board), refreshFailed: null } });
      return true;
    }
    setState(current => current?.key === key && current.view.kind === 'ready' && STALE_BOARD_KEPT.has(result.reason)
      ? { key, view: { ...current.view, refreshFailed: result.reason } }
      : { key, view: { kind: 'failed', reason: result.reason } });
    return false;
    // `key` identifies `subject`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, key]);
  useObservationRefresh(observe, JSON.stringify(['board', key, generation]), { enabled: subject !== null });
  if (subject === null) return null;
  return state !== null && state.key === key ? state.view : { kind: 'loading' };
}

export type BoardStage = 'building' | 'verifying' | 'ready' | 'closed';
export const BOARD_STAGES: readonly Exclude<BoardStage, 'closed'>[] = ['building', 'verifying', 'ready'];

/** The open pull requests of an item, newest number first. */
export function itemPullRequests(board: BoardV1, item: BoardItemV1): readonly BoardPullRequestV1[] {
  return board.pull_requests.filter(pr => item.pull_requests.includes(pr.number)).slice().sort((left, right) => right.number - left.number);
}

/** The pull request a row shows: the newest open one, else the newest merged one. */
export function primaryPullRequest(board: BoardV1, item: BoardItemV1): BoardPullRequestV1 | null {
  const prs = itemPullRequests(board, item);
  return prs.find(pr => pr.state === 'open') ?? prs.find(pr => pr.state === 'merged') ?? null;
}

/**
 * The column of one item, read from single core fields: a closed issue is
 * closed; core merge readiness `ready` is ready; an open non-draft pull
 * request is verifying; everything else is still building.
 */
export function itemStage(board: BoardV1, item: BoardItemV1): BoardStage {
  if (item.state === 'closed') return 'closed';
  const pr = primaryPullRequest(board, item);
  if (pr?.state === 'open' && pr.merge_readiness?.ready === true) return 'ready';
  if (pr?.state === 'open' && !pr.is_draft) return 'verifying';
  return 'building';
}

/** The seat terminals that name this item's issue, or one of its pull requests. */
export function itemTerminals(board: BoardV1, item: BoardItemV1): readonly Extract<BoardTerminalV1, { readonly seat_status: 'observed' }>[] {
  if (board.execution.status !== 'observed') return [];
  return board.execution.terminals.flatMap(terminal => terminal.seat_status === 'observed'
    && (terminal.issue === item.number || (terminal.pr !== null && item.pull_requests.includes(terminal.pr))) ? [terminal] : []);
}

/** The item a "waiting for you" row shows: the first issue the finding names, if it is on the board. */
export function findingItem(board: BoardV1, finding: BoardFindingV1): BoardItemV1 | null {
  return board.items.find(item => finding.issues.includes(item.number)) ?? null;
}

/** Findings that name this item, or one of its pull requests or terminals. */
export function itemFindings(board: BoardV1, attention: BoardAttentionV1, item: BoardItemV1): readonly BoardFindingV1[] {
  const terminals = new Set(itemTerminals(board, item).map(terminal => terminal.address));
  return attention.findings.filter(finding => finding.issues.includes(item.number)
    || finding.pull_requests.some(pr => item.pull_requests.includes(pr))
    || finding.terminals.some(address => terminals.has(address)));
}

/** Pull requests merged since local midnight, newest first. */
export function shippedToday(board: BoardV1, now: number): readonly BoardPullRequestV1[] {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return board.pull_requests
    .filter(pr => pr.merged_at !== null && Date.parse(pr.merged_at) >= midnight.getTime())
    .slice().sort((left, right) => Date.parse(right.merged_at!) - Date.parse(left.merged_at!));
}
