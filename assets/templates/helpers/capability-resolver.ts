#!/usr/bin/env bun
// @generated-from src/core/capabilities/registry.ts sha256:68d11540967639ad476223b02f19d4190bf46800d0395ad4fa66f83bbc09e300
// Standalone typed Bun projection. Regenerate from the capability resolver library; do not edit by hand.
export const CAPABILITY_REGISTRY_VERSION = 1 as const;

export interface ContractFiles {
  agents: string;
  claude: string;
}

export interface CapabilityIdentity {
  readonly id: string;
  readonly domain: string;
  readonly name: string;
  readonly architecture_module: string;
}

/** The structural profile that archctx exports. This module has no imports. */
export interface NativeCapabilityProfileInput {
  readonly nodeId: string;
  readonly status: string;
  readonly domain: string;
  readonly name: string;
  readonly modulePath: string;
  readonly contractFiles: Readonly<Record<string, string>>;
  readonly includeAnchors: readonly string[];
  readonly lspProfile: string | null;
  readonly verification: readonly string[] | null;
}

export interface Capability {
  id: string;
  domain: string;
  name: string;
  prefixes: string[];
  contract_files: ContractFiles;
  architecture_module: string;
  workstream_dir: string;
  lsp_profile: string;
  verification_hints: string[];
}

export interface CapabilityRegistry {
  version: typeof CAPABILITY_REGISTRY_VERSION;
  capabilities: Capability[];
}

export type CapabilityRegistryDiagnosticCode =
  | "REGISTRY_MISSING"
  | "INVALID_JSON"
  | "REGISTRY_NOT_OBJECT"
  | "UNSUPPORTED_VERSION"
  | "CAPABILITIES_NOT_ARRAY"
  | "CAPABILITY_NOT_OBJECT"
  | "FIELD_REQUIRED"
  | "PREFIXES_REQUIRED"
  | "PREFIX_NOT_STRING"
  | "VERIFICATION_HINTS_NOT_ARRAY"
  | "VERIFICATION_HINT_NOT_STRING"
  | "CONTRACT_FILES_REQUIRED"
  | "INVALID_PATH"
  | "DUPLICATE_ID"
  | "DUPLICATE_PREFIX"
  | "AMBIGUOUS_MATCH"
  | "ARCHCONTEXT_NODE_ID_INVALID"
  | "ARCHCONTEXT_OWNER_UNKNOWN"
  | "ARCHCONTEXT_RESOLVE_FAILED"
  | "ARCHCONTEXT_MODEL_REJECTED"
  | "ARCHCONTEXT_RESOLVE_UNAVAILABLE"
  | "ARCHCONTEXT_LSP_PROFILE_REQUIRED"
  | "ARCHCONTEXT_VERIFICATION_REQUIRED";

