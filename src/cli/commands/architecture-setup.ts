import { ARCHCONTEXT_NODE_RANGE, productVersionManifest } from 'archctx-contracts';
import { ARCHITECTURE_CONTRACT_VERSION, type ArchitectureSetupPort, type ManagedArchctxReadback } from '../../core/architecture/contracts';
import { archctxCapabilities, inspectArchitectureProjectionReadiness, verifyArchctxDaemonRuntime } from '../../effects/architecture/archctx-provider';
import { architectureModelReady } from '../../effects/architecture/architecture-read';
import { readGlobalArchitectureConfiguration } from '../../effects/architecture/projection-config';
import { ARCHCTX_PACKAGES } from '../installer/install-profile';
import { bunGlobalPackageRoot } from '../installer/skill-projection';
import { ensureGlobalArchitectureProjection } from './architecture-configuration';
import { findInstalledPackageRoot, readPackageManifest, recordValue } from './global-runtime';

function readManagedPackages(globalPackageRoot: string, cwd: string, env: NodeJS.ProcessEnv): ManagedArchctxReadback {
  const dependencies = recordValue(readPackageManifest(globalPackageRoot).dependencies);
  const versions: string[] = [];
  for (const packageName of ARCHCTX_PACKAGES) {
    const expected = dependencies[packageName];
    if (typeof expected !== 'string') {
      return { status: 'package-mismatch', detail: `installed repo-harness does not declare mandatory dependency ${packageName}` };
    }
    const packageRoot = findInstalledPackageRoot(globalPackageRoot, packageName);
    if (packageRoot === null) {
      return { status: 'package-mismatch', detail: `mandatory dependency is missing: ${packageName}@${expected}` };
    }
    const actual = readPackageManifest(packageRoot).version;
    if (actual !== expected) {
      return { status: 'package-mismatch', detail: `mandatory dependency mismatch: expected ${packageName}@${expected}, got ${String(actual)}` };
    }
    versions.push(`${packageName}@${actual}`);
  }

  const archctxRoot = findInstalledPackageRoot(globalPackageRoot, 'archctx')!;
  const archctx = readPackageManifest(archctxRoot);
  const nodeRange = recordValue(archctx.engines).node;
  if (nodeRange !== ARCHCONTEXT_NODE_RANGE) {
    return { status: 'package-mismatch', detail: `archctx Node runtime contract mismatch: expected ${ARCHCONTEXT_NODE_RANGE}, got ${String(nodeRange)}` };
  }
  const codegraphVersion = recordValue(archctx.dependencies)['@colbymchenry/codegraph'];
  if (typeof codegraphVersion !== 'string') {
    return { status: 'package-mismatch', detail: 'archctx does not declare mandatory package-local CodeGraph' };
  }
  const codegraphRoot = findInstalledPackageRoot(archctxRoot, '@colbymchenry/codegraph');
  const actualCodegraph = codegraphRoot === null ? null : readPackageManifest(codegraphRoot).version;
  if (actualCodegraph !== codegraphVersion) {
    return { status: 'package-mismatch', detail: `archctx package-local CodeGraph mismatch: expected ${codegraphVersion}, got ${String(actualCodegraph)}` };
  }

  try {
    archctxCapabilities(cwd, {
      consumerRoot: globalPackageRoot,
      env,
      policy: { provider: 'archctx', applyMode: 'manual', requiredVersion: String(dependencies.archctx), timeoutMs: 10_000 },
    });
  } catch (error) {
    return { status: 'runtime-mismatch', detail: error instanceof Error ? error.message : String(error) };
  }
  versions.push(`@colbymchenry/codegraph@${actualCodegraph}`, `node=${ARCHCONTEXT_NODE_RANGE}`);
  return { status: 'ready', versions };
}

function verifyDaemon(cwd: string, env: NodeJS.ProcessEnv): void {
  const globalPackageRoot = bunGlobalPackageRoot(env);
  if (!globalPackageRoot) throw new Error('unable to resolve Bun global package root');
  const requiredVersion = recordValue(readPackageManifest(globalPackageRoot).dependencies).archctx;
  if (typeof requiredVersion !== 'string') throw new Error('managed archctx dependency version is unavailable');
  const archctxRoot = findInstalledPackageRoot(globalPackageRoot, 'archctx');
  if (archctxRoot === null) {
    throw new Error(`mandatory dependency is missing: archctx@${requiredVersion}`);
  }
  verifyArchctxDaemonRuntime(cwd, {
    consumerRoot: globalPackageRoot, env,
    policy: { provider: 'archctx', applyMode: 'manual', requiredVersion, timeoutMs: 10_000 },
  }, archctxRoot);
}

/** The setup provider that only the CLI root registers, and only when the architecture plugin is selected. */
export const ARCHITECTURE_SETUP_PROVIDER: ArchitectureSetupPort = {
  contractVersion: ARCHITECTURE_CONTRACT_VERSION,
  codegraphVersion: productVersionManifest().runtime.codeGraph.requiredVersion,
  readManagedPackages,
  verifyDaemon,
  ensureGlobalConfiguration: ensureGlobalArchitectureProjection,
  readiness: (repoRoot, env) => inspectArchitectureProjectionReadiness(repoRoot, architectureModelReady, { env }),
  configuration: (env) => {
    const { path, initialized } = readGlobalArchitectureConfiguration(env);
    return { scope: 'global', path, initialized };
  },
};
