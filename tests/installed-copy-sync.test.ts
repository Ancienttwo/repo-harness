import { describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, relative } from "path";
import { spawnSync } from "child_process";
import { removeOwnedDanglingSkillLinks } from "../src/effects/skill-tree-integrity";

const ROOT = join(import.meta.dir, "..");
/**
 * profile_facades() now unconditionally needs a real `bun` on PATH (to run
 * the adapter) before it can reach any of this script's own capability
 * probes (rsync, symlink). The three tests below deliberately restrict PATH
 * to a minimal fakeBin to test those probes in isolation; this appends the
 * real bun's own directory (never rsync/ln) so the eager facade-selection
 * step succeeds and execution reaches the capability probe under test.
 */
const BUN_BIN_DIR = dirname(process.execPath);

/**
 * profile_facades() now resolves `$SOURCE_ROOT/scripts/skill-surface-select.ts`
 * eagerly (see scripts/sync-codex-installed-copies.sh), which imports
 * src/core/skill-surface/catalog.ts and reads
 * assets/skill-commands/manifest.json, all resolved relative to SOURCE_ROOT;
 * its managed-tree-hash subcommand also loads src/cli/installer, so the
 * whole src/ tree is seeded.
 * Every fixture `source` tree in this file is a synthetic, sparse package
 * layout (by design, to exercise sync mechanics in isolation), so each one
 * needs a real copy of these three so the adapter can actually run. The real
 * manifest.json is used as-is: it is a static declarative file decoupled
 * from which facade directories a given fixture happens to physically ship,
 * so copying it does not change what any test asserts.
 */
function seedSkillSurfaceRuntime(source: string): void {
  mkdirSync(join(source, "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts", "skill-surface-select.ts"), join(source, "scripts", "skill-surface-select.ts"));
  cpSync(join(ROOT, "src"), join(source, "src"), { recursive: true });
  mkdirSync(join(source, "assets", "skill-commands"), { recursive: true });
  cpSync(join(ROOT, "assets", "skill-commands", "manifest.json"), join(source, "assets", "skill-commands", "manifest.json"));
}

