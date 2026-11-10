#!/usr/bin/env bun
// @generated-from src/core/capabilities/registry.ts sha256:9ca724195f6081e32ffe7cad95d537161016c2deb466426223ef60f1faedafb4
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
  | "ARCHCONTEXT_RESOLVE_TIMEOUT"
  | "ARCHCONTEXT_MODEL_REJECTED"
  | "ARCHCONTEXT_RESOLVE_UNAVAILABLE"
  | "ARCHCONTEXT_LSP_PROFILE_REQUIRED"
  | "ARCHCONTEXT_VERIFICATION_REQUIRED";

export interface CapabilityRegistryDiagnostic {
  readonly code: CapabilityRegistryDiagnosticCode;
  readonly path: string;
  readonly message: string;
  /** The typed archctx client error code behind an ARCHCONTEXT_RESOLVE_FAILED diagnostic. */
  readonly archctxErrorCode?: string;
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

/** One capability that owns some of the resolved implementation paths. */
export interface CapabilityOwnershipEntry {
  readonly id: string;
  readonly module_document: string;
  /** The resolved implementation paths this capability owns, sorted. */
  readonly paths: readonly string[];
}

/**
 * The capability ownership answer for the resolved implementation paths: the
 * explicit target paths plus the review subject. It is a projection of the
 * one ownership result the resolver already computes.
 */
export interface CapabilityOwnership {
  /** The commit the review subject was diffed against; null when the subject was unavailable. */
  readonly review_base: string | null;
  readonly capability_ids: readonly string[];
  readonly capabilities: readonly CapabilityOwnershipEntry[];
  readonly unowned_paths: readonly string[];
}

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
/**
 * The core contract of the Architecture plugin. Core reaches the archctx
 * ownership, notice, runtime, setup and CodeGraph code only through these
 * ports. A process entry registers the providers once, and only when the
 * plugin is selected; a port without a provider is a typed unavailable
 * result, never a fallback.
 */
export const ARCHITECTURE_CONTRACT_VERSION = 2;
export type ArchitectureContractVersion = typeof ARCHITECTURE_CONTRACT_VERSION;

export type ProjectionProvider = 'disabled' | 'archctx';
export type ProjectionApplyMode = 'disabled' | 'manual';

export interface ArchitectureProjectionPolicy {
  provider: ProjectionProvider;
  applyMode: ProjectionApplyMode;
  requiredVersion: string;
  timeoutMs: number;
}

export interface ArchitectureProjectionReadinessV1 {
  schemaVersion: 'repo-harness.architecture-projection-readiness/v1';
  modelAuthority: { source: 'registry' | 'archcontext' | 'unadopted'; ready: boolean };
  /**
   * `command` is the managed invocation `[nodePath, binaryPath]`. Guidance runs
   * archctx only through it, never through a PATH copy. It is null unless the
   * package and Node runtime resolve.
   */
  projectionProvider: { provider: ProjectionProvider; state: 'disabled' | 'missing' | 'mismatch' | 'error' | 'ready'; binaryPath: string | null; nodePath: string | null; command: [string, string] | null; version: string | null; reason: string; reasonCode?: string };
  codeFacts: { requirement: 'required'; state: 'not-evaluated' | 'ready' | 'not-ready' | 'index-missing' | 'unavailable'; issues?: Array<{ code: string; message: string }>; reasonCode?: string; message?: string };
  daemonRuntime: { state: 'not-evaluated' | 'compatible' | 'mismatch' | 'error' };
  apply: { mode: ProjectionApplyMode; enabled: boolean };
  /** The next operator step for adoption, code facts or provider repair; null when none is needed. */
  next: string | null;
}

export interface ArchctxProcessResult { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: string; timedOut?: boolean }
export type RunArchctxProcess = (binary: string, args: readonly string[], options: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }) => ArchctxProcessResult;

export interface ArchctxProviderOptions {
  consumerRoot?: string;
  policy?: ArchitectureProjectionPolicy;
  env?: NodeJS.ProcessEnv;
  run?: RunArchctxProcess;
  trustedNodeCandidateSource?: () => readonly string[];
  deadlineMs?: number;
  nowMs?: () => number;
}

