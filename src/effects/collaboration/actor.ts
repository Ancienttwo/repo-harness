/**
 * Who is speaking on the collaboration plane.
 *
 * D4: the actor is derived by the Host from an authenticated principal and is
 * never accepted from a caller. Every collaboration mutation — signal, handoff,
 * adoption — needs the same derivation, and three copies of an identity
 * derivation is three places for one to fall behind a rebinding check. It lives
 * here once.
 *
 * The Engineer principal and Binding are read, never written; this module opens
 * no delivery-plane store for writing (D1).
 */
import type { CollaborationActorRefV1 } from '../../core/collaboration/common';
import { resolveEngineerPrincipal } from '../engineers/principal';
import { readEngineerPrincipalMapping } from '../engineers/principal-store';
import { collaborationUnavailable } from './record-store';

export interface CollaborationPrincipalActor {
  readonly actor: CollaborationActorRefV1;
  readonly repository_id: string;
}

/**
 * Resolve the authenticated Module Engineer behind an authorization.
 *
 * The principal mapping is read a second time after `resolveEngineerPrincipal()`
 * and compared field by field: if the mapping moved between the two reads the
 * actor is uncertain, and an uncertain author is worse than a refused write.
 */
export function resolveCollaborationActor(
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
