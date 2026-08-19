/**
 * Lock-free board consistency: collect -> project -> collect.
 *
 * The board takes no task lock and no backlog lock, by design. An observer
 * that locked would serialize every agent behind every reader, and the thing
 * a reader actually needs is not exclusion but an honest answer about whether
 * the inputs moved while it was reading them.
 *
 * ```text
 * round: A = collect(); document = project(A); B = collect()
 *   A.revisions.board === B.revisions.board -> stable
 *   otherwise                               -> discard the whole round, run one more
 *   second round also unequal               -> the second round's A-side document,
 *                                              marked changed_during_read
 * ```
 *
 * The projection sits between the two collections on purpose: the window the
 * comparison covers must include the work the document was built from, not
 * just two back-to-back reads with nothing in between.
 *
 * The retry discards the WHOLE round rather than re-collecting one dimension.
 * Patching a single moved dimension into an otherwise older observation would
 * publish a document that never existed at any instant -- the exact failure
 * `changed_during_read` is meant to make visible instead of hide.
 *
 * TRUST BOUNDARY: a `changed_during_read` board is diagnostic only. `claim`,
 * `steal`, `release`, and `begin-completion` must re-read the authority inside
 * their own task lock and must never act on any board snapshot, stable or not.
 */
import { projectBoard, type BoardInputsV1 } from '../../core/state/project-board';
import type { BoardDocumentV1 } from '../../core/state/types';
import { collectBoardInputs, type CollectBoardOptions } from './collect-board-inputs';

export type BoardCollector = () => BoardInputsV1;

interface BoardRound {
  readonly document: BoardDocumentV1;
  readonly stable: boolean;
}

function collectProjectCollect(collect: BoardCollector): BoardRound {
  const before = collect();
  const document = projectBoard(before);
  const after = collect();
  return { document, stable: before.revisions.board === after.revisions.board };
}

/**
 * The injectable seam. Tests drive torn snapshots through this; the process
 * path below binds it to the real collector.
 */
export function resolveBoardFromCollector(collect: BoardCollector): BoardDocumentV1 {
  const first = collectProjectCollect(collect);
  if (first.stable) return first.document;
  const second = collectProjectCollect(collect);
  if (second.stable) return second.document;
  // Key order is preserved: only `snapshot_consistency` is replaced, so a
  // stable and a torn document stay byte-comparable field by field.
  return { ...second.document, snapshot_consistency: 'changed_during_read' };
}

export function resolveBoard(cwd: string, options: CollectBoardOptions): BoardDocumentV1 {
  return resolveBoardFromCollector(() => collectBoardInputs(cwd, options));
}
