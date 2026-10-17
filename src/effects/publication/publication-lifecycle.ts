/** Read historical integration observations for dependency inspection. */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  PublicationLifecycleError,
  canonicalPublicationIntegrationObservationBytes,
  validatePublicationIntegrationObservation,
  type PublicationIntegrationObservationV1,
  type PublicationLifecycleErrorCode,
} from '../../core/publication/publication-lifecycle';
import { resolveGitCommonDirectory } from '../git/common-directory';

const INTEGRATION_RELATIVE_PATH = 'repo-harness/publications/v1/integration';
function failure(code: PublicationLifecycleErrorCode, message: string, cause?: unknown): PublicationLifecycleError {
  return new PublicationLifecycleError(code, message, cause);
}

export function readPublicationIntegrationObservations(
  repoRoot: string,
  taskId: string,
  taskRevision: string,
  gitBin?: string,
): readonly PublicationIntegrationObservationV1[] {
  const root = join(resolveGitCommonDirectory(repoRoot, gitBin), INTEGRATION_RELATIVE_PATH);
  let publications: readonly string[];
  try {
    publications = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze([]);
    throw failure('publication_incomplete', 'integration observation store is unreadable', error);
  }
  const observations: PublicationIntegrationObservationV1[] = [];
  for (const publication of publications) {
    const directory = join(root, publication);
    let files: readonly string[];
    try {
      files = readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw failure('publication_incomplete', 'integration observation store is unreadable', error);
    }
    for (const file of files) {
      const path = join(directory, file);
      let raw: string;
      try {
        raw = readFileSync(path, 'utf-8');
      } catch (error) {
        throw failure('publication_incomplete', `integration observation is unreadable: ${path}`, error);
      }
      let observation: PublicationIntegrationObservationV1;
      try {
        observation = validatePublicationIntegrationObservation(JSON.parse(raw));
      } catch (error) {
        throw failure('publication_incomplete', `integration observation is invalid: ${path}`, error);
      }
      if (`${canonicalPublicationIntegrationObservationBytes(observation)}\n` !== raw) {
        throw failure('publication_pointer_mismatch', `integration observation is not canonical: ${path}`);
      }
      if (observation.publication_id.slice('sha256:'.length) !== publication) {
        throw failure('publication_pointer_mismatch', `integration observation is misfiled: ${path}`);
      }
      if (observation.task_id === taskId && observation.task_revision === taskRevision) observations.push(observation);
    }
  }
  return Object.freeze(observations.sort((left, right) => left.observation_id.localeCompare(right.observation_id)));
}
