#!/usr/bin/env bun
// @generated-from src/core/capabilities/registry.ts sha256:0076225810b6506432835775bfbb0388db4a16e074f3705a5624c8a296123452
// Standalone typed Bun projection. Regenerate from scripts/capability-resolver.ts; do not edit by hand.
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
  | "ARCHCONTEXT_OWNER_UNKNOWN"
  | "ARCHCONTEXT_RESOLVE_FAILED"
  | "ARCHCONTEXT_MODEL_REJECTED"
  | "ARCHCONTEXT_RESOLVE_UNAVAILABLE"
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

/**
 * `unavailable` means ownership was not computed at all, for example inside a
 * read-only observation that must not start archctx. It is never a model fault.
 */
export interface CapabilityPathResolution {
  readonly status: "valid" | "invalid" | "unavailable";
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

const ARCHCONTEXT_NODE_SCHEMA_VERSION = "archcontext.node/v2";
const ARCHCONTEXT_CAPABILITY_KIND = "capability";
const ARCHCONTEXT_ACTIVE_STATUS = "active";
const ARCHCONTEXT_ID_PREFIX = "capability";
const ARCHCONTEXT_ID_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
// ArchContext globs know only `*`, `?` and `**`; every other character is literal.
const ARCHCONTEXT_GLOB_WILDCARD = /[*?]/;

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

/**
 * Projects one archcontext `source.include` pattern onto its literal anchor: the
 * leading path segments before the first segment with `*` or `?`, the only
 * ArchContext glob characters. `D/**` gives `D`, a file path gives itself,
 * `src/x/foo-*.ts` gives `src/x`, and `src/app/[locale]/**` keeps `[locale]`.
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
 *
 * Every capability node is mapped and validated, whatever its status, because
 * ArchContext resolves ownership without a status filter: `owners` carries them
 * all for the owner join. `registry` lists only active capabilities, for
 * display, anchors and contract files. A capability whose includes are all
 * globs has no anchor; it stays valid and is shown by its node id.
 */
export function capabilityRegistryFromArchcontextNodes(
  files: readonly ArchcontextNodeFile[],
  options: { readonly repoRoot?: string } = {},
): ArchcontextCapabilityResolution {
  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const capabilities: Capability[] = [];
  const activeIds = new Set<string>();

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
    // Include and exclude grammar belongs to ArchContext validation. This mapper
    // reads only the literal anchors for display and directory discovery, and
    // enforces path safety: no pattern may be absolute or climb out of the repo.
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
    const exclude = isRecord(source) && Array.isArray(source.exclude) ? source.exclude : [];
    const unsafe = [
      ...include.map((entry, index) => ({ field: `source.include[${index}]`, entry })),
      ...exclude.map((entry, index) => ({ field: `source.exclude[${index}]`, entry })),
    ].flatMap(({ field, entry }) => {
      if (typeof entry !== "string") return [];
      try {
        normalizeCapabilityPath(entry);
        return [];
      } catch (error) {
        return [diagnostic(
          "INVALID_PATH",
          `${file.path}#${field}`,
          `${file.path}: ${field} must stay inside the repository: ${(error as Error).message}`,
        )];
      }
    });
    if (unsafe.length > 0) {
      diagnostics.push(...unsafe);
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

    if (node.status === ARCHCONTEXT_ACTIVE_STATUS) activeIds.add(`${domain}-${name}`);
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

  if (diagnostics.length > 0) return { status: "invalid", registry: null, owners: null, diagnostics };
  capabilities.sort((left, right) => byteCompare(left.id, right.id));
  const validated = validateCapabilityRegistryValue(
    { version: CAPABILITY_REGISTRY_VERSION, capabilities },
    { repoRoot: options.repoRoot, sharedPrefixes: true, anchorless: true },
  );
  if (validated.status !== "valid") {
    return { status: "invalid", registry: null, owners: null, diagnostics: validated.diagnostics };
  }
  return {
    status: "valid",
    registry: Object.freeze({
      version: CAPABILITY_REGISTRY_VERSION,
      capabilities: capabilities.filter((capability) => activeIds.has(capability.id)),
    }),
    owners: new Map(capabilities.map((capability) => [archcontextNodeId(capability), capability])),
    diagnostics: [],
  };
}

/**
 * Maps `archctx resolve` owners onto capability nodes. ArchContext decides the
 * owner; this function only joins its capability id to node metadata.
 * `owningCapabilityId` decides first: archctx 0.8.0 reports `matched: false`
 * for every ambiguous result, also when all candidates share one owning
 * capability, so `matched` is not read. An ambiguous result without an owning
 * capability fails closed, and any other result without one is unmapped
 * (unowned). The match prefix is the owner's stable node id, because
 * ArchContext does not report which include entry matched.
 */
export function capabilityPathResolutionFromArchcontextOwners(
  owners: ArchcontextCapabilityOwners,
  results: readonly ArchcontextPathOwner[],
): CapabilityPathResolution {
  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const matches: CapabilityPathMatch[] = [];
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
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { relative, resolve } from "path";
import { spawnSync } from "child_process";


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

type Format = "json" | "text" | "prefixes" | "archcontext-nodes-v2";

type Args = {
  command: string;
  repo: string;
  path: string;
  pathsFrom: string;
  format: Format;
};

const DEFAULT_REGISTRY = ".ai/context/capabilities.json";
const HARNESS_POLICY = ".ai/harness/policy.json";
const CAPABILITY_SOURCE_KEY = `${HARNESS_POLICY}#context.capability_source`;
const ARCHCONTEXT_NODES_DIR = ".archcontext/model/nodes";
const ARCHCONTEXT_NODE_FILE = /\.ya?ml$/;

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

/**
 * Structural accessor for Bun's native YAML parser. Keeping the lookup
 * structural avoids an npm YAML dependency in a helper that must run inside a
 * repo with no node_modules, and doubles as the fail-closed guard for Bun
 * runtimes older than 1.3.
 */
export function bunYamlParser(host: unknown): (source: string) => unknown {
  const runtime = plainRecord(host)?.Bun;
  const yaml = plainRecord(runtime)?.YAML;
  const parse = plainRecord(yaml)?.parse;
  if (typeof parse !== "function") {
    throw new CapabilitySourceError(
      `Bun.YAML is unavailable; ${CAPABILITY_SOURCE_KEY}="archcontext" requires Bun >= 1.3 ` +
        "(upgrade Bun, or set the capability source back to \"registry\")"
    );
  }
  return (source: string) => (parse as (input: string) => unknown).call(yaml, source);
}

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

export function readArchcontextNodeFiles(repo: string): ArchcontextNodeFile[] {
  const nodesDir = resolve(repo, ARCHCONTEXT_NODES_DIR);
  if (!existsSync(nodesDir)) {
    throw new CapabilitySourceError(
      `missing archcontext model directory: ${ARCHCONTEXT_NODES_DIR}; ` +
        `${CAPABILITY_SOURCE_KEY}="archcontext" reads capabilities from that directory only`
    );
  }
  const parseYaml = bunYamlParser(globalThis);
  const entries = readdirSync(nodesDir, { withFileTypes: true })
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  const files: ArchcontextNodeFile[] = [];
  for (const entry of entries) {
    const relPath = `${ARCHCONTEXT_NODES_DIR}/${entry.name}`;
    if (!entry.isFile() || !ARCHCONTEXT_NODE_FILE.test(entry.name)) {
      throw new CapabilitySourceError(
        `unexpected entry in archcontext model directory: ${relPath}; expected only *.yaml or *.yml node files`
      );
    }
    let value: unknown;
    try {
      value = parseYaml(readFileSync(resolve(nodesDir, entry.name), "utf-8"));
    } catch (error) {
      throw new CapabilitySourceError(
        `invalid archcontext node YAML: ${relPath}: ${(error as Error).message}`
      );
    }
    files.push({ path: relPath, value });
  }
  return files;
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
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
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
    return capabilityRegistryFromArchcontextNodes(readArchcontextNodeFiles(repo), { repoRoot: repo });
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

/** Every archcontext capability node by node id, whatever its status: the owner join input. */
export function readArchcontextOwners(repo: string): ArchcontextCapabilityOwners {
  const resolution = capabilityRegistryFromArchcontextNodes(readArchcontextNodeFiles(repo), { repoRoot: repo });
  if (resolution.status === "invalid") {
    throw malformedRegistryError(resolution.diagnostics, ARCHCONTEXT_NODES_DIR);
  }
  return resolution.owners;
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

// Under `archcontext`, `winner.prefix` is the owner's stable node id: ArchContext
// does not report which include matched, so no synthetic path prefix is shown.
function matchRecord(filePath: string, winner: CapabilityPathMatch | null) {
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

type ArchcontextPathResolver = (repo: string, owners: ArchcontextCapabilityOwners, paths: readonly string[]) => CapabilityPathResolution;

// The standalone projection of this helper has no package-local archctx, so the
// import fails there and archcontext mode fails closed instead of guessing. The
// specifier is not a literal, so the projection type-checks without that module.
const ARCHCONTEXT_OWNERS_MODULE = "../src/effects/capabilities/archcontext-owners";

async function archcontextPathResolver(): Promise<ArchcontextPathResolver> {
  try {
    const owners: { resolveArchcontextCapabilityPaths: ArchcontextPathResolver } = await import(ARCHCONTEXT_OWNERS_MODULE);
    return owners.resolveArchcontextCapabilityPaths;
  } catch (error) {
    throw new CapabilitySourceError(
      `${CAPABILITY_SOURCE_KEY}="archcontext" resolves paths through the repo-harness package; ` +
        `run repo-harness run capability-resolver (${(error as Error).message})`
    );
  }
}

export type MatchAuthority =
  | { readonly mode: "registry"; readonly registry: CapabilityRegistry }
  | { readonly mode: "archcontext"; readonly owners: ArchcontextCapabilityOwners };

/**
 * One match per input path. Under `archcontext`, one archctx call resolves the
 * whole batch, joined against every capability node whatever its status.
 */
export async function findMatches(authority: MatchAuthority, repo: string, paths: readonly string[]) {
  if (authority.mode === "registry") return paths.map((path) => findMatch(authority.registry, repo, path));
  const resolution = (await archcontextPathResolver())(repo, authority.owners, paths);
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

function toArchContextNodeV2(capability: Capability, isExistingDirectory: (path: string) => boolean): ArchContextNodeV2 {
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
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
        "ARCHCONTEXT_NODE_NOT_OBJECT",
        "ARCHCONTEXT_SCHEMA_VERSION_UNSUPPORTED",
        "ARCHCONTEXT_NODE_ID_INVALID",
        "ARCHCONTEXT_NODE_KIND_INVALID",
        "ARCHCONTEXT_NODE_STATUS_INVALID",
        "ARCHCONTEXT_NODE_NAME_INVALID",
        "ARCHCONTEXT_NODE_SUMMARY_INVALID",
        "ARCHCONTEXT_NODE_RESPONSIBILITIES_INVALID",
        "ARCHCONTEXT_INCLUDE_REQUIRED",
        "ARCHCONTEXT_EXTENSIONS_REQUIRED",
        "ARCHCONTEXT_LSP_PROFILE_REQUIRED",
        "ARCHCONTEXT_VERIFICATION_REQUIRED",
        "ARCHCONTEXT_CONTRACT_FILES_REQUIRED",
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
    await main();
  } catch (error) {
    console.error(`[CapabilityResolver] ${(error as Error).message}`);
    process.exit((error as { exitCode?: number }).exitCode ?? 1);
  }
}