export interface CapabilityRegistryDiagnostic {
  readonly code: CapabilityRegistryDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export type CapabilityRegistryResolution =
  | {
      readonly status: "absent";
      readonly registry: null;
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "invalid";
      readonly registry: null;
      readonly diagnostics: readonly CapabilityRegistryDiagnostic[];
    }
  | {
      readonly status: "valid";
      readonly registry: CapabilityRegistry;
      readonly diagnostics: readonly [];
    };

export interface CapabilityPathMatch<C = Capability> {
  readonly capability: C;
  readonly prefix: string;
  readonly filePath: string;
}

export type CapabilityPathMatchResult =
  | {
      readonly status: "matched";
      readonly match: CapabilityPathMatch;
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "unmapped";
      readonly filePath: string;
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "invalid";
      readonly filePath: string | null;
      readonly diagnostics: readonly CapabilityRegistryDiagnostic[];
    };

/**
 * `unavailable` means ownership was not computed at all, for example inside a
 * read-only observation that must not start archctx. It is never a model fault.
 */
export interface CapabilityPathResolution<C = Capability> {
  readonly status: "valid" | "invalid" | "unavailable";
  readonly capabilityIds: readonly string[];
  readonly matches: readonly CapabilityPathMatch<C>[];
  readonly unmappedPaths: readonly string[];
  readonly diagnostics: readonly CapabilityRegistryDiagnostic[];
}

type UnknownRecord = Record<string, unknown>;

const REQUIRED_STRING_FIELDS = [
  "id",
  "domain",
  "name",
  "architecture_module",
  "workstream_dir",
  "lsp_profile",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function diagnostic(
  code: CapabilityRegistryDiagnosticCode,
  path: string,
  message: string,
): CapabilityRegistryDiagnostic {
  return Object.freeze({ code, path, message });
}

export function normalizeCapabilityPath(value: string, repoRoot = ""): string {
  if (typeof value !== "string") throw new Error("path must be a string");
  let next = value.trim().replace(/^file:\/\//, "").replaceAll("\\", "/");
  if (next.includes("\0")) throw new Error("path must not contain NUL");

  const normalizedRoot = repoRoot.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalizedRoot && next.startsWith(`${normalizedRoot}/`)) {
    next = next.slice(normalizedRoot.length + 1);
  } else if (next.startsWith("/") || /^[A-Za-z]:\//.test(next)) {
    throw new Error(`absolute path is outside repo: ${value}`);
  }

  next = next.replace(/^\.\//, "").replace(/\/+$/, "");
  const parts = next.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("path must not be empty");
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`path must not contain traversal: ${value}`);
  }
  return parts.join("/");
}

/**
 * True when the path is absolute and not under repoRoot. Such paths can never
 * be governed by the repo-relative capability registry (prefixes are
 * repo-relative), so callers keep them out of prefix matching -- where
 * normalizeCapabilityPath would otherwise fail the whole resolution -- and
 * account for them separately. Invalid values stay in the canonical
 * normalization path so validation still fails closed.
 */
export function isCapabilityPathOutsideRepo(value: string, repoRoot = ""): boolean {
  if (typeof value !== "string") return false;
  const next = value.trim().replace(/^file:\/\//, "").replaceAll("\\", "/");
  if (next.includes("\0")) return false;
  const normalizedRoot = repoRoot.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalizedRoot && next.startsWith(`${normalizedRoot}/`)) return false;
  return next.startsWith("/") || /^[A-Za-z]:\//.test(next);
}

function validatePathField(
  value: unknown,
  path: string,
  repoRoot: string,
  diagnostics: CapabilityRegistryDiagnostic[],
): void {
  if (typeof value !== "string" || value.trim() === "") return;
  try {
    normalizeCapabilityPath(value, repoRoot);
  } catch (error) {
    diagnostics.push(diagnostic(
      "INVALID_PATH",
      path,
      `${path}: ${(error as Error).message}`,
    ));
  }
}

export function validateCapabilityRegistryValue(
  value: unknown,
  options: {
    readonly repoRoot?: string;
    readonly sharedPrefixes?: boolean;
    /** ArchContext capabilities may own paths only through globs, so they can have no anchor. */
    readonly anchorless?: boolean;
  } = {},
): CapabilityRegistryResolution {
  const repoRoot = options.repoRoot ?? "";
  if (!isRecord(value)) {
    return {
      status: "invalid",
      registry: null,
      diagnostics: [diagnostic("REGISTRY_NOT_OBJECT", "$", "expected an object")],
    };
  }
  if (value.version !== CAPABILITY_REGISTRY_VERSION) {
    return {
      status: "invalid",
      registry: null,
      diagnostics: [diagnostic("UNSUPPORTED_VERSION", "version", "version must be 1")],
    };
  }
  if (!Array.isArray(value.capabilities)) {
    return {
      status: "invalid",
      registry: null,
      diagnostics: [diagnostic(
        "CAPABILITIES_NOT_ARRAY",
        "capabilities",
        "capabilities must be an array",
      )],
    };
  }

  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const capabilities: Capability[] = [];
  const ids = new Map<string, number>();
  const prefixes = new Map<string, { readonly id: string; readonly index: number }>();

  for (const [index, rawCapability] of value.capabilities.entries()) {
    const basePath = `capabilities[${index}]`;
    if (!isRecord(rawCapability)) {
      diagnostics.push(diagnostic(
        "CAPABILITY_NOT_OBJECT",
        basePath,
        `${basePath} must be an object`,
      ));
      continue;
    }

    const capabilityId = typeof rawCapability.id === "string" && rawCapability.id.trim()
      ? rawCapability.id.trim()
      : "(unknown)";
    for (const field of REQUIRED_STRING_FIELDS) {
      const fieldValue = rawCapability[field];
      if (typeof fieldValue !== "string" || fieldValue.trim() === "") {
        diagnostics.push(diagnostic(
          "FIELD_REQUIRED",
          `${basePath}.${field}`,
          `${capabilityId}: ${field} is required`,
        ));
      }
    }

    if (!Array.isArray(rawCapability.prefixes) || (rawCapability.prefixes.length === 0 && !options.anchorless)) {
      diagnostics.push(diagnostic(
        "PREFIXES_REQUIRED",
        `${basePath}.prefixes`,
        `${capabilityId}: prefixes must contain at least one path`,
      ));
    } else {
      for (const [prefixIndex, prefix] of rawCapability.prefixes.entries()) {
        const prefixPath = `${basePath}.prefixes[${prefixIndex}]`;
        if (typeof prefix !== "string") {
          diagnostics.push(diagnostic(
            "PREFIX_NOT_STRING",
            prefixPath,
            `${capabilityId}: prefix must be a string`,
          ));
          continue;
        }
        try {
          const normalized = normalizeCapabilityPath(prefix, repoRoot);
          const owner = options.sharedPrefixes ? undefined : prefixes.get(normalized);
          if (owner) {
            diagnostics.push(diagnostic(
              "DUPLICATE_PREFIX",
              prefixPath,
              `duplicate capability prefix: ${normalized} (${owner.id}, ${capabilityId})`,
            ));
          } else {
            prefixes.set(normalized, { id: capabilityId, index });
          }
        } catch (error) {
          diagnostics.push(diagnostic(
            "INVALID_PATH",
            prefixPath,
            `${capabilityId}: invalid prefix ${prefix}: ${(error as Error).message}`,
          ));
        }
      }
    }

    if (!isRecord(rawCapability.contract_files)) {
      diagnostics.push(diagnostic(
        "CONTRACT_FILES_REQUIRED",
        `${basePath}.contract_files`,
        `${capabilityId}: contract_files.agents and contract_files.claude are required`,
      ));
    } else {
      for (const field of ["agents", "claude"] as const) {
        const fieldValue = rawCapability.contract_files[field];
        const fieldPath = `${basePath}.contract_files.${field}`;
        if (typeof fieldValue !== "string" || fieldValue.trim() === "") {
          diagnostics.push(diagnostic(
            "FIELD_REQUIRED",
            fieldPath,
            `${capabilityId}: contract_files.${field} is required`,
          ));
        } else {
          validatePathField(fieldValue, fieldPath, repoRoot, diagnostics);
        }
      }
    }

    validatePathField(
      rawCapability.architecture_module,
      `${basePath}.architecture_module`,
      repoRoot,
      diagnostics,
    );
    validatePathField(
      rawCapability.workstream_dir,
      `${basePath}.workstream_dir`,
      repoRoot,
      diagnostics,
    );

    if (!Array.isArray(rawCapability.verification_hints)) {
      diagnostics.push(diagnostic(
        "VERIFICATION_HINTS_NOT_ARRAY",
        `${basePath}.verification_hints`,
        `${capabilityId}: verification_hints must be an array`,
      ));
    } else {
      for (const [hintIndex, hint] of rawCapability.verification_hints.entries()) {
        if (typeof hint !== "string") {
          diagnostics.push(diagnostic(
            "VERIFICATION_HINT_NOT_STRING",
            `${basePath}.verification_hints[${hintIndex}]`,
            `${capabilityId}: verification_hints entries must be strings`,
          ));
        }
      }
    }

    if (capabilityId !== "(unknown)") {
      const previous = ids.get(capabilityId);
      if (previous !== undefined) {
        diagnostics.push(diagnostic(
          "DUPLICATE_ID",
          `${basePath}.id`,
          `duplicate capability id: ${capabilityId}`,
        ));
      } else {
        ids.set(capabilityId, index);
      }
    }

    capabilities.push(rawCapability as unknown as Capability);
  }

  if (diagnostics.length > 0) {
    return { status: "invalid", registry: null, diagnostics };
  }
  return {
    status: "valid",
    registry: Object.freeze({
      version: CAPABILITY_REGISTRY_VERSION,
      capabilities,
    }),
    diagnostics: [],
  };
}

export function parseCapabilityRegistry(
  source: string | null,
  options: { readonly declared?: boolean; readonly repoRoot?: string } = {},
): CapabilityRegistryResolution {
  if (source === null) {
    if (options.declared) {
      return {
        status: "invalid",
        registry: null,
        diagnostics: [diagnostic("REGISTRY_MISSING", "$", "capability registry is missing")],
      };
    }
    return { status: "absent", registry: null, diagnostics: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return {
      status: "invalid",
      registry: null,
      diagnostics: [diagnostic(
        "INVALID_JSON",
        "$",
        `invalid JSON: ${(error as Error).message}`,
      )],
    };
  }
  return validateCapabilityRegistryValue(parsed, { repoRoot: options.repoRoot });
}

export function matchCapabilityPath(
  registry: CapabilityRegistry,
  inputPath: string,
  options: { readonly repoRoot?: string } = {},
): CapabilityPathMatchResult {
  let filePath: string;
  try {
    filePath = normalizeCapabilityPath(inputPath, options.repoRoot);
  } catch (error) {
    return {
      status: "invalid",
      filePath: null,
      diagnostics: [diagnostic("INVALID_PATH", "path", (error as Error).message)],
    };
  }

  const matches: CapabilityPathMatch[] = [];
  for (const capability of registry.capabilities) {
    for (const rawPrefix of capability.prefixes) {
      let prefix: string;
      try {
        prefix = normalizeCapabilityPath(rawPrefix, options.repoRoot);
      } catch (error) {
        return {
          status: "invalid",
          filePath,
          diagnostics: [diagnostic(
            "INVALID_PATH",
            `capability.${capability.id}.prefixes`,
            `${capability.id}: invalid prefix ${rawPrefix}: ${(error as Error).message}`,
          )],
        };
      }
      if (filePath === prefix || filePath.startsWith(`${prefix}/`)) {
        matches.push({ capability, prefix, filePath });
      }
    }
  }

  if (matches.length === 0) return { status: "unmapped", filePath, diagnostics: [] };
  matches.sort((left, right) => (
    right.prefix.length - left.prefix.length
      || byteCompare(left.capability.id, right.capability.id)
      || byteCompare(left.prefix, right.prefix)
  ));
  const longest = matches[0].prefix.length;
  const winners = matches.filter((match) => match.prefix.length === longest);
  const winnerKeys = new Set(winners.map((match) => `${match.capability.id}:${match.prefix}`));
  if (winnerKeys.size > 1) {
    return {
      status: "invalid",
      filePath,
      diagnostics: [diagnostic(
        "AMBIGUOUS_MATCH",
        "path",
        `ambiguous capability match for ${filePath}: ${winners
          .map((match) => `${match.capability.id} (${match.prefix})`)
          .join(", ")}`,
      )],
    };
  }
  return { status: "matched", match: winners[0], diagnostics: [] };
}

export function resolveCapabilityPaths(
  registry: CapabilityRegistry,
  inputPaths: readonly string[],
  options: { readonly repoRoot?: string } = {},
): CapabilityPathResolution {
  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const matches: CapabilityPathMatch[] = [];
  const unmappedPaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const inputPath of inputPaths) {
    const result = matchCapabilityPath(registry, inputPath, options);
    if (result.status === "invalid") {
      diagnostics.push(...result.diagnostics);
      continue;
    }
    const filePath = result.status === "matched" ? result.match.filePath : result.filePath;
    if (seenPaths.has(filePath)) continue;
    seenPaths.add(filePath);
    if (result.status === "matched") matches.push(result.match);
    else unmappedPaths.push(result.filePath);
  }

  const capabilityIds = Array.from(new Set(matches.map((match) => match.capability.id))).sort(byteCompare);
  matches.sort((left, right) => byteCompare(left.filePath, right.filePath));
  unmappedPaths.sort(byteCompare);
  return {
    status: diagnostics.length > 0 ? "invalid" : "valid",
    capabilityIds,
    matches,
    unmappedPaths,
    diagnostics,
  };
}

/**
 * Selected capability authority. Exactly one source is read per repo: `registry`
 * reads the JSON capability registry, `archcontext` reads archcontext node files.
 * There is no dual-read and no fallback in either direction.
 */
export const CAPABILITY_SOURCE_MODES = ["registry", "archcontext"] as const;

export type CapabilitySourceMode = (typeof CAPABILITY_SOURCE_MODES)[number];

/** One `archctx resolve --paths-from` result, reduced to the fields this registry reads. */
export interface ArchcontextPathOwner {
  readonly path: string;
  readonly matched: boolean;
  readonly ambiguous: boolean;
  readonly owningCapabilityId: string | null;
  /** Node ids of an ambiguous result; empty when archctx reports none. */
  readonly candidates: readonly string[];
}

/**
 * Every archcontext capability node keyed by its node id, whatever its status.
 * ArchContext resolves ownership without a status filter, so the owner join
 * must see planned and deprecated owners too.
 */
export type ArchcontextCapabilityOwners = ReadonlyMap<string, Capability>;

export type ArchcontextCapabilityResolution =
  | {
      readonly status: "invalid";
      readonly registry: null;
      readonly owners: null;
      readonly diagnostics: readonly CapabilityRegistryDiagnostic[];
    }
  | {
      /** `registry` lists active capabilities only; `owners` holds every capability node. */
      readonly status: "valid";
      readonly registry: CapabilityRegistry;
      readonly owners: ArchcontextCapabilityOwners;
      readonly diagnostics: readonly [];
    };

const ARCHCONTEXT_ACTIVE_STATUS = "active";
const ARCHCONTEXT_ID_PREFIX = "capability";
const ARCHCONTEXT_ID_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

export function architectureModulePathFor(domain: string, name: string): string {
  return `docs/architecture/modules/${domain}/${name}.md`;
}

export function workstreamDirFor(domain: string, name: string): string {
  return `tasks/workstreams/${domain}/${name}`;
}

/** The stable ArchContext node id of a capability: `capability.<domain>.<name>`. */
export function archcontextNodeId(capability: Pick<Capability, "domain" | "name">): string {
  return `${ARCHCONTEXT_ID_PREFIX}.${capability.domain}.${capability.name}`;
}

function archcontextIdParts(value: unknown): { readonly domain: string; readonly name: string } | null {
  if (typeof value !== "string" || value.includes("::")) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== ARCHCONTEXT_ID_PREFIX) return null;
  if (!ARCHCONTEXT_ID_SEGMENT.test(parts[1]) || !ARCHCONTEXT_ID_SEGMENT.test(parts[2])) return null;
  return { domain: parts[1], name: parts[2] };
}

