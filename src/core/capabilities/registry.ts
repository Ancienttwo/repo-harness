export const CAPABILITY_REGISTRY_VERSION = 1 as const;

export interface ContractFiles {
  agents: string;
  claude: string;
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
  | "ARCHCONTEXT_NODE_NOT_OBJECT"
  | "ARCHCONTEXT_SCHEMA_VERSION_UNSUPPORTED"
  | "ARCHCONTEXT_NODE_ID_INVALID"
  | "ARCHCONTEXT_NODE_KIND_INVALID"
  | "ARCHCONTEXT_NODE_STATUS_INVALID"
  | "ARCHCONTEXT_NODE_NAME_INVALID"
  | "ARCHCONTEXT_NODE_SUMMARY_INVALID"
  | "ARCHCONTEXT_NODE_RESPONSIBILITIES_INVALID"
  | "ARCHCONTEXT_INCLUDE_REQUIRED"
  | "ARCHCONTEXT_INCLUDE_ANCHOR_REQUIRED"
  | "ARCHCONTEXT_OWNER_UNKNOWN"
  | "ARCHCONTEXT_RESOLVE_FAILED"
  | "ARCHCONTEXT_EXTENSIONS_REQUIRED"
  | "ARCHCONTEXT_LSP_PROFILE_REQUIRED"
  | "ARCHCONTEXT_VERIFICATION_REQUIRED"
  | "ARCHCONTEXT_CONTRACT_FILES_REQUIRED";

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

export interface CapabilityPathMatch {
  readonly capability: Capability;
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

export interface CapabilityPathResolution {
  readonly status: "valid" | "invalid";
  readonly capabilityIds: readonly string[];
  readonly matches: readonly CapabilityPathMatch[];
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
  options: { readonly repoRoot?: string; readonly sharedPrefixes?: boolean } = {},
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

