import { basename } from 'node:path';
import {
  OPERATOR_REPOSITORIES_KIND,
  OPERATOR_REPOSITORIES_PROTOCOL,
  type OperatorRepositoriesV1,
} from '../../core/operator/repositories';
import { readRepoHarnessRegistryStrictSnapshot, registeredRootReadable } from '../repo-registry';

/**
 * The registered repositories for `GET /api/v1/repositories`. A registration
 * whose root is gone counts as stale and is not listed. The registered root
 * stays on the server; the browser gets its basename. A registry read failure
 * throws, and the route refuses with `registry_unavailable`.
 */
export function readOperatorRepositories(env: NodeJS.ProcessEnv): OperatorRepositoriesV1 {
  const registered = readRepoHarnessRegistryStrictSnapshot({ env }).repos;
  const readable = registered.filter(registeredRootReadable);
  const repositories = readable
    .map(repo => Object.freeze({ repository_id: repo.id, display_name: basename(repo.path), access_mode: repo.accessMode }))
    .sort((left, right) => left.display_name.localeCompare(right.display_name) || left.repository_id.localeCompare(right.repository_id));
  return Object.freeze({
    protocol: OPERATOR_REPOSITORIES_PROTOCOL,
    kind: OPERATOR_REPOSITORIES_KIND,
    repositories: Object.freeze(repositories),
    stale_registrations: registered.length - readable.length,
  });
}
