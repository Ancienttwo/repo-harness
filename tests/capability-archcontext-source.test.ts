import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";
import {
  CapabilitySourceError,
  bunYamlParser,
} from "../scripts/capability-resolver";
import {
  capabilityRegistryFromArchcontextNodes,
  type CapabilityRegistryDiagnosticCode,
} from "../src/core/capabilities/registry";

const ROOT = join(import.meta.dir, "..");
const NODES_DIR = ".archcontext/model/nodes";

function tmpWorkspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

function writeFile(cwd: string, relPath: string, content: string): void {
  const target = join(cwd, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writePolicy(cwd: string, capabilitySource: string | null): void {
  const context: Record<string, unknown> = {
    map_file: ".ai/context/context-map.json",
    capability_registry_file: ".ai/context/capabilities.json",
  };
  if (capabilitySource !== null) context.capability_source = capabilitySource;
  writeFile(cwd, ".ai/harness/policy.json", `${JSON.stringify({ version: 1, context }, null, 2)}\n`);
}

function runResolver(cwd: string, args: string[]) {
  return spawnSync("bun", [join(ROOT, "scripts/capability-resolver.ts"), ...args, "--repo", cwd], {
    cwd,
    encoding: "utf-8",
  });
}

function runStandaloneResolver(cwd: string, args: string[]) {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  const target = join(cwd, "scripts/capability-resolver.ts");
  writeFileSync(target, readFileSync(join(ROOT, "assets/templates/helpers/capability-resolver.ts")));
  return spawnSync("bun", [target, ...args, "--repo", cwd], { cwd, encoding: "utf-8" });
}

function yaml(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Twin fixture: one capability set expressed in both authorities.
// The archcontext side declares include globs and extensions; the registry side
// spells out exactly what the mapper must derive from them (id, architecture
// module, workstream dir) plus the fields that stay declared (contract files).
// ---------------------------------------------------------------------------

const TWIN_CAPABILITIES = [
  {
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
  },
  {
    id: "apps-web-web",
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
    verification_hints: ["bun test apps/web"],
  },
  {
    id: "public-surface-root-router",
    domain: "public-surface",
    name: "root-router",
    prefixes: ["AGENTS.md", "CLAUDE.md"],
    contract_files: {
      agents: "AGENTS.md",
      claude: "CLAUDE.md",
    },
    architecture_module: "docs/architecture/modules/public-surface/root-router.md",
    workstream_dir: "tasks/workstreams/public-surface/root-router",
    lsp_profile: "typescript-lsp",
    verification_hints: [],
  },
];

const TWIN_NODES: ReadonlyArray<{ readonly file: string; readonly lines: readonly string[] }> = [
  {
    file: "capability.apps-web.web.yaml",
    lines: [
      "schemaVersion: archcontext.node/v1",
      "id: capability.apps-web.web",
      "kind: capability",
      "name: web",
      "status: active",
      "summary: Web application shell",
      "source:",
      "  include:",
      "    - apps/web/**",
      "extensions:",
      "  contractFiles:",
      "    agents: apps/web/AGENTS.md",
      "    claude: apps/web/CLAUDE.md",
      "  lspProfile: typescript-lsp",
      "  verification:",
      "    - bun test apps/web",
    ],
  },
  {
    file: "capability.apps-web.account.yaml",
    lines: [
      "schemaVersion: archcontext.node/v1",
      "id: capability.apps-web.account",
      "kind: capability",
      "name: account",
      "status: active",
      "summary: Account routes",
      "source:",
      "  include:",
      "    - apps/web/src/routes/account/**",
      "extensions:",
      "  contractFiles:",
      "    agents: apps/web/src/routes/account/AGENTS.md",
      "    claude: apps/web/src/routes/account/CLAUDE.md",
      "  lspProfile: typescript-lsp",
      "  verification:",
      "    - bun test apps/web/src/routes/account",
    ],
  },
  {
    file: "capability.public-surface.root-router.yaml",
    lines: [
      "schemaVersion: archcontext.node/v1",
      "id: capability.public-surface.root-router",
      "kind: capability",
      "name: root-router",
      "status: active",
      "summary: Root routing contracts",
      "source:",
      "  include:",
      "    - AGENTS.md",
      "    - CLAUDE.md",
      "extensions:",
      "  contractFiles:",
      "    agents: AGENTS.md",
      "    claude: CLAUDE.md",
      "  lspProfile: typescript-lsp",
      "  verification: []",
    ],
  },
];

function seedTree(cwd: string): void {
  mkdirSync(join(cwd, "apps/web/src/routes/account"), { recursive: true });
  writeFile(cwd, "AGENTS.md", "# root agents\n");
  writeFile(cwd, "CLAUDE.md", "# root claude\n");
}

function registryWorkspace(prefix: string): string {
  const cwd = tmpWorkspace(prefix);
  seedTree(cwd);
  writePolicy(cwd, "registry");
  writeFile(
    cwd,
    ".ai/context/capabilities.json",
    `${JSON.stringify({ version: 1, capabilities: TWIN_CAPABILITIES }, null, 2)}\n`,
  );
  return cwd;
}

function archcontextWorkspace(
  prefix: string,
  nodes: ReadonlyArray<{ readonly file: string; readonly lines: readonly string[] }> = TWIN_NODES,
): string {
  const cwd = tmpWorkspace(prefix);
  seedTree(cwd);
  writePolicy(cwd, "archcontext");
  for (const node of nodes) writeFile(cwd, `${NODES_DIR}/${node.file}`, yaml(node.lines));
  return cwd;
}

const PARITY_COMMANDS: ReadonlyArray<readonly string[]> = [
  ["list", "--format", "text"],
  ["list", "--format", "json"],
  ["list", "--format", "prefixes"],
  ["match", "--path", "apps/web/src/routes/account/page.tsx", "--format", "json"],
  ["match", "--path", "apps/web/other/page.tsx", "--format", "text"],
  ["match", "--path", "AGENTS.md", "--format", "json"],
  ["validate", "--format", "text"],
  ["validate", "--format", "json"],
  ["export", "--format", "archcontext-boundaries-v1"],
];

describe("capability source: archcontext file-source parity", () => {
  test("both authorities produce byte-identical stdout for every read command", () => {
    const registryCwd = registryWorkspace("capability-source-registry");
    const archcontextCwd = archcontextWorkspace("capability-source-archcontext");
    try {
      for (const command of PARITY_COMMANDS) {
        const fromRegistry = runResolver(registryCwd, [...command]);
        const fromArchcontext = runResolver(archcontextCwd, [...command]);
        expect(fromRegistry.status, fromRegistry.stderr).toBe(0);
        expect(fromArchcontext.status, fromArchcontext.stderr).toBe(0);
        expect(fromArchcontext.stdout, `stdout parity for: ${command.join(" ")}`)
          .toBe(fromRegistry.stdout);
        expect(fromArchcontext.stderr).toBe(fromRegistry.stderr);
      }
    } finally {
      rmSync(registryCwd, { recursive: true, force: true });
      rmSync(archcontextCwd, { recursive: true, force: true });
    }
  }, 60_000);

  test("the standalone projected helper reads archcontext nodes identically", () => {
    const sourceCwd = archcontextWorkspace("capability-source-standalone-source");
    const projectedCwd = archcontextWorkspace("capability-source-standalone-projected");
    try {
      for (const command of PARITY_COMMANDS) {
        const fromSource = runResolver(sourceCwd, [...command]);
        const fromProjection = runStandaloneResolver(projectedCwd, [...command]);
        expect(fromSource.status, fromSource.stderr).toBe(0);
        expect(fromProjection.status, fromProjection.stderr).toBe(0);
        expect(fromProjection.stdout, `projection parity for: ${command.join(" ")}`)
          .toBe(fromSource.stdout);
        expect(fromProjection.stderr).toBe(fromSource.stderr);
      }
    } finally {
      rmSync(sourceCwd, { recursive: true, force: true });
      rmSync(projectedCwd, { recursive: true, force: true });
    }
  }, 60_000);

  test("node file order does not change resolver output", () => {
    const ordered = archcontextWorkspace("capability-source-ordered");
    const shuffled = archcontextWorkspace(
      "capability-source-shuffled",
      TWIN_NODES.map((node, index) => ({ ...node, file: `${9 - index}-node.yml` })),
    );
    try {
      for (const command of [["list", "--format", "json"], ["export", "--format", "archcontext-boundaries-v1"]]) {
        const fromOrdered = runResolver(ordered, command);
        const fromShuffled = runResolver(shuffled, command);
        expect(fromOrdered.status, fromOrdered.stderr).toBe(0);
        expect(fromShuffled.status, fromShuffled.stderr).toBe(0);
        expect(fromShuffled.stdout).toBe(fromOrdered.stdout);
      }
    } finally {
      rmSync(ordered, { recursive: true, force: true });
      rmSync(shuffled, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("capability source: no fallback in either direction", () => {
  test("archcontext mode never reads the JSON registry", () => {
    const cwd = registryWorkspace("capability-source-no-fallback-to-registry");
    try {
      writePolicy(cwd, "archcontext");
      const res = runResolver(cwd, ["list", "--format", "json"]);
      expect(res.status).toBe(2);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain(`missing archcontext model directory: ${NODES_DIR}`);
      expect(res.stderr).not.toContain("apps-web-account");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("registry mode never reads archcontext nodes", () => {
    const cwd = archcontextWorkspace("capability-source-no-fallback-to-archcontext");
    try {
      writePolicy(cwd, "registry");
      const res = runResolver(cwd, ["list", "--format", "json"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("missing capability registry: .ai/context/capabilities.json");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("capability source: source-layer failures S1-S6", () => {
  test("S1 rejects an unknown capability_source value", () => {
    const cwd = archcontextWorkspace("capability-source-s1");
    try {
      writePolicy(cwd, "nodes");
      const res = runResolver(cwd, ["validate", "--format", "text"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('unknown capability source: "nodes"');
      expect(res.stderr).toContain(".ai/harness/policy.json#context.capability_source");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("S2 rejects a malformed harness policy", () => {
    const cwd = archcontextWorkspace("capability-source-s2");
    try {
      writeFile(cwd, ".ai/harness/policy.json", '{"context":{\n');
      const res = runResolver(cwd, ["validate", "--format", "text"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("malformed harness policy: .ai/harness/policy.json");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("S3 rejects a missing archcontext model directory", () => {
    const cwd = tmpWorkspace("capability-source-s3");
    try {
      seedTree(cwd);
      writePolicy(cwd, "archcontext");
      const res = runResolver(cwd, ["validate", "--format", "text"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain(`missing archcontext model directory: ${NODES_DIR}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("S4 rejects unexpected entries in the archcontext model directory", () => {
    const nested = archcontextWorkspace("capability-source-s4-nested");
    const foreign = archcontextWorkspace("capability-source-s4-foreign");
    try {
      mkdirSync(join(nested, NODES_DIR, "legacy"), { recursive: true });
      const nestedRes = runResolver(nested, ["validate", "--format", "text"]);
      expect(nestedRes.status).toBe(2);
      expect(nestedRes.stderr).toContain(`unexpected entry in archcontext model directory: ${NODES_DIR}/legacy`);

      writeFile(foreign, `${NODES_DIR}/notes.txt`, "not a node\n");
      const foreignRes = runResolver(foreign, ["validate", "--format", "text"]);
      expect(foreignRes.status).toBe(2);
      expect(foreignRes.stderr).toContain(`unexpected entry in archcontext model directory: ${NODES_DIR}/notes.txt`);
    } finally {
      rmSync(nested, { recursive: true, force: true });
      rmSync(foreign, { recursive: true, force: true });
    }
  }, 30_000);

  test("S5 rejects unparseable node YAML", () => {
    const cwd = archcontextWorkspace("capability-source-s5");
    try {
      writeFile(cwd, `${NODES_DIR}/broken.yaml`, "id: [unterminated\n");
      const res = runResolver(cwd, ["validate", "--format", "text"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain(`invalid archcontext node YAML: ${NODES_DIR}/broken.yaml`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("S6 fails closed with upgrade guidance when Bun.YAML is unavailable", () => {
    for (const host of [{}, { Bun: {} }, { Bun: { YAML: {} } }, { Bun: { YAML: { parse: "nope" } } }]) {
      expect(() => bunYamlParser(host)).toThrow(/Bun\.YAML is unavailable/);
      try {
        bunYamlParser(host);
        throw new Error("expected bunYamlParser to fail closed");
      } catch (error) {
        expect(error).toBeInstanceOf(CapabilitySourceError);
        expect((error as CapabilitySourceError).exitCode).toBe(2);
        expect((error as Error).message).toContain("Bun >= 1.3");
      }
    }

    const parse = bunYamlParser(globalThis);
    expect(typeof parse).toBe("function");
    expect(parse("id: capability.a.b\n")).toEqual({ id: "capability.a.b" });
  });
});

// ---------------------------------------------------------------------------
// Node-layer matrix N1-N13.
// ---------------------------------------------------------------------------

const VALID_NODE_LINES = TWIN_NODES[0].lines;

function withoutLines(lines: readonly string[], drop: readonly string[]): string[] {
  return lines.filter((line) => !drop.includes(line));
}

function replaceLine(lines: readonly string[], from: string, to: readonly string[]): string[] {
  return lines.flatMap((line) => (line === from ? [...to] : [line]));
}

const NODE_CASES: ReadonlyArray<{
  readonly label: string;
  readonly code: CapabilityRegistryDiagnosticCode;
  readonly lines: readonly string[];
  readonly fragment: string;
}> = [
  {
    label: "N1 node is not a mapping",
    code: "ARCHCONTEXT_NODE_NOT_OBJECT",
    lines: ["- capability.apps-web.web"],
    fragment: "archcontext node must be a YAML mapping",
  },
  {
    label: "N2 unsupported schemaVersion",
    code: "ARCHCONTEXT_SCHEMA_VERSION_UNSUPPORTED",
    lines: replaceLine(VALID_NODE_LINES, "schemaVersion: archcontext.node/v1", ["schemaVersion: archcontext.node/v2"]),
    fragment: "schemaVersion must be archcontext.node/v1",
  },
  {
    label: "N3 id is not capability.<domain>.<name>",
    code: "ARCHCONTEXT_NODE_ID_INVALID",
    lines: replaceLine(VALID_NODE_LINES, "id: capability.apps-web.web", ["id: repo::capability.apps-web.web"]),
    fragment: "id must be capability.<domain>.<name> without a namespace prefix",
  },
  {
    label: "N4 kind is missing",
    code: "ARCHCONTEXT_NODE_KIND_INVALID",
    lines: withoutLines(VALID_NODE_LINES, ["kind: capability"]),
    fragment: "kind is required",
  },
  {
    label: "N5 status is missing",
    code: "ARCHCONTEXT_NODE_STATUS_INVALID",
    lines: withoutLines(VALID_NODE_LINES, ["status: active"]),
    fragment: "status is required",
  },
  {
    label: "N6 source.include is empty",
    code: "ARCHCONTEXT_INCLUDE_REQUIRED",
    lines: replaceLine(VALID_NODE_LINES, "  include:", ["  include: []"]).filter(
      (line) => line !== "    - apps/web/**",
    ),
    fragment: "source.include must contain at least one entry",
  },
  {
    label: "N7 source.exclude is not supported",
    code: "ARCHCONTEXT_EXCLUDE_UNSUPPORTED",
    lines: replaceLine(VALID_NODE_LINES, "    - apps/web/**", [
      "    - apps/web/**",
      "  exclude:",
      "    - apps/web/legacy/**",
    ]),
    fragment: "source.exclude is not supported",
  },
  {
    label: "N8 unsupported include glob shape",
    code: "ARCHCONTEXT_INCLUDE_SHAPE_UNSUPPORTED",
    lines: replaceLine(VALID_NODE_LINES, "    - apps/web/**", ["    - apps/**/*.ts"]),
    fragment: "unsupported source.include shape apps/**/*.ts",
  },
  {
    label: "N9 wildcard-free include that is an existing directory",
    code: "ARCHCONTEXT_INCLUDE_SHAPE_AMBIGUOUS",
    lines: replaceLine(VALID_NODE_LINES, "    - apps/web/**", ["    - apps/web"]),
    fragment: "write apps/web/** for a directory boundary",
  },
  {
    label: "N10 extensions is missing",
    code: "ARCHCONTEXT_EXTENSIONS_REQUIRED",
    lines: [
      ...VALID_NODE_LINES.slice(0, VALID_NODE_LINES.indexOf("extensions:")),
    ],
    fragment: "extensions is required",
  },
  {
    label: "N11 extensions.lspProfile is missing",
    code: "ARCHCONTEXT_LSP_PROFILE_REQUIRED",
    lines: withoutLines(VALID_NODE_LINES, ["  lspProfile: typescript-lsp"]),
    fragment: "extensions.lspProfile is required",
  },
  {
    label: "N12 extensions.verification is not an array of strings",
    code: "ARCHCONTEXT_VERIFICATION_REQUIRED",
    lines: replaceLine(VALID_NODE_LINES, "  verification:", ["  verification: bun test apps/web"]).filter(
      (line) => line !== "    - bun test apps/web",
    ),
    fragment: "extensions.verification must be an array of strings",
  },
  {
    label: "N13 extensions.contractFiles is missing",
    code: "ARCHCONTEXT_CONTRACT_FILES_REQUIRED",
    lines: withoutLines(VALID_NODE_LINES, [
      "  contractFiles:",
      "    agents: apps/web/AGENTS.md",
      "    claude: apps/web/CLAUDE.md",
    ]),
    fragment: "extensions.contractFiles.agents and extensions.contractFiles.claude are required",
  },
];

describe("capability source: node-layer matrix N1-N13", () => {
  for (const nodeCase of NODE_CASES) {
    test(`${nodeCase.label} fails closed`, () => {
      const parsed = Bun.YAML.parse(yaml(nodeCase.lines));
      const resolution = capabilityRegistryFromArchcontextNodes(
        [{ path: `${NODES_DIR}/case.yaml`, value: parsed }],
        { isExistingDirectory: (path) => path === "apps/web" },
      );
      expect(resolution.status).toBe("invalid");
      expect(resolution.diagnostics.map((item) => item.code)).toEqual([nodeCase.code]);
      expect(resolution.diagnostics[0].message).toContain(nodeCase.fragment);

      const cwd = archcontextWorkspace("capability-source-node-case", [
        { file: "case.yaml", lines: nodeCase.lines },
      ]);
      try {
        const res = runResolver(cwd, ["validate", "--format", "text"]);
        expect(res.status).toBe(1);
        expect(res.stdout).toBe("");
        expect(res.stderr).toContain(`malformed capability registry: ${NODES_DIR}`);
        expect(res.stderr).toContain(nodeCase.fragment);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }, 30_000);
  }

  test("non-capability kinds and non-active statuses are skipped without claiming prefixes", () => {
    const cwd = archcontextWorkspace("capability-source-skipped", [
      TWIN_NODES[0],
      {
        file: "module.yaml",
        lines: replaceLine(
          replaceLine(VALID_NODE_LINES, "kind: capability", ["kind: module"]),
          "id: capability.apps-web.web",
          ["id: module.apps-web.legacy"],
        ),
      },
      {
        file: "planned.yaml",
        lines: replaceLine(
          replaceLine(VALID_NODE_LINES, "status: active", ["status: planned"]),
          "id: capability.apps-web.web",
          ["id: capability.apps-web.planned"],
        ),
      },
    ]);
    try {
      const list = runResolver(cwd, ["list", "--format", "text"]);
      expect(list.status, list.stderr).toBe(0);
      expect(list.stdout).toBe("apps-web-web\tapps/web\n");

      // The skipped nodes carry the same include, so a duplicate prefix would be
      // reported if either had been mapped.
      const validate = runResolver(cwd, ["validate", "--format", "text"]);
      expect(validate.status, validate.stderr).toBe(0);
      expect(validate.stdout).toBe("[CapabilityResolver] OK\n");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

});
