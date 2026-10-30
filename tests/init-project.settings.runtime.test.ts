import { describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { adoptionTemplateFile } from "../src/effects/adoption/manifest-templates";

const ROOT = join(import.meta.dir, "..");

describe("init-project settings runtime", () => {
  test("create_structure should keep hook adapters user-level", () => {
    const cwd = mkdtempSync(join(tmpdir(), "init-project-settings-"));
    try {
      mkdirSync(join(cwd, ".ai/hooks"), { recursive: true });
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      mkdirSync(join(cwd, ".codex"), { recursive: true });
      const customHook = "#!/bin/bash\necho custom-owner\n";
      const claudeConfig = '{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"custom-claude-hook"}]}]},"ownerField":true}\n';
      const codexConfig = '{"hooks":{"UserPromptSubmit":[{"command":"custom-codex-hook"}]},"ownerField":true}\n';
      writeFileSync(join(cwd, ".ai/hooks/custom-owner-hook.sh"), customHook);
      writeFileSync(join(cwd, ".claude/settings.json"), claudeConfig);
      writeFileSync(join(cwd, ".codex/hooks.json"), codexConfig);

      const res = spawnSync(
        "/bin/bash",
        [
          "-lc",
          `
            export REPO_HARNESS_SOURCE_ONLY=1
            source "${join(ROOT, "scripts/init-project.sh")}" demo vite-tanstack bun >/dev/null
            create_structure
          `,
        ],
        {
          cwd,
          encoding: "utf-8",
        }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Host hook adapters are user-level:");
      expect(readFileSync(join(cwd, ".claude/settings.json"), "utf-8")).toBe(claudeConfig);
      expect(readFileSync(join(cwd, ".codex/hooks.json"), "utf-8")).toBe(codexConfig);
      expect(readFileSync(join(cwd, ".ai/hooks/custom-owner-hook.sh"), "utf-8")).toBe(customHook);
      expect(existsSync(join(cwd, ".ai/hooks/README.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/session-start-context.sh"))).toBe(false);
      expect(readFileSync(join(cwd, "tasks/lessons.md"), "utf-8")).toBe(adoptionTemplateFile(cwd, "lessonsLog").content);
      expect(existsSync(join(cwd, "plans"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/workstreams"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/current.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/prds/prd.template.md"))).toBe(true);
      const policy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.active_plan).toBeUndefined();
      expect(policy.tasks.current_status_file).toBeUndefined();
      expect(policy.tasks.workstreams_dir).toBeUndefined();
      expect(policy.tasks.lessons_file).toBe("tasks/lessons.md");
      expect(existsSync(join(cwd, "tasks/todos.md"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/notes"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/reviews"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/contracts"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("create_structure keeps canonical architecture sources trackable and caches ignored", () => {
    const cwd = mkdtempSync(join(tmpdir(), "init-project-archcontext-"));
    try {
      expect(spawnSync("git", ["init", "-q"], { cwd }).status).toBe(0);
      const res = spawnSync(
        "/bin/bash",
        [
          "-lc",
          `
            export REPO_HARNESS_SOURCE_ONLY=1
            source "${join(ROOT, "scripts/init-project.sh")}" demo vite-tanstack bun >/dev/null
            create_structure
          `,
        ],
        { cwd, encoding: "utf-8" }
      );
      expect(res.status).toBe(0);

      const sources = [".archcontext/manifest.yaml", ".archcontext/product.yaml", ".archcontext/model/nodes/example.yaml"];
      const cache = ".archcontext/cache/index.json";
      for (const path of [...sources, cache]) {
        mkdirSync(join(cwd, path, ".."), { recursive: true });
        writeFileSync(join(cwd, path), "kind: example\n");
      }
      const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ".archcontext"], { cwd, encoding: "utf-8" });
      expect(status.status).toBe(0);
      const untracked = status.stdout.split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
      expect(untracked).toEqual([...sources].sort());
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);
});