/** Project only the stable capability identity needed by ownership readers. */
export function capabilityIdentityFromNodeId(nodeId: string): CapabilityIdentity | null {
  const parts = archcontextIdParts(nodeId);
  if (!parts) return null;
  return {
    id: `${parts.domain}-${parts.name}`,
    domain: parts.domain,
    name: parts.name,
    architecture_module: architectureModulePathFor(parts.domain, parts.name),
  };
}

/** Use archctx profiles for metadata and verify the identity projection. */
export function capabilityRegistryFromNativeContext(
  context: { readonly capabilityProfiles: readonly NativeCapabilityProfileInput[] },
  options: { readonly repoRoot: string },
): ArchcontextCapabilityResolution {
  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const capabilities: Capability[] = [];
  const activeIds = new Set<string>();

  for (const profile of context.capabilityProfiles) {
    const identity = capabilityIdentityFromNodeId(profile.nodeId);
    if (!identity || identity.domain !== profile.domain || identity.name !== profile.name || identity.architecture_module !== profile.modulePath) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_NODE_ID_INVALID",
        profile.nodeId,
        `${profile.nodeId}: domain, name and modulePath must match the capability identity`,
      ));
      continue;
    }
    if (profile.lspProfile === null) {
      diagnostics.push(diagnostic("ARCHCONTEXT_LSP_PROFILE_REQUIRED", `${profile.nodeId}#lspProfile`, `${profile.nodeId}: lspProfile is required`));
    }
    if (profile.verification === null) {
      diagnostics.push(diagnostic("ARCHCONTEXT_VERIFICATION_REQUIRED", `${profile.nodeId}#verification`, `${profile.nodeId}: verification is required`));
    }
    if (profile.lspProfile === null || profile.verification === null) continue;
    if (profile.status === ARCHCONTEXT_ACTIVE_STATUS) activeIds.add(identity.id);
    capabilities.push({
      id: identity.id,
      domain: profile.domain,
      name: profile.name,
      prefixes: [...profile.includeAnchors],
      contract_files: { agents: profile.contractFiles.agents, claude: profile.contractFiles.claude },
      architecture_module: profile.modulePath,
      workstream_dir: workstreamDirFor(profile.domain, profile.name),
      lsp_profile: profile.lspProfile,
      verification_hints: [...profile.verification],
    });
  }

  if (diagnostics.length > 0) return { status: "invalid", registry: null, owners: null, diagnostics };
  capabilities.sort((left, right) => byteCompare(left.id, right.id));
  const validated = validateCapabilityRegistryValue(
    { version: CAPABILITY_REGISTRY_VERSION, capabilities },
    { repoRoot: options.repoRoot, sharedPrefixes: true, anchorless: true },
  );
  if (validated.status !== "valid") return { status: "invalid", registry: null, owners: null, diagnostics: validated.diagnostics };
  return {
    status: "valid",
    registry: Object.freeze({ version: CAPABILITY_REGISTRY_VERSION, capabilities: capabilities.filter((capability) => activeIds.has(capability.id)) }),
    owners: new Map(capabilities.map((capability) => [archcontextNodeId(capability), capability])),
    diagnostics: [],
  };
}