    if (!Array.isArray(rawCapability.prefixes) || rawCapability.prefixes.length === 0) {
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

/** One parsed archcontext node file. `value` is the structural YAML result. */
export interface ArchcontextNodeFile {
  readonly path: string;
  readonly value: unknown;
}

/** One `archctx resolve --paths-from` result, reduced to the fields this registry reads. */
export interface ArchcontextPathOwner {
  readonly path: string;
  readonly matched: boolean;
  readonly ambiguous: boolean;
  readonly owningCapabilityId: string | null;
}

const ARCHCONTEXT_NODE_SCHEMA_VERSION = "archcontext.node/v2";
const ARCHCONTEXT_CAPABILITY_KIND = "capability";
const ARCHCONTEXT_ACTIVE_STATUS = "active";
const ARCHCONTEXT_ID_PREFIX = "capability";
const ARCHCONTEXT_ID_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const ARCHCONTEXT_GLOB_WILDCARD = /[*?[\]{}!]/;

export function architectureModulePathFor(domain: string, name: string): string {
  return `docs/architecture/modules/${domain}/${name}.md`;
}

export function workstreamDirFor(domain: string, name: string): string {
  return `tasks/workstreams/${domain}/${name}`;
}

/**
 * Projects one archcontext `source.include` pattern onto its literal anchor: the
 * leading path segments before the first segment with a glob character. `D/**`
 * gives `D`, a file path gives itself, and `src/x/foo-*.ts` gives `src/x`.
 *
 * The anchor is a display and directory-discovery projection only. It never
 * decides ownership: under `archcontext`, `archctx resolve` owns that rule.
 * A pattern whose first segment is a glob has no anchor.
 */
export function archcontextIncludeAnchor(include: string): string | null {
  if (typeof include !== "string") return null;
  const segments: string[] = [];
  for (const segment of include.split("/")) {
    if (segment === "" || ARCHCONTEXT_GLOB_WILDCARD.test(segment)) break;
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join("/") : null;
}

function archcontextIdParts(value: unknown): { readonly domain: string; readonly name: string } | null {
  if (typeof value !== "string" || value.includes("::")) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== ARCHCONTEXT_ID_PREFIX) return null;
  if (!ARCHCONTEXT_ID_SEGMENT.test(parts[1]) || !ARCHCONTEXT_ID_SEGMENT.test(parts[2])) return null;
  return { domain: parts[1], name: parts[2] };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Maps archcontext capability nodes onto the canonical capability registry.
 *
 * This stays a pure structural mapper: callers own file reading and YAML
 * parsing. Node-shape failures are reported as `ARCHCONTEXT_*` diagnostics;
 * when the mapping succeeds the derived registry goes through the same
 * `validateCapabilityRegistryValue` contract as the JSON authority, so
 * duplicate ids and invalid paths keep their existing diagnostic codes.
 * Prefixes here are include anchors, and two capabilities can share one.
 */
export function capabilityRegistryFromArchcontextNodes(
  files: readonly ArchcontextNodeFile[],
  options: { readonly repoRoot?: string } = {},
): CapabilityRegistryResolution {
  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const capabilities: Capability[] = [];

  for (const file of files) {
    const node = file.value;
    if (!isRecord(node)) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_NODE_NOT_OBJECT",
        file.path,
        `${file.path}: archcontext node must be a YAML mapping`,
      ));
      continue;
    }
    if (node.schemaVersion !== ARCHCONTEXT_NODE_SCHEMA_VERSION) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_SCHEMA_VERSION_UNSUPPORTED",
        `${file.path}#schemaVersion`,
        `${file.path}: schemaVersion must be ${ARCHCONTEXT_NODE_SCHEMA_VERSION}`,
      ));
      continue;
    }
    if (!nonEmptyString(node.kind)) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_NODE_KIND_INVALID",
        `${file.path}#kind`,
        `${file.path}: kind is required`,
      ));
      continue;
    }
    if (!nonEmptyString(node.status)) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_NODE_STATUS_INVALID",
        `${file.path}#status`,
        `${file.path}: status is required`,
      ));
      continue;
    }
    // Nodes this repo does not own are skipped without claiming any prefix.
    if (node.kind !== ARCHCONTEXT_CAPABILITY_KIND) continue;
    if (node.status !== ARCHCONTEXT_ACTIVE_STATUS) continue;

    const idParts = archcontextIdParts(node.id);
    if (!idParts) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_NODE_ID_INVALID",
        `${file.path}#id`,
        `${file.path}: id must be capability.<domain>.<name> without a namespace prefix`,
      ));
      continue;
    }
    const { domain, name } = idParts;
    if (!nonEmptyString(node.name)) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_NODE_NAME_INVALID",
        `${file.path}#name`,
        `${file.path}: name is required by ${ARCHCONTEXT_NODE_SCHEMA_VERSION}`,
      ));
      continue;
    }
    if (!nonEmptyString(node.summary)) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_NODE_SUMMARY_INVALID",
        `${file.path}#summary`,
        `${file.path}: summary is required by ${ARCHCONTEXT_NODE_SCHEMA_VERSION}`,
      ));
      continue;
    }
    if (!Array.isArray(node.responsibilities) || node.responsibilities.length === 0 || node.responsibilities.some((entry) => !nonEmptyString(entry))) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_NODE_RESPONSIBILITIES_INVALID",
        `${file.path}#responsibilities`,
        `${file.path}: responsibilities must contain at least one non-empty string`,
      ));
      continue;
    }

    const source = node.source;
    const include = isRecord(source) ? source.include : undefined;
    if (!Array.isArray(include) || include.length === 0) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_INCLUDE_REQUIRED",
        `${file.path}#source.include`,
        `${file.path}: source.include must contain at least one entry`,
      ));
      continue;
    }
    // Include and exclude shapes belong to ArchContext validation. This mapper
    // reads only the literal anchors for display and directory discovery.
    const prefixes: string[] = [];
    let includeRejected = false;
    for (const [index, entry] of include.entries()) {
      if (!nonEmptyString(entry)) {
        diagnostics.push(diagnostic(
          "ARCHCONTEXT_INCLUDE_REQUIRED",
          `${file.path}#source.include[${index}]`,
          `${file.path}: source.include entries must be non-empty strings`,
        ));
        includeRejected = true;
        continue;
      }
      const anchor = archcontextIncludeAnchor(entry);
      if (anchor !== null && !prefixes.includes(anchor)) prefixes.push(anchor);
    }
    if (includeRejected) continue;
    if (prefixes.length === 0) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_INCLUDE_ANCHOR_REQUIRED",
        `${file.path}#source.include`,
        `${file.path}: source.include needs at least one entry with a literal leading path`,
      ));
      continue;
    }

    const extensions = node.extensions;
    if (!isRecord(extensions)) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_EXTENSIONS_REQUIRED",
        `${file.path}#extensions`,
        `${file.path}: extensions is required`,
      ));
      continue;
    }
    if (!nonEmptyString(extensions.lspProfile)) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_LSP_PROFILE_REQUIRED",
        `${file.path}#extensions.lspProfile`,
        `${file.path}: extensions.lspProfile is required`,
      ));
      continue;
    }
    const verification = extensions.verification;
    if (!Array.isArray(verification) || verification.some((hint) => typeof hint !== "string")) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_VERIFICATION_REQUIRED",
        `${file.path}#extensions.verification`,
        `${file.path}: extensions.verification must be an array of strings`,
      ));
      continue;
    }
    // contract_files is a human authority decision (root-facing capabilities do
    // not follow the prefix), so it is declared, never derived.
    const contractFiles = extensions.contractFiles;
    if (
      !isRecord(contractFiles)
      || !nonEmptyString(contractFiles.agents)
      || !nonEmptyString(contractFiles.claude)
    ) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_CONTRACT_FILES_REQUIRED",
        `${file.path}#extensions.contractFiles`,
        `${file.path}: extensions.contractFiles.agents and extensions.contractFiles.claude are required`,
      ));
      continue;
    }

    capabilities.push({
      id: `${domain}-${name}`,
      domain,
      name,
      prefixes,
      contract_files: {
        agents: contractFiles.agents,
        claude: contractFiles.claude,
      },
      architecture_module: architectureModulePathFor(domain, name),
      workstream_dir: workstreamDirFor(domain, name),
      lsp_profile: extensions.lspProfile,
      verification_hints: [...(verification as string[])],
    });
  }

  if (diagnostics.length > 0) return { status: "invalid", registry: null, diagnostics };
  capabilities.sort((left, right) => byteCompare(left.id, right.id));
  return validateCapabilityRegistryValue(
    { version: CAPABILITY_REGISTRY_VERSION, capabilities },
    { repoRoot: options.repoRoot, sharedPrefixes: true },
  );
}

