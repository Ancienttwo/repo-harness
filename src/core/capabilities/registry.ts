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
