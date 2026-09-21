import { realpathSync } from 'fs';
import { EngineerPrincipalError, type ClaimActorReceiptV1, type EngineerPrincipalMappingV1 } from '../../core/engineers/principal-claim';
import { validateFleetCommunicationEnvelope, type WorkEnvelopeV1 } from '../fleet/acquire';
import type { RestrictedTaskInboxInput } from '../fleet/task-inbox';
import { withRepoHarnessRegistryAuthorizationLock } from '../repo-registry';
import { withEngineerBindingLock } from './binding-store';
import { readClaimActorReceipt, validateClaimActorReceiptLive } from './claim-actor-store';
import { resolveEngineerPrincipal } from './principal';
import { readEngineerPrincipalMapping, withEngineerPrincipalStoreLock } from './principal-store';

export interface EngineerTaskInboxInput {
  readonly repo_root: string;
  readonly authorization_id: string;
  /** The exact acquire result, checked against the actor's sealed digest, not a new authority. */
  readonly work_envelope: unknown;
  /** Bound by HTTP to this request's actual token; never supplied as an MCP argument. */
  readonly verify_authorization: () => void;
  readonly env?: NodeJS.ProcessEnv;
}

function stale(message: string): never { throw new EngineerPrincipalError('engineer_principal_mismatch', message); }

/** Lock order: Binding -> Task (inside the inbox action) -> principal mapping -> registry. */
export function withEngineerTaskInbox<T>(input: EngineerTaskInboxInput, action: (inbox: RestrictedTaskInboxInput) => T): T {
  input.verify_authorization();
  const value = input.work_envelope;
  if (!value || typeof value !== 'object' || Array.isArray(value)) stale('original WorkEnvelope is required');
  const work = value as WorkEnvelopeV1;
  if (work.protocol !== 1 || work.kind !== 'repo-harness-work-envelope' || typeof work.task_id !== 'string' || typeof work.claim_id !== 'string') {
    stale('WorkEnvelope identity is invalid');
  }
  const principal = resolveEngineerPrincipal({ repo_root: input.repo_root, authorization_id: input.authorization_id, env: input.env });
  return withEngineerBindingLock(input.repo_root, principal.engineer_id, () => action({
    repo_root: input.repo_root,
    task_id: work.task_id,
    canonical_source: { sprintPath: work.sprint_path, targetRef: work.canonical_target?.ref },
    execution_worktree: work.worktree_path,
    recipient: { kind: 'claim', claim_id: work.claim_id, generation: work.generation },
    with_authority: run => withEngineerPrincipalStoreLock(input.env ?? process.env, () => withRepoHarnessRegistryAuthorizationLock({ env: input.env }, (registry) => {
      let frozen: { mapping: EngineerPrincipalMappingV1; actor: ClaimActorReceiptV1 } | undefined;
      const validate = () => {
        input.verify_authorization();
        const live = resolveEngineerPrincipal({ repo_root: input.repo_root, authorization_id: input.authorization_id, env: input.env });
        if (live.engineer_id !== principal.engineer_id || live.binding_id !== principal.binding_id || live.binding_generation !== principal.binding_generation
          || live.engineer_contract_revision !== principal.engineer_contract_revision) stale('Engineer Binding changed before task communication');
        const mapping = readEngineerPrincipalMapping(live.repository_id, input.authorization_id, input.env)!;
        const repository = registry.repos.find(repo => repo.id === live.repository_id);
        if (!repository || repository.accessMode !== 'read_write' || realpathSync(repository.path) !== realpathSync(input.repo_root)
          || registry.authorizationRevision !== work.authorization_revision) stale('Task repository authorization changed');
        const actor = readClaimActorReceipt(input.repo_root, work.task_id, work.claim_id);
        if (!actor || actor.engineer_id !== live.engineer_id || actor.binding_id !== live.binding_id || actor.binding_generation !== live.binding_generation
          || actor.engineer_contract_revision !== live.engineer_contract_revision || actor.repository_id !== live.repository_id) stale('Claim actor does not belong to this current Engineer');
        validateClaimActorReceiptLive(input.repo_root, actor, work);
        validateFleetCommunicationEnvelope(input.repo_root, work, input.env);
        if (frozen && (frozen.mapping.mapping_digest !== mapping.mapping_digest || frozen.actor.receipt_sha256 !== actor.receipt_sha256)) stale('Original task communication fence changed');
        frozen = { mapping, actor };
        return frozen;
      };
      const initial = validate();
      return run({ ...initial, revalidate: () => { validate(); } });
    })),
  }));
}
