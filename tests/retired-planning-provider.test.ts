import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

const ACTIVE_SURFACES = [
  "AGENTS.md",
  "CLAUDE.md",
  "SKILL.md",
  "README.md",
  "README.zh-CN.md",
  "README.fr.md",
  "README.es.md",
  "README.ja.md",
  ".ai/harness/policy.json",
  ".ai/harness/workflow-contract.json",
  "assets",
  "src",
  "scripts",
  "docs/reference-configs",
  "docs/architecture/index.md",
  "docs/architecture/modules/public-surface/root-router.md",
  "references/migration-guide.md",
] as const;

const RETIRED_TERMS = ["gstack", "plan-eng-review", "plan-design-review"];

function textFiles(path: string): string[] {
  const stats = statSync(path);
  if (stats.isFile()) return [path];

  return readdirSync(path, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) return textFiles(child);
      if (entry.isFile()) return [child];
      throw new Error(`Unexpected non-regular active-surface entry: ${child}`);
    });
}

describe("retired planning provider", () => {
  test("is absent from active product and generated surfaces", () => {
    const violations = ACTIVE_SURFACES.flatMap((relativePath) => {
      const absolutePath = join(ROOT, relativePath);
      return textFiles(absolutePath).flatMap((file) => {
        const content = readFileSync(file, "utf-8").toLowerCase();
        return RETIRED_TERMS
          .filter((term) => content.includes(term))
          .map((term) => `${file.slice(ROOT.length + 1)}: ${term}`);
      });
    });

    expect(violations).toEqual([]);
  });
});
