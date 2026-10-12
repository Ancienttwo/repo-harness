import { describe, expect, test } from "bun:test";
import {
  archcontextIncludeAnchor,
  architectureModulePathFor,
  capabilityPathResolutionFromArchcontextOwners,
  capabilityRegistryFromArchcontextNodes,
  isCapabilityPathOutsideRepo,
  matchCapabilityPath,
  workstreamDirFor,
  normalizeCapabilityPath,
  parseCapabilityRegistry,
  resolveCapabilityPaths,
  validateCapabilityRegistryValue,
  type Capability,
  type CapabilityRegistry,
} from "../../src/core/capabilities/registry";

describe("isCapabilityPathOutsideRepo", () => {
  const repoRoot = "/repo/root";

  test("flags absolute paths outside the repo root", () => {
    expect(isCapabilityPathOutsideRepo("/home/user/.pi/agent/bridge.ts", repoRoot)).toBe(true);
    expect(isCapabilityPathOutsideRepo("C:/Users/user/config.ts", repoRoot)).toBe(true);
  });

  test("keeps repo-internal and relative paths inside jurisdiction", () => {
    expect(isCapabilityPathOutsideRepo("/repo/root/src/a.ts", repoRoot)).toBe(false);
    expect(isCapabilityPathOutsideRepo("src/a.ts", repoRoot)).toBe(false);
    expect(isCapabilityPathOutsideRepo("../escape.ts", repoRoot)).toBe(false);
  });

  test("partitions only validation-safe paths outside the repo", () => {
    expect(() => normalizeCapabilityPath("/home/user/.pi/agent/bridge.ts", repoRoot)).toThrow(/outside repo/);
    expect(normalizeCapabilityPath("/repo/root/src/a.ts", repoRoot)).toBe("src/a.ts");
    const invalid = "/home/user/.pi/agent/bri\0dge.ts";
    expect(isCapabilityPathOutsideRepo(invalid, repoRoot)).toBe(false);
    expect(() => normalizeCapabilityPath(invalid, repoRoot)).toThrow(/NUL/);
  });
});

const web: Capability = {
  id: "apps-web",
  domain: "apps-web",
  name: "web",
  prefixes: ["apps/web"],
  contract_files: {
    agents: "apps/web/AGENTS.md",
    claude: "apps/web/CLAUDE.md",
  },
  architecture_module: "docs/architecture/modules/apps-web/web.md",
  workstream_dir: "tasks/workstreams/apps-web/web",
  lsp_profile: "typescript-lsp",
  verification_hints: ["web checks"],
};

const account: Capability = {
  ...web,
  id: "apps-web-account",
  name: "account",
  prefixes: ["apps/web/src/routes/account"],
  architecture_module: "docs/architecture/modules/apps-web/account.md",
  workstream_dir: "tasks/workstreams/apps-web/account",
};

function registry(capabilities: unknown[]): unknown {
  return { version: 1, capabilities };
}

function codes(value: ReturnType<typeof validateCapabilityRegistryValue>): string[] {
  return value.diagnostics.map((item) => item.code);
}