export interface ArchcontextOwnerLookup<C> {
  get(nodeId: string): C | undefined;
}

export const ARCHCONTEXT_IDENTITY_OWNERS: ArchcontextOwnerLookup<CapabilityIdentity> = {
  get: (nodeId) => capabilityIdentityFromNodeId(nodeId) ?? undefined,
};

export type ArchctxResolveResult = Omit<ArchcontextPathOwner, 'path'>;

/** Answers keyed by the exact query line; the owner of the cache binds them to one model. */
export interface ArchcontextResolveCache {
  lookup(queries: readonly string[]): ReadonlyMap<string, ArchctxResolveResult>;
  store(answers: ReadonlyMap<string, ArchctxResolveResult>): void;
}

/** The archcontext capability authority with the summary of each capability node. */
export interface ArchcontextCapabilityContext {
  readonly registry: CapabilityRegistry;
  readonly owners: ArchcontextCapabilityOwners;
  readonly summaries: ReadonlyMap<string, string>;
}

/** Path ownership under `capability_source: archcontext`. */
export interface ArchitectureOwnershipPort {
  readonly contractVersion: ArchitectureContractVersion;
  /** The complete capability authority from one worktree export; a rejected model is an `invalid` result. */
  readAuthority(repoRoot: string, options?: ArchctxProviderOptions): ArchcontextCapabilityResolution;
  /** The authority and the node summaries; a failure throws `CapabilitySourceError`. */
  readCapabilityContext(repoRoot: string): ArchcontextCapabilityContext;
  /** One `archctx resolve` batch; a process, version or runtime failure throws. */
  resolvePaths<C extends { readonly id: string } = Capability>(
    repoRoot: string,
    owners: ArchcontextOwnerLookup<C>,
    paths: readonly string[],
    options?: ArchctxProviderOptions,
    cache?: ArchcontextResolveCache,
  ): CapabilityPathResolution<C>;
  /** The exact query lines that `resolvePaths` sends; callers key caches on them. */
  resolveQueries(repoRoot: string, paths: readonly string[]): string[];
  /** The persistent answer cache of one worktree. */
  resolveCache(repoRoot: string): ArchcontextResolveCache;
  /** The diagnostic for an error that `resolvePaths` threw. */
  resolveFailure(error: unknown): CapabilityRegistryDiagnostic;
  formatError(error: unknown): string;
}

export type ArchitecturePathOwnersRead =
  | { readonly status: 'resolved'; readonly resolution: CapabilityPathResolution<CapabilityIdentity> }
  | { readonly status: 'failed'; readonly code: string };

/** Path owners for display, with no policy branch. */
export interface ArchitectureDisplayPort {
  readonly contractVersion: ArchitectureContractVersion;
  pathOwners(repoRoot: string, paths: readonly string[], options?: ArchctxProviderOptions): ArchitecturePathOwnersRead;
}

export interface AgentNotice {
  readonly content?: string;
  readonly systemMessage?: string;
  readonly diagnostics?: string;
}

export type AgentNoticePoint = 'session-start' | 'turn';

/** The `[ArchitectureDebt]` and `[Archimap]` notice at SessionStart, `inbox` and Stop. */
export interface ArchitectureNoticePort {
  readonly contractVersion: ArchitectureContractVersion;
  collect(
    repoRoot: string,
    ownership: (options: ArchctxProviderOptions) => CapabilityOwnership | null,
    options?: ArchctxProviderOptions,
    point?: AgentNoticePoint,
  ): AgentNotice;
}

export interface ResolvedArchctxPackage {
  binaryPath: string;
  nodeRange: string;
  packageRoot: string;
  version: string;
}

export interface ArchitectureDaemonStopFailure {
  /** Null when the daemon listing failed before a state directory was known. */
  stateDir: string | null;
  code: string;
  action: string;
  reasonCode?: string;
  retryable?: boolean;
  message: string;
}

export interface ArchitectureDaemonStopReportV1 {
  schemaVersion: 'repo-harness.architecture-daemon-stop/v1';
  worktree: string;
  provider: ArchitectureProjectionPolicy['provider'];
  stopped: string[];
  failures: ArchitectureDaemonStopFailure[];
}

