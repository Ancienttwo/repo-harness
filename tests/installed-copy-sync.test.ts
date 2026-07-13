import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
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

  test("minimal profile removes an exact package-owned command facade", () => {
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
      mkdirSync(owned, { recursive: true });
      writeFileSync(join(owned, "SKILL.md"), "---\nname: repo-harness-plan\n---\n");

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
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("unknown facade fails closed before changing any managed surface", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-unknown-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const canonical = join(codexSkills, "repo-harness");
    const custom = join(codexSkills, "repo-harness-custom");
    try {
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-plan"), { recursive: true });
      mkdirSync(custom, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "source\n");
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-plan", "SKILL.md"), "plan\n");
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

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Refusing to replace or remove");
      // No source (never shipped) and no owner marker: this cannot be
      // proven a legitimate retirement candidate, so it still fails closed
      // exactly like any other unowned directory.
      expect(result.stderr).toContain("no valid owner marker");
      expect(existsSync(custom)).toBe(true);
      expect(existsSync(canonical)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("modified owner-marked canonical copy fails closed and is preserved", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-drift-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const canonical = join(codexSkills, "repo-harness");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "source\n");
      const env = {
        ...process.env,
        AGENTIC_DEV_SOURCE_ROOT: source,
        AGENTIC_DEV_LINK_INSTALLED_COPIES: "0",
        REPO_HARNESS_INSTALL_PROFILE: "minimal",
        CODEX_SKILLS_ROOT: codexSkills,
        CLAUDE_SKILLS_ROOT: "",
      };

      const installed = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env,
      });
      expect(installed.status).toBe(0);
      expect(readFileSync(join(canonical, ".repo-harness-owner.json"), "utf-8")).toContain('"content_hash":"sha256:');
      writeFileSync(join(canonical, "LOCAL.md"), "unowned modification\n");

      const retry = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env,
      });
      expect(retry.status).toBe(1);
      expect(retry.stderr).toContain("managed copy content has drifted");
      expect(readFileSync(join(canonical, "LOCAL.md"), "utf-8")).toBe("unowned modification\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("wires repo-harness-gptpro into product-planning and strict but not standard or minimal", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-gptpro-profile-${Date.now()}`);
    const source = join(tmp, "source");
    try {
      for (const name of ["repo-harness-plan", "repo-harness-check", "repo-harness-handoff", "repo-harness-gptpro"]) {
        mkdirSync(join(source, "assets", "skill-commands", name), { recursive: true });
        writeFileSync(join(source, "assets", "skill-commands", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
      }
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");

      for (const [profile, expectCoreFacades, expectGptpro] of [
        ["minimal", false, false],
        ["standard", true, false],
        ["product-planning", true, true],
        ["strict", true, true],
      ] as const) {
        const codexSkills = join(tmp, `codex-skills-${profile}`);
        mkdirSync(codexSkills, { recursive: true });
        const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
          cwd: ROOT,
          encoding: "utf-8",
          env: {
            ...process.env,
            AGENTIC_DEV_SOURCE_ROOT: source,
            REPO_HARNESS_INSTALL_PROFILE: profile,
            CODEX_SKILLS_ROOT: codexSkills,
            CLAUDE_SKILLS_ROOT: "",
          },
        });
        expect(result.status).toBe(0);
        expect(existsSync(join(codexSkills, "repo-harness-plan", "SKILL.md"))).toBe(expectCoreFacades);
        expect(existsSync(join(codexSkills, "repo-harness-gptpro", "SKILL.md"))).toBe(expectGptpro);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("retires an owner-marked facade once its canonical source and profile selection are both gone", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-retire-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");
    const gptproSource = join(source, "assets", "skill-commands", "repo-harness-gptpro");
    try {
      for (const name of ["repo-harness-plan", "repo-harness-check", "repo-harness-handoff"]) {
        mkdirSync(join(source, "assets", "skill-commands", name), { recursive: true });
        writeFileSync(join(source, "assets", "skill-commands", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
      }
      mkdirSync(gptproSource, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(gptproSource, "SKILL.md"), "---\nname: repo-harness-gptpro\n---\n");

      const baseEnv = {
        ...process.env,
        AGENTIC_DEV_SOURCE_ROOT: source,
        CODEX_SKILLS_ROOT: codexSkills,
        CLAUDE_SKILLS_ROOT: claudeSkills,
      };

      // Phase 1: product-planning legitimately installs and marks
      // repo-harness-gptpro on both hosts.
      const bootstrap = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env: { ...baseEnv, REPO_HARNESS_INSTALL_PROFILE: "product-planning" },
      });
      expect(bootstrap.status).toBe(0);
      const gptproDest = join(codexSkills, "repo-harness-gptpro");
      expect(existsSync(join(gptproDest, ".repo-harness-owner.json"))).toBe(true);

      // Phase 2: the package retires repo-harness-gptpro's canonical
      // source, and the host moves to a profile that never selects it.
      rmSync(gptproSource, { recursive: true, force: true });
      const retire = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env: { ...baseEnv, REPO_HARNESS_INSTALL_PROFILE: "standard" },
      });

      expect(retire.status).toBe(0);
      expect(existsSync(gptproDest)).toBe(false);
      expect(retire.stdout).toContain("retiring");
      expect(retire.stdout).toContain(gptproDest);
      // Selected, still-canonical facades on the same host are untouched.
      expect(existsSync(join(codexSkills, "repo-harness-plan", "SKILL.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("preserves and reports a modified facade even after its canonical source is removed", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-retire-drift-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");
    const gptproSource = join(source, "assets", "skill-commands", "repo-harness-gptpro");
    try {
      for (const name of ["repo-harness-plan", "repo-harness-check", "repo-harness-handoff"]) {
        mkdirSync(join(source, "assets", "skill-commands", name), { recursive: true });
        writeFileSync(join(source, "assets", "skill-commands", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
      }
      mkdirSync(gptproSource, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(gptproSource, "SKILL.md"), "---\nname: repo-harness-gptpro\n---\n");

      const baseEnv = {
        ...process.env,
        AGENTIC_DEV_SOURCE_ROOT: source,
        CODEX_SKILLS_ROOT: codexSkills,
        CLAUDE_SKILLS_ROOT: claudeSkills,
      };

      const bootstrap = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env: { ...baseEnv, REPO_HARNESS_INSTALL_PROFILE: "product-planning" },
      });
      expect(bootstrap.status).toBe(0);
      const gptproDest = join(codexSkills, "repo-harness-gptpro");

      // The package retires the source AND a user hand-edits the host copy.
      rmSync(gptproSource, { recursive: true, force: true });
      writeFileSync(join(gptproDest, "SKILL.md"), "---\nname: repo-harness-gptpro\n---\nuser edit\n");

      const retry = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env: { ...baseEnv, REPO_HARNESS_INSTALL_PROFILE: "standard" },
      });

      expect(retry.status).toBe(1);
      expect(retry.stderr).toContain("managed copy content has drifted");
      expect(existsSync(gptproDest)).toBe(true);
      expect(readFileSync(join(gptproDest, "SKILL.md"), "utf-8")).toContain("user edit");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("unknown canonical directory fails closed without rm -rf", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-canonical-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const canonical = join(codexSkills, "repo-harness");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(canonical, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "package\n");
      writeFileSync(join(canonical, "SKILL.md"), "user-authored\n");

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

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("no valid owner marker");
      expect(readFileSync(join(canonical, "SKILL.md"), "utf-8")).toBe("user-authored\n");
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