describe("canonical capability registry", () => {
  test("distinguishes an undeclared absence from a declared missing authority", () => {
    expect(parseCapabilityRegistry(null)).toEqual({
      status: "absent",
      registry: null,
      diagnostics: [],
    });
    const declared = parseCapabilityRegistry(null, { declared: true });
    expect(declared.status).toBe("invalid");
    expect(declared.diagnostics[0]?.code).toBe("REGISTRY_MISSING");
  });

  test("rejects corrupt JSON, unsupported versions, and non-array capabilities", () => {
    expect(parseCapabilityRegistry("{broken").diagnostics[0]?.code).toBe("INVALID_JSON");
    expect(codes(validateCapabilityRegistryValue({ version: 2, capabilities: [] }))).toEqual([
      "UNSUPPORTED_VERSION",
    ]);
    expect(codes(validateCapabilityRegistryValue({ version: 1, capabilities: {} }))).toEqual([
      "CAPABILITIES_NOT_ARRAY",
    ]);
  });

  test("rejects non-object entries and empty or non-string identifiers", () => {
    expect(codes(validateCapabilityRegistryValue(registry([null])))).toEqual([
      "CAPABILITY_NOT_OBJECT",
    ]);
    const empty = validateCapabilityRegistryValue(registry([{ ...web, id: " " }]));
    expect(empty.diagnostics).toContainEqual(expect.objectContaining({
      code: "FIELD_REQUIRED",
      path: "capabilities[0].id",
    }));
    const nonString = validateCapabilityRegistryValue(registry([{ ...web, id: 42 }]));
    expect(nonString.diagnostics).toContainEqual(expect.objectContaining({
      code: "FIELD_REQUIRED",
      path: "capabilities[0].id",
    }));
  });

  test("rejects empty, non-array, and non-string prefixes", () => {
    for (const prefixes of [[], "apps/web", [42]]) {
      const result = validateCapabilityRegistryValue(registry([{ ...web, prefixes }]));
      expect(result.status).toBe("invalid");
    }
    expect(validateCapabilityRegistryValue(registry([{ ...web, prefixes: [42] }])).diagnostics)
      .toContainEqual(expect.objectContaining({ code: "PREFIX_NOT_STRING" }));
  });

  test("rejects duplicate IDs and normalized duplicate prefixes", () => {
    const result = validateCapabilityRegistryValue(registry([
      web,
      { ...account, id: web.id, prefixes: ["./apps/web/"] },
    ]));
    expect(result.status).toBe("invalid");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "DUPLICATE_ID" }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "DUPLICATE_PREFIX" }));
  });

  test("uses deterministic longest-prefix matching", () => {
    const parsed = validateCapabilityRegistryValue(registry([web, account]));
    expect(parsed.status).toBe("valid");
    if (parsed.status !== "valid") throw new Error("expected valid registry");
    const result = matchCapabilityPath(parsed.registry, "apps/web/src/routes/account/page.tsx");
    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("expected match");
    expect(result.match.capability.id).toBe("apps-web-account");
    expect(result.match.prefix).toBe("apps/web/src/routes/account");
  });

  test("fails a same-length winner tie instead of selecting by declaration order", () => {
    const unchecked = {
      version: 1,
      capabilities: [web, { ...account, prefixes: ["apps/web"], id: "other" }],
    } as CapabilityRegistry;
    const result = matchCapabilityPath(unchecked, "apps/web/page.tsx");
    expect(result.status).toBe("invalid");
    expect(result.diagnostics[0]?.code).toBe("AMBIGUOUS_MATCH");
  });

  test("returns sorted capability IDs and unmapped implementation paths", () => {
    const parsed = validateCapabilityRegistryValue(registry([web, account]));
    if (parsed.status !== "valid") throw new Error("expected valid registry");
    const result = resolveCapabilityPaths(parsed.registry, [
      "packages/api/index.ts",
      "apps/web/src/index.ts",
      "apps/web/src/routes/account/page.tsx",
      "packages/api/index.ts",
    ]);
    expect(result).toMatchObject({
      status: "valid",
      capabilityIds: ["apps-web", "apps-web-account"],
      unmappedPaths: ["packages/api/index.ts"],
    });
  });

  test("normalizes repository paths and rejects traversal or foreign absolute paths", () => {
    expect(normalizeCapabilityPath("./apps\\web/", "/repo")).toBe("apps/web");
    expect(normalizeCapabilityPath("/repo/apps/web/page.tsx", "/repo")).toBe("apps/web/page.tsx");
    expect(() => normalizeCapabilityPath("../secret", "/repo")).toThrow("traversal");
    expect(() => normalizeCapabilityPath("/other/secret", "/repo")).toThrow("outside repo");
    expect(() => normalizeCapabilityPath("C:\\other\\secret", "C:\\repo")).toThrow("outside repo");
  });
});