/** The managed archctx runtime for the setup check and the worktree closeout. */
export interface ArchitectureRuntimePort {
  readonly contractVersion: ArchitectureContractVersion;
  readonly requiredArchctxVersion: string;
  resolvePackageLocalArchctx(consumerRoot: string): ResolvedArchctxPackage;
  stopWorkspaceDaemons(repoRoot: string, canonicalWorktree: string): ArchitectureDaemonStopReportV1;
}

export interface ArchitectureDoctorCheck {
  readonly id: string;
  readonly describe: string;
  readonly status: 'ok' | 'warn' | 'fail' | 'na';
  readonly detail: string;
}

export type CodegraphHostTarget = 'codex' | 'claude' | 'both';

export interface CodegraphSetupStep {
  readonly step: string;
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly detail?: string;
  readonly stderr?: string;
}

/** The CodeGraph rows of `doctor`, the `init` index step and the global MCP configuration of the runtime setup. */
export interface CodegraphPort {
  readonly contractVersion: ArchitectureContractVersion;
  checks(cwd: string): readonly ArchitectureDoctorCheck[];
  indexSteps(ctx: { repoRoot: string; sync: boolean; env: NodeJS.ProcessEnv | undefined; target: CodegraphHostTarget }): readonly CodegraphSetupStep[];
  configureMcp(cwd: string, target: CodegraphHostTarget, env: NodeJS.ProcessEnv): CodegraphSetupStep;
}

export interface ArchitectureSetupStep {
  readonly step: string;
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly detail?: string;
}

export interface ArchitectureProjectionConfiguration {
  readonly scope: 'global';
  readonly path: string;
  readonly initialized: boolean;
}

/** The archctx part of the managed runtime readback. */
export type ManagedArchctxReadback =
  | { readonly status: 'ready'; readonly versions: readonly string[] }
  | { readonly status: 'package-mismatch' | 'runtime-mismatch'; readonly detail: string };

/** Writes one change to the global configuration under the caller's runtime transaction and returns its value. */
export type GlobalConfigurationWrite = <T>(mutate: (config: Record<string, unknown>) => { readonly config?: Record<string, unknown> | null; readonly value: T }) => T;

/** The archctx steps of update, status and init. Only the CLI root registers it. */
export interface ArchitectureSetupPort {
  readonly contractVersion: ArchitectureContractVersion;
  /** The CodeGraph CLI version that archctx pins. */
  readonly codegraphVersion: string;
  /** archctx and archctx-contracts as declared, the archctx Node range, its CodeGraph, and one handshake. */
  readManagedPackages(globalPackageRoot: string, cwd: string, env: NodeJS.ProcessEnv): ManagedArchctxReadback;
  /** Throws when the shared daemon is not compatible and does not stop cleanly. */
  verifyDaemon(cwd: string, env: NodeJS.ProcessEnv): void;
  /** Migrates a retired section and writes the default section when it is absent. */
  ensureGlobalConfiguration(env: NodeJS.ProcessEnv, write: GlobalConfigurationWrite): ArchitectureSetupStep;
  readiness(repoRoot: string, env?: NodeJS.ProcessEnv): ArchitectureProjectionReadinessV1;
  configuration(env?: NodeJS.ProcessEnv): ArchitectureProjectionConfiguration;
}

export interface ArchitecturePorts {
  readonly ownership: ArchitectureOwnershipPort;
  readonly display: ArchitectureDisplayPort;
  readonly notice: ArchitectureNoticePort;
  readonly runtime: ArchitectureRuntimePort;
  readonly setup: ArchitectureSetupPort;
  readonly codegraph: CodegraphPort;
}

export type ArchitecturePortName = keyof ArchitecturePorts;

/** `ARCHITECTURE_PLUGIN_NOT_SELECTED`: the install selection lacks the plugin, so the root registered no provider. */
export type ArchitectureUnavailableCode = 'ARCHITECTURE_PROVIDER_UNAVAILABLE' | 'ARCHITECTURE_PLUGIN_NOT_SELECTED';

