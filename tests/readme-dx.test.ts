import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const PACKAGE_VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version as string;
const RUNTIME_SCAN_FILES = [
  "SKILL.md",
  "README.md",
  "README.zh-CN.md",
  "docs/reference-configs/external-tooling.md",
];
const LOCALIZED_READMES = ["README.zh-CN.md", "README.ja.md", "README.es.md", "README.fr.md"];
const RUNTIME_RED_FLAGS = [
  /在 Claude Code/,
  /Claude Code skill/,
  /Claude Code 用户/,
  /Cursor only/,
  /Codex 中/,
  /^\[!\[Claude Code/,
  /~\/\.claude\/skills\/[a-z]/,
  /\/plugin install\b/,
];

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

function isAllowedRuntimeReference(file: string, line: string): boolean {
  if (/Claude skill alias/.test(line)) return true;
  if (file === "README.md" && /Claude\/Codex paths \(`~\/\.claude\/skills\/repo-harness`/.test(line)) {
    return true;
  }
  if (file === "README.zh-CN.md" && /~\/\.claude\/skills\/repo-harness/.test(line)) {
    return true;
  }
  return false;
}

describe("README DX contract", () => {
  test("localized READMEs track the current English release surface", () => {
    const languageSwitcher =
      "[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)";

    for (const file of LOCALIZED_READMES) {
      const localized = read(file);

      // SSD-06: the GPT Pro hero image reference is dropped from every
      // README (the image file itself stays on disk, undeleted, per the
      // plan's explicit "update or drop the image reference" choice); the
      // diagram depicted the retired repo-harness-gptpro-branded flow.
      expect(localized).toContain(PACKAGE_VERSION);
      expect(localized).toContain(`repo-harness@${PACKAGE_VERSION}`);
      expect(localized).toContain(`repo-harness@${PACKAGE_VERSION}+template@${PACKAGE_VERSION}`);
      expect(localized).toContain("repo-harness update");
      expect(localized).toContain("repo-harness init");
      expect(localized).toContain("repo-harness docs list");
      // #696 step 1 moved the route table to hook-operations.md; every README links to it.
      expect(localized).toContain("docs/reference-configs/hook-operations.md");
      expect(localized).not.toContain("| Route |");
      // SSD-xx: "Generated vs Self-Hosted Hook Projection", "Package Manager
      // Defaults", "Runtime Profiles", and the benchmark:skills eval command
      // example all moved into docs/reference-configs (harness-overview.md,
      // evals-checks.md) per the approved README slim-down; they are no
      // longer README content to pin. Pin the install commands and the
      // five-language switcher instead, since every locale must keep them.
      expect(localized).toContain(languageSwitcher);
      expect(localized).toContain(
        "curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh",
      );
      expect(localized).toContain("bunx repo-harness@latest install");
      expect(localized).not.toContain("0.5.0");
      expect(localized).not.toContain("0.2.1");
      expect(localized.toLowerCase()).not.toContain("gstack");
    }
  });

  test("dry-run keeps the canonical adoption-plan onboarding signal", () => {
    const repo = mkdtempSync(join(tmpdir(), "repo-harness-readme-dx-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "readme-dx-fixture", private: true }));
      const res = spawnSync("bun", ["src/cli/index.ts", "init", "--repo", repo, "--dry-run"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain(`[init-plan] repo: ${repo}`);
      expect(res.stdout).toContain("[init-plan] operations:");
      expect(res.stdout).toContain("writeFile:");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 15000);

  test("runtime red-flag scan uses an explicit allowlist for install examples and legacy aliases", () => {
    const hits: string[] = [];

    for (const file of RUNTIME_SCAN_FILES) {
      read(file).split("\n").forEach((line, index) => {
        const redFlag = RUNTIME_RED_FLAGS.some((pattern) => pattern.test(line));
        if (redFlag && !isAllowedRuntimeReference(file, line)) {
          hits.push(`${file}:${index + 1}:${line}`);
        }
      });
    }

    expect(hits).toEqual([]);
  });

  test("README languages do not advertise retired goal, plan skill or plugin names", () => {
    const readmes = ["README.md", ...LOCALIZED_READMES].map(read).join("\n");
    expect(readmes).not.toMatch(/prepare_codex_goal_from_sprint|write_codex_goal|codex-goal\.md|codex@openai-codex|claude-plan|Codex goal handoff/);
  });
});