describe("archcontextIncludeAnchor", () => {
  test("keeps the literal leading path of every include shape", () => {
    expect(archcontextIncludeAnchor("apps/web/**")).toBe("apps/web");
    expect(archcontextIncludeAnchor("AGENTS.md")).toBe("AGENTS.md");
    expect(archcontextIncludeAnchor("src/effects/path-safety.ts")).toBe("src/effects/path-safety.ts");
    expect(archcontextIncludeAnchor("src/core/state/coordination-*.ts")).toBe("src/core/state");
    expect(archcontextIncludeAnchor("src/{core,effects}/engineers/**")).toBe("src");
    expect(archcontextIncludeAnchor("apps/web/")).toBe("apps/web");
  });

  test("has no anchor when the first segment is a glob", () => {
    for (const include of ["", "**", "/**", "**/*.ts", "*.md", "!apps/web/**", "{a,b}/**"]) {
      expect(archcontextIncludeAnchor(include), include).toBeNull();
    }
  });
});

describe("capabilityRegistryFromArchcontextNodes", () => {
  const node = (id: string, include: string[], exclude?: string[]) => ({
    schemaVersion: "archcontext.node/v2",
    id,
    kind: "capability",
    name: id.split(".").at(-1),
    status: "active",
    summary: "fixture",
    responsibilities: ["fixture responsibility"],
    source: exclude ? { include, exclude } : { include },
    extensions: {
      contractFiles: { agents: "apps/web/AGENTS.md", claude: "apps/web/CLAUDE.md" },
      lspProfile: "typescript-lsp",
      verification: ["bun test apps/web"],
    },
  });

  test("derives id, architecture module, and workstream dir from the node id", () => {
    const resolution = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/web.yaml", value: node("capability.apps-web.web", ["apps/web/**"]) },
    ]);
    if (resolution.status !== "valid") throw new Error(`expected valid registry: ${JSON.stringify(resolution.diagnostics)}`);
    expect(resolution.registry.capabilities).toEqual([
      {
        id: "apps-web-web",
        domain: "apps-web",
        name: "web",
        prefixes: ["apps/web"],
        contract_files: { agents: "apps/web/AGENTS.md", claude: "apps/web/CLAUDE.md" },
        architecture_module: architectureModulePathFor("apps-web", "web"),
        workstream_dir: workstreamDirFor("apps-web", "web"),
        lsp_profile: "typescript-lsp",
        verification_hints: ["bun test apps/web"],
      },
    ]);
    expect(architectureModulePathFor("apps-web", "web")).toBe("docs/architecture/modules/apps-web/web.md");
    expect(workstreamDirFor("apps-web", "web")).toBe("tasks/workstreams/apps-web/web");
  });

  test("sorts derived capabilities by id regardless of node order", () => {
    const nodes = [
      { path: "nodes/z.yaml", value: node("capability.public-surface.root-router", ["AGENTS.md"]) },
      { path: "nodes/a.yaml", value: node("capability.apps-web.web", ["apps/web/**"]) },
    ];
    const resolution = capabilityRegistryFromArchcontextNodes(nodes);
    if (resolution.status !== "valid") throw new Error("expected valid registry");
    expect(resolution.registry.capabilities.map((capability) => capability.id)).toEqual([
      "apps-web-web",
      "public-surface-root-router",
    ]);
  });

  test("routes derived registries through the canonical registry validation", () => {
    const collision = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/a.yaml", value: node("capability.apps-web.web", ["apps/web/**"]) },
      { path: "nodes/b.yaml", value: node("capability.apps-web.web", ["apps/web/**"]) },
    ]);
    expect(collision.status).toBe("invalid");
    expect(collision.diagnostics.map((item) => item.code).sort()).toEqual(["DUPLICATE_ID"]);

    const traversal = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/a.yaml", value: node("capability.apps-web.web", ["../outside/**"]) },
    ]);
    expect(traversal.status).toBe("invalid");
    expect(traversal.diagnostics.map((item) => item.code)).toEqual(["INVALID_PATH"]);
  });

  test("accepts glob includes and excludes, and lets capabilities share an anchor", () => {
    const resolution = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/a.yaml", value: node("capability.workflow-engine.state", ["src/core/state/**"], ["src/core/state/coordination-*.ts"]) },
      { path: "nodes/b.yaml", value: node("capability.workflow-engine.coordination", ["src/core/state/coordination-*.ts", "src/core/state/coordination-*.ts"]) },
    ]);
    if (resolution.status !== "valid") throw new Error(`expected valid registry: ${JSON.stringify(resolution.diagnostics)}`);
    expect(resolution.registry.capabilities.map((capability) => [capability.id, capability.prefixes])).toEqual([
      ["workflow-engine-coordination", ["src/core/state"]],
      ["workflow-engine-state", ["src/core/state"]],
    ]);
  });

  test("requires at least one include with a literal anchor", () => {
    const resolution = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/a.yaml", value: node("capability.apps-web.web", ["**/*.md"]) },
    ]);
    expect(resolution.status).toBe("invalid");
    expect(resolution.diagnostics.map((item) => item.code)).toEqual(["ARCHCONTEXT_INCLUDE_ANCHOR_REQUIRED"]);
  });
});