function writeExecutable(filePath: string, content: string) {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

describe("Codex installed copy sync", () => {
  test("removes retired package dangling links and same-folder backups on both hosts", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-dangling-owned-"));
    const source = join(tmp, "source");
    const roots = [join(tmp, "codex-skills"), join(tmp, "claude-skills")];
    try {
      seedSkillSurfaceRuntime(source);
      const retired = join(source, "assets", "skill-commands", "repo-harness-plan");
      const foreign = join(tmp, "Waza");
      symlinkSync(join(tmp, "missing-volume"), foreign);
      mkdirSync(retired, { recursive: true });
      writeFileSync(join(retired, "SKILL.md"), "old skill\n");
      for (const root of roots) {
        mkdirSync(root);
        symlinkSync(retired, join(root, "repo-harness-plan"));
        symlinkSync(relative(root, retired), join(root, "repo-harness-plan.bak"));
        symlinkSync(join(foreign, "think"), join(root, "think"));
        symlinkSync("foreign-loop", join(root, "foreign-loop"));
      }
      rmSync(retired, { recursive: true });
      const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8",
        env: { ...process.env, AGENTIC_DEV_SOURCE_ROOT: source, AGENTIC_DEV_LINK_INSTALLED_COPIES: "1",
          REPO_HARNESS_INSTALL_PROFILE: "minimal", CODEX_SKILLS_ROOT: roots[0], CLAUDE_SKILLS_ROOT: roots[1] },
      });
      expect(result.status, result.stderr).toBe(0);
      for (const root of roots) {
        for (const name of ["repo-harness-plan", "repo-harness-plan.bak"]) {
          const link = join(root, name);
          expect(() => lstatSync(link)).toThrow();
          expect(result.stdout).toContain(`removed dangling skill symlink: ${link}`);
        }
        expect(readlinkSync(join(root, "repo-harness"))).toBe(source);
        expect(readlinkSync(join(root, "think"))).toBe(join(foreign, "think"));
        expect(readlinkSync(join(root, "foreign-loop"))).toBe("foreign-loop");
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  for (const live of [false, true]) {
    test(`refuses foreign ${live ? "live" : "dangling"} facade links without changing either host`, () => {
      const tmp = mkdtempSync(join(tmpdir(), "repo-harness-dangling-foreign-"));
      const source = join(tmp, "source");
      const roots = [join(tmp, "codex-skills"), join(tmp, "claude-skills")];
      // A shared prefix must not prove package ownership.
      const foreign = join(`${source}-foreign`, "repo-harness-plan");
      try {
        seedSkillSurfaceRuntime(source);
        if (live) {
          mkdirSync(foreign, { recursive: true });
          writeFileSync(join(foreign, "SKILL.md"), "foreign skill\n");
        }
        for (const root of roots) {
          mkdirSync(root);
          symlinkSync(foreign, join(root, "repo-harness-plan"));
          symlinkSync(foreign, join(root, "think"));
        }
        const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
          cwd: ROOT, encoding: "utf-8",
          env: { ...process.env, AGENTIC_DEV_SOURCE_ROOT: source, AGENTIC_DEV_LINK_INSTALLED_COPIES: "1",
            REPO_HARNESS_INSTALL_PROFILE: "minimal", CODEX_SKILLS_ROOT: roots[0], CLAUDE_SKILLS_ROOT: roots[1] },
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("symlink target is not the expected package source");
        for (const root of roots) {
          expect(readlinkSync(join(root, "repo-harness-plan"))).toBe(foreign);
          expect(readlinkSync(join(root, "think"))).toBe(foreign);
          expect(existsSync(join(root, "repo-harness"))).toBe(false);
        }
        if (live) expect(readFileSync(join(foreign, "SKILL.md"), "utf-8")).toBe("foreign skill\n");
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }, 30_000);
  }

  test("does not delete a dangling link through a package ancestor that points outside", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-dangling-escape-"));
    try {
      const source = join(tmp, "source");
      const root = join(tmp, "skills");
      const foreign = join(tmp, "foreign");
      mkdirSync(source); mkdirSync(root); mkdirSync(foreign);
      symlinkSync(foreign, join(source, "escape"));
      const target = join(source, "escape", "missing");
      const link = join(root, "repo-harness-plan");
      symlinkSync(target, link);
      expect(removeOwnedDanglingSkillLinks(source, [root])).toEqual([]);
      expect(readlinkSync(link)).toBe(target);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("registers each command facade as a standalone skill in copy mode", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-sync-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");

    try {
      seedSkillSurfaceRuntime(source);
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-check"), { recursive: true });
      mkdirSync(join(source, "evals"), { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });

      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-check", "SKILL.md"), "---\nname: repo-harness-check\n---\n");
      writeFileSync(join(source, "assets", "skill-version.json"), "{\"version\":\"test\"}\n");
      writeFileSync(join(source, "evals", "benchmark.md"), "local benchmark output\n");
      mkdirSync(join(source, ".ai", "harness", "checks"), { recursive: true });
      mkdirSync(join(source, ".claude"), { recursive: true });
      mkdirSync(join(source, ".codex"), { recursive: true });
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
          REPO_HARNESS_INSTALL_PROFILE: "minimal",
          CODEX_SKILLS_ROOT: codexSkills,
          CLAUDE_SKILLS_ROOT: claudeSkills,
        },
      });

      expect(result.status).toBe(0);
      expect(existsSync(join(codexSkills, "repo-harness", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexSkills, "repo-harness", "assets", "skill-commands", "repo-harness-check", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexSkills, "repo-harness", "evals", "benchmark.md"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".ai", "harness", "checks", "minimal-change.latest.json"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".ai", "harness", "checks", "minimal-change.latest.md"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".claude", ".trace.jsonl"))).toBe(false);
      expect(existsSync(join(codexSkills, "repo-harness", ".codex", "hooks.json"))).toBe(false);

      expect(existsSync(join(claudeSkills, "repo-harness", "SKILL.md"))).toBe(true);
      expect(existsSync(join(claudeSkills, "repo-harness", ".ai", "harness", "checks", "minimal-change.latest.json"))).toBe(false);
      expect(existsSync(join(claudeSkills, "repo-harness", ".ai", "harness", "checks", "minimal-change.latest.md"))).toBe(false);
      expect(existsSync(join(claudeSkills, "repo-harness", ".claude", ".trace.jsonl"))).toBe(false);
      expect(existsSync(join(claudeSkills, "repo-harness", ".codex", "hooks.json"))).toBe(false);
      // Each facade is also registered as its own host skill (copy mode).
      expect(existsSync(join(codexSkills, "repo-harness-check", "SKILL.md"))).toBe(true);
      expect(existsSync(join(claudeSkills, "repo-harness-check", "SKILL.md"))).toBe(true);
      expect(result.stdout).toContain("command facades (copy)");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test("can maintain local skill roots as source-backed aliases", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-link-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");

    try {
      seedSkillSurfaceRuntime(source);
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-check"), { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });

      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-check", "SKILL.md"), "---\nname: repo-harness-check\n---\n");
      writeFileSync(join(source, "assets", "skill-version.json"), "{\"version\":\"test\"}\n");
      writeFileSync(join(source, "README.md"), "source-backed runtime alias\n");

      const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENTIC_DEV_SOURCE_ROOT: source,
          REPO_HARNESS_INSTALL_PROFILE: "minimal",
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
      expect(lstatSync(join(codexSkills, "repo-harness-check")).isSymbolicLink()).toBe(true);
      expect(lstatSync(join(claudeSkills, "repo-harness-check")).isSymbolicLink()).toBe(true);
      expect(existsSync(join(codexSkills, "repo-harness-check", "SKILL.md"))).toBe(true);
      expect(result.stdout).toContain("command facades (link)");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test("full sync leaves separately managed provider skills untouched", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-provider-skill-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");
    const providerSkill = "repo-harness-cross-review";
    const customContent = "---\nname: repo-harness-cross-review\n---\ntransaction-owned provider skill\n";

    try {
      seedSkillSurfaceRuntime(source);
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      for (const root of [codexSkills, claudeSkills]) {
        const installed = join(root, providerSkill);
        mkdirSync(installed, { recursive: true });
        writeFileSync(join(installed, "SKILL.md"), customContent);
      }

      const result = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENTIC_DEV_SOURCE_ROOT: source,
          AGENTIC_DEV_LINK_INSTALLED_COPIES: "1",
          REPO_HARNESS_INSTALL_PROFILE: "full",
          CODEX_SKILLS_ROOT: codexSkills,
          CLAUDE_SKILLS_ROOT: claudeSkills,
        },
      });

      expect(result.status).toBe(0);
      for (const root of [codexSkills, claudeSkills]) {
        const installed = join(root, providerSkill);
        expect(readFileSync(join(installed, "SKILL.md"), "utf-8")).toBe(customContent);
        expect(lstatSync(installed).isDirectory()).toBe(true);
        expect(existsSync(join(installed, ".repo-harness-owner.json"))).toBe(false);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test("minimal removes an exact package-owned full-only facade", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-minimal-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    try {
      seedSkillSurfaceRuntime(source);
      mkdirSync(join(source, "assets", "skills", "repo-harness-product"), { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(source, "assets", "skills", "repo-harness-product", "SKILL.md"), "---\nname: repo-harness-product\n---\n");
      writeFileSync(join(source, "assets", "skill-version.json"), "{}\n");
      const owned = join(codexSkills, "repo-harness-product");
      mkdirSync(owned, { recursive: true });
      writeFileSync(join(owned, "SKILL.md"), "---\nname: repo-harness-product\n---\n");

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
  }, 30_000);

  test("unknown facade fails closed before changing any managed surface", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-unknown-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const canonical = join(codexSkills, "repo-harness");
    const custom = join(codexSkills, "repo-harness-custom");
    try {
      seedSkillSurfaceRuntime(source);
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-check"), { recursive: true });
      mkdirSync(custom, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "source\n");
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-check", "SKILL.md"), "plan\n");
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
  }, 30_000);

  test("modified owner-marked canonical copy fails closed and is preserved", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-drift-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const canonical = join(codexSkills, "repo-harness");
    try {
      seedSkillSurfaceRuntime(source);
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
  }, 30_000);

  test("wires plan/check into both profiles and product/ship into full only", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-product-ship-profile-${Date.now()}`);
    const source = join(tmp, "source");
    try {
      seedSkillSurfaceRuntime(source);
      for (const name of ["repo-harness-check", "repo-harness-ship"]) {
        mkdirSync(join(source, "assets", "skill-commands", name), { recursive: true });
        writeFileSync(join(source, "assets", "skill-commands", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
      }
      for (const name of ["repo-harness-check", "repo-harness-product"]) {
        mkdirSync(join(source, "assets", "skills", name), { recursive: true });
        writeFileSync(join(source, "assets", "skills", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
      }
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");

      for (const [profile, expectCoreFacades, expectProduct, expectShip] of [
        ["minimal", true, false, false],
        ["full", true, true, true],
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
        expect(existsSync(join(codexSkills, "repo-harness-check", "SKILL.md"))).toBe(expectCoreFacades);
        expect(existsSync(join(codexSkills, "repo-harness-product", "SKILL.md"))).toBe(expectProduct);
        expect(existsSync(join(codexSkills, "repo-harness-ship", "SKILL.md"))).toBe(expectShip);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test("retires an owner-marked facade once its canonical source and profile selection are both gone", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-retire-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");
    const productSource = join(source, "assets", "skills", "repo-harness-product");
    try {
      seedSkillSurfaceRuntime(source);
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-check"), { recursive: true });
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-check", "SKILL.md"), "---\nname: repo-harness-check\n---\n");
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-check"), { recursive: true });
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-check", "SKILL.md"), "---\nname: repo-harness-check\n---\n");
      mkdirSync(productSource, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(productSource, "SKILL.md"), "---\nname: repo-harness-product\n---\n");

      const baseEnv = {
        ...process.env,
        AGENTIC_DEV_SOURCE_ROOT: source,
        CODEX_SKILLS_ROOT: codexSkills,
        CLAUDE_SKILLS_ROOT: claudeSkills,
      };

      // Phase 1: full legitimately installs and marks
      // repo-harness-product on both hosts.
      const bootstrap = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env: { ...baseEnv, REPO_HARNESS_INSTALL_PROFILE: "full" },
      });
      expect(bootstrap.status).toBe(0);
      const productDest = join(codexSkills, "repo-harness-product");
      expect(existsSync(join(productDest, ".repo-harness-owner.json"))).toBe(true);

      // Phase 2: the package retires repo-harness-product's canonical
      // source, and the host moves to a profile that never selects it.
      rmSync(productSource, { recursive: true, force: true });
      const retire = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env: { ...baseEnv, REPO_HARNESS_INSTALL_PROFILE: "minimal" },
      });

      expect(retire.status).toBe(0);
      expect(existsSync(productDest)).toBe(false);
      expect(retire.stdout).toContain("retiring");
      expect(retire.stdout).toContain(productDest);
      // Selected, still-canonical facades on the same host are untouched.
      expect(existsSync(join(codexSkills, "repo-harness-check", "SKILL.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test("preserves and reports a modified facade even after its canonical source is removed", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-retire-drift-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const claudeSkills = join(tmp, "claude-skills");
    const productSource = join(source, "assets", "skills", "repo-harness-product");
    try {
      seedSkillSurfaceRuntime(source);
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-check"), { recursive: true });
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-check", "SKILL.md"), "---\nname: repo-harness-check\n---\n");
      mkdirSync(join(source, "assets", "skill-commands", "repo-harness-check"), { recursive: true });
      writeFileSync(join(source, "assets", "skill-commands", "repo-harness-check", "SKILL.md"), "---\nname: repo-harness-check\n---\n");
      mkdirSync(productSource, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(claudeSkills, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");
      writeFileSync(join(productSource, "SKILL.md"), "---\nname: repo-harness-product\n---\n");

      const baseEnv = {
        ...process.env,
        AGENTIC_DEV_SOURCE_ROOT: source,
        CODEX_SKILLS_ROOT: codexSkills,
        CLAUDE_SKILLS_ROOT: claudeSkills,
      };

      const bootstrap = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env: { ...baseEnv, REPO_HARNESS_INSTALL_PROFILE: "full" },
      });
      expect(bootstrap.status).toBe(0);
      const productDest = join(codexSkills, "repo-harness-product");

      // The package retires the source AND a user hand-edits the host copy.
      rmSync(productSource, { recursive: true, force: true });
      writeFileSync(join(productDest, "SKILL.md"), "---\nname: repo-harness-product\n---\nuser edit\n");

      const retry = spawnSync("bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT, encoding: "utf-8", env: { ...baseEnv, REPO_HARNESS_INSTALL_PROFILE: "minimal" },
      });

      // A retired conflict stays visible without blocking selected runtime sync.
      expect(retry.status).toBe(0);
      expect(retry.stderr).toContain("managed copy content has drifted");
      expect(retry.stderr).toContain("preserving retired facade");
      expect(existsSync(join(codexSkills, "repo-harness-check", "SKILL.md"))).toBe(true);
      expect(existsSync(productDest)).toBe(true);
      expect(readFileSync(join(productDest, "SKILL.md"), "utf-8")).toContain("user edit");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test("unknown canonical directory fails closed without rm -rf", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-canonical-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const canonical = join(codexSkills, "repo-harness");
    try {
      seedSkillSurfaceRuntime(source);
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
  }, 30_000);

  test("copy mode reports explicit unsupported mode when rsync is missing", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-no-rsync-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const fakeBin = join(tmp, "fake-bin");

    try {
      seedSkillSurfaceRuntime(source);
      mkdirSync(source, { recursive: true });
      mkdirSync(codexSkills, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "---\nname: repo-harness\n---\n");

      const result = spawnSync("/bin/bash", [join(ROOT, "scripts", "sync-codex-installed-copies.sh")], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: `${fakeBin}:${BUN_BIN_DIR}`,
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
  }, 30_000);

  test("link mode does not require rsync when symlinks are supported", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-link-no-rsync-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const fakeBin = join(tmp, "fake-bin");

    try {
      seedSkillSurfaceRuntime(source);
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
          PATH: `${fakeBin}:${BUN_BIN_DIR}`,
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
  }, 30_000);

  test("link mode reports explicit unsupported mode when symlink creation fails", () => {
    const tmp = join(tmpdir(), `repo-harness-installed-no-symlink-${Date.now()}`);
    const source = join(tmp, "source");
    const codexSkills = join(tmp, "codex-skills");
    const fakeBin = join(tmp, "fake-bin");

    try {
      seedSkillSurfaceRuntime(source);
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
          PATH: `${fakeBin}:${BUN_BIN_DIR}`,
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
  }, 30_000);

  test("managed-tree-hash matches the retired shell hash so existing owner markers still verify", () => {
    const tmp = join(tmpdir(), `repo-harness-tree-hash-${Date.now()}`);
    const tree = join(tmp, "tree");
    try {
      mkdirSync(join(tree, "nested", "deeper"), { recursive: true });
      writeFileSync(join(tree, "SKILL.md"), "---\nname: parity\n---\n");
      writeFileSync(join(tree, "nested", "blob.bin"), Buffer.from([0x00, 0xff, 0x0a, 0x00, 0x41, 0x80]));
      writeFileSync(join(tree, "nested", "deeper", "a-b.txt"), "dash\n");
      writeFileSync(join(tree, "nested", "deeper", ".repo-harness-owner.json"), "{}\n");
      writeFileSync(join(tree, ".repo-harness-owner.json"), "{}\n");
      symlinkSync("../SKILL.md", join(tree, "nested", "link.md"));

      // Verbatim body of the pre-0.19.3 shell managed_tree_hash()/hash_stream().
      const legacy = String.raw`
root="$1"
{
  while IFS= read -r entry; do
    rel="${"$"}{entry#"$root"/}"
    if [[ -L "$entry" ]]; then
      printf 'L\0%s\0%s\0' "$rel" "$(readlink "$entry")"
    elif [[ -f "$entry" ]]; then
      printf 'F\0%s\0' "$rel"
      cat "$entry"
      printf '\0'
    fi
  done < <(find "$root" \( -type f -o -type l \) ! -name '.repo-harness-owner.json' -print | LC_ALL=C sort)
} | shasum -a 256 | awk '{print "sha256:" $1}'
`;
      const old = spawnSync("bash", ["-c", legacy, "legacy", tree], { encoding: "utf-8" });
      expect(old.status).toBe(0);
      const current = spawnSync("bun", [join(ROOT, "scripts", "skill-surface-select.ts"), "managed-tree-hash", tree], {
        encoding: "utf-8",
      });
      expect(current.status).toBe(0);
      expect(current.stdout.trim()).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(current.stdout.trim()).toBe(old.stdout.trim());
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('minimal provider ownership boundary', () => {
  for (const link of [true, false]) {
    test(`minimal sync preserves an unselected provider ${link ? 'link' : 'copy'}`, () => {
      const tmp = mkdtempSync('/tmp/rh-minimal-provider-');
      try {
        const source = join(tmp, 'source');
        seedSkillSurfaceRuntime(source);
        const provider = join(source, 'assets/skills/repo-harness-cross-review');
        mkdirSync(provider, { recursive: true });
        cpSync(join(ROOT, 'assets/skills/repo-harness-cross-review'), provider, { recursive: true });
        const roots = ['.codex', '.claude'].map(host => join(tmp, 'home', host, 'skills'));
        for (const root of roots) {
          mkdirSync(root, { recursive: true });
          const dest = join(root, 'repo-harness-cross-review');
          if (link) symlinkSync(provider, dest); else cpSync(provider, dest, { recursive: true });
        }
        const result = spawnSync('bash', [join(ROOT, 'scripts/sync-codex-installed-copies.sh')], {
          env: { ...process.env, HOME: join(tmp, 'home'), BUN_INSTALL: join(tmp, 'home/.bun'),
            AGENTIC_DEV_SOURCE_ROOT: source, AGENTIC_DEV_LINK_INSTALLED_COPIES: '1', REPO_HARNESS_INSTALL_PROFILE: 'minimal' }, encoding: 'utf8',
        });
        expect(result.status, result.stderr).toBe(0);
        for (const root of roots) {
          expect(readlinkSync(join(root, 'repo-harness'))).toBe(source);
          const dest = join(root, 'repo-harness-cross-review');
          expect(lstatSync(dest).isSymbolicLink()).toBe(link);
          if (link) expect(readlinkSync(dest)).toBe(provider);
          expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe(readFileSync(join(provider, 'SKILL.md'), 'utf8'));
        }
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    }, 30000);
  }
});

describe('separately installed integration ownership boundary', () => {
  for (const profile of ['minimal', 'full'] as const) {
    for (const link of [true, false]) {
      test(`${profile} ${link ? 'link' : 'copy'} sync keeps an installed ChatGPT skill link`, async () => {
        const { runChatgptSkillProjection } = await import('../src/cli/chatgpt-skill/installer');
        const tmp = mkdtempSync('/tmp/rh-integration-boundary-');
        try {
          const home = join(tmp, 'home');
          const source = join(tmp, 'source');
          seedSkillSurfaceRuntime(source);
          writeFileSync(join(source, 'SKILL.md'), '---\nname: repo-harness\n---\n');
          const installed = runChatgptSkillProjection({ action: 'install', home });
          const links = ['.codex', '.claude'].map(host => join(home, host, 'skills', 'repo-harness-chatgpt'));
          expect([...installed.changed].sort()).toEqual([...links].sort());
          const result = spawnSync('bash', [join(ROOT, 'scripts/sync-codex-installed-copies.sh')], {
            env: { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun'), AGENTIC_DEV_SOURCE_ROOT: source,
              AGENTIC_DEV_LINK_INSTALLED_COPIES: link ? '1' : '0', REPO_HARNESS_INSTALL_PROFILE: profile }, encoding: 'utf8',
          });
          expect(result.status, result.stderr).toBe(0);
          for (const dest of links) expect(readlinkSync(dest)).toBe(installed.source);
          expect(lstatSync(join(home, '.codex', 'skills', 'repo-harness')).isSymbolicLink()).toBe(link);
        } finally { rmSync(tmp, { recursive: true, force: true }); }
      }, 30000);
    }
  }
});

describe('installed copy file projection', () => {
  test('installer and upgrade staging copy exactly the shared canonical and facade file lists', async () => {
    const { hashManagedTree, installedCopyTreeOptions, managedTreeEntries } = await import('../src/cli/installer/install-profile');
    const { hashUpgradeSource } = await import('../src/core/upgrade/legacy-inventory');
    const contract = JSON.parse(readFileSync(join(ROOT, 'assets/workflow-contract.v1.json'), 'utf8'));
    const shippedFiles: string[] = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).files;
    expect(contract.installedCopyIncludes.filter((path: string) => path.startsWith('dist/')).sort())
      .toEqual(shippedFiles.filter(path => path.startsWith('dist/')).sort());
    const tmp = mkdtempSync('/tmp/rh-copy-projection-');
    try {
      const source = join(tmp, 'source');
      seedSkillSurfaceRuntime(source);
      const facade = join(source, 'assets/skill-commands/repo-harness-check');
      const put = (path: string, bytes: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
      put(join(source, 'SKILL.md'), 'router\n');
      put(join(source, 'LICENSE'), readFileSync(join(ROOT, 'LICENSE'), 'utf8'));
      put(join(source, 'references/space and\nnewline.md'), 'reference\n');
      symlinkSync('space and\nnewline.md', join(source, 'references/link.md'));
      put(join(facade, 'SKILL.md'), 'facade\n');
      put(join(facade, 'references/guide.md'), 'guide\n');
      for (const path of ['dist/hook-entry.js', 'dist/oar-review-host.js', 'dist/operator-ui/index.html']) {
        put(join(source, path), `shipped runtime ${path}\n`);
      }
      const residues = ['.ai/harness/state/effective.json', '.ai/harness/security/scan.json',
        '.ai/harness/evidence/events/log.jsonl', '.ai/harness/delegation/active.json',
        'dist/unshipped-build.js', 'plans/untracked.md', 'assets/node_modules/private.txt',
        'assets/.ai/harness/state/effective.json', 'assets/.ai/harness/security/scan.json',
        'assets/.ai/harness/evidence/events/log.jsonl', 'assets/.ai/harness/delegation/active.json',
        'assets/.ai/harness/backups/snapshot.json'];
      for (const path of residues) put(join(source, path), 'private residue\n');
      put(join(facade, 'references/retired.md'), 'old shipped guide\n');
      const env = { ...process.env, HOME: tmp, BUN_INSTALL: join(tmp, '.bun'), AGENTIC_DEV_SOURCE_ROOT: source,
        CODEX_SKILLS_ROOT: join(tmp, 'codex'), CLAUDE_SKILLS_ROOT: join(tmp, 'claude'),
        AGENTIC_DEV_LINK_INSTALLED_COPIES: '0', REPO_HARNESS_INSTALL_PROFILE: 'minimal' };
      const installed = spawnSync('bash', [join(ROOT, 'scripts/sync-codex-installed-copies.sh')], { env, encoding: 'utf8' });
      expect(installed.status, installed.stdout + installed.stderr).toBe(0);
      rmSync(join(facade, 'references/retired.md'));
      const refreshed = spawnSync('bash', [join(ROOT, 'scripts/sync-codex-installed-copies.sh')], { env, encoding: 'utf8' });
      expect(refreshed.status, refreshed.stdout + refreshed.stderr).toBe(0);
      for (const host of ['codex', 'claude']) {
        expect(existsSync(join(tmp, host, 'repo-harness-check/references/retired.md'))).toBe(false);
        expect(existsSync(join(tmp, host, 'repo-harness/assets/skill-commands/repo-harness-check/references/retired.md'))).toBe(false);
      }
      for (const [surface, root, name] of [
        ['canonical-skill', source, 'repo-harness'], ['command-facade', facade, 'repo-harness-check'],
      ] as const) {
        const expected = managedTreeEntries(root, installedCopyTreeOptions(surface, contract));
        expect(expected.length).toBeGreaterThan(0);
        const staging = join(tmp, `staged-${name}`);
        const staged = spawnSync('bash', [join(ROOT, 'scripts/sync-codex-installed-copies.sh'), '--stage-owned-copy', root, staging, surface], { env, encoding: 'utf8' });
        expect(staged.status, staged.stdout + staged.stderr).toBe(0);
        for (const copy of [staging, join(tmp, 'codex', name), join(tmp, 'claude', name)]) {
          expect(managedTreeEntries(copy)).toEqual(expected);
          expect(hashUpgradeSource(root, source, surface)).toBe(hashManagedTree(copy));
          for (const entry of expected) {
            if (entry.type === 'symlink') expect(readlinkSync(join(copy, entry.path))).toBe(readlinkSync(join(root, entry.path)));
            else expect(readFileSync(join(copy, entry.path))).toEqual(readFileSync(join(root, entry.path)));
          }
        }
      }
      for (const path of residues) expect(existsSync(join(tmp, 'codex/repo-harness', path))).toBe(false);
      expect(readFileSync(join(tmp, 'codex/repo-harness/LICENSE'))).toEqual(readFileSync(join(ROOT, 'LICENSE')));
      expect(existsSync(join(tmp, 'codex/repo-harness/references/link.md'))).toBe(true);
      for (const path of ['dist/hook-entry.js', 'dist/oar-review-host.js', 'dist/operator-ui/index.html']) {
        expect(existsSync(join(tmp, 'codex/repo-harness', path))).toBe(true);
      }
      expect(() => installedCopyTreeOptions('canonical-skill', { installedCopyExcludes: [] })).toThrow('includes');
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 60000);
});

test('a missing canonical projection fails before changing existing owned copies or links', async () => {
  const { hashManagedTree } = await import('../src/cli/installer/install-profile');
  const tmp = mkdtempSync('/tmp/rh-copy-invalid-contract-');
  try {
    const source = join(tmp, 'source');
    seedSkillSurfaceRuntime(source);
    const writer = join(source, 'scripts/sync-codex-installed-copies.sh');
    cpSync(join(ROOT, 'scripts/sync-codex-installed-copies.sh'), writer);
    const contractPath = join(source, 'assets/workflow-contract.v1.json');
    cpSync(join(ROOT, 'assets/workflow-contract.v1.json'), contractPath);
    writeFileSync(join(source, 'SKILL.md'), 'router\n');
    const facade = join(source, 'assets/skill-commands/repo-harness-check');
    mkdirSync(facade, { recursive: true });
    writeFileSync(join(facade, 'SKILL.md'), 'facade\n');
    const env = { ...process.env, HOME: tmp, BUN_INSTALL: join(tmp, '.bun'), AGENTIC_DEV_SOURCE_ROOT: source,
      CODEX_SKILLS_ROOT: join(tmp, 'codex'), CLAUDE_SKILLS_ROOT: join(tmp, 'claude'), REPO_HARNESS_INSTALL_PROFILE: 'minimal' };
    const installed = spawnSync('bash', [writer], { env: { ...env, AGENTIC_DEV_LINK_INSTALLED_COPIES: '0' }, encoding: 'utf8' });
    expect(installed.status, installed.stdout + installed.stderr).toBe(0);
    const targets = ['codex/repo-harness', 'claude/repo-harness', 'codex/repo-harness-check', 'claude/repo-harness-check'].map(path => join(tmp, path));
    const before = targets.map(path => hashManagedTree(path));
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    delete contract.installedCopyIncludes;
    writeFileSync(contractPath, JSON.stringify(contract));
    for (const mode of ['0', '1']) {
      const rejected = spawnSync('bash', [writer], { env: { ...env, AGENTIC_DEV_LINK_INSTALLED_COPIES: mode }, encoding: 'utf8' });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('installed copy includes are missing or invalid');
      expect(targets.map(path => hashManagedTree(path))).toEqual(before);
      for (const path of targets) expect(lstatSync(path).isDirectory()).toBe(true);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}, 60000);

test('canonical projection keeps every tracked include file and every existing declared package file', async () => {
  const { managedTreeEntries, installedCopyTreeOptions } = await import('../src/cli/installer/install-profile');
  const { readdirSync } = await import('fs');
  const contract = JSON.parse(readFileSync(join(ROOT, 'assets/workflow-contract.v1.json'), 'utf8'));
  const includes: string[] = contract.installedCopyIncludes;
  const packageFiles: string[] = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).files;
  const projected = new Set(managedTreeEntries(ROOT, installedCopyTreeOptions('canonical-skill', contract)).map(entry => entry.path));
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  expect(tracked.status, tracked.stderr).toBe(0);
  const trackedIncludes = tracked.stdout.split('\0').filter(file => file && includes.some(root =>
    root.endsWith('/') ? file.startsWith(root) : file === root));
  expect(trackedIncludes.length).toBeGreaterThan(0);
  expect(trackedIncludes.filter(file => !projected.has(file))).toEqual([]);

  const existingPackageFiles: string[] = [];
  const visit = (file: string): void => {
    const absolute = join(ROOT, file);
    const entry = lstatSync(absolute);
    if (entry.isDirectory()) {
      for (const name of readdirSync(absolute)) visit(`${file.replace(/\/$/, '')}/${name}`);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      existingPackageFiles.push(file);
    }
  };
  for (const file of packageFiles) {
    if (existsSync(join(ROOT, file))) visit(file);
  }
  expect(existingPackageFiles.length).toBeGreaterThan(0);
  expect(existingPackageFiles.filter(file => !projected.has(file))).toEqual([]);
});