export interface ArchitectureUnavailable {
  readonly status: 'unavailable';
  readonly code: ArchitectureUnavailableCode;
  readonly port: ArchitecturePortName;
  readonly message: string;
}

const registered: { -readonly [K in ArchitecturePortName]?: ArchitecturePorts[K] } = {};
let absence: { readonly code: ArchitectureUnavailableCode; readonly message: string } | null = null;

/** A root that registers no provider states why; each port then returns this code and message. */
export function declareArchitectureAbsent(code: ArchitectureUnavailableCode, message: string): void {
  absence = { code, message };
}

/**
 * A process entry calls this once with the providers it runs. A provider of
 * another contract version is refused before any port is registered.
 */
export function registerArchitecturePorts(ports: Partial<ArchitecturePorts>): void {
  for (const [name, port] of Object.entries(ports)) {
    if (port.contractVersion !== ARCHITECTURE_CONTRACT_VERSION) {
      throw new Error(`architecture ${name} provider has contract version ${String(port.contractVersion)}; core requires ${ARCHITECTURE_CONTRACT_VERSION}`);
    }
  }
  Object.assign(registered, ports);
}

export function architecturePort<K extends ArchitecturePortName>(name: K): ArchitecturePorts[K] | ArchitectureUnavailable {
  const port = registered[name];
  if (port) return port as ArchitecturePorts[K];
  if (absence) return { status: 'unavailable', code: absence.code, port: name, message: absence.message };
  return { status: 'unavailable', code: 'ARCHITECTURE_PROVIDER_UNAVAILABLE', port: name, message: `no architecture ${name} provider is registered in this process` };
}

export function isArchitectureUnavailable(value: object): value is ArchitectureUnavailable {
  return 'status' in value && value.status === 'unavailable' && 'code' in value
    && (value.code === 'ARCHITECTURE_PROVIDER_UNAVAILABLE' || value.code === 'ARCHITECTURE_PLUGIN_NOT_SELECTED');
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

/**
 * Variables that make git ignore the working directory when it selects the repository,
 * or take its refs, objects and config from another repository.
 */
export const REPOSITORY_SELECTING_GIT_ENV = [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
] as const;

export function withoutRepositorySelectingGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of REPOSITORY_SELECTING_GIT_ENV) delete next[key];
  return next;
}

/** Provider tokens that gh, and the `gh auth git-credential` helper that git starts, read from the environment. */
const PROVIDER_TOKEN_ENV = new Set(['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']);

/** Subcommands that contact a remote, so git can start a credential helper that needs a provider token. */
const CREDENTIAL_GIT_COMMANDS = new Set(['fetch', 'pull', 'push', 'ls-remote', 'clone']);
/** Global options that select no mode and take no value. */
const GIT_GLOBAL_FLAGS = new Set([
  '-p', '--paginate', '-P', '--no-pager', '--bare', '--no-replace-objects', '--no-lazy-fetch', '--no-optional-locks',
  '--no-advice', '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs',
]);
/** Global options that take the next argument as their value, or an attached `=value`. */
const VALUED_GIT_GLOBAL_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--attr-source']);

/**
 * Index of the subcommand git runs, or -1. Help, version and path modes, unknown
 * options and a valued option without its value give -1.
 */
function gitSubcommandIndex(args: readonly string[]): number {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (GIT_GLOBAL_FLAGS.has(arg)) continue;
    if (VALUED_GIT_GLOBAL_OPTIONS.has(arg)) {
      if (++index >= args.length) return -1;
      continue;
    }
    if (arg.startsWith('--') && arg.includes('=') && VALUED_GIT_GLOBAL_OPTIONS.has(arg.slice(0, arg.indexOf('=')))) continue;
    return arg.startsWith('-') ? -1 : index;
  }
  return -1;
}

/** git turns `<cmd> --help` into `git help <cmd>`, which starts the configured man viewer or browser. */
function isHelpArgument(arg: string): boolean {
  return arg === '--help' || arg === '-h' || arg.startsWith('--help=');
}

/** A copy of env without provider tokens. Names match without case, as Windows reads them. */
export function withoutProviderTokens(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !PROVIDER_TOKEN_ENV.has(key.toUpperCase())));
}

