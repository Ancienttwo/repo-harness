import { ARCHITECTURE_CONTRACT_VERSION, type ArchitecturePorts } from '../../core/architecture/contracts';
import { ARCHCTX_REQUIRED_VERSION } from '../../core/architecture/projection';
import {
  archcontextResolveFailure,
  archcontextResolveQueries,
  formatArchcontextCapabilityError,
  readArchcontextCapabilityAuthority,
  readArchcontextCapabilityContext,
  readArchcontextPathOwners,
  resolveArchcontextCapabilityPaths,
} from './archcontext-owners';
import { archcontextResolveFileCache } from './archcontext-resolve-cache';
import { resolvePackageLocalArchctx, stopWorkspaceArchitectureDaemons } from './archctx-provider';

/**
 * The archctx providers that every process entry registers. The two
 * composition roots add the hook notice and the CodeGraph doctor providers.
 */
export const ARCHITECTURE_PROVIDERS: Pick<ArchitecturePorts, 'ownership' | 'display' | 'runtime'> = {
  ownership: {
    contractVersion: ARCHITECTURE_CONTRACT_VERSION,
    readAuthority: readArchcontextCapabilityAuthority,
    readCapabilityContext: readArchcontextCapabilityContext,
    resolvePaths: resolveArchcontextCapabilityPaths,
    resolveQueries: archcontextResolveQueries,
    resolveCache: archcontextResolveFileCache,
    resolveFailure: archcontextResolveFailure,
    formatError: formatArchcontextCapabilityError,
  },
  display: {
    contractVersion: ARCHITECTURE_CONTRACT_VERSION,
    pathOwners: readArchcontextPathOwners,
  },
  runtime: {
    contractVersion: ARCHITECTURE_CONTRACT_VERSION,
    requiredArchctxVersion: ARCHCTX_REQUIRED_VERSION,
    resolvePackageLocalArchctx: (consumerRoot) => resolvePackageLocalArchctx(consumerRoot),
    stopWorkspaceDaemons: (repoRoot, canonicalWorktree) => stopWorkspaceArchitectureDaemons(repoRoot, canonicalWorktree),
  },
};
