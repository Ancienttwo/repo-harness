import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  mkdirSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("select-agent-context-blocks helper integration", () => {
  test("select-agent-context-blocks should ignore external reference and local runtime dirs", () => {
    const cwd = tmpWorkspace("helper-select-context-files-ref");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "apps", "web"), { recursive: true });
      mkdirSync(join(cwd, "_ref", "external-tool"), { recursive: true });
      mkdirSync(join(cwd, "_ops", "scratch"), { recursive: true });
      mkdirSync(join(cwd, ".worktrees", "codex", "old"), { recursive: true });
      writeFileSync(join(cwd, "apps", "web", "AGENTS.md"), "# Web Contract\n");
      writeFileSync(join(cwd, "_ref", "external-tool", "AGENTS.md"), "# External Reference\n");
      writeFileSync(join(cwd, "_ops", "scratch", "CLAUDE.md"), "# Local Operations\n");
      writeFileSync(join(cwd, ".worktrees", "codex", "old", "AGENTS.md"), "# Old Worktree\n");

      const res = run("bash", ["scripts/select-agent-context-blocks.sh"], cwd);

      expect(res.status).toBe(0);
      expect(res.stdout.trim()).toBe("apps/web");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("select-agent-context-blocks fails closed with the resolver error under archcontext", () => {
    const cwd = tmpWorkspace("helper-select-context-archcontext-broken");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "legacy-dir"), { recursive: true });
      mkdirSync(join(cwd, ".archcontext", "model", "nodes"), { recursive: true });
      writeFileSync(join(cwd, ".ai", "harness", "policy.json"), JSON.stringify({ context: { capability_source: "archcontext" } }));
      // A leftover retired JSON registry must not be read under archcontext.
      mkdirSync(join(cwd, ".ai", "context"), { recursive: true });
      writeFileSync(join(cwd, ".ai", "context", "capabilities.json"), JSON.stringify({ version: 1, capabilities: [{ prefixes: ["legacy-dir"] }] }));
      writeFileSync(join(cwd, ".archcontext", "model", "nodes", "broken.yaml"), "schemaVersion: [\n");

      const res = run("bash", ["scripts/select-agent-context-blocks.sh"], cwd);

      expect(res.status).not.toBe(0);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("invalid archcontext node YAML: .archcontext/model/nodes/broken.yaml");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("select-agent-context-blocks rejects an unknown or empty capability source before any discovery", () => {
    for (const source of ["nodes", ""]) {
      const cwd = tmpWorkspace("helper-select-context-unknown-source");
      try {
        copyHelpers(cwd);
        mkdirSync(join(cwd, "apps", "web"), { recursive: true });
        writeFileSync(join(cwd, "apps", "web", "AGENTS.md"), "# Web Contract\n");
        writeFileSync(join(cwd, ".ai", "harness", "policy.json"), JSON.stringify({ context: { capability_source: source } }));

        const res = run("bash", ["scripts/select-agent-context-blocks.sh"], cwd);

        expect(res.status, source).not.toBe(0);
        expect(res.stdout).toBe("");
        expect(res.stderr).toContain(`unknown capability_source "${source}"`);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  }, 60_000);

  test("select-agent-context-blocks lists archcontext anchors from the resolver", () => {
    const cwd = tmpWorkspace("helper-select-context-archcontext");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "apps", "web"), { recursive: true });
      mkdirSync(join(cwd, ".archcontext", "model", "nodes"), { recursive: true });
      writeFileSync(join(cwd, ".ai", "harness", "policy.json"), JSON.stringify({ context: { capability_source: "archcontext" } }));
      writeFileSync(join(cwd, ".archcontext", "model", "nodes", "capability.apps-web.web.yaml"), [
        "schemaVersion: archcontext.node/v2",
        "id: capability.apps-web.web",
        "kind: capability",
        "name: Web",
        "status: active",
        "summary: Web shell",
        "responsibilities:",
        "  - Own the web shell",
        "source:",
        "  include:",
        "    - apps/web/**",
        "extensions:",
        "  contractFiles:",
        "    agents: AGENTS.md",
        "    claude: CLAUDE.md",
        "  lspProfile: typescript-lsp",
        "  verification: []",
        "",
      ].join("\n"));

      const res = run("bash", ["scripts/select-agent-context-blocks.sh"], cwd);

      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout.trim()).toBe("apps/web");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
