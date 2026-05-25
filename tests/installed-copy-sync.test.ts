import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

describe("Codex installed copy sync", () => {
  test("keeps command facades only in the canonical agentic-dev copy", () => {
    const tmp = join(tmpdir(), `agentic-dev-installed-sync-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const legacyAliasTarget = join(tmp, "legacy-project-initializer-target");

    try {
      mkdirSync(join(source, "assets", "skill-commands", "agentic-dev-plan"), { recursive: true });
      mkdirSync(join(source, "evals"), { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(legacyAliasTarget, { recursive: true });
      symlinkSync(legacyAliasTarget, join(codexSkills, "project-initializer"), "dir");

      writeFileSync(join(source, "SKILL.md"), "---\nname: agentic-dev\n---\n");
      writeFileSync(join(source, "assets", "skill-commands", "agentic-dev-plan", "SKILL.md"), "---\nname: agentic-dev-plan\n---\n");
      writeFileSync(join(source, "assets", "skill-version.json"), "{\"version\":\"test\"}\n");
      writeFileSync(join(source, "evals", "benchmark.md"), "local benchmark output\n");
      mkdirSync(join(source, ".ai", "harness", "checks"), { recursive: true });
      mkdirSync(join(source, ".claude"), { recursive: true });
      mkdirSync(join(source, ".codex"), { recursive: true });
      writeFileSync(join(source, ".ai", "harness", "checks", "latest.json"), "{}\n");
      writeFileSync(join(source, ".claude", ".trace.jsonl"), "{\"local\":true}\n");
      writeFileSync(join(source, ".codex", "hooks.json"), "{}\n");

      const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENTIC_DEV_SOURCE_ROOT: source,
          CODEX_SKILLS_ROOT: codexSkills,
        },
      });

      expect(result.status).toBe(0);
      expect(existsSync(join(codexSkills, "agentic-dev", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexSkills, "agentic-dev", "assets", "skill-commands", "agentic-dev-plan", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexSkills, "agentic-dev", "evals", "benchmark.md"))).toBe(false);
      expect(existsSync(join(codexSkills, "agentic-dev", ".ai", "harness", "checks", "latest.json"))).toBe(false);
      expect(existsSync(join(codexSkills, "agentic-dev", ".claude", ".trace.jsonl"))).toBe(false);
      expect(existsSync(join(codexSkills, "agentic-dev", ".codex", "hooks.json"))).toBe(false);

      for (const legacyName of ["agentic-dev-skill", "project-initializer"]) {
        expect(existsSync(join(codexSkills, legacyName, "assets", "skill-version.json"))).toBe(true);
        expect(existsSync(join(codexSkills, legacyName, "SKILL.md"))).toBe(false);
        expect(existsSync(join(codexSkills, legacyName, "assets", "skill-commands"))).toBe(false);
        expect(existsSync(join(codexSkills, legacyName, ".ai", "harness", "checks", "latest.json"))).toBe(false);
        expect(existsSync(join(codexSkills, legacyName, ".claude", ".trace.jsonl"))).toBe(false);
        expect(existsSync(join(codexSkills, legacyName, ".codex", "hooks.json"))).toBe(false);
      }

      expect(existsSync(join(legacyAliasTarget, "SKILL.md"))).toBe(false);
      expect(existsSync(join(legacyAliasTarget, "assets", "skill-commands"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
