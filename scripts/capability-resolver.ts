#!/usr/bin/env bun
import {
  PROJECTION_MANIFEST_PATH,
  matchCapabilityPath,
  normalizeCapabilityPath,
  parseCapabilityRegistry,
} from "../src/core/capabilities/registry";

export type { Capability, CapabilityRegistry, ContractFiles } from "../src/core/capabilities/registry";

import {
  CapabilitySourceError,
  buildArchContextNodesV2,
  capabilitySourceMode,
  findMatch,
  findMatches,
  readRegistry,
  runCapabilityResolverCli,
  type ArchContextNodeV2,
  type MatchAuthority,
} from "../src/effects/architecture/capability-resolver";
import { readRecordedSelection, registerSelectedArchitecturePorts } from "../src/cli/installer/architecture-selection";

export {
  CapabilitySourceError,
  PROJECTION_MANIFEST_PATH,
  buildArchContextNodesV2,
  capabilitySourceMode,
  findMatch,
  findMatches,
  matchCapabilityPath,
  normalizeCapabilityPath,
  parseCapabilityRegistry,
  readRegistry,
  runCapabilityResolverCli,
};

export type { ArchContextNodeV2, MatchAuthority };

// The package entry loads the archctx providers for a selected architecture plugin; the standalone projection has none.
await registerSelectedArchitecturePorts(readRecordedSelection(), async () => (await import("../src/effects/architecture/providers")).ARCHITECTURE_PROVIDERS);

if (import.meta.main) {
  try {
    await runCapabilityResolverCli(process.argv.slice(2));
  } catch (error) {
    console.error(`[CapabilityResolver] ${(error as Error).message}`);
    process.exit((error as { exitCode?: number }).exitCode ?? 1);
  }
}
