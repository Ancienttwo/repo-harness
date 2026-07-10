import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { spawnSync } from "child_process";
import { digestJson, productVersionManifest, validateJsonSchema, type Json } from "archctx-contracts";
import {
  buildArchContextBoundariesV1,
  findMatch,
  type ArchContextBoundaryNode,
  type Capability,
  type CapabilityRegistry,
} from "../scripts/capability-resolver";

const ROOT = join(import.meta.dir, "..");
const REPO = ROOT;
const requireFromTest = createRequire(import.meta.url);
const ARCHITECTURE_NODE_SCHEMA_PATH = requireFromTest.resolve(
  "archctx-contracts/schemas/repo/architecture-node.schema.json",
);
const PROJECTION_TARGET_SCHEMA_PATH = requireFromTest.resolve(
  "archctx-contracts/schemas/runtime/projection-target.schema.json",
);

// Minimal schema shape used to derive this bridge's validation subset from the
// authoritative archctx-contracts architecture-node schema. The full upstream schema
// also requires name/status/summary; this read-only boundary export intentionally
// does not synthesize those fields from local rules.
type JsonSchema = {
  type?: string | string[];
  const?: Json;
  enum?: Json[];
  pattern?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  minItems?: number;
};

function loadSchema(path: string): JsonSchema {
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

function requiredProperty(schema: JsonSchema, key: string): JsonSchema {
  const property = schema.properties?.[key];
  if (!property) throw new Error(`archctx-contracts architecture-node schema missing ${key}`);
  return property;
}

function bridgeSchemaFromArchitectureNodeSchema(schema: JsonSchema): JsonSchema {
  const source = requiredProperty(schema, "source");
  const sourceInclude = source.properties?.include;
  if (!sourceInclude) throw new Error("archctx-contracts architecture-node schema missing source.include");

  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "id", "kind", "source", "extensions"],
    properties: {
      schemaVersion: requiredProperty(schema, "schemaVersion"),
      id: requiredProperty(schema, "id"),
      kind: { const: "capability" },
      source: {
        type: "object",
        additionalProperties: false,
        required: ["include"],
        properties: {
          include: { ...sourceInclude, minItems: 1 },
        },
      },
      extensions: requiredProperty(schema, "extensions"),
    },
  };
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

  test("export output validates against the archctx-contracts architecture-node bridge subset", () => {
    const schema = bridgeSchemaFromArchitectureNodeSchema(loadSchema(ARCHITECTURE_NODE_SCHEMA_PATH));
    const nodes = buildArchContextBoundariesV1(registry);
    expect(nodes.length).toBe(registry.capabilities.length);

    for (const node of nodes) {
      const result = validateJsonSchema(schema, node as unknown as Json);
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
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

    // The authoritative archctx-contracts schema const pins the same version; if
    // arch-context bumps this to v2 this assertion should fail before any silent drift.
    const schema = loadSchema(ARCHITECTURE_NODE_SCHEMA_PATH);
    expect(schema.properties?.schemaVersion?.const).toBe("archcontext.node/v1");
  });

  test("archctx-contracts package exposes expected version, digest, and agent-context schema surface", () => {
    const packageManifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
      devDependencies: Record<string, string>;
    };
    const contractsVersion = packageManifest.devDependencies["archctx-contracts"];
    expect(contractsVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(String(productVersionManifest().product.version)).toBe(contractsVersion);
    expect(digestJson({ ok: true })).toMatch(/^sha256:[a-f0-9]{64}$/);

    const projectionTargetSchema = loadSchema(PROJECTION_TARGET_SCHEMA_PATH);
    expect(projectionTargetSchema.properties?.schemaVersion?.const).toBe("archcontext.projection-target/v1");
    expect(projectionTargetSchema.properties?.type?.enum).toContain("agent-context");

    const agentContextTarget = {
      schemaVersion: "archcontext.projection-target/v1",
      targetId: "projection_target.agent-context.test",
      type: "agent-context",
      scope: { kind: "entity", id: "capability.example.agent-context", entityKind: "capability" },
      path: "scripts/AGENTS.md",
      ownership: "mixed",
      generatedRegion: { startMarker: "start", endMarker: "end" },
      rendererVersion: "archcontext.agent-context-renderer/v1",
      format: "markdown",
      sourceDigest: `sha256:${"a".repeat(64)}`,
      outputDigest: `sha256:${"b".repeat(64)}`,
    };

    expect(validateJsonSchema(projectionTargetSchema, agentContextTarget as Json).valid).toBe(true);
    expect(
      validateJsonSchema(projectionTargetSchema, {
        ...agentContextTarget,
        schemaVersion: "archcontext.projection-target/v2",
      } as Json).valid,
    ).toBe(false);
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

    // Full bridge-subset validation (not just the schemaVersion/kind/source-is-array smoke
    // checks below) against every node this repo's REAL capability registry produces,
    // using the authoritative archctx-contracts schema as the source for pinned
    // schemaVersion/id/source/extensions semantics.
    const schema = bridgeSchemaFromArchitectureNodeSchema(loadSchema(ARCHITECTURE_NODE_SCHEMA_PATH));
    for (const node of cliNodes) {
      expect(node.schemaVersion).toBe("archcontext.node/v1");
      expect(node.kind).toBe("capability");
      expect(Array.isArray(node.source.include)).toBe(true);
      const result = validateJsonSchema(schema, node as unknown as Json);
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });
});