describe("capabilityPathResolutionFromArchcontextOwners", () => {
  const capability = (domain: string, name: string): Capability => ({
    id: `${domain}-${name}`,
    domain,
    name,
    prefixes: [`src/${name}`],
    contract_files: { agents: "AGENTS.md", claude: "CLAUDE.md" },
    architecture_module: architectureModulePathFor(domain, name),
    workstream_dir: workstreamDirFor(domain, name),
    lsp_profile: "typescript-lsp",
    verification_hints: [],
  });
  const registry: CapabilityRegistry = { version: 1, capabilities: [capability("engine", "state"), capability("engine", "tasks")] };
  const owner = (path: string, owningCapabilityId: string | null, flags: { matched?: boolean; ambiguous?: boolean } = {}) => ({
    path,
    matched: flags.matched ?? owningCapabilityId !== null,
    ambiguous: flags.ambiguous ?? false,
    owningCapabilityId,
  });

  test("joins ArchContext owners to registry capabilities and reports unowned paths", () => {
    const resolution = capabilityPathResolutionFromArchcontextOwners(registry, [
      owner("src/tasks/b.ts", "capability.engine.tasks"),
      owner("src/state/a.ts", "capability.engine.state"),
      owner("README.md", null),
      owner("docs/x.md", null, { matched: true }),
      owner("src/state/a.ts", "capability.engine.state"),
    ]);
    expect(resolution.status).toBe("valid");
    expect(resolution.capabilityIds).toEqual(["engine-state", "engine-tasks"]);
    expect(resolution.matches.map((match) => [match.filePath, match.capability.id, match.prefix])).toEqual([
      ["src/state/a.ts", "engine-state", "src/state"],
      ["src/tasks/b.ts", "engine-tasks", "src/tasks"],
    ]);
    expect(resolution.unmappedPaths).toEqual(["README.md", "docs/x.md"]);
  });

  test("keeps the owner of an ambiguous result whose candidates share one capability", () => {
    const resolution = capabilityPathResolutionFromArchcontextOwners(registry, [
      owner("src/state/a.ts", "capability.engine.state", { ambiguous: true }),
    ]);
    expect(resolution.status).toBe("valid");
    expect(resolution.capabilityIds).toEqual(["engine-state"]);
  });

  test("fails closed on an ambiguous owner or an owner outside the registry", () => {
    const resolution = capabilityPathResolutionFromArchcontextOwners(registry, [
      owner("src/a.ts", null, { matched: true, ambiguous: true }),
      owner("src/b.ts", "capability.engine.retired"),
    ]);
    expect(resolution.status).toBe("invalid");
    expect(resolution.diagnostics.map((item) => item.code)).toEqual(["AMBIGUOUS_MATCH", "ARCHCONTEXT_OWNER_UNKNOWN"]);
  });
});
