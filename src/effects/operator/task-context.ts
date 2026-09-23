import { realpathSync } from 'node:fs';
import type { BoardDocumentV1 } from '../../core/state/types';
import { projectOperatorTaskContext, decodeOperatorTaskContext, TASK_CONTEXT_MAX_BYTES, isTaskContextRequest, type OperatorTaskContext, type OperatorTaskContextRequest, type TaskContextFailure } from '../../core/operator/task-context';
import { collectRepoTaskOffers } from '../fleet/acquire';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { resolveBoard } from '../state/resolve-board';

export class OperatorTaskContextError extends Error {
  constructor(readonly code: TaskContextFailure) { super(code); }
}
const fail = (code: TaskContextFailure): never => { throw new OperatorTaskContextError(code); };
/** The same owning readers serve the operator; this projection grants no execution authority. */
export function readOperatorTaskContext(input: OperatorTaskContextRequest & { readonly env?: NodeJS.ProcessEnv }): OperatorTaskContext {
  try {
    if (!isTaskContextRequest(input)) return fail('unavailable');
    const observe = () => {
      const registry = readRepoHarnessRegistryStrictSnapshot({ env:input.env, adoptedOnly:false });
      const repo = registry.repos.find(r=>r.id === input.repository_id);
      if (!repo) return fail('task_not_found');
      const root = realpathSync(repo.path);
      let board: BoardDocumentV1 | null = null;
      const result = collectRepoTaskOffers(repo,registry,{ env:input.env,task_id:input.task_id,board_reader:(...args)=>{ const value=resolveBoard(...args); board=value; return value; } });
      const observed = board as BoardDocumentV1 | null;
      const card = observed?.cards.find(c=>c.task_id === input.task_id);
      const offer = result?.offers.find(o=>o.task_id === input.task_id);
      if (!observed || !card || !offer) return fail('task_not_found');
      if (observed.snapshot_consistency !== 'stable' || offer.snapshot_consistency !== 'stable'
        || (input.expected_task_revision !== null && card.task_revision !== input.expected_task_revision)) return fail('stale');
      return { root, authorization:registry.authorizationRevision, board:observed,card,offer };
    };
    const before=observe(), after=observe();
    if (before.root !== after.root || before.authorization !== after.authorization || before.board.revisions.board !== after.board.revisions.board
      || JSON.stringify(before.offer) !== JSON.stringify(after.offer)) return fail('stale');
    const finalRegistry = readRepoHarnessRegistryStrictSnapshot({env:input.env,adoptedOnly:false});
    const finalRepo = finalRegistry.repos.find(r=>r.id === input.repository_id);
    if (!finalRepo || finalRegistry.authorizationRevision !== after.authorization || realpathSync(finalRepo.path) !== after.root) return fail('stale');
    const {board,card,offer}=after;
    const result = projectOperatorTaskContext({ repository_id:input.repository_id,board,card,offer,
      authorization_revision:after.authorization,observed_at:new Date().toISOString() });
    if (Buffer.byteLength(JSON.stringify(result)) > TASK_CONTEXT_MAX_BYTES) return fail('too_large');
    return decodeOperatorTaskContext(result,input);
  } catch(error) { if (error instanceof OperatorTaskContextError) throw error; return fail('unavailable'); }
}
