// Pure skill-surface catalog module. It imports only the pure plugin
// manifest: entrypoints never throw on data problems, parse takes an
// already-read string|null, and every result is a closed status union carrying
// a closed diagnostic-code union. This module never touches fs/process;
// callers own reading manifest.json and (optionally) proving a package's
// source path exists on disk.
import { isRecord } from "../evidence/is-record";
import { HOST_PROGRAM_PLUGINS, isSurfaceOwner, ownerEnabled, SURFACE_OWNERS, type PluginId, type SurfaceOwner } from "./plugin-manifest";
import { SHA256_PREFIXED_PATTERN } from "../evidence/sha256";

export const SKILL_SURFACE_CATALOG_VERSION = 4 as const;

export const SKILL_SURFACE_HOSTS = ["claude", "codex", "pi"] as const;
export type SkillSurfaceHost = (typeof SKILL_SURFACE_HOSTS)[number];

export const SKILL_SURFACE_KINDS = ["router", "facade", "provider-skill", "integration", "external", "judge"] as const;
export type SkillSurfaceKind = (typeof SKILL_SURFACE_KINDS)[number];

export const SKILL_SURFACE_DISCOVERABILITIES = [
  "always",
  "profile-facade",
  "explicit-only",
  "cli-reference",
  "cross-model",
  "explicit-setup",
  "external-marketplace",
] as const;
export type SkillSurfaceDiscoverability = (typeof SKILL_SURFACE_DISCOVERABILITIES)[number];

export interface SkillSurfaceRetirementCandidate {
  readonly replacement: string | null;
  readonly note: string;
}

export interface SkillSurfaceRetirementCleanup {
  readonly actionId: string;
  readonly historicalFingerprints: readonly string[];
}

/**
 * Migration-diagnostics-only record for a package name that has been fully
 * deleted from `packages[]` (source directory removed, no longer
 * installable/discoverable). Distinct from `retirementCandidate` (which
 * annotates a still-live package that is a *future* consolidation target):
 * every entry here names a package that is already gone. `replacement`, when
 * non-null, must reference a live `packages[].name`; `null` means fully
 * retired with no successor (e.g. autoplan).
 */
export interface SkillSurfaceRetiredPackage {
  readonly name: string;
  readonly replacement: string | null;
  readonly note: string;
  /** Inert ownership proof for the workflow contract's explicit cleanup action. */
  readonly cleanup?: readonly SkillSurfaceRetirementCleanup[];
}

export interface SkillSurfacePackage {
  readonly name: string;
  readonly kind: SkillSurfaceKind;
  readonly audience: "bot" | "worker";
  readonly source: string | null;
  /** Upstream package spec (e.g. "tw93/Waza") for kind:"external" packages fetched via `bunx skills add`; null otherwise. */
  readonly provider: string | null;
  /** Optional immutable full-tree digest required before host projection. */
  readonly integrity: string | null;
  readonly hosts: readonly SkillSurfaceHost[];
  /** `core` or the plugin whose selection projects this package. */
  readonly owner: SurfaceOwner;
  /** True when no selection projects the package; an explicit command or flag installs it. */
  readonly explicitOnly: boolean;
  readonly discoverability: SkillSurfaceDiscoverability;
  readonly requires: readonly string[];
  readonly mutatesRepoByDefault: boolean;
  readonly summary: string;
  readonly retirementCandidate: SkillSurfaceRetirementCandidate | null;
}

export interface SkillSurfaceHostPlacements {
  readonly pi: readonly string[];
  readonly claude: readonly string[];
  readonly codex: readonly string[];
}

export interface SkillSurfaceCatalog {
  readonly version: typeof SKILL_SURFACE_CATALOG_VERSION;
  readonly surface: string;
  readonly source: string;
  readonly router: string;
  readonly packages: readonly SkillSurfacePackage[];
  readonly nonPublicInternalSteps: readonly string[];
  readonly retiredPackages: readonly SkillSurfaceRetiredPackage[];
}

export interface ExternalSkillInstallGroup {
  readonly provider: string;
  readonly hosts: readonly SkillSurfaceHost[];
  readonly skills: readonly string[];
  readonly integrityBySkill: Readonly<Record<string, string | null>>;
}

export interface IntegrityBoundExternalSkillInstallGroup extends Omit<ExternalSkillInstallGroup, "integrityBySkill"> {
  readonly integrityBySkill: Readonly<Record<string, string>>;
}