/**
 * Maps `archctx resolve` owners onto capability nodes. ArchContext decides the
 * owner; this function only joins its capability id to node metadata.
 * `owningCapabilityId` decides first: archctx 0.9.1 reports `matched: false`
 * for every ambiguous result, also when all candidates share one owning
 * capability, so `matched` is not read. An ambiguous result without an owning
 * capability fails closed, and any other result without one is unmapped
 * (unowned). The match prefix is the owner's stable node id, because
 * ArchContext does not report which include entry matched.
 */
export function capabilityPathResolutionFromArchcontextOwners<C extends { readonly id: string } = Capability>(
  owners: { get(nodeId: string): C | undefined },
  results: readonly ArchcontextPathOwner[],
): CapabilityPathResolution<C> {
  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const matches: CapabilityPathMatch<C>[] = [];
  const unmappedPaths: string[] = [];
  const seenPaths = new Set<string>();
  for (const owner of results) {
    if (seenPaths.has(owner.path)) continue;
    seenPaths.add(owner.path);
    if (owner.owningCapabilityId === null) {
      if (owner.ambiguous) {
        const candidates = owner.candidates.length > 0 ? `: ${owner.candidates.join(", ")}` : "";
        diagnostics.push(diagnostic("AMBIGUOUS_MATCH", owner.path, `ambiguous ArchContext owner for ${owner.path}${candidates}`));
      } else {
        unmappedPaths.push(owner.path);
      }
      continue;
    }
    const capability = owners.get(owner.owningCapabilityId);
    if (!capability) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_OWNER_UNKNOWN",
        owner.path,
        `${owner.path}: ArchContext owner ${owner.owningCapabilityId} is not a capability node in .archcontext/model/nodes`,
      ));
      continue;
    }
    matches.push({ capability, prefix: owner.owningCapabilityId, filePath: owner.path });
  }
  matches.sort((left, right) => byteCompare(left.filePath, right.filePath));
  unmappedPaths.sort(byteCompare);
  return {
    status: diagnostics.length > 0 ? "invalid" : "valid",
    capabilityIds: Array.from(new Set(matches.map((match) => match.capability.id))).sort(byteCompare),
    matches,
    unmappedPaths,
    diagnostics,
  };
}
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
import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import * as child from 'node:child_process';

