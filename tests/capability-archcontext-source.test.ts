import { describe, expect, test } from "bun:test";
import { errorEnvelope } from "archctx-contracts";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { execFileSync, spawnSync } from "child_process";
import {
  capabilityRegistryFromNativeContext,
  type ArchcontextCapabilityOwners,
  type Capability,
} from "../src/core/capabilities/registry";

import { formatArchcontextCapabilityError, readArchcontextCapabilityAuthority, resolveArchcontextCapabilityPaths } from "../src/effects/capabilities/archcontext-owners";
import { ArchctxClientError, readArchitectureNativeContext } from "../src/effects/architecture/archctx-provider";
import { withReadonlyObservation } from "../src/effects/state/readonly-observation";

const ROOT = join(import.meta.dir, "..");
const NODES_DIR = ".archcontext/model/nodes";

function tmpWorkspace(prefix: string): string {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-q", "--allow-empty", "-m", "fixture"], { cwd });
  return cwd;
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

function runResolver(cwd: string, args: string[], input?: string) {
  return spawnSync("bun", [join(ROOT, "scripts/capability-resolver.ts"), ...args, "--repo", cwd], {
    cwd,
    encoding: "utf-8",
    input,
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
      "schemaVersion: archcontext.node/v2",
      "id: capability.apps-web.web",
      "kind: capability",
      "name: web",
      "status: active",
      "summary: Web application shell",
      "responsibilities:",
      "  - Own the web shell",
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
      "schemaVersion: archcontext.node/v2",
      "id: capability.apps-web.account",
      "kind: capability",
      "name: account",
      "status: active",
      "summary: Account routes",
      "responsibilities:",
      "  - Own account routes",
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
      "schemaVersion: archcontext.node/v2",
      "id: capability.public-surface.root-router",
      "kind: capability",
      "name: root-router",
      "status: active",
      "summary: Root routing contracts",
      "responsibilities:",
      "  - Own root routing contracts",
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
  writeFile(cwd, ".archcontext/manifest.yaml", readFileSync(join(ROOT, ".archcontext/manifest.yaml"), "utf-8"));
  execFileSync("git", ["add", "."], { cwd });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-q", "-m", "model"], { cwd });
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
  ["export", "--format", "archcontext-nodes-v2"],
];

// Under archcontext a match names the owner's stable node id, because ArchContext
// does not report which include matched (#676 finding 5). Registry mode keeps the prefix.
const MATCH_OWNER_IDS: Readonly<Record<string, string>> = {
  "apps/web/src/routes/account/page.tsx": "capability.apps-web.account",
  "apps/web/other/page.tsx": "capability.apps-web.web",
  "AGENTS.md": "capability.public-surface.root-router",
};

function withOwnerId(command: readonly string[], stdout: string): string {
  if (command[0] !== "match") return stdout;
  const ownerId = MATCH_OWNER_IDS[command[2]!]!;
  return stdout.replace(/^(\s*"?(?:functional_block|matched_prefix)"?: "?)[^",\n]+/gm, `$1${ownerId}`);
}

describe("capability source: archcontext file-source parity", () => {
  test("both authorities produce the same stdout for every read command, with owner ids for matches", () => {
    const registryCwd = registryWorkspace("capability-source-registry");
    const archcontextCwd = archcontextWorkspace("capability-source-archcontext");
    try {
      for (const command of PARITY_COMMANDS) {
        const fromRegistry = runResolver(registryCwd, [...command]);
        const fromArchcontext = runResolver(archcontextCwd, [...command]);
        expect(fromRegistry.status, fromRegistry.stderr).toBe(0);
        expect(fromArchcontext.status, fromArchcontext.stderr).toBe(0);
        expect(fromArchcontext.stdout, `stdout parity for: ${command.join(" ")}`)
          .toBe(withOwnerId(command, fromRegistry.stdout));
        expect(fromArchcontext.stderr).toBe(fromRegistry.stderr);
      }
    } finally {
      rmSync(registryCwd, { recursive: true, force: true });
      rmSync(archcontextCwd, { recursive: true, force: true });
    }
  }, 60_000);

  test("the standalone projected helper refuses every archcontext command", () => {
    const projectedCwd = archcontextWorkspace("capability-source-standalone-projected");
    try {
      for (const command of PARITY_COMMANDS) {
        const refused = runStandaloneResolver(projectedCwd, [...command]);
        expect(refused.status, command.join(" ")).toBe(2);
        expect(refused.stdout).toBe("");
        expect(refused.stderr).toContain('capability_source "archcontext" needs the packaged resolver; run repo-harness run capability-resolver');
      }
    } finally {
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
      for (const command of [["list", "--format", "json"], ["export", "--format", "archcontext-nodes-v2"]]) {
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

describe("capability source: ArchContext owns path ownership", () => {
  test("match honors source.exclude and glob includes through archctx resolve", () => {
    const cwd = archcontextWorkspace("capability-source-archctx-owner", [
      { file: "web.yaml", lines: replaceLine(VALID_NODE_LINES, "    - apps/web/**", [
        "    - apps/web/**",
        "  exclude:",
        "    - apps/web/legacy/**",
      ]) },
    ]);
    try {
      mkdirSync(join(cwd, "apps/web/legacy"), { recursive: true });
      const res = runResolver(cwd, ["match", "--paths-from", "-", "--format", "json"], "apps/web/page.tsx\napps/web/legacy/old.ts\napps/web\n");
      expect(res.status, res.stderr).toBe(0);
      const matches = JSON.parse(res.stdout) as Array<{ file_path: string; matched: boolean; capability_id: string }>;
      expect(matches.map((match) => [match.file_path, match.matched, match.capability_id])).toEqual([
        ["apps/web/page.tsx", true, "apps-web-web"],
        ["apps/web/legacy/old.ts", false, "root"],
        ["apps/web", true, "apps-web-web"],
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("capability source: archctx resolve envelope checks", () => {
  const owners: ArchcontextCapabilityOwners = new Map([["capability.apps-web.account", TWIN_CAPABILITIES[0] as Capability]]);
  const envelope = (results: unknown) => JSON.stringify({ schemaVersion: "archcontext.envelope/v1", ok: true, requestId: "resolve", data: { results } });
  test('review round 1: the default ownership resolver retains its 10 s timeout', () => {
    let timeoutMs = 0;
    const result = resolveArchcontextCapabilityPaths(ROOT, owners, ['apps/web/page.tsx'], {
      run: (_binary, _args, options) => {
        timeoutMs = options.timeoutMs;
        return { status: 0, signal: null, stdout: envelope([{ path: 'apps/web/page.tsx', matched: false, ambiguous: false, owningCapabilityId: null }]), stderr: '' };
      },
    });
    expect(result.status).toBe('valid');
    expect(timeoutMs).toBe(10_000);
  });
  const resolveWith = (stdout: string, status = 0) => resolveArchcontextCapabilityPaths(ROOT, owners, ["apps/web/page.tsx"], {
    run: (_binary, args) => {
      expect(args.slice(0, 2)).toEqual(["resolve", "--paths-from"]);
      return { status, signal: null, stdout, stderr: "" };
    },
  });

  test("maps a well-formed result and reports an unowned path", () => {
    const resolution = resolveWith(envelope([{ path: "apps/web/page.tsx", matched: false, ambiguous: false, owningCapabilityId: null }]));
    expect(resolution.status).toBe("valid");
    expect(resolution.unmappedPaths).toEqual(["apps/web/page.tsx"]);
  });

  test("an error envelope is a model fault, not an unavailable runtime", () => {
    const resolution = resolveWith(JSON.stringify(errorEnvelope("resolve", "AC_SCHEMA_INVALID", "boom")), 1);
    expect(resolution.status).toBe("invalid");
    expect(resolution.diagnostics).toEqual([{
      code: "ARCHCONTEXT_MODEL_REJECTED",
      path: ".archcontext/model/nodes",
      message: "archctx resolve rejected the model: AC_SCHEMA_INVALID: boom",
    }]);
  });

  test("an unknown error code fails closed instead of becoming a model result", () => {
    const invalid = errorEnvelope("resolve", "AC_SCHEMA_INVALID", "boom");
    const envelope = { ...invalid, error: { ...invalid.error, code: "AC_X" } };
    expect(() => resolveWith(JSON.stringify(envelope), 1)).toThrow("invalid error envelope");
  });

  test("throws on a result-count mismatch, a path mismatch or a bad field", () => {
    expect(() => resolveWith(envelope([]))).toThrow("result count");
    expect(() => resolveWith(envelope([{ path: "apps/web/other.tsx", matched: false, ambiguous: false, owningCapabilityId: null }]))).toThrow("invalid result");
    expect(() => resolveWith(envelope([{ path: "apps/web/page.tsx", matched: "yes", ambiguous: false, owningCapabilityId: null }]))).toThrow("invalid result");
    expect(() => resolveWith(JSON.stringify({ schemaVersion: "other", ok: true }))).toThrow("invalid envelope");
    expect(() => resolveWith(envelope([{ path: "apps/web/page.tsx", matched: false, ambiguous: true, owningCapabilityId: null, candidates: "a" }]))).toThrow("invalid result");
  });

  test("joins the recorded archctx 0.7.2 batch, exit 2 included, through the owner model", () => {
    const fixtures = join(ROOT, "tests/fixtures/archctx-resolve");
    const nodesDir = join(fixtures, "ownership-0.7.2-model/nodes");
    const cwd = archcontextWorkspace("capability-source-recorded", readdirSync(nodesDir).sort().map((name) => ({
      file: name, lines: readFileSync(join(nodesDir, name), "utf-8").trimEnd().split("\n"),
    })));
    const paths = readFileSync(join(fixtures, "ownership-0.7.2-paths.txt"), "utf-8").trim().split("\n");
    try {
      const model = readArchcontextCapabilityAuthority(cwd);
      if (model.status !== "valid") throw new Error(JSON.stringify(model.diagnostics));
      const resolution = resolveArchcontextCapabilityPaths(cwd, model.owners, paths, {
        run: () => ({ status: 2, signal: null, stdout: readFileSync(join(fixtures, "ownership-0.7.2.json"), "utf-8"), stderr: "" }),
      });
      expect(resolution.status).toBe("invalid");
      expect(resolution.diagnostics.map((item) => [item.code, item.path])).toEqual([["AMBIGUOUS_MATCH", "lib/shared.ts"]]);
      expect(resolution.capabilityIds).toEqual([
        "future-planned",
        "old-legacy",
        "owned-dir",
        "owned-literal",
        "probe-anchorless",
        "verification-tools",
        "web-locale",
      ]);
      expect(resolution.unmappedPaths).toEqual(["README.md", "literal/new-helper.ts"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a read-only observation gets an unavailable result and never starts archctx", () => {
    let started = 0;
    const io = {
      readFile: () => { throw new Error("unexpected read"); },
      readDirectory: () => { throw new Error("unexpected directory read"); },
      validatePath: () => {},
      exec: () => { throw new Error("unexpected exec"); },
    };
    const resolution = withReadonlyObservation(io, () => resolveArchcontextCapabilityPaths(ROOT, owners, ["apps/web/page.tsx"], {
      run: () => { started += 1; return { status: 0, signal: null, stdout: "", stderr: "" }; },
    }));
    expect(started).toBe(0);
    expect(resolution.status).toBe("unavailable");
    expect(resolution.diagnostics.map((item) => item.code)).toEqual(["ARCHCONTEXT_RESOLVE_UNAVAILABLE"]);
  });
});

describe("capability source: no fallback in either direction", () => {
  test("archcontext mode never reads the JSON registry", () => {
    const cwd = registryWorkspace("capability-source-no-fallback-to-registry");
    try {
      writePolicy(cwd, "archcontext");
      const res = runResolver(cwd, ["list", "--format", "json"]);
      expect(res.status).toBe(2);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("AC_MODEL_ADOPTION_REQUIRED");
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

describe("capability source: source-layer failures S1-S5", () => {
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
      expect(res.stderr).toContain("AC_MODEL_ADOPTION_REQUIRED");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("S4 rejects unexpected entries in the archcontext model directory", () => {
    const nested = archcontextWorkspace("capability-source-s4-nested");
    const foreign = archcontextWorkspace("capability-source-s4-foreign");
    try {
      writeFile(nested, `${NODES_DIR}/legacy/notes.txt`, "not a node\n");
      const nestedRes = runResolver(nested, ["validate", "--format", "text"]);
      expect(nestedRes.status).toBe(2);
      expect(nestedRes.stderr).toContain("AC_PATH_DENIED");

      writeFile(foreign, `${NODES_DIR}/notes.txt`, "not a node\n");
      const foreignRes = runResolver(foreign, ["validate", "--format", "text"]);
      expect(foreignRes.status).toBe(2);
      expect(foreignRes.stderr).toContain("AC_PATH_DENIED");
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
      expect(res.stderr).toContain("AC_SCHEMA_INVALID");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);


});

// ---------------------------------------------------------------------------
// Native authority fixtures.
// ---------------------------------------------------------------------------

const VALID_NODE_LINES = TWIN_NODES[0].lines;

function withoutLines(lines: readonly string[], drop: readonly string[]): string[] {
  return lines.filter((line) => !drop.includes(line));
}

function replaceLine(lines: readonly string[], from: string, to: readonly string[]): string[] {
  return lines.flatMap((line) => (line === from ? [...to] : [line]));
}

describe("capability source: native diagnostics", () => {
  test("shows at most five native issues and counts the omitted issues", () => {
    const error = new ArchctxClientError({
      code: "AC_SCHEMA_INVALID", message: "native-context-model-invalid", action: "repair-native-input",
      details: { issues: Array.from({ length: 7 }, (_, index) => ({ entityId: `capability.fixture.item${index}`, field: "summary", invariant: "required" })) },
    });
    const message = formatArchcontextCapabilityError(error);
    expect(message).toStartWith(error.message);
    expect(message).toContain("capability.fixture.item0 summary required");
    expect(message).toContain("capability.fixture.item4 summary required");
    expect(message.match(/capability\.fixture\.item/g)).toHaveLength(5);
    expect(message).not.toContain("capability.fixture.item5");
    expect(message).not.toContain("capability.fixture.item6");
    expect(message).toEndWith("+2 more");
  });

  test("preserves messages without native issues and does not add an omission marker for five issues", () => {
    expect(formatArchcontextCapabilityError(new Error("process failed"))).toBe("process failed");
    const error = new ArchctxClientError({ code: "AC_SCHEMA_INVALID", message: "model invalid", action: "repair-native-input" });
    expect(formatArchcontextCapabilityError(error)).toBe(error.message);
    const five = new ArchctxClientError({
      code: "AC_SCHEMA_INVALID", message: "model invalid", action: "repair-native-input",
      details: { issues: Array.from({ length: 5 }, (_, index) => ({ entityId: `capability.fixture.item${index}`, field: "summary", invariant: "required" })) },
    });
    expect(formatArchcontextCapabilityError(five)).toEndWith("capability.fixture.item4 summary required");
    expect(formatArchcontextCapabilityError(five)).not.toContain("more");
  });
});

describe("capability source: native authority", () => {
  test("an archctx-invalid node fails closed", () => {
    const cwd = archcontextWorkspace("capability-source-native-invalid", [{
      file: "invalid.yaml", lines: withoutLines(VALID_NODE_LINES, ["summary: Web application shell"]),
    }]);
    try {
      const authority = readArchcontextCapabilityAuthority(cwd);
      expect(authority.status).toBe("invalid");
      expect(authority.diagnostics.map((item) => item.code)).toEqual(["ARCHCONTEXT_MODEL_REJECTED"]);
      expect(authority.diagnostics[0].message).toContain("AC_SCHEMA_INVALID");
      expect(authority.diagnostics[0].message).toContain("capability.apps-web.web $.summary required");
      const result = runResolver(cwd, ["validate", "--format", "json"]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("AC_SCHEMA_INVALID");
      expect(result.stderr).toContain("capability.apps-web.web $.summary required");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("a drifted native identity fails closed", () => {
    const cwd = archcontextWorkspace("capability-source-native-drift");
    try {
      const context = readArchitectureNativeContext(cwd, { kind: "worktree" });
      const authority = capabilityRegistryFromNativeContext({ ...context, capabilityProfiles: context.capabilityProfiles.map((profile) => ({ ...profile, modulePath: "docs/architecture/modules/drift/wrong.md" })) }, { repoRoot: cwd });
      expect(authority.status).toBe("invalid");
      expect(authority.diagnostics.map((item) => item.code)).toEqual(TWIN_NODES.map(() => "ARCHCONTEXT_NODE_ID_INVALID"));
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("validate JSON reports a repo-harness profile rejection on stderr with exit 2", () => {
    const cwd = archcontextWorkspace("capability-source-native-incomplete", [{
      file: "incomplete.yaml", lines: withoutLines(VALID_NODE_LINES, ["  lspProfile: typescript-lsp"]),
    }]);
    try {
      const context = readArchitectureNativeContext(cwd, { kind: "worktree" });
      expect(context.capabilityProfiles[0].lspProfile).toBeNull();
      const result = runResolver(cwd, ["validate", "--format", "json"]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("capability.apps-web.web: lspProfile is required");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("a valid native model lists its capabilities", () => {
    const cwd = archcontextWorkspace("capability-source-native-valid");
    try {
      const result = runResolver(cwd, ["list", "--format", "json"]);
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(TWIN_CAPABILITIES);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});

describe("capability source: native status and ownership", () => {
  test("non-capability kinds are skipped and non-active capabilities are not listed", () => {
    const cwd = archcontextWorkspace("capability-source-skipped", [
      TWIN_NODES[0],
      {
        file: "module.yaml",
        lines: replaceLine(
          replaceLine(VALID_NODE_LINES, "kind: capability", ["kind: component"]),
          "id: capability.apps-web.web",
          ["id: component.apps-web.legacy"],
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

      // The planned node stays a valid owner; only active capabilities are listed.
      const validate = runResolver(cwd, ["validate", "--format", "text"]);
      expect(validate.status, validate.stderr).toBe(0);
      expect(validate.stdout).toBe("[CapabilityResolver] OK\n");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("planned, deprecated, anchorless and [locale] capabilities resolve through archctx", () => {
    const capabilityNode = (id: string, status: string, include: string) => replaceLine(
      replaceLine(replaceLine(VALID_NODE_LINES, "status: active", [`status: ${status}`]), "id: capability.apps-web.web", [`id: ${id}`]),
      "    - apps/web/**",
      [`    - "${include}"`],
    );
    const cwd = archcontextWorkspace("capability-source-owner-status", [
      { file: "planned.yaml", lines: capabilityNode("capability.future.planned", "planned", "planned/**") },
      { file: "legacy.yaml", lines: capabilityNode("capability.old.legacy", "deprecated", "legacy/**") },
      { file: "probe.yaml", lines: capabilityNode("capability.probe.anchorless", "active", "**/*.probe") },
      { file: "locale.yaml", lines: capabilityNode("capability.web.locale", "active", "src/app/[locale]/**") },
    ]);
    try {
      mkdirSync(join(cwd, "src/app/[locale]"), { recursive: true });
      // A non-active capability still owns its architecture module, so it is no orphan.
      writeFile(cwd, "docs/architecture/modules/future/planned.md", "# Planned\n");

      const list = runResolver(cwd, ["list", "--format", "text"]);
      expect(list.status, list.stderr).toBe(0);
      expect(list.stdout).toBe("probe-anchorless\tcapability.probe.anchorless\nweb-locale\tsrc/app/[locale]\n");
      const prefixes = runResolver(cwd, ["list", "--format", "prefixes"]);
      expect(prefixes.stdout).toBe("src/app/[locale]\n");
      const validate = runResolver(cwd, ["validate", "--format", "text"]);
      expect(validate.status, validate.stdout).toBe(0);
      expect(validate.stdout).toBe("[CapabilityResolver] OK\n");

      const res = runResolver(cwd, ["match", "--paths-from", "-", "--format", "json"],
        "planned/a.ts\nlegacy/b.ts\nprobes/x.probe\nsrc/app/[locale]/page.tsx\nREADME.md\n");
      expect(res.status, res.stderr).toBe(0);
      const matches = JSON.parse(res.stdout) as Array<{ file_path: string; matched: boolean; capability_id: string; matched_prefix: string }>;
      expect(matches.map((match) => [match.file_path, match.matched, match.capability_id, match.matched_prefix])).toEqual([
        ["planned/a.ts", true, "future-planned", "capability.future.planned"],
        ["legacy/b.ts", true, "old-legacy", "capability.old.legacy"],
        ["probes/x.probe", true, "probe-anchorless", "capability.probe.anchorless"],
        ["src/app/[locale]/page.tsx", true, "web-locale", "capability.web.locale"],
        ["README.md", false, "root", "root"],
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);

});
