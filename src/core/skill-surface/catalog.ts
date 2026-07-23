// Pure skill-surface catalog module. Zero imports (mirrors the
// src/core/capabilities/registry.ts house pattern exactly): entrypoints never
// throw on data problems, parse takes an already-read string|null, and every
// result is a closed status union carrying a closed diagnostic-code union.
// This module never touches fs/process; callers own reading manifest.json and
// (optionally) proving a package's source path exists on disk.

export const SKILL_SURFACE_CATALOG_VERSION = 2 as const;

export const SKILL_SURFACE_HOSTS = ["claude", "codex"] as const;
export type SkillSurfaceHost = (typeof SKILL_SURFACE_HOSTS)[number];

export const SKILL_SURFACE_PROFILES = ["minimal", "full"] as const;
export type SkillSurfaceProfile = (typeof SKILL_SURFACE_PROFILES)[number];

export const SKILL_SURFACE_KINDS = ["router", "facade", "provider-skill", "integration", "external", "judge"] as const;
export type SkillSurfaceKind = (typeof SKILL_SURFACE_KINDS)[number];

export const SKILL_SURFACE_DISCOVERABILITIES = [
  "always",
  "profile-facade",
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
}

export interface SkillSurfacePackage {
  readonly name: string;
  readonly kind: SkillSurfaceKind;
  readonly source: string | null;
  /** Upstream package spec (e.g. "tw93/Waza") for kind:"external" packages fetched via `bunx skills add`; null otherwise. */
  readonly provider: string | null;
  readonly hosts: readonly SkillSurfaceHost[];
  readonly profiles: readonly SkillSurfaceProfile[];
  readonly discoverability: SkillSurfaceDiscoverability;
  readonly component: string;
  readonly requires: readonly string[];
  readonly mutatesRepoByDefault: boolean;
  readonly summary: string;
  readonly retirementCandidate: SkillSurfaceRetirementCandidate | null;
}

export interface SkillSurfaceHostPlacements {
  readonly claude: readonly string[];
  readonly codex: readonly string[];
}

export interface SkillSurfaceExpectedProjections {
  readonly facadesByProfile: Readonly<Record<SkillSurfaceProfile, readonly string[]>>;
  readonly externalSkillsByProfile: Readonly<Record<SkillSurfaceProfile, readonly string[]>>;
  readonly hostSkillPlacementsByProfile: Readonly<Record<SkillSurfaceProfile, SkillSurfaceHostPlacements>>;
}

export interface SkillSurfaceCatalog {
  readonly version: typeof SKILL_SURFACE_CATALOG_VERSION;
  readonly surface: string;
  readonly source: string;
  readonly router: string;
  readonly packages: readonly SkillSurfacePackage[];
  readonly expectedProjections: SkillSurfaceExpectedProjections;
  readonly nonPublicInternalSteps: readonly string[];
  readonly retiredPackages: readonly SkillSurfaceRetiredPackage[];
}

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
  | "INVALID_PROFILE"
  | "DUPLICATE_NAME"
  | "DUPLICATE_SOURCE"
  | "COMPONENT_NOT_IN_PROFILE"
  | "RETIREMENT_CANDIDATE_NOT_OBJECT"
  | "RETIREMENT_REPLACEMENT_UNKNOWN"
  | "RETIREMENT_REPLACEMENT_RETIRING"
  | "SOURCE_MISSING"
  | "EXPECTED_PROJECTIONS_REQUIRED"
  | "PROJECTION_MISMATCH"
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
  /** profile -> allowed InstallComponent names, e.g. install-profile.ts's exported PROFILE_COMPONENTS. Omit to skip the crossref check. */
  readonly profileComponents?: Readonly<Record<string, readonly string[]>>;
  /** Caller-supplied fs existence probe for package.source. Omit to skip missing-source detection (pure core never touches fs itself). */
  readonly exists?: (path: string) => boolean;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sorted = (values: readonly string[]) => [...values].sort();
  const a = sorted(left);
  const b = sorted(right);
  return a.every((value, index) => value === b[index]);
}

// --- selector core (shared by the exported selectors and the internal
// self-consistency check, so there is exactly one implementation of each
// projection rule) ---------------------------------------------------------

function computeFacadesForProfile(
  packages: readonly SkillSurfacePackage[],
  profile: SkillSurfaceProfile,
): readonly string[] {
  return packages
    .filter((pkg) => pkg.kind === "facade" && pkg.profiles.includes(profile))
    .map((pkg) => pkg.name);
}

