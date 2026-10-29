/** Compose existing docs/projection authorities for #1023. The host owner must
 * supply its writable-path predicate; no second instruction-file deny list. */
import { join } from 'node:path';
import { isRepositoryRelativePath } from '../../core/operator/doc-session-events';
import { readArchitectureHandEdits, type ArchctxProviderOptions } from '../architecture/archctx-provider';
import { docsHostProtectedProjection } from '../review/docs-host-isolation';
import { normalizeDocsPath } from './docs-reader';
import { DocSessionScopeRefusal, type DocSessionFinalizeDependencies } from './doc-session-finalize';
import { OperatorWriteRefusal } from './write-run';

export interface DocSessionScopeAuthority {
  /** Required canonical host policy. Must cover instruction/config paths as well
   * as docs-root scope. Do not implement a second regex or a permissive default. */
  readonly is_writable_path: (path: string) => boolean;
  readonly architecture?: ArchctxProviderOptions;
}
export function createDocSessionScopeValidator(authority: DocSessionScopeAuthority): DocSessionFinalizeDependencies['validate_changes'] {
  if (typeof authority.is_writable_path !== 'function') throw new Error('host writable-path authority is required');
  return async (session, changes) => {
    try {
      const outside = changes.filter(change => {
        try { normalizeDocsPath(change.path); } catch { return true; }
        return !authority.is_writable_path(change.path);
      }).map(change => change.path);
      if (outside.length) throw new DocSessionScopeRefusal('path_outside_scope', outside);
      const protectedPaths = new Set(docsHostProtectedProjection(session.worktree));
      const targets = changes.filter(change => protectedPaths.has(join(session.worktree, change.path))).map(change => change.path);
      if (targets.length) throw new DocSessionScopeRefusal('generated_region', targets);
      const changed = new Set(changes.map(change => change.path));
      const drift = readArchitectureHandEdits(session.worktree, authority.architecture);
      if (drift.some(row => !isRepositoryRelativePath(row.path))) throw new Error('architecture hand-edit path invalid');
      const regions = [...new Set(drift.filter(row => changed.has(row.path)).map(row => row.path))];
      if (regions.length) throw new DocSessionScopeRefusal('generated_region', regions);
    } catch (error) {
      if (error instanceof DocSessionScopeRefusal) throw error;
      throw new OperatorWriteRefusal(503, 'scope_validation_unavailable', 'The document write policy or generated-region check is unavailable.', 'Restore the policy and architecture provider before retrying.');
    }
  };
}
