import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

function writeExecutable(filePath: string, content: string) {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

describe("Codex installed copy sync", () => {
  test("registers each command facade as a standalone skill in copy mode", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-sync-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");

    try {
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-plan"), { recursive: true });
      mkdirSync(join(source, "evals"), { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });

      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-plan", "SKILL.md"), "---\nname: repo-harness-plan\n---\n");
      writeFileSync(join(source, "assets", "skill-version.json"), "{\"version\":\"test\"}\n");
      writeFileSync(join(source, "evals", "benchmark.md"), "local benchmark output\n");
      mkdirSync(join(source, ".ai", "harness", "checks"), { recursive: true });
      mkdirSync(join(source, ".claude"), { recursive: true });
      mkdirSync(join(source, ".codex"), { recursive: true });
      writeFileSync(join(source, ".ai", "harness", "checks", "latest.json"), "{}\n");
      writeFileSync(join(source, ".ai", "harness", "checks", "minimal-change.latest.json"), "{}\n");
      writeFileSync(join(source, ".ai", "harness", "checks", "minimal-change.latest.md"), "# local\n");
      writeFileSync(join(source, ".claude", ".trace.jsonl"), "{\"local\":true}\n");
      writeFileSync(join(source, ".codex", "hooks.json"), "{}\n");

      const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENTIC_DEV_SOURCE_ROOT: source,
          REPO_HARNESS_INSTALL_PROFILE: "standard",
          CODEX_SKILLS_ROOT: codexSkills,
          CLAUDE_SKILLS_ROOT: claudeSkills,
        },
      });

      expect(result.status).toBe(0);
      expect(existsSync(join(codexSkills, "repo-harness", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexSkills, "repo-harness", "assets", "skill-commands", "repo-harness-plan", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexSkills, "repo-harness", "evals", "benchmark.md"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".ai", "harness", "checks", "latest.json"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".ai", "harness", "checks", "minimal-change.latest.json"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".ai", "harness", "checks", "minimal-change.latest.md"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".claude", ".trace.jsonl"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".codex", "hooks.json"))).toBe(false);

      expect(existsSync(join(claudeSkills, "repo-harness", "SKILL.md"))).toBe(true);
      expect(existsSync(join(claudeSkills, "repo-harness", ".ai", "harness", "checks", "latest.json"))).toBe(false);
      expect(existsSync(join(claudeSkills, "repo-harness", ".ai", "harness", "checks", "minimal-change.latest.json"))).toBe(false);
      expect(existsSync(join(claudeSkills, "repo-harness", ".ai", "harness", "checks", "minimal-change.latest.md"))).toBe(false);
      expect(existsSync(join(claudeSkills, "repo-harness", ".claude", ".trace.jsonl"))).toBe(false);
      expect(existsSync(join(claudeSkills, "repo-harness", ".codex", "hooks.json"))).toBe(false);
      // Each facade is also registered as its own host skill (copy mode).
      expect(existsSync(join(codexSkills, "repo-harness-plan", "SKILL.md"))).toBe(true);
      expect(existsSync(join(claudeSkills, "repo-harness-plan", "SKILL.md"))).toBe(true);
      expect(result.stdout).toContain("command facades (copy)");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("can maintain local skill roots as source-backed aliases", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-link-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");

    try {
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-plan"), { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });

      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-plan", "SKILL.md"), "---\nname: repo-harness-plan\n---\n");
      writeFileSync(join(source, "assets", "skill-version.json"), "{\"version\":\"test\"}\n");
      writeFileSync(join(source, "README.md"), "source-backed runtime alias\n");

      const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENTIC_DEV_SOURCE_ROOT: source,
          REPO_HARNESS_INSTALL_PROFILE: "standard",
          AGENTIC_DEV_LINK_INSTALLED_COPIES: "1",
          CODEX_SKILLS_ROOT: codexSkills,
          CLAUDE_SKILLS_ROOT: claudeSkills,
        },
      });

      expect(result.status).toBe(0);
      expect(lstatSync(join(codexSkills, "repo-harness")).isSymbolicLink()).toBe(true);
      expect(lstatSync(join(claudeSkills, "repo-harness")).isSymbolicLink()).toBe(true);
      expect(existsSync(join(source, "SKILL.md"))).toBe(true);

      // Each facade is registered as its own source-backed symlink (link mode).
      expect(lstatSync(join(codexSkills, "repo-harness-plan")).isSymbolicLink()).toBe(true);
      expect(lstatSync(join(claudeSkills, "repo-harness-plan")).isSymbolicLink()).toBe(true);
      expect(existsSync(join(codexSkills, "repo-harness-plan", "SKILL.md"))).toBe(true);
      expect(result.stdout).toContain("command facades (link)");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("minimal profile removes only provably package-owned command facades", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-minimal-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    try {
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-plan"), { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-plan", "SKILL.md"), "---\nname: repo-harness-plan\n---\n");
      writeFileSync(join(source, "assets", "skill-version.json"), "{}\n");
      const owned = join(codexSkills, "repo-harness-plan");
      const custom = join(codexSkills, "repo-harness-custom");
      mkdirSync(owned, { recursive: true });
      mkdirSync(custom, { recursive: true });
      writeFileSync(join(owned, "SKILL.md"), "---\nname: repo-harness-plan\n---\n");
      writeFileSync(join(custom, "SKILL.md"), "user-authored\n");

      const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENTIC_DEV_SOURCE_ROOT: source,
          AGENTIC_DEV_LINK_INSTALLED_COPIES: "1",
          REPO_HARNESS_INSTALL_PROFILE: "minimal",
          CODEX_SKILLS_ROOT: codexSkills,
          CLAUDE_SKILLS_ROOT: "",
        },
      });
      expect(result.status).toBe(0);
      expect(existsSync(owned)).toBe(false);
      expect(existsSync(custom)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("copy mode reports explicit unsupported mode when rsync is missing", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-no-rsync-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const fakeBin = join(tmp, "fake-bin");

    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");

      const result = spawnSync("/bin/bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: fakeBin,
          AGENTIC_DEV_SOURCE_ROOT: source,
          AGENTIC_DEV_LINK_INSTALLED_COPIES: "0",
          CODEX_SKILLS_ROOT: codexSkills,
          CLAUDE_SKILLS_ROOT: "",
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unsupported copy-mode: rsync capability is missing");
      expect(result.stderr).toContain("AGENTIC_DEV_LINK_INSTALLED_COPIES=1");
      expect(existsSync(join(codexSkills, "repo-harness"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("link mode does not require rsync when symlinks are supported", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-link-no-rsync-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const fakeBin = join(tmp, "fake-bin");

    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeExecutable(join(fakeBin, "mkdir"), "#!/bin/bash\nexec /bin/mkdir \"$@\"\n");
      writeExecutable(join(fakeBin, "ln"), "#!/bin/bash\nexec /bin/ln \"$@\"\n");

      const result = spawnSync("/bin/bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: fakeBin,
          AGENTIC_DEV_SOURCE_ROOT: source,
          AGENTIC_DEV_LINK_INSTALLED_COPIES: "1",
          CODEX_SKILLS_ROOT: codexSkills,
          CLAUDE_SKILLS_ROOT: "",
        },
      });

      expect(result.status).toBe(0);
      expect(lstatSync(join(codexSkills, "repo-harness")).isSymbolicLink()).toBe(true);
      expect(result.stdout).toContain("canonical skill link");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("link mode reports explicit unsupported mode when symlink creation fails", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-no-symlink-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const fakeBin = join(tmp, "fake-bin");

    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeExecutable(join(fakeBin, "mkdir"), "#!/bin/bash\nexec /bin/mkdir \"$@\"\n");
      writeExecutable(join(fakeBin, "ln"), "#!/bin/bash\nexit 1\n");

      const result = spawnSync("/bin/bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: fakeBin,
          AGENTIC_DEV_SOURCE_ROOT: source,
          AGENTIC_DEV_LINK_INSTALLED_COPIES: "1",
          CODEX_SKILLS_ROOT: codexSkills,
          CLAUDE_SKILLS_ROOT: "",
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unsupported link-mode: symlink capability is unavailable");
      expect(result.stderr).toContain("AGENTIC_DEV_LINK_INSTALLED_COPIES=0");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