/**
 * Maps `archctx resolve` owners onto the registry. ArchContext decides the owner;
 * this function only joins its capability id to registry metadata. An ambiguous
 * owner fails closed like a same-length prefix tie. A path without an owning
 * capability is unmapped. The match prefix is the owner's primary anchor,
 * because ArchContext does not report which include entry matched.
 */
export function capabilityPathResolutionFromArchcontextOwners(
  registry: CapabilityRegistry,
  owners: readonly ArchcontextPathOwner[],
): CapabilityPathResolution {
  const byNodeId = new Map(registry.capabilities.map((capability) => [
    `${ARCHCONTEXT_ID_PREFIX}.${capability.domain}.${capability.name}`,
    capability,
  ]));
  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const matches: CapabilityPathMatch[] = [];
  const unmappedPaths: string[] = [];
  const seenPaths = new Set<string>();
  for (const owner of owners) {
    if (seenPaths.has(owner.path)) continue;
    seenPaths.add(owner.path);
    if (owner.ambiguous) {
      diagnostics.push(diagnostic("AMBIGUOUS_MATCH", "path", `ambiguous ArchContext owner for ${owner.path}`));
      continue;
    }
    if (!owner.matched || owner.owningCapabilityId === null) {
      unmappedPaths.push(owner.path);
      continue;
    }
    const capability = byNodeId.get(owner.owningCapabilityId);
    if (!capability) {
      diagnostics.push(diagnostic(
        "ARCHCONTEXT_OWNER_UNKNOWN",
        "path",
        `${owner.path}: ArchContext owner ${owner.owningCapabilityId} is not an active capability`,
      ));
      continue;
    }
    matches.push({ capability, prefix: capability.prefixes[0], filePath: owner.path });
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