export type RequiredExternalDependencyInstallGroups =
  | { readonly status: "selected"; readonly groups: readonly IntegrityBoundExternalSkillInstallGroup[] }
  | { readonly status: "missing"; readonly name: string }
  | { readonly status: "not_explicit_only"; readonly name: string }
  | { readonly status: "missing_integrity"; readonly name: string };

export type SkillSurfaceCatalogDiagnosticCode =
  | "MANIFEST_MISSING"
  | "INVALID_JSON"
  | "CATALOG_NOT_OBJECT"
  | "UNSUPPORTED_VERSION"
  | "FIELD_REQUIRED"
  | "PACKAGES_NOT_ARRAY"
  | "PACKAGE_NOT_OBJECT"
  | "INVALID_KIND"
  | "INVALID_DISCOVERABILITY"
  | "INVALID_HOST"
  | "INVALID_OWNER"
  | "INVALID_INTEGRITY_SCOPE"
  | "DUPLICATE_NAME"
  | "DUPLICATE_SOURCE"
  | "UNKNOWN_REQUIREMENT"
  | "SELF_REQUIREMENT"
  | "DUPLICATE_REQUIREMENT"
  | "CYCLIC_REQUIREMENT"
  | "HOST_INCOMPATIBLE_REQUIREMENT"
  | "RETIREMENT_CANDIDATE_NOT_OBJECT"
  | "RETIREMENT_REPLACEMENT_UNKNOWN"
  | "RETIREMENT_REPLACEMENT_RETIRING"
  | "SOURCE_MISSING"
  | "RETIRED_PACKAGES_NOT_ARRAY"
  | "RETIRED_PACKAGE_NOT_OBJECT";