/** An opt-in IO capability. Ordinary owners retain their original defaults. */
export interface ReadonlyObservationIO {
  readFile(path: string): Buffer;
  readDirectory(path: string): string[];
  validatePath(path: string): void;
  exec(file: string, args: string[], options: child.ExecFileSyncOptions): Buffer;
}
export class ObservationViolation extends Error {}
interface Scope { io: ReadonlyObservationIO; failure?: ObservationViolation }
const scopes = new AsyncLocalStorage<Scope>();
export function currentReadonlyObservation(): ReadonlyObservationIO | undefined { return scopes.getStore()?.io; }
function checked<T>(call: () => T): T {
  try { return call(); }
  catch (error) {
    if (error instanceof ObservationViolation) { const scope = scopes.getStore(); if (scope) scope.failure ??= error; }
    throw error;
  }
}
export function withReadonlyObservation<T>(io: ReadonlyObservationIO, call: () => T): T {
  const scope: Scope = { io };
  return scopes.run(scope, () => {
    const result = call();
    if (scope.failure) throw scope.failure;
    return result;
  });
}
export function assertObservationPath(path: string): void {
  const io = currentReadonlyObservation(); if (io) checked(() => io.validatePath(path));
}
export function rejectObservation(reason: string): never { return checked(() => { throw new ObservationViolation(reason); }); }
function encoding(options: unknown): BufferEncoding | undefined {
  return typeof options === 'string' ? options as BufferEncoding
    : options && typeof options === 'object' ? (options as { encoding?: BufferEncoding }).encoding ?? undefined : undefined;
}
export const observationReadFileSync: typeof fs.readFileSync = ((path: fs.PathOrFileDescriptor, options?: unknown) => {
  const io = currentReadonlyObservation();
  if (!io) return fs.readFileSync(path, options as BufferEncoding);
  if (typeof path !== 'string') return rejectObservation('Observation requires a named source file');
  const bytes = checked(() => io.readFile(path)); const enc = encoding(options);
  return enc ? bytes.toString(enc) : bytes;
}) as typeof fs.readFileSync;
export const observationReaddirSync: typeof fs.readdirSync = ((path: fs.PathLike, options?: unknown) => {
  const io = currentReadonlyObservation();
  if (!io) return fs.readdirSync(path, options as BufferEncoding);
  if (typeof path !== 'string' || options) return rejectObservation('Unsupported observation directory options');
  return checked(() => io.readDirectory(path));
}) as typeof fs.readdirSync;
export const observationExecFileSync: typeof child.execFileSync = ((file: string, args: string[], options: child.ExecFileSyncOptions = {}) => {
  const io = currentReadonlyObservation(); if (!io) return child.execFileSync(file, args, options);
  const bytes = checked(() => io.exec(file, args, options)); const enc = encoding(options);
  return enc && String(enc) !== 'buffer' ? bytes.toString(enc) : bytes;
}) as typeof child.execFileSync;
export const observationSpawnSync: typeof child.spawnSync = ((file: string, args: string[], options: child.SpawnSyncOptions = {}) => {
  if (!currentReadonlyObservation()) return child.spawnSync(file, args, options);
  try {
    const stdout = observationExecFileSync(file, args, options as child.ExecFileSyncOptions);
    return { pid: 0, status: 0, signal: null, output: [null, stdout, ''], stdout, stderr: '' };
  } catch (error) {
    if (error instanceof ObservationViolation) throw error;
    const failed = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
    const enc = encoding(options);
    const decode = (value?: Buffer) => enc ? (value ?? Buffer.alloc(0)).toString(enc) : value ?? Buffer.alloc(0);
    return { pid: 0, status: failed.status ?? 1, signal: null, output: [], stdout: decode(failed.stdout), stderr: decode(failed.stderr), error };
  }
}) as typeof child.spawnSync;
import { basename } from 'node:path';
import {
  execFileSync as execFileSyncRaw,
  spawn as spawnRaw,
  spawnSync as spawnSyncRaw,
  type ChildProcess,
  type ExecFileSyncOptions,
  type ExecFileSyncOptionsWithBufferEncoding,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnOptions,
  type SpawnSyncOptions,
  type SpawnSyncOptionsWithBufferEncoding,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';


/**
 * Wall clock for a git call that does not set its own timeout.
 * Same bound as the shared process runner, so a forgotten deadline still
 * ends a hung git instead of waiting forever.
 */
export const DEFAULT_GIT_TIMEOUT_MS = 120_000;

const GENERIC_GIT_NAMES = new Set(['git', 'git.exe']);

export function configuredGitBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.REPO_HARNESS_GIT_BIN ?? 'git';
}

