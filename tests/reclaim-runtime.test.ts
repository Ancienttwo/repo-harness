import { describe, expect, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runRuntimeReclaim, runRuntimeRollback } from "../src/cli/repo-adoption/reclaim-runtime";

const ROOT = join(import.meta.dir, "..");

function tempRepo(prefix: string): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(repo, ".ai/harness/scripts"), { recursive: true });
  mkdirSync(join(repo, ".ai/harness"), { recursive: true });
  return repo;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copyHelper(repo: string, helper: string): void {
  copyFileSync(
    join(ROOT, "assets/templates/helpers", helper),
    join(repo, ".ai/harness/scripts", helper),
  );
}

function writeLegacyRootHelper(repo: string, helper: string): void {
  const helperId = helper.replace(/\.[^.]+$/, "");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  writeFileSync(
    join(repo, "scripts", helper),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "",
      "if command -v repo-harness >/dev/null 2>&1; then",
      `  exec repo-harness run ${helperId} "$@"`,
      "fi",
      "",
      `echo "Missing repo-harness CLI for helper ${helperId}" >&2`,
      "exit 1",
      "",
    ].join("\n"),
  );
}

describe("runtime reclaim", () => {
  test("removes generated helper runtime and root helpers while compacting package scripts", () => {
    const repo = tempRepo("runtime-reclaim-generated-");
    try {
      copyHelper(repo, "check-task-workflow.sh");
      writeLegacyRootHelper(repo, "check-task-workflow.sh");
      copyFileSync(
        join(ROOT, "assets/templates/helpers/check-task-sync.sh"),
        join(repo, "scripts/check-task-sync.sh"),
      );
      writeJson(join(repo, "package.json"), {
        name: "demo",
        scripts: {
          "check:task-workflow": "bash .ai/harness/scripts/check-task-workflow.sh --strict",
          "app:test": "node app-test.js",
        },
      });

      const result = runRuntimeReclaim({ repo, apply: true, compact: true, verify: false });

      expect(result.status).toBe("ok");
      expect(result.runtime_reclaim.archive).toBeDefined();
      expect(existsSync(join(repo, ".ai/harness/scripts/check-task-workflow.sh"))).toBe(false);
      expect(existsSync(join(repo, "scripts/check-task-workflow.sh"))).toBe(false);
      expect(existsSync(join(repo, "scripts/check-task-sync.sh"))).toBe(false);
      expect(existsSync(join(repo, "scripts/repo-harness/check-task-workflow.sh"))).toBe(false);
      const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf-8"));
      expect(pkg.scripts["check:task-workflow"]).toBe("repo-harness run check-task-workflow --strict");
      expect(pkg.scripts["app:test"]).toBe("node app-test.js");
      expect(existsSync(join(repo, ".ai/harness/runtime-manifest.json"))).toBe(true);
      const archive = result.runtime_reclaim.archive ?? "";
      expect(existsSync(join(repo, archive, "files/.ai/harness/scripts/check-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, archive, "files/scripts/check-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, archive, "files/scripts/check-task-sync.sh"))).toBe(true);
      expect(existsSync(join(repo, archive, "files/package.json"))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("preserves managed-looking modified helpers for review", () => {
    const repo = tempRepo("runtime-reclaim-modified-");
    try {
      writeFileSync(
        join(repo, ".ai/harness/scripts/check-task-workflow.sh"),
        "#!/bin/bash\n# repo-harness managed helper with local edits\necho custom\n",
      );

      const result = runRuntimeReclaim({ repo, apply: false });
      const entry = result.runtime_reclaim.files.find((file) => file.path === ".ai/harness/scripts/check-task-workflow.sh");

      expect(entry?.classification).toBe("managed-modified");
      expect(entry?.action).toBe("requires-user-review");
      expect(result.runtime_reclaim.requires_user_review.map((file) => file.path)).toContain(
        ".ai/harness/scripts/check-task-workflow.sh",
      );
      expect(existsSync(join(repo, ".ai/harness/scripts/check-task-workflow.sh"))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("preserves app-owned root scripts without writing repo-harness fallback files", () => {
    const repo = tempRepo("runtime-reclaim-app-script-");
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(join(repo, "scripts/check-task-workflow.sh"), "#!/bin/bash\necho app-owned\n");

      runRuntimeReclaim({ repo, apply: true, verify: false });

      expect(readFileSync(join(repo, "scripts/check-task-workflow.sh"), "utf-8")).toContain("app-owned");
      expect(existsSync(join(repo, "scripts/repo-harness/check-task-workflow.sh"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("compact mode preserves app-owned root scripts without writing fallback files", () => {
    const repo = tempRepo("runtime-reclaim-compact-app-script-");
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(join(repo, "scripts/check-task-workflow.sh"), "#!/bin/bash\necho app-owned\n");

      const result = runRuntimeReclaim({ repo, apply: true, compact: true, verify: false });
      const entry = result.runtime_reclaim.files.find((file) => file.path === "scripts/check-task-workflow.sh");

      expect(entry?.classification).toBe("custom-unknown");
      expect(entry?.action).toBe("preserve");
      expect(readFileSync(join(repo, "scripts/check-task-workflow.sh"), "utf-8")).toContain("app-owned");
      expect(existsSync(join(repo, "scripts/repo-harness/check-task-workflow.sh"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("strips only managed hook commands from repo-local host adapters", () => {
    const repo = tempRepo("runtime-reclaim-hooks-json-");
    try {
      mkdirSync(join(repo, ".codex"), { recursive: true });
      writeJson(join(repo, ".codex/hooks.json"), {
        hooks: {
          PostToolUse: [
            {
              matcher: "Bash",
              hooks: [
                { type: "command", command: "repo-harness hook post-bash" },
                { type: "command", command: "bash scripts/custom-hook.sh" },
              ],
            },
          ],
        },
        keep: true,
      });

      const result = runRuntimeReclaim({ repo, apply: true, verify: false });

      expect(result.runtime_reclaim.files.find((file) => file.path === ".codex/hooks.json")?.action).toBe(
        "remove-managed-hooks-preserve-file",
      );
      const hooks = JSON.parse(readFileSync(join(repo, ".codex/hooks.json"), "utf-8"));
      expect(JSON.stringify(hooks)).not.toContain("repo-harness hook");
      expect(JSON.stringify(hooks)).toContain("custom-hook.sh");
      expect(hooks.keep).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("leaves invalid JSON unchanged and reports user review", () => {
    const repo = tempRepo("runtime-reclaim-invalid-json-");
    try {
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, ".claude/settings.json"), "{ not json\n");

      const result = runRuntimeReclaim({ repo, apply: true, verify: false });

      expect(result.runtime_reclaim.requires_user_review.map((file) => file.path)).toContain(".claude/settings.json");
      expect(readFileSync(join(repo, ".claude/settings.json"), "utf-8")).toBe("{ not json\n");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("removes helper runtime even when helper_source was repo pinned", () => {
    const repo = tempRepo("runtime-reclaim-helper-pin-");
    try {
      copyHelper(repo, "check-task-workflow.sh");
      writeJson(join(repo, ".ai/harness/policy.json"), { harness: { helper_source: "repo" } });

      const result = runRuntimeReclaim({ repo, apply: true, verify: false });
      const entry = result.runtime_reclaim.files.find((file) => file.path === ".ai/harness/scripts/check-task-workflow.sh");

      expect(entry?.classification).toBe("known-generated");
      expect(entry?.action).toBe("remove-after-helper-verify");
      expect(existsSync(join(repo, ".ai/harness/scripts/check-task-workflow.sh"))).toBe(false);
      expect(result.runtime_reclaim.policy_pins.helper_source).toBe("package");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("removes generated hook shims from .ai and .claude hook dirs", () => {
    const repo = tempRepo("runtime-reclaim-hook-shims-");
    try {
      mkdirSync(join(repo, ".ai/hooks"), { recursive: true });
      mkdirSync(join(repo, ".claude/hooks"), { recursive: true });
      copyFileSync(join(ROOT, "assets/hooks/run-hook.sh"), join(repo, ".ai/hooks/run-hook.sh"));
      copyFileSync(join(ROOT, "assets/hooks/run-hook.sh"), join(repo, ".claude/hooks/run-hook.sh"));

      runRuntimeReclaim({ repo, apply: true, verify: false });

      expect(existsSync(join(repo, ".ai/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/run-hook.sh"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("restores archived files through rollback", () => {
    const repo = tempRepo("runtime-reclaim-rollback-");
    try {
      copyHelper(repo, "check-task-workflow.sh");
      writeLegacyRootHelper(repo, "check-task-workflow.sh");
      writeJson(join(repo, "package.json"), {
        name: "demo",
        scripts: { "check:task-workflow": "bash .ai/harness/scripts/check-task-workflow.sh --strict" },
      });

      const result = runRuntimeReclaim({ repo, apply: true, compact: true, verify: false });
      expect(existsSync(join(repo, ".ai/harness/scripts/check-task-workflow.sh"))).toBe(false);
      expect(existsSync(join(repo, "scripts/check-task-workflow.sh"))).toBe(false);

      const rollback = runRuntimeRollback({ repo, archive: result.runtime_reclaim.archive ?? "" });

      expect(rollback.status).toBe("ok");
      expect(rollback.restored).toContain(".ai/harness/scripts/check-task-workflow.sh");
      expect(rollback.restored).toContain("scripts/check-task-workflow.sh");
      expect(rollback.restored).toContain("package.json");
      expect(existsSync(join(repo, ".ai/harness/scripts/check-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-task-workflow.sh"))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf-8"));
      expect(pkg.scripts["check:task-workflow"]).toBe("bash .ai/harness/scripts/check-task-workflow.sh --strict");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