export interface SkillSurfaceCatalogDiagnostic {
  readonly code: SkillSurfaceCatalogDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export type SkillSurfaceCatalogResolution =
  | {
      readonly status: "absent";
      readonly catalog: null;
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "invalid";
      readonly catalog: null;
      readonly diagnostics: readonly SkillSurfaceCatalogDiagnostic[];
    }
  | {
      readonly status: "valid";
      readonly catalog: SkillSurfaceCatalog;
      readonly diagnostics: readonly [];
    };

export interface SkillSurfaceCatalogOptions {
  /** When source is null: true means "a manifest was expected" (invalid), false/omitted means "absent" is acceptable. */
  readonly declared?: boolean;
  /** Caller-supplied fs existence probe for package.source. Omit to skip missing-source detection (pure core never touches fs itself). */
  readonly exists?: (path: string) => boolean;
}

function diagnostic(
  code: SkillSurfaceCatalogDiagnosticCode,
  path: string,
  message: string,
): SkillSurfaceCatalogDiagnostic {
  return Object.freeze({ code, path, message });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sorted = (values: readonly string[]) => [...values].sort();
  const a = sorted(left);
  const b = sorted(right);
  return a.every((value, index) => value === b[index]);
}

/** A package that a plugin selection projects: not explicit-only, and its owner is enabled. */
function selected(pkg: SkillSurfacePackage, plugins: readonly PluginId[]): boolean {
  return !pkg.explicitOnly && ownerEnabled(pkg.owner, plugins);
}

// --- validation --------------------------------------------------------

const REQUIRED_STRING_FIELDS = ["name", "kind", "discoverability", "summary"] as const;

function validatePackage(
  raw: unknown,
  index: number,
  diagnostics: SkillSurfaceCatalogDiagnostic[],
): SkillSurfacePackage | null {
  const basePath = `packages[${index}]`;
  if (!isRecord(raw)) {
    diagnostics.push(diagnostic("PACKAGE_NOT_OBJECT", basePath, `${basePath} must be an object`));
    return null;
  }
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "(unknown)";

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = raw[field];
    if (typeof value !== "string" || value.trim() === "") {
      diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.${field}`, `${name}: ${field} is required`));
    }
  }

  if (raw.source !== null && typeof raw.source !== "string") {
    diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.source`, `${name}: source must be a string or null`));
  }
  if (raw.provider !== null && raw.provider !== undefined && typeof raw.provider !== "string") {
    diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.provider`, `${name}: provider must be a string or null`));
  }
  if (
    raw.integrity !== null &&
    raw.integrity !== undefined &&
    (typeof raw.integrity !== "string" || !SHA256_PREFIXED_PATTERN.test(raw.integrity))
  ) {
    diagnostics.push(diagnostic(
      "FIELD_REQUIRED",
      `${basePath}.integrity`,
      `${name}: integrity must be null or sha256:<64 lowercase hex>`,
    ));
  }

  if (typeof raw.kind === "string" && !(SKILL_SURFACE_KINDS as readonly string[]).includes(raw.kind)) {
    diagnostics.push(diagnostic(
      "INVALID_KIND",
      `${basePath}.kind`,
      `${name}: kind must be one of ${SKILL_SURFACE_KINDS.join(", ")}`,
    ));
  }
  if (
    typeof raw.discoverability === "string" &&
    !(SKILL_SURFACE_DISCOVERABILITIES as readonly string[]).includes(raw.discoverability)
  ) {
    diagnostics.push(diagnostic(
      "INVALID_DISCOVERABILITY",
      `${basePath}.discoverability`,
      `${name}: discoverability must be one of ${SKILL_SURFACE_DISCOVERABILITIES.join(", ")}`,
    ));
  }

  if (!isStringArray(raw.hosts)) {
    diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.hosts`, `${name}: hosts must be a string array`));
  } else {
    for (const [hostIndex, host] of raw.hosts.entries()) {
      if (!(SKILL_SURFACE_HOSTS as readonly string[]).includes(host)) {
        diagnostics.push(diagnostic(
          "INVALID_HOST",
          `${basePath}.hosts[${hostIndex}]`,
          `${name}: host must be one of ${SKILL_SURFACE_HOSTS.join(", ")}`,
        ));
      }
    }
  }

  if (!isSurfaceOwner(raw.owner)) {
    diagnostics.push(diagnostic("INVALID_OWNER", `${basePath}.owner`, `${name}: owner must be one of ${SURFACE_OWNERS.join(", ")}`));
  }
  if (typeof raw.explicitOnly !== "boolean") {
    diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.explicitOnly`, `${name}: explicitOnly must be a boolean`));
  }

  if (!isStringArray(raw.requires)) {
    diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.requires`, `${name}: requires must be a string array`));
  }

  if (typeof raw.mutatesRepoByDefault !== "boolean") {
    diagnostics.push(diagnostic(
      "FIELD_REQUIRED",
      `${basePath}.mutatesRepoByDefault`,
      `${name}: mutatesRepoByDefault must be a boolean`,
    ));
  }

  if (raw.audience !== "bot" && raw.audience !== "worker") {
    diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.audience`, `${name}: audience must be bot or worker`));
  }

  let retirementCandidate: SkillSurfaceRetirementCandidate | null = null;
  if (raw.retirementCandidate !== null && raw.retirementCandidate !== undefined) {
    if (!isRecord(raw.retirementCandidate)) {
      diagnostics.push(diagnostic(
        "RETIREMENT_CANDIDATE_NOT_OBJECT",
        `${basePath}.retirementCandidate`,
        `${name}: retirementCandidate must be an object or null`,
      ));
    } else {
      const replacement = raw.retirementCandidate.replacement;
      const note = raw.retirementCandidate.note;
      if (replacement !== null && typeof replacement !== "string") {
        diagnostics.push(diagnostic(
          "FIELD_REQUIRED",
          `${basePath}.retirementCandidate.replacement`,
          `${name}: retirementCandidate.replacement must be a string or null`,
        ));
      }
      if (typeof note !== "string" || note.trim() === "") {
        diagnostics.push(diagnostic(
          "FIELD_REQUIRED",
          `${basePath}.retirementCandidate.note`,
          `${name}: retirementCandidate.note is required`,
        ));
      }
      if ((replacement === null || typeof replacement === "string") && typeof note === "string") {
        retirementCandidate = { replacement: replacement as string | null, note };
      }
    }
  }

  return {
    name,
    audience: raw.audience as SkillSurfacePackage["audience"],
    kind: (raw.kind as SkillSurfaceKind) ?? "facade",
    source: (raw.source as string | null) ?? null,
    provider: typeof raw.provider === "string" ? raw.provider : null,
    integrity: typeof raw.integrity === "string" ? raw.integrity : null,
    hosts: isStringArray(raw.hosts) ? (raw.hosts as SkillSurfaceHost[]) : [],
    owner: raw.owner as SurfaceOwner,
    explicitOnly: raw.explicitOnly === true,
    discoverability: (raw.discoverability as SkillSurfaceDiscoverability) ?? "cli-reference",
    requires: isStringArray(raw.requires) ? raw.requires : [],
    mutatesRepoByDefault: raw.mutatesRepoByDefault === true,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    retirementCandidate,
  };
}

function validateRetiredPackages(
  raw: unknown,
  liveNames: ReadonlySet<string>,
  diagnostics: SkillSurfaceCatalogDiagnostic[],
): readonly SkillSurfaceRetiredPackage[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    diagnostics.push(diagnostic("RETIRED_PACKAGES_NOT_ARRAY", "retiredPackages", "retiredPackages must be an array"));
    return [];
  }
  const entries: SkillSurfaceRetiredPackage[] = [];
  for (const [index, rawEntry] of raw.entries()) {
    const basePath = `retiredPackages[${index}]`;
    if (!isRecord(rawEntry)) {
      diagnostics.push(diagnostic("RETIRED_PACKAGE_NOT_OBJECT", basePath, `${basePath} must be an object`));
      continue;
    }
    const name = typeof rawEntry.name === "string" && rawEntry.name.trim() ? rawEntry.name.trim() : "";
    if (!name) {
      diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.name`, `${basePath}: name is required`));
      continue;
    }
    const replacement = rawEntry.replacement;
    if (replacement !== null && typeof replacement !== "string") {
      diagnostics.push(diagnostic(
        "FIELD_REQUIRED",
        `${basePath}.replacement`,
        `${name}: replacement must be a string or null`,
      ));
      continue;
    }
    const note = rawEntry.note;
    if (typeof note !== "string" || note.trim() === "") {
      diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.note`, `${name}: note is required`));
      continue;
    }
    if (replacement !== null && !liveNames.has(replacement)) {
      diagnostics.push(diagnostic(
        "RETIREMENT_REPLACEMENT_UNKNOWN",
        `${basePath}.replacement`,
        `${name}: retiredPackages replacement "${replacement}" is not a live package in this catalog`,
      ));
      continue;
    }
    let cleanup: SkillSurfaceRetirementCleanup[] | undefined;
    if (rawEntry.cleanup !== undefined) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(name) || !Array.isArray(rawEntry.cleanup) || rawEntry.cleanup.length === 0) {
        diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.cleanup`, `${name}: cleanup requires a safe package name and a non-empty array`));
        continue;
      }
      cleanup = [];
      const actionIds = new Set<string>();
      for (const [cleanupIndex, item] of rawEntry.cleanup.entries()) {
        const path = `${basePath}.cleanup[${cleanupIndex}]`;
        if (!isRecord(item) || typeof item.actionId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(item.actionId)
          || actionIds.has(item.actionId) || !isStringArray(item.historicalFingerprints)
          || item.historicalFingerprints.length === 0 || item.historicalFingerprints.some((hash) => !SHA256_PREFIXED_PATTERN.test(hash))) {
          diagnostics.push(diagnostic("FIELD_REQUIRED", path, `${name}: cleanup requires a unique action id and exact SHA-256 fingerprints`));
          continue;
        }
        actionIds.add(item.actionId);
        cleanup.push({ actionId: item.actionId, historicalFingerprints: item.historicalFingerprints });
      }
    }
    entries.push({ name, replacement: replacement as string | null, note, ...(cleanup === undefined ? {} : { cleanup }) });
  }
  return entries;
}

