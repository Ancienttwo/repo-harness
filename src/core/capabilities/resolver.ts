import {
  CAPABILITY_SOURCE_MODES,
  matchCapabilityPath,
  type ArchcontextCapabilityOwners,
  type Capability,
  type CapabilityPathMatch,
  type CapabilityRegistry,
  type CapabilitySourceMode,
} from "./registry";

export const HARNESS_POLICY = ".ai/harness/policy.json";
const CAPABILITY_SOURCE_KEY = `${HARNESS_POLICY}#context.capability_source`;

// Explicit one-shot registry -> ArchContext node/v2 migration projection. The
// exporter carries only facts already present in the registry; it does not
// become a second runtime authority and is never read by capability resolution.
export type ArchContextNodeV2 = {
  schemaVersion: "archcontext.node/v2";
  id: string;
  kind: "capability";
  name: string;
  status: "active";
  summary: string;
  responsibilities: string[];
  source: {
    include: string[];
  };
  extensions: {
    contractFiles: {
      agents: string;
      claude: string;
    };
    lspProfile: string;
    verification: string[];
  };
};

/**
 * Capability source selection failures. These are configuration/authority
 * failures rather than registry content failures, so they exit 2 and never
 * degrade to the other source.
 */
export class CapabilitySourceError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "CapabilitySourceError";
  }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Read `context.capability_source` from an already loaded policy document. */
export function capabilitySourceModeFromPolicy(policy: unknown): CapabilitySourceMode {
  const value = plainRecord(plainRecord(policy)?.context)?.capability_source;
  if (value === undefined) return "registry";
  if (typeof value === "string" && (CAPABILITY_SOURCE_MODES as readonly string[]).includes(value)) {
    return value as CapabilitySourceMode;
  }
  throw new CapabilitySourceError(
    `unknown capability source: ${JSON.stringify(value)}; ${CAPABILITY_SOURCE_KEY} must be one of ` +
      CAPABILITY_SOURCE_MODES.join(", ")
  );
}

// Under `archcontext`, `winner.prefix` is the owner's stable node id: ArchContext
// does not report which include matched, so no synthetic path prefix is shown.
export function matchRecord(filePath: string, winner: CapabilityPathMatch | null) {
  if (winner === null) {
    return {
      matched: false,
      file_path: filePath,
      functional_block: "root",
      matched_prefix: "root",
      capability_id: "root",
      architecture_domain: "root",
      architecture_capability: "_root",
      architecture_module: "docs/architecture/index.md",
      workstream_dir: "tasks/workstreams/root/_root",
    };
  }
  return {
    matched: true,
    file_path: winner.filePath,
    functional_block: winner.prefix,
    matched_prefix: winner.prefix,
    capability_id: winner.capability.id,
    architecture_domain: winner.capability.domain,
    architecture_capability: winner.capability.name,
    architecture_module: winner.capability.architecture_module,
    workstream_dir: winner.capability.workstream_dir,
    contract_agents: winner.capability.contract_files.agents,
    contract_claude: winner.capability.contract_files.claude,
    lsp_profile: winner.capability.lsp_profile,
    verification_hints: winner.capability.verification_hints,
  };
}

/** Registry-mode longest-prefix match. Under `archcontext`, use findMatches. */
export function findMatch(registry: CapabilityRegistry, repo: string, inputPath: string) {
  const result = matchCapabilityPath(registry, inputPath, { repoRoot: repo });
  if (result.status === "invalid") {
    throw new Error(result.diagnostics.map((item) => item.message).join("; "));
  }
  return result.status === "matched" ? matchRecord(result.match.filePath, result.match) : matchRecord(result.filePath, null);
}

export type MatchAuthority =
  | { readonly mode: "registry"; readonly registry: CapabilityRegistry }
  | { readonly mode: "archcontext"; readonly owners: ArchcontextCapabilityOwners };

export function toArchContextNodeV2(capability: Capability, isExistingDirectory: (path: string) => boolean): ArchContextNodeV2 {
  const displayName = capability.name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const includes = capability.prefixes.map((prefix) => {
    try {
      return isExistingDirectory(prefix) ? `${prefix}/**` : prefix;
    } catch {
      return prefix;
    }
  });
  return {
    schemaVersion: "archcontext.node/v2",
    id: `capability.${capability.domain}.${capability.name}`,
    kind: "capability",
    name: displayName,
    status: "active",
    summary: `Capability boundary for ${capability.domain}/${capability.name}.`,
    responsibilities: [`Own the source paths declared by the ${capability.id} capability boundary.`],
    source: {
      include: includes,
    },
    extensions: {
      contractFiles: {
        agents: capability.contract_files.agents,
        claude: capability.contract_files.claude,
      },
      lspProfile: capability.lsp_profile,
      verification: [...capability.verification_hints],
    },
  };
}
