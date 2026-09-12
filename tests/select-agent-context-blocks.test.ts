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
});