export function validateSkillSurfaceCatalogValue(
  value: unknown,
  options: SkillSurfaceCatalogOptions = {},
): SkillSurfaceCatalogResolution {
  if (!isRecord(value)) {
    return {
      status: "invalid",
      catalog: null,
      diagnostics: [diagnostic("CATALOG_NOT_OBJECT", "$", "expected an object")],
    };
  }
  if (value.version !== SKILL_SURFACE_CATALOG_VERSION) {
    return {
      status: "invalid",
      catalog: null,
      diagnostics: [diagnostic("UNSUPPORTED_VERSION", "version", `version must be ${SKILL_SURFACE_CATALOG_VERSION}`)],
    };
  }
  if (!Array.isArray(value.packages)) {
    return {
      status: "invalid",
      catalog: null,
      diagnostics: [diagnostic("PACKAGES_NOT_ARRAY", "packages", "packages must be an array")],
    };
  }

  const diagnostics: SkillSurfaceCatalogDiagnostic[] = [];
  const packages: SkillSurfacePackage[] = [];
  // Invalid entries are dropped, so `packages` positions differ from input
  // positions. `names` holds positions in `packages`; diagnostics use
  // `sourceIndexes` to name the input entry.
  const sourceIndexes: number[] = [];
  const names = new Map<string, number>();
  const sources = new Map<string, number>();

  for (const [index, rawPackage] of value.packages.entries()) {
    const pkg = validatePackage(rawPackage, index, diagnostics);
    if (!pkg) continue;
    packages.push(pkg);
    sourceIndexes.push(index);

    if (pkg.name !== "(unknown)") {
      const previous = names.get(pkg.name);
      if (previous !== undefined) {
        diagnostics.push(diagnostic(
          "DUPLICATE_NAME",
          `packages[${index}].name`,
          `duplicate package name: ${pkg.name}`,
        ));
      } else {
        names.set(pkg.name, packages.length - 1);
      }
    }
    if (pkg.source !== null) {
      const previous = sources.get(pkg.source);
      if (previous !== undefined) {
        diagnostics.push(diagnostic(
          "DUPLICATE_SOURCE",
          `packages[${index}].source`,
          `duplicate package source: ${pkg.source}`,
        ));
      } else {
        sources.set(pkg.source, index);
      }
    }
  }

  for (const [position, pkg] of packages.entries()) {
    const index = sourceIndexes[position];
    const seenRequirements = new Set<string>();
    for (const [requirementIndex, requirement] of pkg.requires.entries()) {
      const requirementPath = `packages[${index}].requires[${requirementIndex}]`;
      if (seenRequirements.has(requirement)) {
        diagnostics.push(diagnostic(
          "DUPLICATE_REQUIREMENT",
          requirementPath,
          `${pkg.name}: duplicate requirement "${requirement}"`,
        ));
        continue;
      }
      seenRequirements.add(requirement);
      if (requirement === pkg.name) {
        diagnostics.push(diagnostic(
          "SELF_REQUIREMENT",
          requirementPath,
          `${pkg.name}: a package cannot require itself`,
        ));
        continue;
      }
      const targetIndex = names.get(requirement);
      if (targetIndex === undefined) {
        diagnostics.push(diagnostic(
          "UNKNOWN_REQUIREMENT",
          requirementPath,
          `${pkg.name}: required package "${requirement}" is not in this catalog`,
        ));
        continue;
      }
      const target = packages[targetIndex];
      const unsupportedHosts = pkg.hosts.filter((host) => !target.hosts.includes(host));
      if (unsupportedHosts.length > 0) {
        diagnostics.push(diagnostic(
          "HOST_INCOMPATIBLE_REQUIREMENT",
          requirementPath,
          `${pkg.name}: required package "${requirement}" does not support hosts ${unsupportedHosts.join(", ")}`,
        ));
      }
    }
    if (pkg.integrity !== null && (pkg.kind !== "external" || !pkg.explicitOnly)) {
      diagnostics.push(diagnostic(
        "INVALID_INTEGRITY_SCOPE",
        `packages[${index}].integrity`,
        `${pkg.name}: integrity-bound packages must be explicit-only external packages`,
      ));
    }
    const rc = pkg.retirementCandidate;
    if (!rc || rc.replacement === null) continue;
    const targetIndex = names.get(rc.replacement);
    if (targetIndex === undefined) {
      diagnostics.push(diagnostic(
        "RETIREMENT_REPLACEMENT_UNKNOWN",
        `packages[${index}].retirementCandidate.replacement`,
        `${pkg.name}: retirementCandidate.replacement "${rc.replacement}" is not a package in this catalog`,
      ));
      continue;
    }
    const target = packages[targetIndex];
    if (target.retirementCandidate !== null) {
      diagnostics.push(diagnostic(
        "RETIREMENT_REPLACEMENT_RETIRING",
        `packages[${index}].retirementCandidate.replacement`,
        `${pkg.name}: retirementCandidate.replacement "${rc.replacement}" is itself a retirement candidate`,
      ));
    }
  }

  const visitState = new Map<string, "visiting" | "visited">();
  const reportedCycles = new Set<string>();
  const visitRequirements = (name: string, trail: readonly string[]): void => {
    const state = visitState.get(name);
    if (state === "visited") return;
    if (state === "visiting") {
      const start = trail.indexOf(name);
      const cycle = [...trail.slice(start), name];
      const key = [...new Set(cycle)].sort().join("\0");
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        diagnostics.push(diagnostic(
          "CYCLIC_REQUIREMENT",
          `packages[${sourceIndexes[names.get(name) ?? 0]}].requires`,
          `dependency cycle: ${cycle.join(" -> ")}`,
        ));
      }
      return;
    }
    visitState.set(name, "visiting");
    const pkgIndex = names.get(name);
    if (pkgIndex !== undefined) {
      for (const requirement of packages[pkgIndex].requires) {
        if (requirement !== name && names.has(requirement)) visitRequirements(requirement, [...trail, name]);
      }
    }
    visitState.set(name, "visited");
  };
  for (const name of names.keys()) visitRequirements(name, []);

  if (options.exists) {
    for (const [position, pkg] of packages.entries()) {
      const index = sourceIndexes[position];
      if (pkg.source !== null && !options.exists(pkg.source)) {
        diagnostics.push(diagnostic(
          "SOURCE_MISSING",
          `packages[${index}].source`,
          `${pkg.name}: source "${pkg.source}" does not exist`,
        ));
      }
    }
  }

  const retiredPackages = validateRetiredPackages(value.retiredPackages, new Set(names.keys()), diagnostics);

  if (diagnostics.length > 0) {
    return { status: "invalid", catalog: null, diagnostics };
  }

  const surface = typeof value.surface === "string" ? value.surface : "";
  const source = typeof value.source === "string" ? value.source : "";
  const router = typeof value.router === "string" ? value.router : "";
  const nonPublicInternalSteps = isStringArray(value.nonPublicInternalSteps) ? value.nonPublicInternalSteps : [];

  return {
    status: "valid",
    catalog: Object.freeze({
      version: SKILL_SURFACE_CATALOG_VERSION,
      surface,
      source,
      router,
      packages,
      nonPublicInternalSteps,
      retiredPackages,
    }),
    diagnostics: [],
  };
}