/**
 * Environment of one git child. Only a subcommand that contacts a remote keeps
 * the provider tokens; every other git process, and the hooks, merge drivers
 * and filters it starts, runs without them.
 */
export function gitChildEnv(args: readonly string[], env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv | undefined {
  const at = gitSubcommandIndex(args);
  if (at >= 0 && CREDENTIAL_GIT_COMMANDS.has(args[at]!) && !args.slice(at + 1).some(isHelpArgument)) return env;
  return withoutProviderTokens(env);
}

const REDACTED = '[redacted]';

/**
 * A shorter value is not a real provider token: it would corrupt ordinary output
 * (a one-letter value turns `status` into `st[redacted]tus`). GitHub tokens have 40 or more characters.
 */
export const MIN_PROVIDER_TOKEN_LENGTH = 8;

function hasProviderToken(env: NodeJS.ProcessEnv): boolean {
  return Object.entries(env).some(([key, value]) => PROVIDER_TOKEN_ENV.has(key.toUpperCase()) && value);
}

/**
 * Provider-token values in the env of one git child, longest first. Only a call whose child env keeps
 * a token reaches this check: a value that is too short, or that the marker contains, is malformed
 * authority, so the call fails closed.
 */
function providerTokenValues(env: NodeJS.ProcessEnv): string[] {
  const values = new Set<string>();
  for (const [key, value] of Object.entries(env)) {
    if (!PROVIDER_TOKEN_ENV.has(key.toUpperCase()) || !value) continue;
    if (value.length < MIN_PROVIDER_TOKEN_LENGTH || REDACTED.includes(value)) {
      throw new Error(`${key} is shorter than ${MIN_PROVIDER_TOKEN_LENGTH} characters or part of the redaction marker; git does not run with a malformed provider token`);
    }
    values.add(value);
  }
  return [...values].sort((left, right) => right.length - left.length);
}

/** The subcommand git runs, or an empty name. Runner messages name it and no argument value. */
function subcommandOf(args: readonly string[]): string {
  const at = gitSubcommandIndex(args);
  return at >= 0 ? args[at]! : '';
}

/** `spawnGit` and `runGit` cannot replace values in their output, so they refuse a call that keeps a token. */
export function refuseProviderToken(entry: string, args: readonly string[], childEnv: NodeJS.ProcessEnv | undefined): void {
  if (hasProviderToken(childEnv ?? process.env)) {
    throw new Error(`${entry} cannot replace provider-token values and the environment of git ${subcommandOf(args)} keeps one; use gitExecFileSync, gitSpawnSync or gitExecFile`);
  }
}

/** The option keys that the remote git callers pass. A call that keeps a token accepts no other key. */
const REMOTE_CALL_OPTION_KEYS = new Set(['cwd', 'env', 'gitBin', 'timeout', 'maxBuffer', 'encoding', 'input', 'killSignal', 'stdio']);

/**
 * A call that keeps a token needs stdout and stderr pipes that the runner reads and replaces.
 * Returns the caller's stdin setting unchanged; the runner sets stdout and stderr itself.
 */
function remoteStdio(stdio: ExecFileSyncOptions['stdio']): unknown {
  const streams = stdio === undefined || stdio === null || typeof stdio === 'string' ? [stdio, stdio, stdio] : stdio;
  for (const stream of [streams[1], streams[2]]) {
    if (stream !== undefined && stream !== null && stream !== 'pipe' && stream !== 'ignore') {
      throw new Error('a git call that keeps a provider token needs runner-owned stdout and stderr pipes; inherit, an fd number and a raw stream are refused');
    }
  }
  return streams[0];
}

function assertRemoteCallOptions(args: readonly string[], options: object): void {
  for (const key of Object.keys(options)) {
    if (!REMOTE_CALL_OPTION_KEYS.has(key)) {
      throw new Error(`git ${subcommandOf(args)} keeps a provider token and refuses the option "${key}"; a remote call takes only ${[...REMOTE_CALL_OPTION_KEYS].join(', ')}`);
    }
  }
}

function redactText(text: string, values: readonly string[], cut = false): string {
  const replaced = values.reduce((current, value) => current.split(value).join(REDACTED), text);
  // A cut inside a token leaves part of it that no value matches. Drop what the longest token could have left.
  return cut ? replaced.slice(0, Math.max(0, replaced.length - (values[0]!.length - 1))) : replaced;
}

/** Buffers are matched byte for byte (latin1), so binary git output outside a token stays intact. */
function redactOutput<T extends string | Buffer | null | undefined>(output: T, values: readonly string[], cut = false): T {
  if (typeof output === 'string') return redactText(output, values, cut) as T;
  if (!Buffer.isBuffer(output)) return output;
  const latin1 = (text: string) => Buffer.from(text).toString('latin1');
  const marked = Buffer.from(redactText(output.toString('latin1'), values.map(latin1), cut), 'latin1');
  return (marked.equals(output) ? output : marked) as T;
}

const outputLimitHit = (error: unknown): boolean => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS';

type Encoding = BufferEncoding | 'buffer' | null | undefined;

/** The runner captures bytes and replaces values first; the caller encoding applies to the replaced bytes. */
function encoded<T>(output: T, encoding: Encoding): T | string {
  return Buffer.isBuffer(output) && typeof encoding === 'string' && encoding !== 'buffer' ? output.toString(encoding) : output;
}

/** A new error built from replaced fields only, so no field of the original (spawnargs, path, cmd) keeps a value. */
function rebuildError(error: unknown, values: readonly string[], encoding: Encoding): unknown {
  if (!(error instanceof Error)) return error;
  const cut = outputLimitHit(error);
  const rebuilt = new Error(redactText(error.message, values));
  rebuilt.name = error.name;
  const clean = (value: unknown, streamCut: boolean): unknown => {
    if (typeof value === 'string') return redactText(value, values);
    if (Buffer.isBuffer(value)) return encoded(redactOutput(value, values, streamCut), encoding);
    return Array.isArray(value) ? value.map(entry => clean(entry, streamCut)) : value;
  };
  for (const [key, value] of Object.entries(error)) {
    // Node sets `error.error = error`; an Error-valued field would carry the original with its unreplaced fields.
    if (value instanceof Error) continue;
    (rebuilt as unknown as Record<string, unknown>)[key] = clean(value, cut && (key === 'stdout' || key === 'stderr' || key === 'output'));
  }
  return rebuilt;
}

function redactSpawnResult<R extends SpawnSyncReturns<string | Buffer>>(result: R, values: readonly string[], encoding: Encoding): R {
  const cut = outputLimitHit(result.error);
  const replace = (output: string | Buffer | null) => encoded(redactOutput(output, values, cut), encoding);
  result.stdout = replace(result.stdout) as never;
  result.stderr = replace(result.stderr) as never;
  if (Array.isArray(result.output)) result.output = result.output.map(replace) as never;
  if (result.error) result.error = rebuildError(result.error, values, encoding) as Error;
  return result;
}

const GENERIC_GIT_NAMES = new Set(['git', 'git.exe']);

export function configuredGitBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.REPO_HARNESS_GIT_BIN ?? 'git';
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
  args: readonly string[],
  options: T,
): { bin: string; values: string[]; encoding: Encoding; options: Omit<T, 'gitBin' | 'direct'> & { timeout: number } } {
  const { gitBin, direct, timeout, env, ...rest } = options;
  // Observation policy allows the caller's git name. Re-entering it from the
  // observation executor would loop, so that executor sets direct.
  const observing = direct !== true && currentReadonlyObservation() !== undefined;
  const bin = observing ? (gitBin?.trim() || 'git') : resolveGitExecutable(gitBin, env);
  const childEnv = gitChildEnv(args, env);
  // The values to replace come from the env this child gets, once per call.
  const values = hasProviderToken(childEnv ?? process.env) ? providerTokenValues(childEnv ?? process.env) : [];
  const bound = (extra: object) => ({ ...rest, ...extra, env: childEnv, timeout: resolveGitTimeout(timeout) }) as Omit<T, 'gitBin' | 'direct'> & { timeout: number };
  const caller = options as ExecFileSyncOptions;
  if (values.length === 0) return { bin, values, encoding: undefined, options: bound({}) };
  assertRemoteCallOptions(args, options);
  // After the caller options, so no caller value can turn a stream, the encoding or the shell back on.
  const stdin = remoteStdio(caller.stdio);
  return { bin, values, encoding: caller.encoding, options: bound({ stdio: [stdin, 'pipe', 'pipe'], encoding: 'buffer', shell: false }) };
}

