import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildArchContextBoundariesV1,
  findMatch,
  type ArchContextBoundaryNode,
  type Capability,
  type CapabilityRegistry,
} from "../scripts/capability-resolver";

const ROOT = join(import.meta.dir, "..");
const SCHEMA_PATH = join(ROOT, "tests/fixtures/archcontext/architecture-node.subset.schema.json");
const REPO = ROOT;

// Minimal, purpose-built JSON Schema subset validator for this test only. It supports
// exactly the keywords tests/fixtures/archcontext/architecture-node.subset.schema.json
// uses (type, const, enum, pattern, required, properties, items, additionalProperties,
// minItems). This is NOT a vendored copy of arch-context's own validator -- only the
// schema fixture itself is vendored (with attribution); this walker is native to this
// repo, same division of concerns as arch-context keeps between its schema files and
// its generic validateJsonSchema helper.
type JsonSchema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  pattern?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
  minItems?: number;
};

function matchesType(type: string, value: unknown): boolean {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function validateAgainstSchema(schema: JsonSchema, value: unknown, path = "$"): string[] {
  const issues: string[] = [];

  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    issues.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    return issues;
  }
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    issues.push(`${path}: expected one of ${schema.enum.map(String).join(", ")}`);
  }
  if (schema.type && !matchesType(schema.type, value)) {
    issues.push(`${path}: expected type ${schema.type}, got ${typeof value}`);
    return issues;
  }
  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    issues.push(`${path}: "${value}" does not match pattern ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push(`${path}: expected at least ${schema.minItems} item(s), got ${value.length}`);
    }
    if (schema.items) {
      value.forEach((item, index) => issues.push(...validateAgainstSchema(schema.items!, item, `${path}[${index}]`)));
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in objectValue)) issues.push(`${path}.${key}: required`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in objectValue) issues.push(...validateAgainstSchema(childSchema, objectValue[key], `${path}.${key}`));
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(objectValue)) {
        if (!(key in schema.properties)) issues.push(`${path}.${key}: additional property denied`);
      }
    }
  }
  return issues;
}

function loadSchema(): JsonSchema {
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf-8")) as JsonSchema;
}

// Same nesting shape used by tests/capability-resolver.test.ts's longest-prefix case,
// plus a file-shaped root capability, so both a nested-directory tie-break and an
// exact-file match are exercised.
const webCapability: Capability = {
  id: "apps-web",
  domain: "apps-web",
  name: "web",
  prefixes: ["apps/web"],
  contract_files: { agents: "apps/web/AGENTS.md", claude: "apps/web/CLAUDE.md" },
  architecture_module: "docs/architecture/modules/apps-web/web.md",
  workstream_dir: "tasks/workstreams/apps-web/web",
  lsp_profile: "typescript-lsp",
  verification_hints: ["bun test apps/web"],
};

const accountCapability: Capability = {
  id: "apps-web-account",
  domain: "apps-web",
  name: "account",
  prefixes: ["apps/web/src/routes/account"],
  contract_files: {
    agents: "apps/web/src/routes/account/AGENTS.md",
    claude: "apps/web/src/routes/account/CLAUDE.md",
  },
  architecture_module: "docs/architecture/modules/apps-web/account.md",
  workstream_dir: "tasks/workstreams/apps-web/account",
  lsp_profile: "typescript-lsp",
  verification_hints: ["bun test apps/web/src/routes/account"],
};

const rootCapability: Capability = {
  id: "public-surface-root-router",
  domain: "public-surface",
  name: "root-router",
  prefixes: ["AGENTS.md", "CLAUDE.md"],
  contract_files: { agents: "AGENTS.md", claude: "CLAUDE.md" },
  architecture_module: "docs/architecture/modules/public-surface/root-router.md",
  workstream_dir: "tasks/workstreams/public-surface/root-router",
  lsp_profile: "typescript-lsp",
  verification_hints: ["root check"],
};

const registry: CapabilityRegistry = {
  version: 1,
  capabilities: [webCapability, accountCapability, rootCapability],
};

function stableIdOf(capability: Capability): string {
  return `capability.${capability.domain}.${capability.name}`;
}

// Independently re-derives the longest-prefix winner from the EXPORTED nodes'
// source.include arrays only (no access to the original registry), using the same
// "longest prefix wins, same-length ambiguity fails" contract as capability-resolver's
// findMatch (.ai/harness/policy.json capability_match_rule). This is the parity
// oracle: if field mapping silently dropped or reordered prefixes, this would
// disagree with findMatch's verdict on the same input.
function matchFromBoundaries(nodes: ArchContextBoundaryNode[], inputPath: string): { id: string; prefix: string } | null {
  const matches: Array<{ id: string; prefix: string }> = [];
  for (const node of nodes) {
    for (const prefix of node.source.include) {
      if (inputPath === prefix || inputPath.startsWith(`${prefix}/`)) matches.push({ id: node.id, prefix });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((left, right) => right.prefix.length - left.prefix.length);
  const longest = matches[0].prefix.length;
  const winners = matches.filter((match) => match.prefix.length === longest);
  const winnerKeys = new Set(winners.map((match) => `${match.id}:${match.prefix}`));
  if (winnerKeys.size > 1) {
    throw new Error(`ambiguous boundary match for ${inputPath}: ${winners.map((match) => match.id).join(", ")}`);
  }
  return winners[0];
}

describe("capability-resolver archcontext-boundaries-v1 export", () => {
  test("boundary matching semantics agree with findMatch for representative paths", () => {
    const nodes = buildArchContextBoundariesV1(registry);
    const representativePaths = [
      "apps/web/src/routes/account/page.tsx", // nested longest-prefix winner
      "apps/web/other/page.tsx", // outer prefix only
      "AGENTS.md", // exact file-shaped prefix
      "README.md", // matches nothing
    ];

    for (const path of representativePaths) {
      const legacy = findMatch(registry, REPO, path);
      const boundary = matchFromBoundaries(nodes, path);

      if (!legacy.matched) {
        expect(boundary).toBeNull();
        continue;
      }

      const expectedCapability = registry.capabilities.find((capability) => capability.id === legacy.capability_id);
      expect(expectedCapability).toBeDefined();
      expect(boundary).not.toBeNull();
      expect(boundary!.id).toBe(stableIdOf(expectedCapability!));
      expect(boundary!.prefix).toBe(legacy.matched_prefix);
    }
  });

  test("export output validates against the vendored archcontext.node/v1 capability subset schema", () => {
    const schema = loadSchema();
    const nodes = buildArchContextBoundariesV1(registry);
    expect(nodes.length).toBe(registry.capabilities.length);

    for (const node of nodes) {
      const issues = validateAgainstSchema(schema, node);
      expect(issues).toEqual([]);
    }
  });

  test("export nodes are sorted by id and carry the mapped lspProfile/verification/source fields", () => {
    const nodes = buildArchContextBoundariesV1(registry);
    const ids = nodes.map((node) => node.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toEqual([
      "capability.apps-web.account",
      "capability.apps-web.web",
      "capability.public-surface.root-router",
    ]);

    const account = nodes.find((node) => node.id === "capability.apps-web.account")!;
    expect(account.source.include).toEqual(accountCapability.prefixes);
    expect(account.extensions.lspProfile).toBe(accountCapability.lsp_profile);
    expect(account.extensions.verification).toEqual(accountCapability.verification_hints);
  });

  test("schemaVersion is pinned to archcontext.node/v1 for every node", () => {
    const nodes = buildArchContextBoundariesV1(registry);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.schemaVersion).toBe("archcontext.node/v1");
      expect(node.kind).toBe("capability");
    }

    // The vendored schema fixture's own const pins the same version; if arch-context
    // ever bumps this to v2 this assertion (and the schema swap it forces) should be
    // the first thing that fails, not a silent drift.
    const schema = loadSchema();
    expect(schema.properties?.schemaVersion?.const).toBe("archcontext.node/v1");
  });

  test("CLI export command produces the same nodes as the in-process builder", () => {
    const res = spawnSync(
      "bun",
      ["scripts/capability-resolver.ts", "export", "--format", "archcontext-boundaries-v1", "--repo", "."],
      { cwd: ROOT, encoding: "utf-8" },
    );
    expect(res.status).toBe(0);
    const cliNodes = JSON.parse(res.stdout) as ArchContextBoundaryNode[];
    expect(cliNodes.length).toBeGreaterThan(0);
    const ids = cliNodes.map((node) => node.id);
    expect(ids).toEqual([...ids].sort());

    // Full schema validation (not just the schemaVersion/kind/source-is-array smoke
    // checks below) against every node this repo's REAL capability registry produces,
    // not just the synthetic 3-capability registry the other tests in this file use.
    // This is what actually proves the vendored subset schema round-trips this repo's
    // real output end-to-end -- a synthetic-registry-only check could pass while the
    // real registry's data shape (e.g. an empty prefixes array tripping the vendored
    // `source.include` minItems:1 narrowing) silently fails outside test coverage.
    const schema = loadSchema();
    for (const node of cliNodes) {
      expect(node.schemaVersion).toBe("archcontext.node/v1");
      expect(node.kind).toBe("capability");
      expect(Array.isArray(node.source.include)).toBe(true);
      const issues = validateAgainstSchema(schema, node);
      expect(issues).toEqual([]);
    }
  });
});
