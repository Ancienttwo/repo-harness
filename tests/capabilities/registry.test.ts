import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  archcontextIncludeAnchor,
  archcontextNodeId,
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
  type ArchcontextCapabilityOwners,
  type ArchcontextPathOwner,
  type Capability,
  type CapabilityRegistry,
} from "../../src/core/capabilities/registry";

// Recorded with package-local archctx 0.7.2: `archctx resolve --paths-from
// ownership-0.7.2-paths.txt --json` over the nodes in ownership-0.7.2-model/.
const RECORDED = join(import.meta.dir, "../fixtures/archctx-resolve");

function recordedOwners(): ArchcontextCapabilityOwners {
  const dir = join(RECORDED, "ownership-0.7.2-model/nodes");
  const files = readdirSync(dir).sort().map((name) => ({
    path: `.archcontext/model/nodes/${name}`,
    value: Bun.YAML.parse(readFileSync(join(dir, name), "utf-8")),
  }));
  const resolution = capabilityRegistryFromArchcontextNodes(files);
  if (resolution.status !== "valid") throw new Error(`recorded model is invalid: ${JSON.stringify(resolution.diagnostics)}`);
  return resolution.owners;
}

// The same field reduction as readOwners in src/effects/capabilities/archcontext-owners.ts.
function recordedResults(): ArchcontextPathOwner[] {
  const envelope = JSON.parse(readFileSync(join(RECORDED, "ownership-0.7.2.json"), "utf-8")) as {
    data: { results: Array<{ path: string; matched: boolean; ambiguous: boolean; owningCapabilityId: string | null; candidates?: string[] }> };
  };
  return envelope.data.results.map((result) => ({
    path: result.path,
    matched: result.matched,
    ambiguous: result.ambiguous,
    owningCapabilityId: result.owningCapabilityId,
    candidates: result.candidates ?? [],
  }));
}

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
    expect(archcontextIncludeAnchor("src/core/state/file?.ts")).toBe("src/core/state");
    expect(archcontextIncludeAnchor("apps/web/")).toBe("apps/web");
  });

  test("cuts only at * and ?, the ArchContext glob characters", () => {
    // ArchContext treats [ ] { } and ! as literal path characters.
    expect(archcontextIncludeAnchor("src/app/[locale]/**")).toBe("src/app/[locale]");
    expect(archcontextIncludeAnchor("src/{core,effects}/engineers/**")).toBe("src/{core,effects}/engineers");
    expect(archcontextIncludeAnchor("!apps/web/**")).toBe("!apps/web");
    expect(archcontextIncludeAnchor("{a,b}/**")).toBe("{a,b}");
  });

  test("has no anchor when the first segment is a glob", () => {
    for (const include of ["", "**", "/**", "**/*.ts", "*.md", "?x/**"]) {
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

    // An anchorless include is valid, so path safety cannot rely on the anchor.
    const absolute = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/a.yaml", value: node("capability.apps-web.web", ["/tmp/outside/**"]) },
    ]);
    expect(absolute.diagnostics.map((item) => [item.code, item.path])).toEqual([["INVALID_PATH", "nodes/a.yaml#source.include[0]"]]);
    const escapingExclude = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/a.yaml", value: node("capability.apps-web.web", ["apps/web/**"], ["../outside/**"]) },
    ]);
    expect(escapingExclude.diagnostics.map((item) => [item.code, item.path])).toEqual([["INVALID_PATH", "nodes/a.yaml#source.exclude[0]"]]);
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

  test("accepts an anchorless capability: it has no prefixes and keeps its node id", () => {
    const resolution = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/a.yaml", value: node("capability.probe.anchorless", ["**/*.probe"]) },
    ]);
    if (resolution.status !== "valid") throw new Error(`expected valid registry: ${JSON.stringify(resolution.diagnostics)}`);
    expect(resolution.registry.capabilities.map((capability) => [capability.id, capability.prefixes])).toEqual([
      ["probe-anchorless", []],
    ]);
    expect(archcontextNodeId(resolution.registry.capabilities[0]!)).toBe("capability.probe.anchorless");
    expect([...resolution.owners.keys()]).toEqual(["capability.probe.anchorless"]);
  });

  test("keeps every capability node as an owner but lists only active ones", () => {
    const withStatus = (id: string, status: string, include: string[]) => ({ ...node(id, include), status });
    const resolution = capabilityRegistryFromArchcontextNodes([
      { path: "nodes/a.yaml", value: withStatus("capability.future.planned", "planned", ["planned/**"]) },
      { path: "nodes/b.yaml", value: withStatus("capability.old.legacy", "deprecated", ["legacy/**"]) },
      { path: "nodes/c.yaml", value: node("capability.apps-web.web", ["apps/web/**"]) },
    ]);
    if (resolution.status !== "valid") throw new Error(`expected valid registry: ${JSON.stringify(resolution.diagnostics)}`);
    expect(resolution.registry.capabilities.map((capability) => capability.id)).toEqual(["apps-web-web"]);
    expect([...resolution.owners.keys()].sort()).toEqual([
      "capability.apps-web.web",
      "capability.future.planned",
      "capability.old.legacy",
    ]);
    expect(resolution.owners.get("capability.future.planned")?.architecture_module)
      .toBe("docs/architecture/modules/future/planned.md");
  });

  test("validates non-active capability nodes like active ones", () => {
    const planned = { ...node("capability.future.planned", ["planned/**"]), status: "planned", summary: "" };
    const resolution = capabilityRegistryFromArchcontextNodes([{ path: "nodes/a.yaml", value: planned }]);
    expect(resolution.status).toBe("invalid");
    expect(resolution.diagnostics.map((item) => item.code)).toEqual(["ARCHCONTEXT_NODE_SUMMARY_INVALID"]);
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
  const owners: ArchcontextCapabilityOwners = new Map([
    ["capability.engine.state", capability("engine", "state")],
    ["capability.engine.tasks", capability("engine", "tasks")],
  ]);
  const owner = (path: string, owningCapabilityId: string | null, flags: { matched?: boolean } = {}): ArchcontextPathOwner => ({
    path,
    matched: flags.matched ?? owningCapabilityId !== null,
    ambiguous: false,
    owningCapabilityId,
    candidates: [],
  });

  test("joins ArchContext owners to capability nodes and reports unowned paths", () => {
    const resolution = capabilityPathResolutionFromArchcontextOwners(owners, [
      owner("src/tasks/b.ts", "capability.engine.tasks"),
      owner("src/state/a.ts", "capability.engine.state"),
      owner("README.md", null),
      // A matched node without a capability ancestor has no owning capability.
      owner("docs/x.md", null, { matched: true }),
      owner("src/state/a.ts", "capability.engine.state"),
    ]);
    expect(resolution.status).toBe("valid");
    expect(resolution.capabilityIds).toEqual(["engine-state", "engine-tasks"]);
    // The match carries the owner's stable node id, not a synthetic path prefix.
    expect(resolution.matches.map((match) => [match.filePath, match.capability.id, match.prefix])).toEqual([
      ["src/state/a.ts", "engine-state", "capability.engine.state"],
      ["src/tasks/b.ts", "engine-tasks", "capability.engine.tasks"],
    ]);
    expect(resolution.unmappedPaths).toEqual(["README.md", "docs/x.md"]);
  });

  test("joins a recorded archctx 0.7.2 batch: shared owner, planned, deprecated, anchorless, [locale] and new files", () => {
    const resolution = capabilityPathResolutionFromArchcontextOwners(recordedOwners(), recordedResults());
    expect(resolution.matches.map((match) => [match.filePath, match.capability.id, match.prefix])).toEqual([
      ["legacy/b.ts", "old-legacy", "capability.old.legacy"],
      ["literal/existing.ts", "owned-literal", "capability.owned.literal"],
      ["owned/new-helper.ts", "owned-dir", "capability.owned.dir"],
      ["planned/a.ts", "future-planned", "capability.future.planned"],
      ["probes/x.probe", "probe-anchorless", "capability.probe.anchorless"],
      ["src/app/[locale]/page.tsx", "web-locale", "capability.web.locale"],
      // archctx prints matched:false for this ambiguous result, yet all candidates share one owner.
      ["src/cli/tools/run.ts", "verification-tools", "capability.verification.tools"],
    ]);
    // A new file next to a literal file include has no owner.
    expect(resolution.unmappedPaths).toEqual(["README.md", "literal/new-helper.ts"]);
    // Two capabilities tie on lib/shared.ts, so archctx names no owning capability.
    expect(resolution.status).toBe("invalid");
    expect(resolution.diagnostics).toEqual([{
      code: "AMBIGUOUS_MATCH",
      path: "lib/shared.ts",
      message: "ambiguous ArchContext owner for lib/shared.ts: capability.shared.left, capability.shared.right",
    }]);
  });

  test("an ambiguous recorded result keeps its owning capability", () => {
    const shared = recordedResults().filter((result) => result.path === "src/cli/tools/run.ts");
    expect(shared).toEqual([{
      path: "src/cli/tools/run.ts",
      matched: false,
      ambiguous: true,
      owningCapabilityId: "capability.verification.tools",
      candidates: ["component.verification.tools-all", "component.verification.tools-ts"],
    }]);
    const resolution = capabilityPathResolutionFromArchcontextOwners(recordedOwners(), shared);
    expect(resolution.status).toBe("valid");
    expect(resolution.capabilityIds).toEqual(["verification-tools"]);
    expect(resolution.unmappedPaths).toEqual([]);
  });

  test("an owner id missing from the model fails closed", () => {
    const resolution = capabilityPathResolutionFromArchcontextOwners(owners, [owner("src/b.ts", "capability.engine.retired")]);
    expect(resolution.status).toBe("invalid");
    expect(resolution.diagnostics.map((item) => [item.code, item.path])).toEqual([["ARCHCONTEXT_OWNER_UNKNOWN", "src/b.ts"]]);
  });
});