type GitExecStringOptions = ExecFileSyncOptionsWithStringEncoding & GitCallFields;
type GitExecBufferOptions = ExecFileSyncOptionsWithBufferEncoding & GitCallFields;
type GitExecOptions = ExecFileSyncOptions & GitCallFields;

export function gitExecFileSync(args: readonly string[], options: GitExecStringOptions): string;
export function gitExecFileSync(args: readonly string[], options?: GitExecBufferOptions): Buffer;
export function gitExecFileSync(args: readonly string[], options: GitExecOptions = {}): string | Buffer {
  const bound = bindGit(args, options);
  const argv = [...args];
  const run = (): string | Buffer => currentReadonlyObservation() !== undefined && options.direct !== true
    ? observationExecFileSync(bound.bin, argv, bound.options) as string | Buffer
    : execFileSyncRaw(bound.bin, argv, bound.options);
  if (bound.values.length === 0) return run();
  try {
    return encoded(redactOutput(run(), bound.values), bound.encoding);
  } catch (error) {
    throw rebuildError(error, bound.values, bound.encoding);
  }
}

type GitSpawnStringOptions = SpawnSyncOptionsWithStringEncoding & GitCallFields;
type GitSpawnBufferOptions = SpawnSyncOptionsWithBufferEncoding & GitCallFields;
type GitSpawnOptions = SpawnSyncOptions & GitCallFields;

