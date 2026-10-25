#!/usr/bin/env bun
import {
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
} from "../src/effects/capabilities/capability-resolver";

export {
  CapabilitySourceError,
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

if (import.meta.main) {
  try {
    await runCapabilityResolverCli(process.argv.slice(2));
  } catch (error) {
    console.error(`[CapabilityResolver] ${(error as Error).message}`);
    process.exit((error as { exitCode?: number }).exitCode ?? 1);
  }
}
