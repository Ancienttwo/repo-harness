import { describe, expect, test } from "bun:test";
import {
  matchCapabilityPath,
  normalizeCapabilityPath,
  parseCapabilityRegistry,
  resolveCapabilityPaths,
  validateCapabilityRegistryValue,
  type Capability,
  type CapabilityRegistry,
} from "../../src/core/capabilities/registry";

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