export function gitSpawnSync(args: readonly string[], options: GitSpawnStringOptions): SpawnSyncReturns<string>;
export function gitSpawnSync(args: readonly string[], options?: GitSpawnBufferOptions): SpawnSyncReturns<Buffer>;
export function gitSpawnSync(args: readonly string[], options: GitSpawnOptions = {}): SpawnSyncReturns<string | Buffer> {
  const bound = bindGit(args, options);
  const argv = [...args];
  const run = (): SpawnSyncReturns<string | Buffer> => currentReadonlyObservation() !== undefined && options.direct !== true
    ? observationSpawnSync(bound.bin, argv, bound.options) as SpawnSyncReturns<string | Buffer>
    : spawnSyncRaw(bound.bin, argv, bound.options);
  if (bound.values.length === 0) return run();
  try {
    return redactSpawnResult(run(), bound.values, bound.encoding);
  } catch (error) {
    throw rebuildError(error, bound.values, bound.encoding);
  }
}

export function spawnGit(args: readonly string[], options: SpawnOptions & GitCallFields = {}): ChildProcess {
  const { gitBin, env, direct: _direct, ...rest } = options;
  const childEnv = gitChildEnv(args, env);
  refuseProviderToken('spawnGit', args, childEnv);
  return spawnRaw(resolveGitExecutable(gitBin, env), [...args], { ...rest, env: childEnv });
}

/** Wait after SIGTERM before a timed-out async git call sends SIGKILL. */
export const GIT_KILL_GRACE_MS = 1_000;
const GIT_OUTPUT_MAX_BYTES = 1024 * 1024;

/** Rejection of `gitExecFile`. `status` is the exit code; it is null after a signal, a timeout or a spawn failure. */
export class GitExecError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly timedOut: boolean,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitExecError';
  }
}

export interface GitExecAsyncOptions extends GitCallFields {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeout?: number;
}

/**
 * Asynchronous `gitExecFileSync` for an event-loop caller: same binary and
 * timeout resolution, stdin ignored, utf8 stdout. At the timeout it sends
 * SIGTERM, then SIGKILL after GIT_KILL_GRACE_MS. It settles only after the
 * child exited, and rejects with GitExecError on a non-zero exit, a signal,
 * the timeout, too much output or a spawn failure.
 */