function computeHostSkillPlacements(
  packages: readonly SkillSurfacePackage[],
  profile: SkillSurfaceProfile | undefined,
): SkillSurfaceHostPlacements {
  const claude: string[] = [];
  const codex: string[] = [];
  for (const pkg of packages) {
    if (pkg.kind !== "provider-skill") continue;
    if (profile !== undefined && !pkg.profiles.includes(profile)) continue;
    for (const host of pkg.hosts) {
      if (host === "claude") claude.push(pkg.name);
      else if (host === "codex") codex.push(pkg.name);
    }
  }
  return { claude, codex };
}

function computeExternalSkillsForProfile(
  packages: readonly SkillSurfacePackage[],
  profile: SkillSurfaceProfile | undefined,
): readonly string[] {
  return packages
    .filter((pkg) => pkg.kind === "external" && (profile === undefined || pkg.profiles.includes(profile)))
    .map((pkg) => pkg.name);
}

// --- validation --------------------------------------------------------

const REQUIRED_STRING_FIELDS = ["name", "kind", "discoverability", "component", "summary"] as const;

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

  if (!isStringArray(raw.profiles)) {
    diagnostics.push(diagnostic("FIELD_REQUIRED", `${basePath}.profiles`, `${name}: profiles must be a string array`));
  } else {
    for (const [profileIndex, profile] of raw.profiles.entries()) {
      if (!(SKILL_SURFACE_PROFILES as readonly string[]).includes(profile)) {
        diagnostics.push(diagnostic(
          "INVALID_PROFILE",
          `${basePath}.profiles[${profileIndex}]`,
          `${name}: profile must be one of ${SKILL_SURFACE_PROFILES.join(", ")}`,
        ));
      }
    }
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
    kind: (raw.kind as SkillSurfaceKind) ?? "facade",
    source: (raw.source as string | null) ?? null,
    provider: typeof raw.provider === "string" ? raw.provider : null,
    hosts: isStringArray(raw.hosts) ? (raw.hosts as SkillSurfaceHost[]) : [],
    profiles: isStringArray(raw.profiles) ? (raw.profiles as SkillSurfaceProfile[]) : [],
    discoverability: (raw.discoverability as SkillSurfaceDiscoverability) ?? "cli-reference",
    component: typeof raw.component === "string" ? raw.component : "",
    requires: isStringArray(raw.requires) ? raw.requires : [],
    mutatesRepoByDefault: raw.mutatesRepoByDefault === true,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    retirementCandidate,
  };
}

