import { describe, test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_DIR = join(ROOT, "assets/reference-configs");
const PROJECTION_DIR = join(ROOT, "docs/reference-configs");

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

describe("reference-configs projection", () => {
  // This loop replaces the scattered per-file equality assertions that used to live in
  // readme-dx / ux-feature-guardrail / global-working-rules-distribution / sprint-backlog.
  // It reads the filesystem directly rather than importing scripts/sync-reference-configs.ts,
  // so it stays an independent guard instead of restating the tool's own logic.
  test("every assets/reference-configs doc has a byte-identical docs/reference-configs projection", () => {
    const sources = markdownFiles(SOURCE_DIR);
    expect(sources.length).toBeGreaterThan(0);

    const drift: string[] = [];
    for (const name of sources) {
      const projectionPath = join(PROJECTION_DIR, name);
      if (!existsSync(projectionPath)) {
        drift.push(`missing projection: docs/reference-configs/${name}`);
        continue;
      }
      if (!readFileSync(projectionPath).equals(readFileSync(join(SOURCE_DIR, name)))) {
        drift.push(`content drift: docs/reference-configs/${name}`);
      }
    }

    expect(
      drift,
      "assets/reference-configs is the source; run bun run sync:reference-configs after editing it",
    ).toEqual([]);
  });

  // docs/reference-configs additionally carries docs-only material (install profiles, MCP
  // guides, contract brief examples) that never ships in assets. Those are outside the
  // mirror by design, so the projection is one-directional and must not delete them.
  test("docs-only reference configs stay outside the mirror", () => {
    const sources = new Set(markdownFiles(SOURCE_DIR));
    const docsOnly = markdownFiles(PROJECTION_DIR).filter((name) => !sources.has(name));
    expect(docsOnly.length).toBeGreaterThan(0);
    for (const name of docsOnly) {
      expect(existsSync(join(SOURCE_DIR, name))).toBe(false);
    }
  });
});