export function isGitExecutableName(command: string): boolean {
  return GENERIC_GIT_NAMES.has(basename(command).toLowerCase());
}

function configuredFrom(env: NodeJS.ProcessEnv | undefined, onlyOwn: boolean): string | undefined {
  if (!env) return undefined;
  if (onlyOwn && !Object.prototype.hasOwnProperty.call(env, 'REPO_HARNESS_GIT_BIN')) return undefined;
  const value = env.REPO_HARNESS_GIT_BIN?.trim();
  return value ? value : undefined;
}

/**
 * An explicit path wins. The bare name `git` does not: that is the call site
 * that used to ignore `REPO_HARNESS_GIT_BIN`. A child env that sets the
 * variable wins over the parent; a child env that omits it does not hide it.
 */
export function resolveGitExecutable(
  explicit?: string,
  env?: NodeJS.ProcessEnv,
  parent: NodeJS.ProcessEnv = process.env,
): string {
  const named = explicit?.trim();
  if (named && !GENERIC_GIT_NAMES.has(named.toLowerCase())) return named;
  return configuredFrom(env, true) ?? configuredFrom(parent, false) ?? named ?? 'git';
}

export function resolveGitTimeout(explicit: number | undefined): number {
  return explicit === undefined ? DEFAULT_GIT_TIMEOUT_MS : explicit;
}

type GitCallFields = { gitBin?: string; direct?: boolean };

function bindGit<T extends GitCallFields & { timeout?: number; env?: NodeJS.ProcessEnv }>(
  options: T,
): { bin: string; options: Omit<T, 'gitBin' | 'direct'> & { timeout: number } } {
  const { gitBin, direct, timeout, env, ...rest } = options;
  // Observation policy allows the caller's git name. Re-entering it from the
  // observation executor would loop, so that executor sets direct.
  const observing = direct !== true && currentReadonlyObservation() !== undefined;
  const bin = observing ? (gitBin?.trim() || 'git') : resolveGitExecutable(gitBin, env);
  return {
    bin,
    options: { ...rest, env, timeout: resolveGitTimeout(timeout) } as Omit<T, 'gitBin' | 'direct'> & { timeout: number },
  };
}

type GitExecStringOptions = ExecFileSyncOptionsWithStringEncoding & GitCallFields;
type GitExecBufferOptions = ExecFileSyncOptionsWithBufferEncoding & GitCallFields;
type GitExecOptions = ExecFileSyncOptions & GitCallFields;

export function gitExecFileSync(args: readonly string[], options: GitExecStringOptions): string;
export function gitExecFileSync(args: readonly string[], options?: GitExecBufferOptions): Buffer;
export function gitExecFileSync(args: readonly string[], options: GitExecOptions = {}): string | Buffer {
  const bound = bindGit(options);
  const argv = [...args];
  if (currentReadonlyObservation() !== undefined && options.direct !== true) {
    return observationExecFileSync(bound.bin, argv, bound.options) as string | Buffer;
  }
  return execFileSyncRaw(bound.bin, argv, bound.options);
}

type GitSpawnStringOptions = SpawnSyncOptionsWithStringEncoding & GitCallFields;
type GitSpawnBufferOptions = SpawnSyncOptionsWithBufferEncoding & GitCallFields;
type GitSpawnOptions = SpawnSyncOptions & GitCallFields;

export function gitSpawnSync(args: readonly string[], options: GitSpawnStringOptions): SpawnSyncReturns<string>;
export function gitSpawnSync(args: readonly string[], options?: GitSpawnBufferOptions): SpawnSyncReturns<Buffer>;
export function gitSpawnSync(args: readonly string[], options: GitSpawnOptions = {}): SpawnSyncReturns<string | Buffer> {
  const bound = bindGit(options);
  const argv = [...args];
  if (currentReadonlyObservation() !== undefined && options.direct !== true) {
    return observationSpawnSync(bound.bin, argv, bound.options) as SpawnSyncReturns<string | Buffer>;
  }
  return spawnSyncRaw(bound.bin, argv, bound.options);
}

export function spawnGit(args: readonly string[], options: SpawnOptions & GitCallFields = {}): ChildProcess {
  const { gitBin, env, direct: _direct, ...rest } = options;
  return spawnRaw(resolveGitExecutable(gitBin, env), [...args], { ...rest, env });
}
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { relative, resolve } from "path";

import { createRequire } from "node:module";









type Format = "json" | "text" | "prefixes" | "archcontext-nodes-v2";

type Args = {
  command: string;
  repo: string;
  path: string;
  pathsFrom: string;
  format: Format;
};

const DEFAULT_REGISTRY = ".ai/context/capabilities.json";
const ARCHCONTEXT_NODES_DIR = ".archcontext/model/nodes";