function validateExpectedProjections(
  raw: unknown,
  packages: readonly SkillSurfacePackage[],
  diagnostics: SkillSurfaceCatalogDiagnostic[],
): SkillSurfaceExpectedProjections | null {
  if (!isRecord(raw)) {
    diagnostics.push(diagnostic(
      "EXPECTED_PROJECTIONS_REQUIRED",
      "expectedProjections",
      "expectedProjections is required and must be an object",
    ));
    return null;
  }

  const facadesByProfile: Record<string, readonly string[]> = {};
  const externalSkillsByProfile: Record<string, readonly string[]> = {};
  const hostSkillPlacementsByProfile: Record<string, SkillSurfaceHostPlacements> = {};
  let shapeOk = true;

  const facadesRaw = raw.facadesByProfile;
  const externalRaw = raw.externalSkillsByProfile;
  const hostsRaw = raw.hostSkillPlacementsByProfile;
  if (!isRecord(facadesRaw) || !isRecord(externalRaw) || !isRecord(hostsRaw)) {
    diagnostics.push(diagnostic(
      "EXPECTED_PROJECTIONS_REQUIRED",
      "expectedProjections",
      "expectedProjections.facadesByProfile, .externalSkillsByProfile, and .hostSkillPlacementsByProfile are required",
    ));
    return null;
  }

  for (const profile of SKILL_SURFACE_PROFILES) {
    const facades = facadesRaw[profile];
    if (!isStringArray(facades)) {
      diagnostics.push(diagnostic(
        "EXPECTED_PROJECTIONS_REQUIRED",
        `expectedProjections.facadesByProfile.${profile}`,
        `expectedProjections.facadesByProfile.${profile} must be a string array`,
      ));
      shapeOk = false;
    } else {
      facadesByProfile[profile] = facades;
    }

    const external = externalRaw[profile];
    if (!isStringArray(external)) {
      diagnostics.push(diagnostic(
        "EXPECTED_PROJECTIONS_REQUIRED",
        `expectedProjections.externalSkillsByProfile.${profile}`,
        `expectedProjections.externalSkillsByProfile.${profile} must be a string array`,
      ));
      shapeOk = false;
    } else {
      externalSkillsByProfile[profile] = external;
    }

    const hostPlacement = hostsRaw[profile];
    if (
      !isRecord(hostPlacement) ||
      !isStringArray(hostPlacement.claude) ||
      !isStringArray(hostPlacement.codex)
    ) {
      diagnostics.push(diagnostic(
        "EXPECTED_PROJECTIONS_REQUIRED",
        `expectedProjections.hostSkillPlacementsByProfile.${profile}`,
        `expectedProjections.hostSkillPlacementsByProfile.${profile} must have claude and codex string arrays`,
      ));
      shapeOk = false;
    } else {
      hostSkillPlacementsByProfile[profile] = {
        claude: hostPlacement.claude as string[],
        codex: hostPlacement.codex as string[],
      };
    }
  }

  if (!shapeOk) return null;
  return {
    facadesByProfile: facadesByProfile as Readonly<Record<SkillSurfaceProfile, readonly string[]>>,
    externalSkillsByProfile: externalSkillsByProfile as Readonly<Record<SkillSurfaceProfile, readonly string[]>>,
    hostSkillPlacementsByProfile:
      hostSkillPlacementsByProfile as Readonly<Record<SkillSurfaceProfile, SkillSurfaceHostPlacements>>,
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
    entries.push({ name, replacement: replacement as string | null, note });
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
      diagnostics: [diagnostic("UNSUPPORTED_VERSION", "version", "version must be 2")],
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
  const names = new Map<string, number>();
  const sources = new Map<string, number>();

  for (const [index, rawPackage] of value.packages.entries()) {
    const pkg = validatePackage(rawPackage, index, diagnostics);
    if (!pkg) continue;
    packages.push(pkg);

    if (pkg.name !== "(unknown)") {
      const previous = names.get(pkg.name);
      if (previous !== undefined) {
        diagnostics.push(diagnostic(
          "DUPLICATE_NAME",
          `packages[${index}].name`,
          `duplicate package name: ${pkg.name}`,
        ));
      } else {
        names.set(pkg.name, index);
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

  if (options.profileComponents) {
    for (const [index, pkg] of packages.entries()) {
      for (const profile of pkg.profiles) {
        const allowed = options.profileComponents[profile];
        if (allowed && !allowed.includes(pkg.component)) {
          diagnostics.push(diagnostic(
            "COMPONENT_NOT_IN_PROFILE",
            `packages[${index}].component`,
            `${pkg.name}: component "${pkg.component}" is not in profile "${profile}"'s component set`,
          ));
        }
      }
    }
  }

  for (const [index, pkg] of packages.entries()) {
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

  if (options.exists) {
    for (const [index, pkg] of packages.entries()) {
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

  const expectedProjections = validateExpectedProjections(value.expectedProjections, packages, diagnostics);

  if (expectedProjections) {
    for (const profile of SKILL_SURFACE_PROFILES) {
      const declaredFacades = expectedProjections.facadesByProfile[profile];
      const computedFacades = computeFacadesForProfile(packages, profile);
      if (!arraysEqual(declaredFacades, computedFacades)) {
        diagnostics.push(diagnostic(
          "PROJECTION_MISMATCH",
          `expectedProjections.facadesByProfile.${profile}`,
          `facadesByProfile.${profile} declared [${declaredFacades.join(", ")}] but packages compute [${computedFacades.join(", ")}]`,
        ));
      }

      const declaredExternal = expectedProjections.externalSkillsByProfile[profile];
      const computedExternal = computeExternalSkillsForProfile(packages, profile);
      if (!arraysEqual(declaredExternal, computedExternal)) {
        diagnostics.push(diagnostic(
          "PROJECTION_MISMATCH",
          `expectedProjections.externalSkillsByProfile.${profile}`,
          `externalSkillsByProfile.${profile} declared [${declaredExternal.join(", ")}] but packages compute [${computedExternal.join(", ")}]`,
        ));
      }

      const declaredHosts = expectedProjections.hostSkillPlacementsByProfile[profile];
      const computedHosts = computeHostSkillPlacements(packages, profile);
      if (
        !arraysEqual(declaredHosts.claude, computedHosts.claude) ||
        !arraysEqual(declaredHosts.codex, computedHosts.codex)
      ) {
        diagnostics.push(diagnostic(
          "PROJECTION_MISMATCH",
          `expectedProjections.hostSkillPlacementsByProfile.${profile}`,
          `hostSkillPlacementsByProfile.${profile} declared claude=[${declaredHosts.claude.join(", ")}] codex=[${declaredHosts.codex.join(", ")}] but packages compute claude=[${computedHosts.claude.join(", ")}] codex=[${computedHosts.codex.join(", ")}]`,
        ));
      }
    }
  }

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
      expectedProjections: expectedProjections as SkillSurfaceExpectedProjections,
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

/** Ordered facade names selected for a profile (profile_facades()/discoverManagedSurfaces parity). */
export function facadesForProfile(catalog: SkillSurfaceCatalog, profile: SkillSurfaceProfile): readonly string[] {
  return computeFacadesForProfile(catalog.packages, profile);
}

/**
 * Cross-review provider-skill host placement. Pass `profile` to get the
 * profile-gated projection (global-runtime.ts's `profile === 'full'` gate);
 * omit it to get the unconditional bundle (init.ts's `repo-harness adopt`
 * flow, which has no installed-profile concept and always syncs the same
 * three packages when externalSkills stays enabled).
 */
export function hostSkillPlacements(
  catalog: SkillSurfaceCatalog,
  profile?: SkillSurfaceProfile,
): SkillSurfaceHostPlacements {
  return computeHostSkillPlacements(catalog.packages, profile);
}

/**
 * External marketplace skill names. Pass `profile` for the profile-gated
 * projection; omit it for the unconditional bundle (init.ts's adopt flow).
 */
export function externalSkillsForProfile(
  catalog: SkillSurfaceCatalog,
  profile?: SkillSurfaceProfile,
): readonly string[] {
  return computeExternalSkillsForProfile(catalog.packages, profile);
}

/** The union installProfileHostMutationPaths() snapshots/allowlists. */
export function mutationPathSkillNames(catalog: SkillSurfaceCatalog): {
  readonly repoHarnessSkills: readonly string[];
  readonly externalSkills: readonly string[];
} {
  const repoHarnessSkills = catalog.packages
    .filter((pkg) => pkg.kind === "router" || (pkg.kind === "facade" && pkg.profiles.length > 0))
    .map((pkg) => pkg.name);
  const externalSkills = catalog.packages
    .filter((pkg) => (
      pkg.kind === "external" ||
      (pkg.kind === "provider-skill" && pkg.component === "cross-model-acceptance")
    ))
    .map((pkg) => pkg.name);
  return { repoHarnessSkills, externalSkills };
}

/** PROFILE_OWNED_SKILLS parity: external packages plus the narrow cross-model-acceptance provider-skills. */
export function profileOwnedSkillNames(catalog: SkillSurfaceCatalog): readonly string[] {
  return catalog.packages
    .filter((pkg) => (
      pkg.kind === "external" ||
      (pkg.kind === "provider-skill" && pkg.component === "cross-model-acceptance")
    ))
    .map((pkg) => pkg.name);
}

/** probeInstalledComponents()'s planningSkillNames / planningCapabilityPaths / crossModel name lists. */
export function probeExpectations(catalog: SkillSurfaceCatalog): {
  readonly planningSkillNames: readonly string[];
  readonly planningCapabilityPaths: readonly string[];
  readonly crossModel: readonly string[];
} {
  const planningSkillNames = catalog.packages.filter((pkg) => pkg.kind === "external").map((pkg) => pkg.name);
  const planningCapabilityPaths = catalog.packages
    .filter((pkg) => pkg.kind === "facade" && pkg.component === "planning-integrations" && pkg.source !== null)
    .map((pkg) => `${pkg.source}/SKILL.md`);
  const crossModel = catalog.packages
    .filter((pkg) => pkg.kind === "provider-skill" && pkg.component === "cross-model-acceptance")
    .map((pkg) => pkg.name);
  return { planningSkillNames, planningCapabilityPaths, crossModel };
}

export { sameStringSet as skillSurfaceSameNameSet };