export function gitExecFile(args: readonly string[], options: GitExecAsyncOptions = {}): Promise<string> {
  const { gitBin, env, cwd, timeout } = options;
  return new Promise((resolveOutput, reject) => {
    const childEnv = gitChildEnv(args, env);
    const values = hasProviderToken(childEnv ?? process.env) ? providerTokenValues(childEnv ?? process.env) : [];
    const child = spawnRaw(resolveGitExecutable(gitBin, env), [...args], { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let exited: { readonly code: number | null; readonly signal: NodeJS.Signals | null } | null = null;
    let timedOut = false;
    let overflow = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), GIT_KILL_GRACE_MS);
    };
    const finish = (spawnError?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(killTimer);
      child.stdout!.destroy();
      child.stderr!.destroy();
      const status = exited?.code ?? null;
      const signal = exited?.signal ?? null;
      const redactAll = (text: string, cut = false) => values.length > 0 ? redactText(text, values, cut) : text;
      const errorText = redactAll(Buffer.concat(stderr).toString('utf8'), overflow);
      const failure = (message: string, code: number | null, signalName: NodeJS.Signals | null, timeout: boolean, text: string) =>
        reject(new GitExecError(redactAll(message), code, signalName, timeout, text));
      if (spawnError) failure(`git ${subcommandOf(args)} could not start: ${spawnError.message}`, null, null, false, '');
      else if (timedOut) failure(`git ${subcommandOf(args)} timed out`, null, signal, true, errorText);
      else if (overflow) failure(`git ${subcommandOf(args)} output exceeded ${GIT_OUTPUT_MAX_BYTES} bytes`, null, signal, false, errorText);
      else if (status !== 0) failure(`git ${subcommandOf(args)} failed (${signal ?? `exit ${status}`})`, status, signal, false, errorText);
      else resolveOutput(redactAll(Buffer.concat(stdout).toString('utf8')));
    };
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > GIT_OUTPUT_MAX_BYTES) {
        if (!overflow) { overflow = true; terminate(); }
        return;
      }
      into.push(chunk);
    };
    child.stdout!.on('data', collect(stdout));
    child.stderr!.on('data', collect(stderr));
    const deadline = setTimeout(() => {
      timedOut = true;
      // A process that exited but left its pipes open to a descendant has nothing left to kill.
      if (exited) finish();
      else terminate();
    }, resolveGitTimeout(timeout));
    child.on('error', (error) => { if (child.pid === undefined) finish(error); });
    child.on('exit', (code, signal) => {
      exited = { code, signal };
      if (timedOut || overflow) finish();
    });
    child.on('close', (code, signal) => {
      exited ??= { code, signal };
      finish();
    });
  });
}
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { relative, resolve } from "path";











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
    const native = archcontextOwnership();
    try {
      const resolution = native.readAuthority(repo);
      if (resolution.status === "invalid") {
        throw new CapabilitySourceError(resolution.diagnostics.map((item) => item.message).join("; "));
      }
      return resolution;
    } catch (error) {
      if (error instanceof CapabilitySourceError) throw error;
      throw new CapabilitySourceError(native.formatError(error));
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
// node, whatever its status, still owns its architecture module.
function validateRegistryEffects(
  registry: CapabilityRegistry,
  repo: string,
  allCapabilities: readonly Capability[] = registry.capabilities,
): string[] {
  const errors: string[] = [];
  const architectureModules = new Set<string>();

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

  return errors;
}


// The standalone projection of this helper registers no provider, so archcontext
// mode fails closed there instead of guessing.
function archcontextOwnership(): ArchitectureOwnershipPort {
  const port = architecturePort("ownership");
  if (isArchitectureUnavailable(port)) {
    throw new CapabilitySourceError(
      'capability_source "archcontext" needs the packaged resolver; run repo-harness run capability-resolver'
    );
  }
  return port;
}


/**
 * One match per input path. Under `archcontext`, one archctx call resolves the
 * whole batch, joined against every capability node whatever its status.
 */
export async function findMatches(authority: MatchAuthority, repo: string, paths: readonly string[]) {
  if (authority.mode === "registry") return paths.map((path) => findMatch(authority.registry, repo, path));
  const resolution = archcontextOwnership().resolvePaths(repo, authority.owners, paths);
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
