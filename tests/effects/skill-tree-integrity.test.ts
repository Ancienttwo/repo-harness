import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { commitVerifiedSkillTree, skillTreeSha256 } from "../../src/effects/skill-tree-integrity";

const ROOT = join(import.meta.dir, "..", "..");

describe("verified Skill tree staging commit", () => {
  test("post-copy digest mismatch leaves no authoritative or temporary staging residue", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-harness-skill-tree-mismatch-"));
    try {
      const source = join(root, "source");
      const staging = join(root, "staging");
      const destination = join(staging, "reverse-skill-router");
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "# verified bytes\n");

      expect(commitVerifiedSkillTree(source, destination, `sha256:${"0".repeat(64)}`)).toMatchObject({
        status: "failed",
      });
      expect(existsSync(destination)).toBe(false);
      expect(readdirSync(staging)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a copy failure after partial temporary output remains retryable", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-harness-skill-tree-copy-failure-"));
    try {
      const source = join(root, "source");
      const staging = join(root, "staging");
      const destination = join(staging, "reverse-skill-router");
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "# verified bytes\n");
      const expected = skillTreeSha256(source);
      const partialCopy = ((_: string, target: string) => {
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, "partial"), "partial\n");
        throw new Error("injected copy failure");
      }) as typeof cpSync;

      expect(commitVerifiedSkillTree(source, destination, expected, { copyTree: partialCopy })).toMatchObject({
        status: "failed",
      });
      expect(existsSync(destination)).toBe(false);
      expect(readdirSync(staging)).toEqual([]);

      expect(commitVerifiedSkillTree(source, destination, expected)).toEqual({
        status: "committed",
        actual: expected,
      });
      expect(skillTreeSha256(destination)).toBe(expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a dangling destination symlink is an owned path entry and is never replaced", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-harness-skill-tree-dangling-"));
    try {
      const source = join(root, "source");
      const staging = join(root, "staging");
      const destination = join(staging, "reverse-skill-router");
      mkdirSync(source, { recursive: true });
      mkdirSync(staging, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "# verified bytes\n");
      symlinkSync(join(root, "missing-user-target"), destination);

      expect(commitVerifiedSkillTree(source, destination, skillTreeSha256(source))).toMatchObject({
        status: "failed",
      });
      expect(readlinkSync(destination)).toBe(join(root, "missing-user-target"));
      expect(readdirSync(staging)).toEqual(["reverse-skill-router"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a symlinked staging ancestor cannot redefine the caller's canonical parent authority", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-harness-skill-tree-parent-symlink-"));
    try {
      const home = join(root, "home");
      const outside = join(root, "outside");
      const source = join(root, "source");
      mkdirSync(home, { recursive: true });
      mkdirSync(outside, { recursive: true });
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "# verified bytes\n");
      symlinkSync(outside, join(home, ".agents"), "dir");
      const destination = join(home, ".agents", "skills", "reverse-skill-router");

      expect(commitVerifiedSkillTree(source, destination, skillTreeSha256(source), {
        expectedCanonicalParent: join(home, ".agents", "skills"),
      })).toMatchObject({ status: "failed", detail: expect.stringContaining("escapes canonical authority") });
      expect(existsSync(join(outside, "skills", "reverse-skill-router"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a killed owner is reclaimed and its orphan transaction does not block retry", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-harness-skill-tree-killed-owner-"));
    try {
      const source = join(root, "source");
      const staging = join(root, "staging");
      const destination = join(staging, "reverse-skill-router");
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, "SKILL.md"), "# verified bytes\n");
      const expected = skillTreeSha256(source);
      const modulePath = join(ROOT, "src", "effects", "skill-tree-integrity.ts");
      const child = spawnSync(process.execPath, [
        "-e",
        `import { commitVerifiedSkillTree } from ${JSON.stringify(modulePath)}; commitVerifiedSkillTree(${JSON.stringify(source)}, ${JSON.stringify(destination)}, ${JSON.stringify(expected)}, { renameTree: (() => process.kill(process.pid, "SIGKILL")) as never });`,
      ], { encoding: "utf-8" });
      expect(child.signal).toBe("SIGKILL");

      const lockName = readdirSync(staging).find((entry) => entry.startsWith(".repo-harness-skill-lock-"));
      expect(lockName).toBeDefined();
      const lockPath = join(staging, lockName!);
      const ownerName = readdirSync(lockPath)[0]!;
      const ownerPath = join(lockPath, ownerName);
      const owner = JSON.parse(readFileSync(ownerPath, "utf-8"));
      writeFileSync(ownerPath, `${JSON.stringify({ ...owner, created_at: 0 })}\n`);

      expect(commitVerifiedSkillTree(source, destination, expected)).toEqual({
        status: "committed",
        actual: expected,
      });
      expect(skillTreeSha256(destination)).toBe(expected);
      expect(readdirSync(staging)).toEqual(["reverse-skill-router"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