export function capabilitySourceMode(repo: string): CapabilitySourceMode {
  const policyPath = resolve(repo, HARNESS_POLICY);
  if (!existsSync(policyPath)) return "registry";
  let policy: unknown;
  try {
    policy = JSON.parse(readFileSync(policyPath, "utf-8"));
  } catch (error) {
    throw new CapabilitySourceError(
      `malformed harness policy: ${HARNESS_POLICY}: ${(error as Error).message}`
    );
  }
  return capabilitySourceModeFromPolicy(policy);
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  scripts/capability-resolver.ts list [--repo <repo>] [--format json|text|prefixes]",
      "  scripts/capability-resolver.ts match --path <repo-relative-path> [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts match --paths-from <file|-> [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts validate [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts export --format archcontext-nodes-v2 [--repo <repo>]",
    ].join("\n")
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] || "",
    repo: ".",
    path: "",
    pathsFrom: "",
    format: "text",
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--repo":
        args.repo = argv[++index] || usage();
        break;
      case "--path":
        args.path = argv[++index] || usage();
        break;
      case "--paths-from":
        args.pathsFrom = argv[++index] || usage();
        break;
      case "--format": {
        const value = argv[++index] as Format;
        if (!["json", "text", "prefixes", "archcontext-nodes-v2"].includes(value)) usage();
        args.format = value;
        break;
      }
      case "--help":
      case "-h":
        usage();
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        usage();
    }
  }

  if (!["list", "match", "validate", "export"].includes(args.command)) usage();
  if (args.command === "match" && !args.path && !args.pathsFrom) usage();
  if (args.command === "match" && args.path && args.pathsFrom) usage();
  if (args.command === "match" && args.format === "prefixes") usage();
  if (args.command === "export" && args.format !== "archcontext-nodes-v2") usage();
  if (args.command !== "export" && args.format === "archcontext-nodes-v2") usage();
  return args;
}

function repoRoot(input: string): string {
  const cwd = resolve(input);
  const result = gitSpawnSync(["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf-8",
  });
  if (result.status === 0 && result.stdout.trim()) {
    return resolve(result.stdout.trim());
  }
  return cwd;
}

function missingRegistryError(): Error {
  return new Error(
    `missing capability registry: ${DEFAULT_REGISTRY}; create it with ` +
      "repo-harness run capability-config add --prefix <existing-path>"
  );
}

function capabilityAuthorityPath(mode: CapabilitySourceMode): string {
  return mode === "archcontext" ? ARCHCONTEXT_NODES_DIR : DEFAULT_REGISTRY;
}

// One authority per mode: archcontext never falls back to the JSON registry and
// the JSON registry never falls back to archcontext nodes.
function loadRegistry(repo: string, mode: CapabilitySourceMode): CapabilityRegistryResolution | ArchcontextCapabilityResolution {
  if (mode === "archcontext") {
    const native = archcontextModule();
    try {
      const resolution = native.readArchcontextCapabilityAuthority(repo);
      if (resolution.status === "invalid") {
        throw new CapabilitySourceError(resolution.diagnostics.map((item) => item.message).join("; "));
      }
      return resolution;
    } catch (error) {
      if (error instanceof CapabilitySourceError) throw error;
      throw new CapabilitySourceError(native.formatArchcontextCapabilityError(error));
    }
  }
  const registryPath = resolve(repo, DEFAULT_REGISTRY);
  if (!existsSync(registryPath)) {
    return parseCapabilityRegistry(null, { declared: false, repoRoot: repo });
  }
  return parseCapabilityRegistry(readFileSync(registryPath, "utf-8"), { declared: true, repoRoot: repo });
}

function malformedRegistryError(
  diagnostics: readonly CapabilityRegistryDiagnostic[],
  authority: string,
): Error {
  return new Error(
    `malformed capability registry: ${authority}: ${diagnostics.map((item) => item.message).join("; ")}`
  );
}

export function readRegistry(repo: string): CapabilityRegistry {
  const mode = capabilitySourceMode(repo);
  const resolution = loadRegistry(repo, mode);
  if (resolution.status === "absent") throw missingRegistryError();
  if (resolution.status === "invalid") {
    throw malformedRegistryError(resolution.diagnostics, capabilityAuthorityPath(mode));
  }
  return resolution.registry;
}

// Anchors must exist only for listed (active) capabilities. Every capability
// node, whatever its status, still owns its architecture module and workstreams.
function validateRegistryEffects(
  registry: CapabilityRegistry,
  repo: string,
  allCapabilities: readonly Capability[] = registry.capabilities,
): string[] {
  const errors: string[] = [];
  const architectureModules = new Set<string>();
  const workstreamDirs = new Set<string>();

  for (const capability of registry.capabilities) {
    for (const prefix of capability.prefixes) {
      const normalized = normalizeCapabilityPath(prefix, repo);
      if (!existsSync(resolve(repo, normalized))) {
        errors.push(`${capability.id}: prefix does not exist: ${normalized}`);
      }
    }
  }
  for (const capability of allCapabilities) {
    architectureModules.add(normalizeCapabilityPath(capability.architecture_module, repo));
    workstreamDirs.add(normalizeCapabilityPath(capability.workstream_dir, repo));
  }

  const modulesRoot = resolve(repo, "docs/architecture/modules");
  if (existsSync(modulesRoot)) {
    const stack = [modulesRoot];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const absPath = resolve(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(absPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const relPath = relative(repo, absPath).replaceAll("\\", "/");
          if (!architectureModules.has(relPath)) {
            errors.push(`orphan architecture module: ${relPath}`);
          }
        }
      }
    }
  }

  const workstreamsRoot = resolve(repo, "tasks/workstreams");
  if (existsSync(workstreamsRoot)) {
    const stack = [workstreamsRoot];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const absPath = resolve(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(absPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const relPath = relative(repo, absPath).replaceAll("\\", "/");
          const owned = [...workstreamDirs].some((dir) => relPath === dir || relPath.startsWith(`${dir}/`));
          if (!owned) {
            errors.push(`orphan workstream: ${relPath}`);
          }
        }
      }
    }
  }

  return errors;
}


type ArchcontextPathResolver = (repo: string, owners: ArchcontextCapabilityOwners, paths: readonly string[]) => CapabilityPathResolution;

// The standalone projection of this helper has no package-local archctx, so the
// import fails there and archcontext mode fails closed instead of guessing. The
// specifier is not a literal, so the projection type-checks without that module.
const ARCHCONTEXT_OWNERS_MODULE = "./archcontext-owners";

