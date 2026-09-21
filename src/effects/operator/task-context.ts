import { realpathSync } from 'node:fs';
import type { BoardDocumentV1 } from '../../core/state/types';
import { decodeOperatorTaskContext, isTaskContextRequest, TASK_CONTEXT_MAX_BYTES, type OperatorTaskContext, type OperatorTaskContextRequest, type TaskContextFailure } from '../../core/operator/task-context';
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
    const claim=card.claim;
    const result:OperatorTaskContext = {
      protocol:1,kind:'operator_task_context',repository_id:input.repository_id,task_id:card.task_id,task_revision:card.task_revision,
      canonical:{ target_ref:board.canonical_target.ref,commit:board.canonical_target.oid,sprint_path:board.sprint_path },
      task:{ title:card.task,mode:card.mode,acceptance:card.acceptance,state:card.task_state },
      execution:{ lease_state:card.lease_state,claim:claim ? { claim_id:claim.claim_id,generation:claim.generation,state:claim.state,branch:claim.branch,target_ref:claim.target_ref } : null },
      offer:{ execution_readiness:offer.execution_readiness,blockers:offer.blockers.map(b=>({code:b.code,attention_owner:b.attention_owner})),offer_revision:offer.offer_revision,
        plan:offer.plan ? { basis:'registered_worktree',plan_path:offer.plan.plan_path,contract_path:offer.plan.contract_path,source_ref:offer.plan.source_ref,plan_sha256:offer.plan.plan_sha256,contract_sha256:offer.plan.contract_sha256 } : null },
      observation:{ observed_at:new Date().toISOString(),board_revision:board.revisions.board,authorization_revision:after.authorization,consistency:'observed' },
    };
    if (Buffer.byteLength(JSON.stringify(result)) > TASK_CONTEXT_MAX_BYTES) return fail('too_large');
    return decodeOperatorTaskContext(result,input);
  } catch(error) { if (error instanceof OperatorTaskContextError) throw error; return fail('unavailable'); }
}
