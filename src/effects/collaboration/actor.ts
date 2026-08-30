/**
 * Who is speaking on the collaboration plane.
 *
 * D4: the actor is derived by the Host from immutable server-side provenance and
 * is never accepted from a caller. Every collaboration mutation — signal,
 * handoff, adoption, contribution — needs the same derivation, and copies of an
 * identity derivation are places for one to fall behind a rebinding check. It
 * lives here once.
 *
 * D4 supports exactly two actor kinds, and they have different provenance, not
 * different levels of trust:
 *
 * - `module_engineer` is a *live* identity. Its authority to speak is the
 *   authenticated principal mapping as it stands right now, so the mapping is
 *   read twice and compared: a mapping that moved mid-derivation makes the
 *   author uncertain, and an uncertain author is worse than a refused write.
 * - `delegated_worker` is a *historical* identity. Its authority to speak is the
 *   immutable `WorkerRunRefV1` plus the `DelegationAdmissionReceiptV1` that let
 *   the run exist at all. Those bytes cannot change, so there is nothing to
 *   re-read for liveness — and re-checking the parent Binding here would be
 *   wrong, not merely redundant: a Worker's contribution describes what that run
 *   observed, and a later rebinding of its parent Engineer does not retroactively
 *   unmake the run. What is verified instead is that the provenance *joins*:
 *   the run reference names an admitted receipt, and that receipt names the
 *   envelope whose parent Engineer the actor claims.
 *
 * The Engineer principal, Binding and delegated-run stores are read, never
 * written; this module opens no delivery-plane store for writing (D1).
 */
import { realpathSync } from 'fs';

import type { CollaborationActorRefV1 } from '../../core/collaboration/common';
import {
  readDelegatedRunRunRef,
  readDelegatedRunStatus,
  readDelegationAdmissionReceipt,
  readDelegationEnvelope,
} from '../engineers/delegated-run-store';
import { resolveEngineerPrincipal } from '../engineers/principal';
import { readEngineerPrincipalMapping } from '../engineers/principal-store';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { collaborationUnavailable } from './record-store';

export interface CollaborationPrincipalActor {
  readonly actor: CollaborationActorRefV1;
  readonly repository_id: string;
}

/**
 * How a caller proves who it is. A discriminated union rather than a bare
 * authorization string, because the second kind proves identity through a
 * persisted run rather than through a credential, and a single nullable field
 * would admit a call that supplies neither.
 */
export type CollaborationAuthorizationV1 =
  | { readonly kind: 'engineer_principal'; readonly authorization_id: string }
  | { readonly kind: 'delegated_run'; readonly dispatch_id: string };

export function engineerPrincipalAuthorization(authorizationId: string): CollaborationAuthorizationV1 {
  return Object.freeze({ kind: 'engineer_principal' as const, authorization_id: authorizationId });
}

export function delegatedRunAuthorization(dispatchId: string): CollaborationAuthorizationV1 {
  return Object.freeze({ kind: 'delegated_run' as const, dispatch_id: dispatchId });
}

/**
 * Resolve the authenticated Module Engineer behind an authorization.
 *
 * The principal mapping is read a second time after `resolveEngineerPrincipal()`
 * and compared field by field: if the mapping moved between the two reads the
 * actor is uncertain, and an uncertain author is worse than a refused write.
 */
export function resolveModuleEngineerActor(
  repoRoot: string,
  authorizationId: string,
  env: NodeJS.ProcessEnv | undefined,
): CollaborationPrincipalActor {
  const principal = resolveEngineerPrincipal({
    repo_root: repoRoot,
    authorization_id: authorizationId,
    env,
  });
  const mapping = readEngineerPrincipalMapping(principal.repository_id, authorizationId, env);
  if (!mapping
    || mapping.state !== 'active'
    || mapping.engineer_id !== principal.engineer_id
    || mapping.binding_id !== principal.binding_id
    || mapping.binding_generation !== principal.binding_generation
    || mapping.engineer_contract_revision !== principal.engineer_contract_revision) {
    collaborationUnavailable('the principal mapping changed during actor derivation');
  }
  return {
    repository_id: principal.repository_id,
    actor: Object.freeze({
      kind: 'module_engineer' as const,
      engineer_id: principal.engineer_id,
      binding_id: principal.binding_id,
      binding_generation: principal.binding_generation,
      principal_mapping_sha256: mapping.mapping_digest,
    }),
  };
}

/**
 * Resolve the delegated Worker behind one dispatch.
 *
 * Nothing here reads the Worker's own output. The parent Engineer, the binding
 * generation, the run reference and the admission receipt all come from records
 * the Host wrote, which is why a draft carrying a self-declared identity has
 * nowhere to land: there is no field for it and no branch that would read one.
 */
export function resolveDelegatedWorkerActor(
  repoRoot: string,
  dispatchId: string,
): CollaborationPrincipalActor {
  const root = realpathSync(repoRoot);
  let status: ReturnType<typeof readDelegatedRunStatus>;
  try {
    status = readDelegatedRunStatus(root, dispatchId);
  } catch (error) {
    return collaborationUnavailable(`delegated run is unavailable: ${dispatchId}`, error);
  }
  if (status.current.worker_run_ref === null) {
    collaborationUnavailable(`delegated run has no worker run reference: ${dispatchId}`);
  }
  const runRef = readDelegatedRunRunRef(root, status.current.worker_run_ref);
  const admission = readDelegationAdmissionReceipt(root, runRef.admission_receipt_sha256);
  if (admission.decision !== 'admitted') {
    collaborationUnavailable(`delegated run provenance is not an admitted delegation: ${dispatchId}`);
  }
  const envelope = readDelegationEnvelope(root, admission.envelope_sha256);
  // The run reference and the envelope must describe one delegation. A run whose
  // provenance chain does not join is not a participant whose identity the Host
  // can vouch for, and inferring one would be exactly the self-identification
  // this module exists to refuse.
  if (envelope.delegation_id !== runRef.delegation_id
    || envelope.role_profile_sha256 !== runRef.role_profile_sha256
    || envelope.logical_role !== runRef.logical_role) {
    collaborationUnavailable(`delegated run provenance does not join its envelope: ${dispatchId}`);
  }
  return {
    repository_id: repoHarnessRepoIdFor(root),
    actor: Object.freeze({
      kind: 'delegated_worker' as const,
      parent_engineer_id: envelope.engineer.engineer_id,
      parent_binding_id: envelope.engineer.binding_id,
      parent_binding_generation: envelope.engineer.binding_generation,
      worker_run_ref_sha256: runRef.run_ref_sha256,
      admission_receipt_sha256: admission.admission_receipt_sha256,
    }),
  };
}

export function resolveCollaborationActor(
  repoRoot: string,
  authorization: CollaborationAuthorizationV1,
  env: NodeJS.ProcessEnv | undefined,
): CollaborationPrincipalActor {
  if (authorization.kind === 'engineer_principal') {
    return resolveModuleEngineerActor(repoRoot, authorization.authorization_id, env);
  }
  if (authorization.kind === 'delegated_run') {
    return resolveDelegatedWorkerActor(repoRoot, authorization.dispatch_id);
  }
  return collaborationUnavailable('collaboration authorization kind is invalid');
}