function archcontextModule(): {
  readArchcontextCapabilityAuthority(repo: string): ArchcontextCapabilityResolution;
  formatArchcontextCapabilityError(error: unknown): string;
  resolveArchcontextCapabilityPaths: ArchcontextPathResolver;
} {
  try {
    return createRequire(import.meta.url)(ARCHCONTEXT_OWNERS_MODULE);
  } catch {
    throw new CapabilitySourceError(
      'capability_source "archcontext" needs the packaged resolver; run repo-harness run capability-resolver'
    );
  }
}


/**
 * One match per input path. Under `archcontext`, one archctx call resolves the
 * whole batch, joined against every capability node whatever its status.
 */
export async function findMatches(authority: MatchAuthority, repo: string, paths: readonly string[]) {
  if (authority.mode === "registry") return paths.map((path) => findMatch(authority.registry, repo, path));
  const resolution = archcontextModule().resolveArchcontextCapabilityPaths(repo, authority.owners, paths);
  if (resolution.status !== "valid") {
    throw new Error(resolution.diagnostics.map((item) => item.message).join("; "));
  }
  const byPath = new Map(resolution.matches.map((match) => [match.filePath, match]));
  return paths.map((path) => {
    const filePath = normalizeCapabilityPath(path, repo);
    return matchRecord(filePath, byPath.get(filePath) ?? null);
  });
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}


export function buildArchContextNodesV2(
  registry: CapabilityRegistry,
  options: { repoRoot?: string; isExistingDirectory?: (path: string) => boolean } = {},
): ArchContextNodeV2[] {
  const repoRoot = options.repoRoot ?? process.cwd();
  const isExistingDirectory = options.isExistingDirectory ?? ((path: string) => {
    try { return statSync(resolve(repoRoot, path)).isDirectory(); } catch { return false; }
  });
  return registry.capabilities
    .map((capability) => toArchContextNodeV2(capability, isExistingDirectory))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function allCapabilities(
  resolution: { readonly registry: CapabilityRegistry; readonly owners?: ArchcontextCapabilityOwners },
): readonly Capability[] {
  return resolution.owners ? [...resolution.owners.values()] : resolution.registry.capabilities;
}

async function readPathLines(input: string): Promise<string[]> {
  const text = input === "-" ? await Bun.stdin.text() : readFileSync(input, "utf-8");
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function runCapabilityResolverCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const repo = repoRoot(args.repo);
  const mode = capabilitySourceMode(repo);
  const authority = capabilityAuthorityPath(mode);
  const resolution = loadRegistry(repo, mode);
  if (resolution.status === "absent") throw missingRegistryError();

  if (args.command === "validate") {
    if (resolution.status === "invalid") {
      const structuralCodes = new Set([
        "INVALID_JSON",
        "REGISTRY_NOT_OBJECT",
        "UNSUPPORTED_VERSION",
        "CAPABILITIES_NOT_ARRAY",
        "CAPABILITY_NOT_OBJECT",
      ]);
      if (resolution.diagnostics.some((item) => structuralCodes.has(item.code))) {
        throw malformedRegistryError(resolution.diagnostics, authority);
      }
    }
    const errors = resolution.status === "invalid"
      ? resolution.diagnostics.map((item) => item.message)
      : validateRegistryEffects(resolution.registry, repo, allCapabilities(resolution));
    if (args.format === "json") {
      printJson({ ok: errors.length === 0, errors });
    } else if (errors.length === 0) {
      console.log("[CapabilityResolver] OK");
    } else {
      for (const error of errors) console.log(`[CapabilityResolver] ${error}`);
    }
    process.exit(errors.length === 0 ? 0 : 1);
  }

  if (resolution.status === "invalid") throw malformedRegistryError(resolution.diagnostics, authority);
  const registry = resolution.registry;
  const matchAuthority: MatchAuthority = "owners" in resolution
    ? { mode: "archcontext", owners: resolution.owners }
    : { mode: "registry", registry };

  if (args.command === "list") {
    if (args.format === "json") {
      printJson(registry.capabilities);
    } else if (args.format === "prefixes") {
      for (const capability of registry.capabilities) {
        for (const prefix of capability.prefixes) {
          console.log(normalizeCapabilityPath(prefix, repo));
        }
      }
    } else {
      // An anchorless ArchContext capability owns paths only through globs; show its node id.
      for (const capability of registry.capabilities) {
        console.log(`${capability.id}\t${capability.prefixes.join(",") || archcontextNodeId(capability)}`);
      }
    }
    return;
  }

  if (args.command === "export") {
    const exportErrors = validateRegistryEffects(registry, repo);
    if (exportErrors.length > 0) {
      throw new Error(`capability registry is invalid:\n${exportErrors.join("\n")}`);
    }
    printJson(buildArchContextNodesV2(registry, { repoRoot: repo }));
    return;
  }

  const errors = validateRegistryEffects(registry, repo, allCapabilities(resolution));
  if (errors.length > 0) {
    throw new Error(`capability registry is invalid:\n${errors.join("\n")}`);
  }
  if (args.pathsFrom) {
    const matches = await findMatches(matchAuthority, repo, [...new Set(await readPathLines(args.pathsFrom))]);
    if (args.format === "json") {
      printJson(matches);
    } else {
      for (const match of matches) {
        console.log(`${match.file_path}: ${match.capability_id} (${match.matched_prefix})`);
      }
    }
    return;
  }

  const [match] = await findMatches(matchAuthority, repo, [args.path]);
  if (args.format === "json") {
    printJson(match);
  } else {
    for (const [key, value] of Object.entries(match)) {
      if (Array.isArray(value)) {
        console.log(`${key}: ${value.join(", ")}`);
      } else {
        console.log(`${key}: ${value}`);
      }
    }
  }
}

if (import.meta.main) {
  try {
    await runCapabilityResolverCli(process.argv.slice(2));
  } catch (error) {
    console.error(`[CapabilityResolver] ${(error as Error).message}`);
    process.exit((error as { exitCode?: number }).exitCode ?? 1);
  }
}
