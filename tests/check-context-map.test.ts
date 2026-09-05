import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/check-context-map.ts");

type ContextEntry = Record<string, unknown>;

function write(repo: string, relPath: string, content: string): void {
  const target = join(repo, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function contractFile(block: string): string {
  return [
    "# Fixture Contract",
    "",
    "<!-- BEGIN ARCHITECTURE CONTRACT -->",
    `- Functional block: \`${block}\``,
    "<!-- END ARCHITECTURE CONTRACT -->",
    "",
  ].join("\n");
}

function nodeYaml(options: {
  id: string;
  name: string;
  include: string[];
  agents: string;
  claude: string;
}): string {
  return [
    "schemaVersion: archcontext.node/v2",
    `id: ${options.id}`,
    "kind: capability",
    `name: ${options.name}`,
    "status: active",
    "summary: Fixture capability node.",
    "responsibilities:",
    "  - Own the fixture boundary.",
    "source:",
    "  include:",
    ...options.include.map((entry) => `    - ${JSON.stringify(entry)}`),
    "extensions:",
    "  contractFiles:",
    `    agents: ${JSON.stringify(options.agents)}`,
    `    claude: ${JSON.stringify(options.claude)}`,
    '  lspProfile: "typescript-lsp"',
    "  verification:",
    '    - "bun test tests/fixture.test.ts"',
    "",
  ].join("\n");
}

function contractEntry(overrides: ContextEntry = {}): ContextEntry {
  return {
    path: "pkg/CLAUDE.md",
    priority: "high",
    char_budget: 1000,
    purpose: "capability-contract",
    capability_id: "alpha-one",
    functional_block: "pkg",
    matched_prefix: "pkg",
    architecture_domain: "alpha",
    architecture_capability: "one",
    target_agent: "claude",
    lsp_profile: "typescript-lsp",
    doc_scope: "capability-contract",
    verification_hint: "bun test tests/fixture.test.ts",
    ...overrides,
  };
}

const GLOB_ENTRY: ContextEntry = {
  path: "docs/reference/*.md",
  priority: "low",
  char_budget: 900,
  purpose: "deep-doc",
};

function writeMap(repo: string, entries: ContextEntry[]): void {
  write(
    repo,
    ".ai/context/context-map.json",
    `${JSON.stringify(
      {
        version: 1,
        profile: "stable-root-progressive-subdir",
        root_context_files: ["CLAUDE.md", "AGENTS.md", ".ai/harness/policy.json"],
        discoverable_contexts: entries,
        budgets: { root_total_chars: 12000, per_discoverable_file_chars: 1200 },
      },
      null,
      2,
    )}\n`,
  );
}

function readMap(repo: string): { discoverable_contexts: ContextEntry[] } {
  return JSON.parse(readFileSync(join(repo, ".ai/context/context-map.json"), "utf-8"));
}

/**
 * Clean fixture: two capability nodes (one nested, one root-facing), a nested
 * contract pair on disk, a root contract pair that must never be mapped, and a
 * generated-projection contract under the declared projection target.
 */
function makeFixture(): string {
  const repo = mkdtempSync(join(tmpdir(), "check-context-map-"));
  write(
    repo,
    ".ai/harness/policy.json",
    `${JSON.stringify(
      {
        version: 1,
        context: {
          capability_source: "archcontext",
          map_file: ".ai/context/context-map.json",
        },
      },
      null,
      2,
    )}\n`,
  );
  write(repo, "README.md", "# Fixture\n");
  write(repo, "pkg/index.ts", "export const value = 1;\n");
  write(repo, "pkg/CLAUDE.md", contractFile("pkg"));
  write(repo, "pkg/AGENTS.md", contractFile("pkg"));
  write(repo, "CLAUDE.md", contractFile("README.md"));
  write(repo, "AGENTS.md", contractFile("README.md"));
  write(
    repo,
    "assets/hooks/projection.json",
    `${JSON.stringify(
      { version: 1, canonical_root: "assets/hooks", projection_target: ".ai/hooks", package_only: [], repo_only: [] },
      null,
      2,
    )}\n`,
  );
  write(repo, ".ai/hooks/CLAUDE.md", contractFile("assets/hooks"));
  write(
    repo,
    ".archcontext/model/nodes/capability.alpha.one.yaml",
    nodeYaml({
      id: "capability.alpha.one",
      name: "Alpha One",
      include: ["pkg/**"],
      agents: "pkg/AGENTS.md",
      claude: "pkg/CLAUDE.md",
    }),
  );
  write(
    repo,
    ".archcontext/model/nodes/capability.beta.two.yaml",
    nodeYaml({
      id: "capability.beta.two",
      name: "Beta Two",
      include: ["README.md"],
      agents: "AGENTS.md",
      claude: "CLAUDE.md",
    }),
  );
  writeMap(repo, [
    contractEntry(),
    contractEntry({ path: "pkg/AGENTS.md", target_agent: "codex" }),
    GLOB_ENTRY,
  ]);
  return repo;
}

function runCheck(repo: string, args: string[] = []) {
  const home = mkdtempSync(join(tmpdir(), "check-context-map-home-"));
  try {
    const result = spawnSync("bun", [SCRIPT, "--repo", repo, ...args], {
      cwd: repo,
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });
    return { ...result, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function withFixture(body: (repo: string) => void): void {
  const repo = makeFixture();
  try {
    body(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

describe("check-context-map", () => {
  test("passes on a clean map and exempts the declared generated projection", () => {
    withFixture((repo) => {
      const result = runCheck(repo);
      expect(result.output).not.toContain("unmapped_contract");
      expect(result.status).toBe(0);
    });
  }, 30_000);

  test("reports duplicate_path when two entries share a path", () => {
    withFixture((repo) => {
      writeMap(repo, [
        contractEntry(),
        contractEntry({ path: "pkg/AGENTS.md", target_agent: "codex" }),
        contractEntry(),
        GLOB_ENTRY,
      ]);
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("duplicate_path pkg/CLAUDE.md");
    });
  }, 30_000);

  test("reports missing_file when a mapped contract is gone from disk", () => {
    withFixture((repo) => {
      rmSync(join(repo, "pkg/AGENTS.md"));
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("missing_file pkg/AGENTS.md");
    });
  }, 30_000);

  test("reports root_path when an entry points at a root context file", () => {
    withFixture((repo) => {
      writeMap(repo, [
        contractEntry(),
        contractEntry({ path: "pkg/AGENTS.md", target_agent: "codex" }),
        contractEntry({
          path: "CLAUDE.md",
          capability_id: "beta-two",
          functional_block: "README.md",
          matched_prefix: "README.md",
          architecture_domain: "beta",
          architecture_capability: "two",
        }),
        GLOB_ENTRY,
      ]);
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("root_path CLAUDE.md");
    });
  }, 30_000);

  test("reports unknown_capability when the capability id has no live node", () => {
    withFixture((repo) => {
      writeMap(repo, [
        contractEntry({ capability_id: "alpha-gone" }),
        contractEntry({ path: "pkg/AGENTS.md", target_agent: "codex" }),
        GLOB_ENTRY,
      ]);
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("unknown_capability pkg/CLAUDE.md alpha-gone");
    });
  }, 30_000);

  test("reports prefix_not_owned when the node does not declare the matched prefix", () => {
    withFixture((repo) => {
      writeMap(repo, [
        contractEntry({ matched_prefix: "other", functional_block: "other" }),
        contractEntry({ path: "pkg/AGENTS.md", target_agent: "codex" }),
        GLOB_ENTRY,
      ]);
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("prefix_not_owned pkg/CLAUDE.md other");
    });
  }, 30_000);

  test("reports capability_facts_mismatch when domain or capability drifts from the node", () => {
    withFixture((repo) => {
      writeMap(repo, [
        contractEntry({ architecture_domain: "wrong" }),
        contractEntry({ path: "pkg/AGENTS.md", target_agent: "codex" }),
        GLOB_ENTRY,
      ]);
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("capability_facts_mismatch pkg/CLAUDE.md architecture_domain");
    });
  }, 30_000);

  test("reports contract_path_mismatch when the path is not the node's declared contract file", () => {
    withFixture((repo) => {
      write(repo, "pkg/nested/CLAUDE.md", contractFile("pkg"));
      writeMap(repo, [
        contractEntry({ path: "pkg/nested/CLAUDE.md" }),
        contractEntry(),
        contractEntry({ path: "pkg/AGENTS.md", target_agent: "codex" }),
        GLOB_ENTRY,
      ]);
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("contract_path_mismatch pkg/nested/CLAUDE.md");
    });
  }, 30_000);

  test("reports unmapped_contract for a disk contract that is not in the map", () => {
    withFixture((repo) => {
      write(repo, "extra/CLAUDE.md", contractFile("extra"));
      write(
        repo,
        ".archcontext/model/nodes/capability.gamma.three.yaml",
        nodeYaml({
          id: "capability.gamma.three",
          name: "Gamma Three",
          include: ["extra/**"],
          agents: "extra/AGENTS.md",
          claude: "extra/CLAUDE.md",
        }),
      );
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("unmapped_contract extra/CLAUDE.md");
    });
  }, 30_000);

  test("stops exempting the projection target when the manifest no longer declares it", () => {
    withFixture((repo) => {
      rmSync(join(repo, "assets/hooks/projection.json"));
      const result = runCheck(repo);
      expect(result.status).toBe(1);
      expect(result.output).toContain("unmapped_contract .ai/hooks/CLAUDE.md");
    });
  }, 30_000);

  test("fails closed when the map cannot be parsed", () => {
    withFixture((repo) => {
      write(repo, ".ai/context/context-map.json", "{ not json\n");
      const result = runCheck(repo);
      expect(result.status).toBe(2);
    });
  }, 30_000);

  test("fails closed when the archcontext nodes cannot be read", () => {
    withFixture((repo) => {
      rmSync(join(repo, ".archcontext"), { recursive: true, force: true });
      const result = runCheck(repo);
      expect(result.status).toBe(2);
    });
  }, 30_000);

  test("--write repairs a drifted map, preserves glob entries, and leaves the check green", () => {
    withFixture((repo) => {
      writeMap(repo, [
        contractEntry({ verification_hint: "bun test tests/kept.test.ts", priority: "medium", char_budget: 777 }),
        contractEntry({
          path: "CLAUDE.md",
          capability_id: "beta-two",
          functional_block: "README.md",
          matched_prefix: "README.md",
          architecture_domain: "beta",
          architecture_capability: "two",
        }),
        contractEntry({
          path: "AGENTS.md",
          target_agent: "codex",
          capability_id: "beta-two",
          functional_block: "README.md",
          matched_prefix: "README.md",
          architecture_domain: "beta",
          architecture_capability: "two",
        }),
        contractEntry(),
        GLOB_ENTRY,
        contractEntry({ path: "pkg/gone/CLAUDE.md" }),
      ]);
      expect(runCheck(repo).status).toBe(1);

      const written = runCheck(repo, ["--write"]);
      expect(written.status).toBe(0);
      expect(written.output).toContain("before");
      expect(written.output).toContain("after");

      const repaired = readMap(repo);
      const paths = repaired.discoverable_contexts.map((entry) => entry.path);
      expect(paths).toEqual(["pkg/CLAUDE.md", "docs/reference/*.md", "pkg/AGENTS.md"]);
      expect(repaired.discoverable_contexts[1]).toEqual(GLOB_ENTRY);

      const kept = repaired.discoverable_contexts[0] as ContextEntry;
      expect(kept.verification_hint).toBe("bun test tests/kept.test.ts");
      expect(kept.priority).toBe("medium");
      expect(kept.char_budget).toBe(777);
      expect(kept.matched_prefix).toBe("pkg");

      expect(runCheck(repo).status).toBe(0);
    });
  }, 60_000);

  test("--write fails closed when a disk contract resolves to no capability node", () => {
    withFixture((repo) => {
      write(repo, "orphan/CLAUDE.md", contractFile("orphan"));
      const result = runCheck(repo, ["--write"]);
      expect(result.status).toBe(2);
      expect(existsSync(join(repo, ".ai/context/context-map.json"))).toBe(true);
    });
  }, 30_000);
});
