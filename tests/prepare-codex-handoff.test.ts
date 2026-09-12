import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, ROOT } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("prepare-codex-handoff helper integration", () => {
  test("prepare-codex-handoff should refresh repo/global handoff and resume packet", () => {
    const cwd = tmpWorkspace("helper-codex-handoff");
    const codexHome = join(cwd, ".codex");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );
      writeFileSync(join(cwd, "AGENTS.md"), "# AGENTS\n");
      writeFileSync(join(cwd, ".ai/harness/checks/latest.json"), "{}\n");
      writeFileSync(
        join(cwd, "tasks/todos.md"),
        "# Deferred Goal Ledger\n\n> **Status**: Backlog\n> **Updated**: test\n> **Scope**: Medium/long-term goals deferred from active plan execution\n\n## Deferred Goals\n\n| Goal | Why Deferred | Tradeoff | Revisit Trigger |\n|------|--------------|----------|-----------------|\n"
      );
      mkdirSync(join(cwd, "docs/researches"), { recursive: true });
      writeFileSync(join(cwd, "docs/researches/research.md"), "# Research\n");

      const res = run(
        "bash",
        ["scripts/prepare-codex-handoff.sh", "--reason", "unit-test"],
        cwd,
        { CODEX_HOME: codexHome }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/handoff/current.md"))).toBe(true);
      expect(readFileSync(join(cwd, ".ai/harness/handoff/current.md"), "utf-8")).toContain("## Exact Next Step");
      expect(readFileSync(join(cwd, ".ai/harness/handoff/resume.md"), "utf-8")).toContain("Codex Resume Packet");
      const handoffs = readdirSync(join(codexHome, "handoffs")).filter((name) => /^handoff-\d{6}\.md$/.test(name));
      expect(handoffs.length).toBe(1);
      const global = readFileSync(join(codexHome, "handoffs", handoffs[0]), "utf-8");
      expect(global).toContain("Filesystem-first fallback handoffs");
      expect(global).toContain("### Repo Handoff");
      expect(global).not.toContain("context_budget");
      expect(global).not.toContain("### Context Budget");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