export function parseSkillSurfaceCatalog(
  source: string | null,
  options: SkillSurfaceCatalogOptions = {},
): SkillSurfaceCatalogResolution {
  if (source === null) {
    if (options.declared) {
      return {
        status: "invalid",
        catalog: null,
        diagnostics: [diagnostic("MANIFEST_MISSING", "$", "skill-surface manifest is missing")],
      };
    }
    return { status: "absent", catalog: null, diagnostics: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return {
      status: "invalid",
      catalog: null,
      diagnostics: [diagnostic("INVALID_JSON", "$", `invalid JSON: ${(error as Error).message}`)],
    };
  }
  return validateSkillSurfaceCatalogValue(parsed, options);
}

// --- selectors (deterministic, over a valid catalog only) ------------------

/** Ordered facade names that a plugin selection projects. */
export function facadesForSelection(catalog: SkillSurfaceCatalog, plugins: readonly PluginId[]): readonly string[] {
  return catalog.packages.filter((pkg) => pkg.kind === "facade" && selected(pkg, plugins)).map((pkg) => pkg.name);
}

/**
 * Provider-skill host placement. Pass `plugins` for the placements that a
 * selection projects; omit it for the unconditional bundle (init.ts's
 * `repo-harness init` flow, which has no install-state concept). A selection
 * places nothing in a host-program root (`pi`) unless it selects that
 * host's plugin: the ledger records each path there under that plugin.
 */
export function hostSkillPlacements(
  catalog: SkillSurfaceCatalog,
  plugins?: readonly PluginId[],
): SkillSurfaceHostPlacements {
  const placements: Record<SkillSurfaceHost, string[]> = { claude: [], codex: [], pi: [] };
  for (const pkg of catalog.packages) {
    if (pkg.kind !== "provider-skill") continue;
    if (plugins !== undefined && !selected(pkg, plugins)) continue;
    for (const host of pkg.hosts) {
      if (plugins !== undefined && (HOST_PROGRAM_PLUGINS as readonly string[]).includes(host) && !(plugins as readonly string[]).includes(host)) continue;
      placements[host].push(pkg.name);
    }
  }
  return placements;
}

/** External marketplace skill names. Pass `plugins` for a selection; omit it for every external package. */
export function externalSkillsForSelection(
  catalog: SkillSurfaceCatalog,
  plugins?: readonly PluginId[],
): readonly string[] {
  return catalog.packages
    .filter((pkg) => pkg.kind === "external" && (plugins === undefined || selected(pkg, plugins)))
    .map((pkg) => pkg.name);
}

/** Stable transitive dependency names for one package, excluding the root. */
export function dependencyClosureNames(
  catalog: SkillSurfaceCatalog,
  rootName: string,
): readonly string[] {
  const byName = new Map(catalog.packages.map((pkg) => [pkg.name, pkg]));
  const ordered: string[] = [];
  const visited = new Set<string>();
  const visit = (name: string): void => {
    if (visited.has(name)) return;
    visited.add(name);
    const pkg = byName.get(name);
    if (pkg === undefined) return;
    for (const requirement of pkg.requires) {
      if (!ordered.includes(requirement)) ordered.push(requirement);
      visit(requirement);
    }
  };
  visit(rootName);
  return ordered;
}

/**
 * Resolve all transitive external dependencies of one catalog package and
 * group them by immutable provider/host projection. The root package itself
 * is not selected; an ordinary plugin selection therefore remains unable to
 * trigger explicit-only downloads through a facade dependency edge.
 */
export function requiredExplicitExternalDependencyInstallGroups(
  catalog: SkillSurfaceCatalog,
  rootName: string,
  hosts: readonly SkillSurfaceHost[],
): RequiredExternalDependencyInstallGroups {
  const byName = new Map(catalog.packages.map((pkg) => [pkg.name, pkg]));
  const root = byName.get(rootName);
  if (root === undefined) return { status: "missing", name: rootName };
  const ordered = dependencyClosureNames(catalog, rootName)
    .map((name) => byName.get(name))
    .filter((pkg): pkg is SkillSurfacePackage => pkg?.kind === "external");

  const groups = new Map<string, {
    provider: string;
    hosts: SkillSurfaceHost[];
    skills: string[];
    integrityBySkill: Record<string, string>;
  }>();
  for (const pkg of ordered) {
    if (pkg.provider === null) return { status: "missing", name: pkg.name };
    if (!pkg.explicitOnly) return { status: "not_explicit_only", name: pkg.name };
    if (pkg.integrity === null) return { status: "missing_integrity", name: pkg.name };
    const selectedHosts = hosts.filter((host) => pkg.hosts.includes(host));
    if (selectedHosts.length === 0) return { status: "missing", name: pkg.name };
    const key = `${pkg.provider}\u0000${selectedHosts.join("\u0000")}`;
    const group = groups.get(key) ?? {
      provider: pkg.provider,
      hosts: [...selectedHosts],
      skills: [],
      integrityBySkill: {},
    };
    if (!group.skills.includes(pkg.name)) {
      group.skills.push(pkg.name);
      group.integrityBySkill[pkg.name] = pkg.integrity;
    }
    groups.set(key, group);
  }
  if (groups.size === 0) return { status: "missing", name: rootName };
  return { status: "selected", groups: [...groups.values()] };
}

/**
 * The union installProfileHostMutationPaths() snapshots/allowlists. Explicit
 * packages are included so a failed combined CLI operation can compensate
 * their writes, even though their lifecycle stays outside selection ownership.
 */
export function mutationPathSkillNames(catalog: SkillSurfaceCatalog): {
  readonly repoHarnessSkills: readonly string[];
  readonly externalSkills: readonly string[];
} {
  const repoHarnessSkills = catalog.packages
    .filter((pkg) => pkg.kind === "router" || (pkg.kind === "facade" && !pkg.explicitOnly))
    .map((pkg) => pkg.name);
  const externalSkills = catalog.packages
    .filter((pkg) => pkg.kind === "external" || pkg.kind === "provider-skill")
    .map((pkg) => pkg.name);
  return { repoHarnessSkills, externalSkills };
}

/**
 * Selection-projected external packages plus the provider-skills. Explicit-only
 * packages stay out so a selection switch neither adopts nor retires a
 * separately authorized install.
 */
export function selectionOwnedSkillNames(catalog: SkillSurfaceCatalog): readonly string[] {
  return catalog.packages
    .filter((pkg) => (pkg.kind === "external" && !pkg.explicitOnly) || pkg.kind === "provider-skill")
    .map((pkg) => pkg.name);
}

export { sameStringSet as skillSurfaceSameNameSet };
